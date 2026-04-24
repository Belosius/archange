/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/gmail/send — Envoi d'email via Gmail API
 * ═══════════════════════════════════════════════════════════════
 *
 * Utilise désormais le token Gmail de la CONNEXION de l'organisation
 * (via gmail_connections), plus le token OAuth personnel du user.
 *
 * Permission : canReplyToEmails (manager, admin, super_admin).
 * Log systématique dans activity_logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/org/getOrgContext';
import { getGmailConnection } from '@/lib/gmail/getGmailConnection';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ctx.permissions.canReplyToEmails) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Insufficient permissions to send email' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { to, subject, body: emailBody, threadId, inReplyTo, cc, bcc } = body;
  if (!to || !emailBody) {
    return NextResponse.json({ error: 'to and body required' }, { status: 400 });
  }

  const conn = await getGmailConnection(ctx.activeOrgId);
  if (!conn) {
    return NextResponse.json(
      { error: 'No Gmail connection configured for this organisation' },
      { status: 400 }
    );
  }

  // Construire le message RFC 2822
  const headers = [
    `From: ${conn.email}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
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

  const gmailPayload: Record<string, unknown> = { raw };
  if (threadId) gmailPayload.threadId = threadId;

  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gmailPayload),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('[gmail/send] Gmail API error:', errText);
      return NextResponse.json(
        { error: 'Gmail API error', details: errText },
        { status: r.status }
      );
    }

    const result = await r.json();

    // Log d'activité
    await supabaseAdmin.from('activity_logs').insert({
      organisation_id: ctx.activeOrgId,
      user_id: ctx.userId,
      action: 'email.sent',
      resource_type: 'email',
      resource_id: result.id,
      metadata: { to, subject, threadId: result.threadId },
    });

    return NextResponse.json({
      success: true,
      gmail_id: result.id,
      thread_id: result.threadId,
    });
  } catch (err) {
    console.error('[gmail/send] Exception:', err);
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }
}
