import { google } from 'googleapis'
import { supabaseAdmin } from './supabase'

const BATCH_SIZE = 10
const BACKOFF_BASE = 1000

async function withBackoff(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fn() }
    catch (e) {
      if (e?.code === 429 && i < retries - 1) { await new Promise(r => setTimeout(r, BACKOFF_BASE * Math.pow(2, i))); continue }
      if (e?.code === 401 || e?.code === 403 || e?.message?.includes('invalid_grant')) throw new Error('GMAIL_AUTH_EXPIRED')
      throw e
    }
  }
  throw new Error('Max retries exceeded')
}

export async function getGmailClient(userId) {
  const { data: account } = await supabaseAdmin.from('accounts').select('access_token, refresh_token').eq('user_id', userId).single()
  if (!account) throw new Error('Compte Google non trouve')
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: account.access_token, refresh_token: account.refresh_token })
  auth.on('tokens', async (tokens) => { if (tokens.access_token) await supabaseAdmin.from('accounts').update({ access_token: tokens.access_token }).eq('user_id', userId) })
  return google.gmail({ version: 'v1', auth })
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

export function extractEmailParts(payload) {
  let html = '', text = ''
  const attachments = []
  function walk(part) {
    if (!part) return
    const mime = part.mimeType || '', body = part.body || {}
    if (body.attachmentId && part.filename) { attachments.push({ id: body.attachmentId, filename: part.filename, mimeType: mime, size: body.size || 0 }); return }
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

export function parseMetadataMessage(msg, userId) {
  const headers = msg.payload?.headers || []
  const from = getHeader(headers, 'from')
  const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/)
  const labels = msg.labelIds || []
  let dateIso = new Date().toISOString()
  try { dateIso = new Date(Number(msg.internalDate)).toISOString() } catch {}
  return {
    user_id: userId, gmail_id: msg.id, thread_id: msg.threadId,
    history_id: Number(msg.historyId) || null,
    from_name: fromMatch ? fromMatch[1].trim().replace(/"/g, '') : from,
    from_email: fromMatch ? fromMatch[2] : from,
    to_addresses: getHeader(headers, 'to').split(',').map(s => s.trim()).filter(Boolean),
    cc_addresses: getHeader(headers, 'cc').split(',').map(s => s.trim()).filter(Boolean),
    subject: getHeader(headers, 'subject') || '(sans objet)',
    snippet: msg.snippet || '', date_iso: dateIso, labels,
    is_unread: labels.includes('UNREAD'), is_starred: labels.includes('STARRED'),
    is_archived: !labels.includes('INBOX'), direction: labels.includes('SENT') ? 'sent' : 'received',
  }
}

export async function upsertEmails(rows) {
  if (!rows.length) return
  const { error } = await supabaseAdmin.from('emails_cache').upsert(rows, { onConflict: 'gmail_id,user_id', ignoreDuplicates: false })
  if (error) console.error('upsertEmails error:', error.message)
}

export async function syncFullMailbox(userId, onProgress) {
  const gmail = await getGmailClient(userId)
  let totalSynced = 0
  const firstPage = await withBackoff(() => gmail.users.messages.list({ userId: 'me', maxResults: 1 }))
  const estimated = firstPage.data.resultSizeEstimate || 0
  for (const labelIds of [['INBOX'], ['SENT']]) {
    let pageToken
    do {
      const listRes = await withBackoff(() => gmail.users.messages.list({ userId: 'me', maxResults: 500, labelIds, pageToken }))
      const messages = listRes.data.messages || []
      pageToken = listRes.data.nextPageToken
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE)
        const details = await Promise.all(batch.map(m => withBackoff(() => gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'] }))))
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

export async function fetchEmailBody(userId, gmailId) {
  const { data: cached } = await supabaseAdmin.from('emails_cache').select('body_html, body_text, attachments').eq('gmail_id', gmailId).eq('user_id', userId).single()
  if (cached?.body_html || cached?.body_text) return cached
  const gmail = await getGmailClient(userId)
  const res = await withBackoff(() => gmail.users.messages.get({ userId: 'me', id: gmailId, format: 'full' }))
  const { html, text, attachments } = extractEmailParts(res.data.payload)
  await supabaseAdmin.from('emails_cache').update({ body_html: html || null, body_text: text || null, attachments, has_attachments: attachments.length > 0 }).eq('gmail_id', gmailId).eq('user_id', userId)
  return { body_html: html, body_text: text, attachments }
}

export async function syncFromHistory(userId, startHistoryId) {
  const gmail = await getGmailClient(userId)
  const histRes = await withBackoff(() => gmail.users.history.list({ userId: 'me', startHistoryId, historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'] }))
  const history = histRes.data.history || []
  const newHistoryId = histRes.data.historyId
  for (const record of history) {
    if (record.messagesAdded) for (const a of record.messagesAdded) if (a.message?.id) {
      const d = await withBackoff(() => gmail.users.messages.get({ userId: 'me', id: a.message.id, format: 'metadata', metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'] }))
      if (d.data) await upsertEmails([parseMetadataMessage(d.data, userId)])
    }
    if (record.messagesDeleted) for (const del of record.messagesDeleted) await supabaseAdmin.from('emails_cache').delete().eq('gmail_id', del.message?.id).eq('user_id', userId)
    const lchanges = [...(record.labelsAdded || []), ...(record.labelsRemoved || [])]
    for (const c of lchanges) if (c.message?.id) {
      const d = await withBackoff(() => gmail.users.messages.get({ userId: 'me', id: c.message.id, format: 'minimal' }))
      if (d.data) { const labels = d.data.labelIds || []; await supabaseAdmin.from('emails_cache').update({ labels, is_unread: labels.includes('UNREAD'), is_starred: labels.includes('STARRED'), is_archived: !labels.includes('INBOX') }).eq('gmail_id', c.message.id).eq('user_id', userId) }
    }
  }
  if (newHistoryId) await supabaseAdmin.from('user_settings').upsert({ user_id: userId, last_history_id: Number(newHistoryId), updated_at: new Date().toISOString() })
  return { processed: history.length, newHistoryId }
}

export async function modifyLabels(userId, gmailId, add, remove) {
  const gmail = await getGmailClient(userId)
  await withBackoff(() => gmail.users.messages.modify({ userId: 'me', id: gmailId, requestBody: { addLabelIds: add, removeLabelIds: remove } }))
}

export async function trashEmail(userId, gmailId) {
  const gmail = await getGmailClient(userId)
  await withBackoff(() => gmail.users.messages.trash({ userId: 'me', id: gmailId }))
}

export async function setupGmailWatch(userId) {
  if (!process.env.GMAIL_PUBSUB_TOPIC) return null
  const gmail = await getGmailClient(userId)
  const res = await withBackoff(() => gmail.users.watch({ userId: 'me', requestBody: { topicName: process.env.GMAIL_PUBSUB_TOPIC, labelIds: ['INBOX', 'SENT'] } }))
  const expiry = res.data.expiration ? new Date(Number(res.data.expiration)).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString()
  await supabaseAdmin.from('user_settings').upsert({ user_id: userId, watch_expiry: expiry, last_history_id: Number(res.data.historyId) || null, updated_at: new Date().toISOString() })
  return { expiry, historyId: res.data.historyId }
}

export async function downloadAttachment(userId, gmailId, attachmentId) {
  const gmail = await getGmailClient(userId)
  const res = await withBackoff(() => gmail.users.messages.attachments.get({ userId: 'me', messageId: gmailId, id: attachmentId }))
  return res.data.data
}
