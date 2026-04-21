import { google } from 'googleapis'
import { supabaseAdmin } from './supabase'
import type { Email } from '@/types'

// ─── Créer un client Gmail authentifié pour un utilisateur ───────
export async function getGmailClient(userId: string) {
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

// ─── Parser un message Gmail brut en objet Email Supabase ────────
export function parseGmailMessage(msg: any): Omit<Email, 'id' | 'created_at'> {
  const headers = msg.payload?.headers || []
  const get = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  const from = get('From')
  const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/)
  const fromName = fromMatch ? fromMatch[1].trim().replace(/"/g, '') : from
  const fromEmail = fromMatch ? fromMatch[2] : from

  const body = extractBody(msg.payload)

  // Fix #5 — gestion date robuste
  let dateIso = ''
  try {
    const rawDate = get('Date')
    dateIso = rawDate ? new Date(rawDate).toISOString() : new Date(Number(msg.internalDate)).toISOString()
  } catch {
    dateIso = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString()
  }

  return {
    gmail_id: msg.id,
    thread_id: msg.threadId,
    from_name: fromName,
    from_email: fromEmail,
    subject: get('Subject'),
    snippet: msg.snippet || '',
    body,
    date: formatDate(get('Date')),
    date_iso: dateIso,
    is_unread: (msg.labelIds || []).includes('UNREAD'),
    is_starred: (msg.labelIds || []).includes('STARRED'),
    flags: [],
    labels: msg.labelIds || [],
  }
}

function extractBody(payload: any): string {
  if (!payload) return ''

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) {
      return Buffer.from(plain.body.data, 'base64').toString('utf-8')
    }
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html?.body?.data) {
      const raw = Buffer.from(html.body.data, 'base64').toString('utf-8')
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    // Multipart imbriqué
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }

  return ''
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return dateStr || ''
  }
}

// ─── Webhook Gmail (optionnel, nécessite GMAIL_PUBSUB_TOPIC) ─────
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

// ─── Fix #2 — Synchroniser INBOX + SENT ──────────────────────────
export async function syncRecentEmails(userId: string, maxResults = 50) {
  const gmail = await getGmailClient(userId)
  const allEmails: any[] = []

  // Fix #5 — wrapper avec détection d'erreur auth
  const fetchLabel = async (labelIds: string[]) => {
    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        labelIds,
      })

      const messages = listRes.data.messages || []
      if (!messages.length) return

      const details = await Promise.all(
        messages.map(m => gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' }))
      )

      for (const detail of details) {
        if (detail.data) {
          allEmails.push(parseGmailMessage(detail.data))
        }
      }
    } catch (err: any) {
      // Fix #5 — remonter les erreurs auth
      if (err?.code === 401 || err?.code === 403 || err?.message?.includes('invalid_grant')) {
        throw new Error('GMAIL_AUTH_EXPIRED')
      }
      // Erreur non-auth : ignorer silencieusement pour ne pas bloquer
      console.error(`syncRecentEmails error for ${labelIds}:`, err?.message)
    }
  }

  // Récupérer INBOX + SENT en parallèle
  await Promise.all([
    fetchLabel(['INBOX']),
    fetchLabel(['SENT']),
  ])

  if (!allEmails.length) return 0

  // Dédupliquer par gmail_id (un email peut apparaître dans INBOX et SENT)
  const seen = new Set<string>()
  const unique = allEmails.filter(e => {
    if (seen.has(e.gmail_id)) return false
    seen.add(e.gmail_id)
    return true
  })

  // Upsert dans table emails (source de vérité)
  await supabaseAdmin.from('emails').upsert(
    unique.map(e => ({ ...e, user_id: userId })),
    { onConflict: 'gmail_id' }
  )

  return unique.length
}
