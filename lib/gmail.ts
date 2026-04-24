/**
 * ═══════════════════════════════════════════════════════════════
 *  lib/gmail.ts — Client Gmail multi-tenant
 * ═══════════════════════════════════════════════════════════════
 *
 * CHANGEMENTS vs version mono-tenant :
 *   - On ne lit plus les tokens dans `accounts` (user_id), mais dans
 *     `gmail_connections` (organisation_id).
 *   - Les insertions/updates dans `emails_cache` contiennent à la fois
 *     `user_id` (FK vers super_admin de l'org, pour la compat) et
 *     `organisation_id` (nouvelle clé de rattachement).
 *   - Les métadonnées de sync (history_id, watch_expiry, last_sync_at)
 *     sont stockées dans `gmail_connections`, plus dans `user_settings`.
 *
 * API publique (identique aux usages internes des routes /api/*) :
 *   - getGmailClient(organisationId, email?)
 *   - parseMetadataMessage(msg, ctx)
 *   - upsertEmails(rows)
 *   - syncFullMailbox(organisationId, email?, onProgress?)
 *   - syncFromHistory(organisationId, startHistoryId, email?)
 *   - syncRecentEmails({ accessToken, organisationId, lastHistoryId, email })
 *       ↳ helper "direct" pour quand on a déjà un token frais
 *         (utilisé par les routes emails/sync et webhooks/gmail)
 *   - fetchEmailBody(organisationId, gmailId, email?)
 *   - modifyLabels(organisationId, gmailId, add, remove, email?)
 *   - trashEmail(organisationId, gmailId, email?)
 *   - setupGmailWatch(organisationId, email?)
 *   - downloadAttachment(organisationId, gmailId, attachmentId, email?)
 */

import { google, gmail_v1 } from 'googleapis'
import { supabaseAdmin } from './supabase'

const BATCH_SIZE = 10
const BACKOFF_BASE = 1000

// ─── Retry avec backoff exponentiel ────────────────────────────────────
async function withBackoff(fn: () => Promise<any>, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      // Quota exceeded → retry avec backoff exponentiel
      if (e?.code === 429 || e?.message?.includes('quota')) {
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
      throw e
    }
  }
  throw new Error('Max retries exceeded')
}

// ─── Helper : lire un header par nom (case-insensitive) ────────────────
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

// ─── Contexte d'écriture emails_cache ──────────────────────────────────
export interface GmailWriteContext {
  organisationId: string
  userId: string // FK symbolique vers le super_admin de l'org
  email: string
}

// ─── Résolution : récupérer le user_id du super_admin pour les FK ──────
async function resolveUserIdForOrg(organisationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('memberships')
    .select('user_id')
    .eq('organisation_id', organisationId)
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .limit(1)
    .single()
  return data?.user_id || null
}

// ─── Construction d'un client Gmail depuis une connexion gmail_connections ──
/**
 * Récupère et crée un client Gmail OAuth2 pour une organisation.
 * Utilise la table gmail_connections (plus `accounts`).
 *
 * Retourne le client Gmail prêt à l'emploi + le contexte d'écriture
 * (organisationId, userId, email) à passer aux fonctions qui écrivent
 * dans emails_cache.
 */
export async function getGmailClient(
  organisationId: string,
  email?: string
): Promise<{ client: gmail_v1.Gmail; ctx: GmailWriteContext; connectionId: string }> {
  let query = supabaseAdmin
    .from('gmail_connections')
    .select('id, email, oauth_access_token, oauth_refresh_token, oauth_expires_at')
    .eq('organisation_id', organisationId)
    .eq('is_active', true)

  if (email) query = query.eq('email', email)

  const { data: conn } = await query.limit(1).single()
  if (!conn) throw new Error('GMAIL_AUTH_EXPIRED')

  const userId = await resolveUserIdForOrg(organisationId)
  if (!userId) throw new Error('No super_admin found for organisation')

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  // expiry_date en ms — la lib google gère le refresh auto
  const expiryMs = conn.oauth_expires_at ? new Date(conn.oauth_expires_at).getTime() : undefined
  auth.setCredentials({
    access_token: conn.oauth_access_token,
    refresh_token: conn.oauth_refresh_token,
    expiry_date: expiryMs,
  })

  // Quand la lib rafraîchit le token, persister en Supabase
  auth.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      const update: Record<string, unknown> = { oauth_access_token: tokens.access_token }
      if (tokens.expiry_date) update.oauth_expires_at = new Date(tokens.expiry_date).toISOString()
      if (tokens.refresh_token) update.oauth_refresh_token = tokens.refresh_token
      await supabaseAdmin.from('gmail_connections').update(update).eq('id', conn.id)
    }
  })

  const client = google.gmail({ version: 'v1', auth })
  return {
    client,
    ctx: { organisationId, userId, email: conn.email },
    connectionId: conn.id,
  }
}

