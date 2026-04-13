import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getGmailClient, parseGmailMessage } from '@/lib/gmail'
export async function POST(request: Request) {
  const secret = new URL(request.url).searchParams.get('secret')
  if (secret !== process.env.GMAIL_WEBHOOK_SECRET) return NextResponse.json({error:'Non autorisé'},{status:401})
  try {
    const body = await request.json()
    const data = JSON.parse(Buffer.from(body.message?.data||'','base64').toString())
    const {emailAddress,historyId} = data
    if (!emailAddress) return NextResponse.json({ok:true})
    const {data:account} = await supabaseAdmin.from('accounts').select('user_id').eq('provider','google').ilike('provider_account_id','%').single()
    if (!account) return NextResponse.json({ok:true})
    const gmail = await getGmailClient(account.user_id)
    const {data:syncData} = await supabaseAdmin.from('gmail_sync').select('last_history_id').eq('user_id',account.user_id).single()
    const histResp = await gmail.users.history.list({userId:'me',startHistoryId:syncData?.last_history_id||String(historyId),historyTypes:['messageAdded']})
    const added = histResp.data.history?.flatMap((h:any)=>h.messagesAdded||[])||[]
    for (const {message} of added) {
      const full = await gmail.users.messages.get({userId:'me',id:message.id,format:'full'})
      const parsed = parseGmailMessage(full.data)
      await supabaseAdmin.from('emails').upsert({...parsed,user_id:account.user_id},{onConflict:'gmail_id'})
    }
    await supabaseAdmin.from('gmail_sync').upsert({user_id:account.user_id,last_history_id:String(historyId),updated_at:new Date().toISOString()})
    return NextResponse.json({ok:true})
  } catch(e:any) { return NextResponse.json({error:e.message},{status:500}) }
}
