import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { syncRecentEmails } from '@/lib/gmail'

// GET /api/emails — récupérer les emails de l'utilisateur depuis Supabase
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const filter = searchParams.get('filter') || 'all'
  const search = searchParams.get('q') || ''
  const limit = parseInt(searchParams.get('limit') || '100')

  let query = supabaseAdmin
    .from('emails')
    .select('*')
    .eq('user_id', session.user.id)
    .order('date_iso', { ascending: false })
    .limit(limit)

  if (filter === 'nonlus') query = query.eq('is_unread', true)
  if (filter === 'star')   query = query.contains('labels', ['STARRED'])
  if (search) query = query.or(`subject.ilike.%${search}%,from_name.ilike.%${search}%,snippet.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data || [])
}

// POST /api/emails — sync Gmail → Supabase (INBOX + SENT)
// Fix #5 : remonte l'erreur GMAIL_AUTH_EXPIRED pour que le frontend redirige
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  try {
    const count = await syncRecentEmails(session.user.id, 50)
    return NextResponse.json({ synced: count })
  } catch (error: any) {
    // Fix #5 — exposer les erreurs d'auth Gmail au frontend
    if (error?.message === 'GMAIL_AUTH_EXPIRED') {
      return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
    }
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
