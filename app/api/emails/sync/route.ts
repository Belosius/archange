import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { getGmailClient, parseMetadataMessage, upsertEmails, syncFromHistory } from '@/lib/gmail'

const BATCH_SIZE = 10
const PAGE_SIZE = 500

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  const userId = session.user.id
  const body = await req.json().catch(() => ({}))

  // Fix #1 — Sync differentielle via historyId (bouton Actualiser)
  if (body.useHistoryId && body.lastHistoryId) {
    try {
      const result = await syncFromHistory(userId, String(body.lastHistoryId))
      return NextResponse.json({ synced: result.processed, historyId: result.newHistoryId, done: true, mode: 'differential' })
    } catch (e: any) {
      if (e.message === 'GMAIL_AUTH_EXPIRED') return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // Sync initiale paginee (un label a la fois)
  const { pageToken, labels = ['INBOX'] } = body
  try {
    const gmail = await getGmailClient(userId)
    const listRes = await gmail.users.messages.list({
      userId: 'me', maxResults: PAGE_SIZE,
      pageToken: pageToken || undefined, labelIds: labels as string[],
    })
    const messages = listRes.data.messages || []
    const nextPageToken = listRes.data.nextPageToken || null
    const resultSizeEstimate = listRes.data.resultSizeEstimate || 0

    if (!messages.length) {
      if (labels[0] === 'INBOX') {
        return NextResponse.json({ synced: 0, nextPageToken: null, total: 0, done: false, nextLabel: 'SENT' })
      }
      const profileRes = await gmail.users.getProfile({ userId: 'me' })
      await supabaseAdmin.from('user_settings').upsert({ user_id: userId, last_history_id: Number(profileRes.data.historyId), sync_completed: true, updated_at: new Date().toISOString() })
      return NextResponse.json({ synced: 0, nextPageToken: null, total: 0, done: true })
    }

    const rows: any[] = []
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)
      const details = await Promise.all(batch.map(m => gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['From','To','Cc','Subject','Date'] })))
      rows.push(...details.filter(d => d.data).map(d => parseMetadataMessage(d.data, userId)))
    }
    await upsertEmails(rows)

    if (!nextPageToken) {
      if (labels[0] === 'INBOX') {
        return NextResponse.json({ synced: rows.length, nextPageToken: null, total: resultSizeEstimate, done: false, nextLabel: 'SENT' })
      }
      const profileRes = await gmail.users.getProfile({ userId: 'me' })
      await supabaseAdmin.from('user_settings').upsert({ user_id: userId, last_history_id: Number(profileRes.data.historyId), sync_completed: true, updated_at: new Date().toISOString() })
    }
    return NextResponse.json({ synced: rows.length, nextPageToken, total: resultSizeEstimate, done: !nextPageToken && labels[0] !== 'INBOX' })
  } catch (e: any) {
    if (e.message === 'GMAIL_AUTH_EXPIRED') return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  const { data } = await supabaseAdmin.from('user_settings').select('sync_completed, last_history_id, updated_at').eq('user_id', session.user.id).single()
  const { count } = await supabaseAdmin.from('emails_cache').select('*', { count: 'exact', head: true }).eq('user_id', session.user.id)
  return NextResponse.json({ syncCompleted: data?.sync_completed || false, lastHistoryId: data?.last_history_id || null, lastSync: data?.updated_at || null, emailCount: count || 0 })
}