// ─── Extraction des parties (html / text / attachments) d'un message ──
export function extractEmailParts(payload: any): {
  html: string
  text: string
  attachments: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }>
} {
  let html = ''
  let text = ''
  const attachments: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }> = []

  const walk = (part: any) => {
    if (!part) return
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        attachmentId: part.body.attachmentId,
        size: part.body.size || 0,
      })
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      html += Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    if (part.parts) part.parts.forEach(walk)
  }

  walk(payload)
  return { html, text, attachments }
}

// ─── Parse une entrée Gmail en row emails_cache ────────────────────────
export function parseMetadataMessage(msg: any, ctx: GmailWriteContext) {
  const headers = msg.payload?.headers || []
  const from = getHeader(headers, 'from')
  const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/)
  const labels = msg.labelIds || []
  let dateIso = new Date().toISOString()
  try {
    dateIso = new Date(Number(msg.internalDate)).toISOString()
  } catch {}

  return {
    user_id: ctx.userId,
    organisation_id: ctx.organisationId,
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
    updated_at: new Date().toISOString(),
  }
}

// ─── Upsert batch dans emails_cache ────────────────────────────────────
export async function upsertEmails(rows: any[]) {
  if (!rows.length) return
  const { error } = await supabaseAdmin
    .from('emails_cache')
    .upsert(rows, { onConflict: 'gmail_id,user_id', ignoreDuplicates: false })
  if (error) console.error('[upsertEmails]', error.message)
}

// ─── Sync complète (premier setup) ─────────────────────────────────────
export async function syncFullMailbox(
  organisationId: string,
  email?: string,
  onProgress?: (synced: number, total: number) => void
): Promise<{ synced: number; historyId: number }> {
  const { client: gmail, ctx, connectionId } = await getGmailClient(organisationId, email)
  let totalSynced = 0
  let estimated = 0

  // Récupérer toutes les pages de message IDs (inbox + sent)
  for (const labelId of ['INBOX', 'SENT']) {
    let pageToken: string | undefined = undefined
    do {
      const listRes: any = await withBackoff(() =>
        gmail.users.messages.list({ userId: 'me', labelIds: [labelId], maxResults: 100, pageToken })
      )
      const messages: any[] = listRes.data.messages || []
      pageToken = listRes.data.nextPageToken || undefined
      estimated += messages.length

      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE)
        const details = await Promise.all(
          batch.map(m =>
            withBackoff(() =>
              gmail.users.messages.get({
                userId: 'me',
                id: m.id!,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
              })
            )
          )
        )
        const rows = details.filter((d: any) => d.data).map((d: any) => parseMetadataMessage(d.data, ctx))
        await upsertEmails(rows)
        totalSynced += rows.length
        onProgress?.(totalSynced, estimated)
      }
    } while (pageToken)
  }

  // Stocker le history_id courant + mark sync OK dans gmail_connections
  const profileRes: any = await withBackoff(() => gmail.users.getProfile({ userId: 'me' }))
  const historyId = Number(profileRes.data.historyId)
  await supabaseAdmin
    .from('gmail_connections')
    .update({
      history_id: historyId,
      last_sync_at: new Date().toISOString(),
    })
    .eq('id', connectionId)

  return { synced: totalSynced, historyId }
}

