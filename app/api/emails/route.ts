import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { modifyLabels, trashEmail, fetchEmailBody } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  const { searchParams } = req.nextUrl
  const filter = searchParams.get('filter') || 'all'
  const search = searchParams.get('q') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200)
  const gmailId = searchParams.get('gmail_id')
  const userId = session.user.id

  if (gmailId) {
    try {
      const body = await fetchEmailBody(userId, gmailId)
      return NextResponse.json(body)
    } catch (e: any) {
      if (e.message === 'GMAIL_AUTH_EXPIRED') return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  let query = supabaseAdmin
    .from('emails_cache')
    .select('id,gmail_id,thread_id,from_name,from_email,subject,snippet,date_iso,labels,is_unread,is_starred,is_archived,has_attachments,attachments,direction,updated_at')
    .eq('user_id', userId)
    .order('date_iso', { ascending: false })
    .limit(limit)

  if (filter === 'inbox') query = query.contains('labels', ['INBOX'])
  if (filter === 'sent') query = query.eq('direction', 'sent')
  if (filter === 'unread') query = query.eq('is_unread', true)
  if (filter === 'starred') query = query.eq('is_starred', true)
  if (filter === 'archived') query = query.eq('is_archived', true)
  if (search) query = query.or('subject.ilike.%' + search + '%,from_name.ilike.%' + search + '%,snippet.ilike.%' + search + '%,from_email.ilike.%' + search + '%')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: settings } = await supabaseAdmin.from('user_settings').select('sync_completed,last_history_id').eq('user_id', userId).single()

  return NextResponse.json({ emails: data || [], syncCompleted: settings?.sync_completed || false })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  return NextResponse.json({ status: 'use /api/emails/sync for initial sync' })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  const userId = session.user.id
  const { gmail_id, action, value } = await req.json()
  if (!gmail_id || !action) return NextResponse.json({ error: 'gmail_id et action requis' }, { status: 400 })
  try {
    let supabaseUpdate: any = {}
    let addLabels: string[] = []
    let removeLabels: string[] = []
    switch (action) {
      case 'read': supabaseUpdate = { is_unread: false }; removeLabels = ['UNREAD']; break
      case 'unread': supabaseUpdate = { is_unread: true }; addLabels = ['UNREAD']; break
      case 'star': supabaseUpdate = { is_starred: value !== false }; if (value !== false) addLabels = ['STARRED']; else removeLabels = ['STARRED']; break
      case 'archive': supabaseUpdate = { is_archived: true }; removeLabels = ['INBOX']; break
      default: return NextResponse.json({ error: 'Action inconnue: ' + action }, { status: 400 })
    }
    await supabaseAdmin.from('emails_cache').update(supabaseUpdate).eq('gmail_id', gmail_id).eq('user_id', userId)
    modifyLabels(userId, gmail_id, addLabels, removeLabels).catch(e => console.error('Gmail modify error:', e.message))
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === 'GMAIL_AUTH_EXPIRED') return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  const userId = session.user.id
  const { gmail_id } = await req.json()
  if (!gmail_id) return NextResponse.json({ error: 'gmail_id requis' }, { status: 400 })
  await supabaseAdmin.from('emails_cache').delete().eq('gmail_id', gmail_id).eq('user_id', userId)
  trashEmail(userId, gmail_id).catch(e => console.error('Gmail trash error:', e.message))
  return NextResponse.json({ ok: true })
}