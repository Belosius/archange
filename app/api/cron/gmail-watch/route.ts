import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { watchGmailInbox } from '@/lib/gmail'
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({error:'Non autorisé'},{status:401})
  const {data:accounts} = await supabaseAdmin.from('accounts').select('user_id').eq('provider','google')
  let renewed = 0
  for (const acc of accounts||[]) { try { await watchGmailInbox(acc.user_id); renewed++ } catch(e){} }
  return NextResponse.json({renewed})
}
