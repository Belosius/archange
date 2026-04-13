import { google } from 'googleapis'
import { supabaseAdmin } from './supabase'
import type { Email } from '@/types'

// ─── Créer un client Gmail authentifié pour un utilisateur ───────
export async function getGmailClient(userId: string) {
  // Récupérer les tokens OAuth depuis Supabase
  const { data: account } = await supabaseAdmin
    .from('accounts')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .single()

  if (!account) throw new Error('Compte Google non trouvé')

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  })

  // Rafraîchir le token si expiré
  auth.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await supabaseAdmin
        .from('accounts')
        .update({ access_token: tokens.access_token })
        .eq('user_id', userId)
    }
  })

  return google.gmail({ version: 'v1', auth })
}

// ─── Parser un message Gmail brut en objet Email ─────────────────
export function parseGmailMessage(msg: any): Omit<Email, 'id' | 'created_at'> {
  const headers = msg.payload?.headers || []
  const get = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  const from = get('From')
  const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/)
  const fromName = fromMatch ? fromMatch[1].trim().replace(/"/g, '') : from
  const fromEmail = fromMatch ? fromMatch[2] : from

  // Extraire le corps du mail (text/plain en priorité)
  const body = extractBody(msg.payload)

  return {
    gmail_id: msg.id,
    thread_id: msg.threadId,
    from_name: fromName,
    from_email: fromEmail,
    subject: get('Subject'),
    snippet: msg.snippet || '',
    body,
    date: formatDate(get('Date')),
    date_iso: new Date(get('Date')).toISOString(),
    is_unread: (msg.labelIds || []).includes('UNREAD'),
    is_starred: (msg.labelIds || []).includes('STARRED'),
    flags: [],
    labels: msg.labelIds || [],
  }
}

function extractBody(payload: any): string {
  if (!payload) return ''

  // Corps direct
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  // Multipart — chercher text/plain en priorité
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) {
      return Buffer.from(plain.body.data, 'base64').toString('utf-8')
    }
    // Fallback text/html
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html?.body?.data) {
      const raw = Buffer.from(html.body.data, 'base64').toString('utf-8')
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    // Récursion sur les parties imbriquées
    for (const part of payload.parts) {
      const result = extractBody(part)
      if (result) return result
    }
  }
  return ''
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    if (days === 1) return 'Hier'
    if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' })
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

// ─── Activer le push Gmail (webhook Pub/Sub) ─────────────────────
export async function watchGmailInbox(userId: string) {
  const gmail = await getGmailClient(userId)
  await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: process.env.GMAIL_PUBSUB_TOPIC!,
      labelIds: ['INBOX'],
    },
  })
}

// ─── Synchroniser les N derniers emails ──────────────────────────
export async function syncRecentEmails(userId: string, maxResults = 50) {
  const gmail = await getGmailClient(userId)

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    labelIds: ['INBOX'],
  })

  const messages = listRes.data.messages || []
  const emails: any[] = []

  // Charger en parallèle (par batch de 10)
  for (let i = 0; i < messages.length; i += 10) {
    const batch = messages.slice(i, i + 10)
    const fetched = await Promise.all(
      batch.map(m =>
        gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' })
      )
    )
    emails.push(...fetched.map(r => parseGmailMessage(r.data)))
  }

  // Upsert dans Supabase
  await supabaseAdmin.from('emails').upsert(
    emails.map(e => ({ ...e, user_id: userId })),
    { onConflict: 'gmail_id' }
  )

  return emails.length
}
