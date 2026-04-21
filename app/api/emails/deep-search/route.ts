import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function decodeBase64(data: string): string {
  try { return Buffer.from(data.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf-8') } catch { return '' }
}
function extractBody(payload: any): { text: string } {
  let text = ''
  function walk(p: any) {
    if (!p) return
    if (p.mimeType === 'text/plain' && p.body?.data) text = decodeBase64(p.body.data)
    if (p.parts) p.parts.forEach(walk)
  }
  walk(payload); return { text }
}
function header(headers: any[], name: string) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } }
  )
  if (!listRes.ok) return NextResponse.json({ results: [] })
  const { messages = [] } = await listRes.json()
  if (!messages.length) return NextResponse.json({ results: [] })

  const results = await Promise.all(messages.slice(0, 15).map(async (m: any) => {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } }
    )
    if (!r.ok) return null
    const msg = await r.json()
    const h = msg.payload?.headers || []
    const { text } = extractBody(msg.payload)
    const fromRaw = header(h, 'from')
    return {
      id: msg.id, gmail_id: msg.id, thread_id: msg.threadId,
      from_name: fromRaw.replace(/<.*>/, '').trim(),
      from_email: (fromRaw.match(/<(.+)>/) || [])[1] || fromRaw,
      subject: header(h, 'subject') || '(sans objet)',
      snippet: msg.snippet || '',
      body: text.slice(0, 3000),
      date: new Date(Number(msg.internalDate)).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}),
      date_iso: new Date(Number(msg.internalDate)).toISOString(),
      _fromGmailSearch: true,
    }
  }))
  return NextResponse.json({ results: results.filter(Boolean) })
}
