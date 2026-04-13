import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { syncRecentEmails } from '@/lib/gmail'

// GET /api/emails — récupérer les emails de l'utilisateur
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

  // Filtres
  if (filter === 'nonlus') query = query.eq('is_unread', true)
  if (filter === 'star')   query = query.contains('flags', ['star'])
  if (filter === 'flag')   query = query.contains('flags', ['flag'])
  if (filter === 'atraiter') query = query.eq('a_traiter', true)

  // Recherche
  if (search) {
    query = query.or(`from_name.ilike.%${search}%,from_email.ilike.%${search}%,subject.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json(data)
}

// POST /api/emails/sync — forcer une synchronisation Gmail
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  try {
    const count = await syncRecentEmails(session.user.id, 50)
    return NextResponse.json({ synced: count })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