// ─── Sync différentielle via history API ───────────────────────────────
export async function syncFromHistory(
  organisationId: string,
  startHistoryId: string | number | bigint,
  email?: string
): Promise<{ processed: number; newHistoryId: string | number | undefined; count: number }> {
  const { client: gmail, ctx, connectionId } = await getGmailClient(organisationId, email)

  const histRes: any = await withBackoff(() =>
    gmail.users.history.list({
      userId: 'me',
      startHistoryId: String(startHistoryId),
      historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
    })
  )
  const history: any[] = histRes.data.history || []
  const newHistoryId = histRes.data.historyId

  let count = 0
  for (const record of history) {
    // Nouveaux messages → fetch metadata + upsert
    if (record.messagesAdded) {
      for (const a of record.messagesAdded) {
        if (a.message?.id) {
          const d: any = await withBackoff(() =>
            gmail.users.messages.get({
              userId: 'me',
              id: a.message!.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
            })
          )
          if (d.data) {
            await upsertEmails([parseMetadataMessage(d.data, ctx)])
            count++
          }
        }
      }
    }

    // Messages supprimés → delete cache row
    if (record.messagesDeleted) {
      for (const del of record.messagesDeleted) {
        if (del.message?.id) {
          await supabaseAdmin
            .from('emails_cache')
            .delete()
            .eq('gmail_id', del.message.id)
            .eq('organisation_id', ctx.organisationId)
        }
      }
    }

    // Changements de labels (unread, starred, archived)
    const labelChanges = [...(record.labelsAdded || []), ...(record.labelsRemoved || [])]
    for (const c of labelChanges) {
      if (c.message?.id) {
        const d: any = await withBackoff(() =>
          gmail.users.messages.get({ userId: 'me', id: c.message!.id!, format: 'metadata' })
        )
        if (d.data) {
          const labels = d.data.labelIds || []
          await supabaseAdmin
            .from('emails_cache')
            .update({
              labels,
              is_unread: labels.includes('UNREAD'),
              is_starred: labels.includes('STARRED'),
              is_archived: !labels.includes('INBOX'),
              updated_at: new Date().toISOString(),
            })
            .eq('gmail_id', c.message.id)
            .eq('organisation_id', ctx.organisationId)
        }
      }
    }
  }

  // Persister le nouveau history_id
  if (newHistoryId) {
    await supabaseAdmin
      .from('gmail_connections')
      .update({
        history_id: Number(newHistoryId),
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
  }

  return { processed: history.length, newHistoryId, count }
}

// ─── Helper "direct" attendu par les routes (accessToken déjà frais) ───
/**
 * Utilisé par :
 *   - /api/emails/sync (après getGmailConnection qui refresh le token)
 *   - /api/webhooks/gmail (même logique)
 *
 * Si lastHistoryId est fourni → syncFromHistory.
 * Sinon → syncFullMailbox (premier setup).
 */
export async function syncRecentEmails(opts: {
  accessToken: string
  organisationId: string
  lastHistoryId: string | number | bigint | null
  email: string
}): Promise<{ count: number; newHistoryId: string | number | undefined }> {
  const { organisationId, lastHistoryId, email } = opts

  if (lastHistoryId) {
    const res = await syncFromHistory(organisationId, lastHistoryId, email)
    return { count: res.count, newHistoryId: res.newHistoryId }
  }

  const res = await syncFullMailbox(organisationId, email)
  return { count: res.synced, newHistoryId: res.historyId }
}

// ─── Lazy fetch du body HTML/text d'un email ───────────────────────────
export async function fetchEmailBody(
  organisationId: string,
  gmailId: string,
  email?: string
): Promise<{ body_html: string | null; body_text: string | null; attachments: any[] }> {
  const { data: cached } = await supabaseAdmin
    .from('emails_cache')
    .select('body_html, body_text, attachments')
    .eq('gmail_id', gmailId)
    .eq('organisation_id', organisationId)
    .single()

  if (cached?.body_html || cached?.body_text) {
    return {
      body_html: cached.body_html,
      body_text: cached.body_text,
      attachments: cached.attachments || [],
    }
  }

  const { client: gmail } = await getGmailClient(organisationId, email)
  const res: any = await withBackoff(() =>
    gmail.users.messages.get({ userId: 'me', id: gmailId, format: 'full' })
  )
  const { html, text, attachments } = extractEmailParts(res.data.payload)

  await supabaseAdmin
    .from('emails_cache')
    .update({
      body_html: html || null,
      body_text: text || null,
      attachments,
      has_attachments: attachments.length > 0,
      updated_at: new Date().toISOString(),
    })
    .eq('gmail_id', gmailId)
    .eq('organisation_id', organisationId)

  return { body_html: html, body_text: text, attachments }
}

// ─── Modifier les labels d'un email dans Gmail ─────────────────────────
export async function modifyLabels(
  organisationId: string,
  gmailId: string,
  add: string[],
  remove: string[],
  email?: string
): Promise<void> {
  const { client: gmail } = await getGmailClient(organisationId, email)
  await withBackoff(() =>
    gmail.users.messages.modify({
      userId: 'me',
      id: gmailId,
      requestBody: { addLabelIds: add, removeLabelIds: remove },
    })
  )
}

// ─── Mettre à la corbeille Gmail ───────────────────────────────────────
export async function trashEmail(
  organisationId: string,
  gmailId: string,
  email?: string
): Promise<void> {
  const { client: gmail } = await getGmailClient(organisationId, email)
  await withBackoff(() => gmail.users.messages.trash({ userId: 'me', id: gmailId }))
}

// ─── Setup du watch Gmail Push → Pub/Sub ───────────────────────────────
export async function setupGmailWatch(
  organisationId: string,
  email?: string
): Promise<{ expiry: string; historyId: string } | null> {
  if (!process.env.GMAIL_PUBSUB_TOPIC) return null
  const { client: gmail, connectionId } = await getGmailClient(organisationId, email)

  const res: any = await withBackoff(() =>
    gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: process.env.GMAIL_PUBSUB_TOPIC,
        labelIds: ['INBOX', 'SENT'],
      },
    })
  )

  const expiry = res.data.expiration
    ? new Date(Number(res.data.expiration)).toISOString()
    : new Date(Date.now() + 7 * 86400000).toISOString()

  await supabaseAdmin
    .from('gmail_connections')
    .update({
      watch_expiry: expiry,
      history_id: Number(res.data.historyId) || null,
    })
    .eq('id', connectionId)

  return { expiry, historyId: String(res.data.historyId || '') }
}

// ─── Télécharger une pièce jointe ──────────────────────────────────────
export async function downloadAttachment(
  organisationId: string,
  gmailId: string,
  attachmentId: string,
  email?: string
): Promise<string | undefined> {
  const { client: gmail } = await getGmailClient(organisationId, email)
  const res: any = await withBackoff(() =>
    gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: gmailId,
      id: attachmentId,
    })
  )
  return res.data.data
}
