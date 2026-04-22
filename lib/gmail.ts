import { google } from 'googleapis'
import { supabaseAdmin } from './supabase'

const BATCH_SIZE = 10
const BACKOFF_BASE = 1000

async function withBackoff(fn: () => Promise<any>, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      // Quota exceeded — retry avec backoff exponentiel
      if (e?.code === 429 && i < retries - 1) {
        await new Promise(r => setTimeout(r, BACKOFF_BASE * Math.pow(2, i)))
        continue
      }
      // invalid_grant = refresh token invalide/révoqué → reconnexion obligatoire
      if (e?.message?.includes('invalid_grant') || e?.message?.includes('Invalid Credentials')) {
        throw new Error('GMAIL_AUTH_EXPIRED')
      }
      // 403 sur certaines opérations = permissions insuffisantes
      if (e?.code === 403) throw new Error('GMAIL_AUTH_EXPIRED')
      // 401 avec retry = token temporairement invalide, la librairie devrait gérer le refresh
      // On ne lance PAS GMAIL_AUTH_EXPIRED ici — on laisse la librairie retenter
      throw e
    }
  }
  throw new Error('Max retries exceeded')
}

export async function getGmailClient(userId: string) {
  const { data: account } = await supabaseAdmin
    .from('accounts')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (!account) throw new Error('Compte Google non trouve')

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  // Passer expiry_date pour que la librairie sache quand rafraichir le token automatiquement
  // Sans ca, la librairie envoie l'access_token expire → Google repond 401
  auth.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  })

  // Quand la librairie rafraichit le token, persister en Supabase
  auth.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      const updateData: any = { access_token: tokens.access_token }
      if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000)
      await supabaseAdmin.from('accounts').update(updateData).eq('user_id', userId)
    }
  })

  return google.gmail({ version: 'v1', auth })
}

function getHeader(headers: any[], name: string) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

