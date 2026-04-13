import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { syncRecentEmails } from '@/lib/gmail'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') || 'all'
  const q = searchParams.get('q') || ''
  let query = supabaseAdmin.from('emails').select('*').eq('user_id', session.user.id).order('date_iso', { ascending: false }).limit(100)
  if (filter === 'unread') query = query.eq('is_unread', true)
  if (filter === 'starred') query = query.eq('is_starred', true)
  if (filter === 'atraiter') query = query.contains('flags', ['atraiter'])
  if (q) query = query.or(`subject.ilike.%${q}%,from_name.ilike.%${q}%,snippet.ilike.%${q}%`)
  const { data, error } = await query
  if (error) return NextResponse.json([], { status: 200 })
  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  try {
    const count = await syncRecentEmails(session.user.id, 50)
    return NextResponse.json({ synced: count })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
