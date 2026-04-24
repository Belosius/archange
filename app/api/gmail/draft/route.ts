/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/gmail/draft — Créer un brouillon dans Gmail
 * ═══════════════════════════════════════════════════════════════
 *
 * Même pattern que /api/gmail/send mais crée un brouillon au lieu
 * d'envoyer. Utile pour le workflow où ARCHANGE prépare une réponse
 * qu'un humain valide avant envoi.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/org/getOrgContext';
import { getGmailConnection } from '@/lib/gmail/getGmailConnection';

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ctx.permissions.canReplyToEmails) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { to, subject, body: emailBody, threadId, inReplyTo, cc } = body;
  if (!to || !emailBody) {
    return NextResponse.json({ error: 'to and body required' }, { status: 400 });
  }

  const conn = await getGmailConnection(ctx.activeOrgId);
  if (!conn) {
    return NextResponse.json({ error: 'No Gmail connection' }, { status: 400 });
  }

  const headers = [
    `From: ${conn.email}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    subject ? `Subject: ${subject}` : null,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    inReplyTo ? `References: ${inReplyTo}` : null,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
  ]
    .filter(Boolean)
    .join('\r\n');

  const rfcMessage = `${headers}\r\n\r\n${emailBody}`;
  const raw = Buffer.from(rfcMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const draftPayload: Record<string, unknown> = { message: { raw } };
  if (threadId) draftPayload.message = { raw, threadId };

  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftPayload),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('[gmail/draft] Gmail API error:', errText);
      return NextResponse.json({ error: 'Gmail API error', details: errText }, { status: r.status });
    }

    const result = await r.json();
    return NextResponse.json({
      success: true,
      draft_id: result.id,
      message_id: result.message?.id,
    });
  } catch (err) {
    console.error('[gmail/draft] Exception:', err);
    return NextResponse.json({ error: 'Draft creation failed' }, { status: 500 });
  }
}