export function extractEmailParts(payload: any) {
  let html = '', text = ''
  const attachments: any[] = []

  function walk(part: any) {
    if (!part) return
    const mime = part.mimeType || '', body = part.body || {}
    if (body.attachmentId && part.filename) {
      attachments.push({ id: body.attachmentId, filename: part.filename, mimeType: mime, size: body.size || 0 })
      return
    }
    if (body.data) {
      const decoded = Buffer.from(body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
      if (mime === 'text/html' && !html) html = decoded
      else if (mime === 'text/plain' && !text) text = decoded
    }
    if (part.parts) part.parts.forEach(walk)
  }
  walk(payload)
  return { html, text, attachments }
}

export function parseMetadataMessage(msg: any, userId: string) {
  const headers = msg.payload?.headers || []
  const from = getHeader(headers, 'from')
  const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/)
  const labels = msg.labelIds || []
  let dateIso = new Date().toISOString()
  try { dateIso = new Date(Number(msg.internalDate)).toISOString() } catch {}
  return {
    user_id: userId,
    gmail_id: msg.id,
    thread_id: msg.threadId,
    history_id: Number(msg.historyId) || null,
    from_name: fromMatch ? fromMatch[1].trim().replace(/"/g, '') : from,
    from_email: fromMatch ? fromMatch[2] : from,
    to_addresses: getHeader(headers, 'to').split(',').map((s: string) => s.trim()).filter(Boolean),
    cc_addresses: getHeader(headers, 'cc').split(',').map((s: string) => s.trim()).filter(Boolean),
    subject: getHeader(headers, 'subject') || '(sans objet)',
    snippet: msg.snippet || '',
    date_iso: dateIso,
    labels,
    is_unread: labels.includes('UNREAD'),
    is_starred: labels.includes('STARRED'),
    is_archived: !labels.includes('INBOX'),
    direction: labels.includes('SENT') ? 'sent' : 'received',
  }
}

export async function upsertEmails(rows: any[]) {
  if (!rows.length) return
  const { error } = await supabaseAdmin.from('emails_cache').upsert(rows, { onConflict: 'gmail_id,user_id', ignoreDuplicates: false })
  if (error) console.error('upsertEmails error:', error.message)
}

export async function syncFullMailbox(userId: string, onProgress?: (synced: number, total: number) => void) {
  const gmail = await getGmailClient(userId)
  let totalSynced = 0
  const firstPage = await withBackoff(() => gmail.users.messages.list({ userId: 'me', maxResults: 1 }))
  const estimated = firstPage.data.resultSizeEstimate || 0

  for (const labelIds of [['INBOX'], ['SENT']]) {
    let pageToken: string | undefined
    do {
      const listRes = await withBackoff(() => gmail.users.messages.list({ userId: 'me', maxResults: 500, labelIds, pageToken }))
      const messages = listRes.data.messages || []
      pageToken = listRes.data.nextPageToken
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE)
        const details = await Promise.all(batch.map(m => withBackoff(() => gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'] }))))
        const rows = details.filter(d => d.data).map(d => parseMetadataMessage(d.data, userId))
        await upsertEmails(rows)
        totalSynced += rows.length
        onProgress?.(totalSynced, estimated)
      }
    } while (pageToken)
  }

  const profileRes = await withBackoff(() => gmail.users.getProfile({ userId: 'me' }))
  const historyId = Number(profileRes.data.historyId)
  await supabaseAdmin.from('user_settings').upsert({ user_id: userId, last_history_id: historyId, sync_completed: true, updated_at: new Date().toISOString() })
  return { synced: totalSynced, historyId }
}

export async function fetchEmailBody(userId: string, gmailId: string) {
  const { data: cached } = await supabaseAdmin.from('emails_cache').select('body_html, body_text, attachments').eq('gmail_id', gmailId).eq('user_id', userId).single()
  if (cached?.body_html || cached?.body_text) return cached

  const gmail = await getGmailClient(userId)
  const res = await withBackoff(() => gmail.users.messages.get({ userId: 'me', id: gmailId, format: 'full' }))
  const { html, text, attachments } = extractEmailParts(res.data.payload)
  await supabaseAdmin.from('emails_cache').update({ body_html: html || null, body_text: text || null, attachments, has_attachments: attachments.length > 0 }).eq('gmail_id', gmailId).eq('user_id', userId)
  return { body_html: html, body_text: text, attachments }
}

export async function syncFromHistory(userId: string, startHistoryId: string) {
  const gmail = await getGmailClient(userId)
  const histRes = await withBackoff(() => gmail.users.history.list({ userId: 'me', startHistoryId, historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'] }))
  const history = histRes.data.history || []
  const newHistoryId = histRes.data.historyId

  for (const record of history) {
    if (record.messagesAdded) for (const a of record.messagesAdded) if (a.message?.id) {
      const d = await withBackoff(() => gmail.users.messages.get({ userId: 'me', id: a.message!.id!, format: 'metadata', metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'] }))
      if (d.data) await upsertEmails([parseMetadataMessage(d.data, userId)])
    }
    if (record.messagesDeleted) for (const del of record.messagesDeleted)
      await supabaseAdmin.from('emails_cache').delete().eq('gmail_id', del.message?.id).eq('user_id', userId)
    const lchanges = [...(record.labelsAdded || []), ...(record.labelsRemoved || [])]
    for (const c of lchanges) if (c.message?.id) {
      const d = await withBackoff(() => gmail.users.messages.get({ userId: 'me', id: c.message!.id!, format: 'minimal' }))
      if (d.data) {
        const labels = d.data.labelIds || []
        await supabaseAdmin.from('emails_cache').update({ labels, is_unread: labels.includes('UNREAD'), is_starred: labels.includes('STARRED'), is_archived: !labels.includes('INBOX') }).eq('gmail_id', c.message!.id!).eq('user_id', userId)
      }
    }
  }

  if (newHistoryId) await supabaseAdmin.from('user_settings').upsert({ user_id: userId, last_history_id: Number(newHistoryId), updated_at: new Date().toISOString() })
  return { processed: history.length, newHistoryId }
}

export async function modifyLabels(userId: string, gmailId: string, add: string[], remove: string[]) {
  const gmail = await getGmailClient(userId)
  await withBackoff(() => gmail.users.messages.modify({ userId: 'me', id: gmailId, requestBody: { addLabelIds: add, removeLabelIds: remove } }))
}

export async function trashEmail(userId: string, gmailId: string) {
  const gmail = await getGmailClient(userId)
  await withBackoff(() => gmail.users.messages.trash({ userId: 'me', id: gmailId }))
}

export async function setupGmailWatch(userId: string) {
  if (!process.env.GMAIL_PUBSUB_TOPIC) return null
  const gmail = await getGmailClient(userId)
  const res = await withBackoff(() => gmail.users.watch({ userId: 'me', requestBody: { topicName: process.env.GMAIL_PUBSUB_TOPIC, labelIds: ['INBOX', 'SENT'] } }))
  const expiry = res.data.expiration ? new Date(Number(res.data.expiration)).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString()
  await supabaseAdmin.from('user_settings').upsert({ user_id: userId, watch_expiry: expiry, last_history_id: Number(res.data.historyId) || null, updated_at: new Date().toISOString() })
  return { expiry, historyId: res.data.historyId }
}

export async function downloadAttachment(userId: string, gmailId: string, attachmentId: string) {
  const gmail = await getGmailClient(userId)
  const res = await withBackoff(() => gmail.users.messages.attachments.get({ userId: 'me', messageId: gmailId, id: attachmentId }))
  return res.data.data
}