import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { generateEmailResponse, extractReservationData, generateNoteIA } from '@/lib/claude'
import { supabaseAdmin } from '@/lib/supabase'
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({error:'Non autorisé'},{status:401})
  const {action,emailBody,evenementId,context} = await request.json()
  try {
    if(action==='generate_response') return NextResponse.json({response: await generateEmailResponse(emailBody,context)})
    if(action==='extract_data') return NextResponse.json(await extractReservationData(emailBody))
    if(action==='generate_note_ia') {
      const {data:evt} = await supabaseAdmin.from('evenements').select('*').eq('id',evenementId).single()
      const {data:emails} = await supabaseAdmin.from('emails').select('*').eq('user_id',session.user.id).ilike('from_email',`%${evt?.email}%`).limit(10)
      const note = await generateNoteIA(evt,emails||[])
      await supabaseAdmin.from('evenements').update({note_ia:note,note_ia_date:new Date().toISOString()}).eq('id',evenementId)
      return NextResponse.json({note})
    }
    return NextResponse.json({error:'Action inconnue'},{status:400})
  } catch(e:any) { return NextResponse.json({error:e.message},{status:500}) }
}
