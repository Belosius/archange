import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { getGmailClient } from '@/lib/gmail'

// PATCH /api/emails/[id] — mettre à jour un email (lu, flags, etc.)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const updates = await req.json()

  // Mettre à jour dans Supabase
  const { data, error } = await supabaseAdmin
    .from('emails')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error }, { status: 500 })

  // Synchroniser avec Gmail si nécessaire (marquer comme lu/non lu)
  if ('is_unread' in updates && data.gmail_id) {
    try {
      const gmail = await getGmailClient(session.user.id)
      await gmail.users.messages.modify({
        userId: 'me',
        id: data.gmail_id,
        requestBody: {
          addLabelIds: updates.is_unread ? ['UNREAD'] : [],
          removeLabelIds: updates.is_unread ? [] : ['UNREAD'],
        },
      })
    } catch (e) {
      console.error('Erreur sync Gmail labels:', e)
    }
  }

  return NextResponse.json(data)
}
