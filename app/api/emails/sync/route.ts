import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Décoder un email base64 Gmail
function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  } catch { return '' }
}

// Extraire texte/html du payload Gmail
function extractBody(payload: any): { text: string; html: string } {
  let text = '', html = ''
  function walk(p: any) {
    if (!p) return
    if (p.mimeType === 'text/plain' && p.body?.data) text = decodeBase64(p.body.data)
    if (p.mimeType === 'text/html'  && p.body?.data) html = decodeBase64(p.body.data)
    if (p.parts) p.parts.forEach(walk)
  }
  walk(payload)
  return { text, html }
}

// Extraire un header
function header(headers: any[], name: string): string {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

// Formater la date ISO depuis internalDate (ms unix)
function fmtDate(internalDate: string): string {
  try { return new Date(Number(internalDate)).toISOString() } catch { return '' }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const userId = session.user.id
  const { pageToken, labels = ['INBOX', 'SENT'] } = await req.json().catch(() => ({}))

  try {
    // Lister les messages Gmail avec pagination
    const labelParam = labels.map((l: string) => `labelIds=${l}`).join('&')
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}&${labelParam}`
    const listRes = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    })
    if (!listRes.ok) return NextResponse.json({ error: 'Erreur Gmail' }, { status: 502 })
    const { messages = [], nextPageToken, resultSizeEstimate } = await listRes.json()

    if (!messages.length) {
      return NextResponse.json({ synced: 0, nextPageToken: null, total: 0 })
    }

    // Récupérer les détails de chaque message en parallèle (par batch de 20)
    const BATCH = 20
    const rows: any[] = []
    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH)
      const details = await Promise.all(batch.map(async (m: any) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${session.accessToken}` } }
        )
        if (!r.ok) return null
        return r.json()
      }))
      for (const msg of details) {
        if (!msg) continue
        const h = msg.payload?.headers || []
        const { text, html } = extractBody(msg.payload)
        const hasAttachments = !!(msg.payload?.parts?.some((p: any) => p.filename))
        rows.push({
          user_id: userId,
          gmail_id: msg.id,
          thread_id: msg.threadId,
          from_addr: header(h, 'from'),
          to_addr: header(h, 'to'),
          subject: header(h, 'subject') || '(sans objet)',
          date_iso: fmtDate(msg.internalDate),
          internal_date: Number(msg.internalDate),
          snippet: msg.snippet || '',
          body_text: text.slice(0, 50000),
          body_html: html.slice(0, 200000),
          labels: msg.labelIds || [],
          has_attachments: hasAttachments,
        })
      }
    }

    // Upsert en Supabase (ignore les doublons sur gmail_id + user_id)
    if (rows.length > 0) {
      const { error } = await supabase
        .from('emails_cache')
        .upsert(rows, { onConflict: 'gmail_id,user_id', ignoreDuplicates: true })
      if (error) console.error('Supabase upsert error:', error)
    }

    return NextResponse.json({
      synced: rows.length,
      nextPageToken: nextPageToken || null,
      total: resultSizeEstimate || 0,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET : état de la sync (dernier timestamp)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data } = await supabase
    .from('emails_cache')
    .select('date_iso')
    .eq('user_id', session.user.id)
    .order('internal_date', { ascending: false })
    .limit(1)
    .single()

  const { count } = await supabase
    .from('emails_cache')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.user.id)

  return NextResponse.json({ count: count || 0, lastSync: data?.date_iso || null })
}
