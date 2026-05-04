/**
 * ═══════════════════════════════════════════════════════════════
 *  lib/sendInviteEmail.ts — Envoi auto invitation via Gmail
 * ═══════════════════════════════════════════════════════════════
 *
 * Construit un message MIME multipart/alternative (HTML + texte) et
 * l'envoie via l'API Gmail en utilisant la connexion Gmail de l'org
 * active (gmail_connections).
 *
 * Retourne { ok: true, gmailId, threadId } en cas de succès, ou
 * { ok: false, error: string } sinon. Ne throw jamais — l'appelant
 * décide quoi faire (créer l'invitation quand même + flag warning).
 *
 * USAGE :
 *   const result = await sendInviteEmail({
 *     organisationId, recipientEmail, orgName, role,
 *     inviterName, inviterEmail, inviteUrl, expiresAt,
 *   });
 *   if (!result.ok) console.error(result.error);
 */

import { getGmailConnection } from '@/lib/gmail/getGmailConnection';
import { buildInviteEmail } from '@/lib/inviteEmail';

export interface SendInviteEmailParams {
  organisationId: string;
  recipientEmail: string;
  orgName: string;
  role: string;
  inviterName: string;
  inviterEmail: string;
  inviteUrl: string;
  expiresAt: string;
}

export type SendInviteResult =
  | { ok: true; gmailId: string; threadId: string }
  | { ok: false; error: string; code: 'NO_GMAIL_CONNECTION' | 'GMAIL_API_ERROR' | 'INTERNAL' };

export async function sendInviteEmail(
  params: SendInviteEmailParams
): Promise<SendInviteResult> {
  const conn = await getGmailConnection(params.organisationId);
  if (!conn) {
    return {
      ok: false,
      error: 'Aucune connexion Gmail configurée pour cette organisation',
      code: 'NO_GMAIL_CONNECTION',
    };
  }

  const { subject, html, text } = buildInviteEmail({
    orgName: params.orgName,
    role: params.role,
    inviterName: params.inviterName,
    inviterEmail: params.inviterEmail,
    inviteUrl: params.inviteUrl,
    expiresAt: params.expiresAt,
  });

  // Build du message MIME multipart/alternative.
  // Boundary aléatoire pour éviter les collisions avec le contenu.
  const boundary = `archange_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // Encoder le sujet en RFC 2047 si non-ASCII (pour les accents et caractères Unicode)
  const encodedSubject = encodeMimeWord(subject);
  // From doit afficher le nom de l'inviteur si possible
  const fromHeader = params.inviterName
    ? `${encodeMimeWord(params.inviterName)} <${conn.email}>`
    : conn.email;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${params.recipientEmail}`,
    `Reply-To: ${params.inviterEmail}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

  const body = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf-8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf-8').toString('base64'),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const rfcMessage = `${headers}\r\n${body}`;
  const raw = Buffer.from(rfcMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('[sendInviteEmail] Gmail API error:', errText);
      return {
        ok: false,
        error: `Gmail API: ${r.status} ${r.statusText}`,
        code: 'GMAIL_API_ERROR',
      };
    }

    const result = await r.json();
    return {
      ok: true,
      gmailId: result.id || '',
      threadId: result.threadId || '',
    };
  } catch (err: any) {
    console.error('[sendInviteEmail] Exception:', err);
    return {
      ok: false,
      error: err?.message || 'Internal error',
      code: 'INTERNAL',
    };
  }
}

// ─── Encodage RFC 2047 (Q-encoded) pour les en-têtes avec accents ──────
function encodeMimeWord(str: string): string {
  // ASCII only → pas besoin d'encoder
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  const encoded = Buffer.from(str, 'utf-8').toString('base64');
  return `=?utf-8?B?${encoded}?=`;
}
