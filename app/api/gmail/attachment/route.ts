/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/gmail/attachment — Récupérer une pièce jointe Gmail
 * ═══════════════════════════════════════════════════════════════
 *
 * Query params :
 *   - messageId : id du message Gmail
 *   - attachmentId : id de la pièce jointe
 *
 * Retourne le contenu base64 de la pièce jointe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/org/getOrgContext';
import { getGmailConnection } from '@/lib/gmail/getGmailConnection';

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const messageId = url.searchParams.get('messageId');
  const attachmentId = url.searchParams.get('attachmentId');
  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: 'messageId and attachmentId required' }, { status: 400 });
  }

  const conn = await getGmailConnection(ctx.activeOrgId);
  if (!conn) {
    return NextResponse.json({ error: 'No Gmail connection' }, { status: 400 });
  }

  try {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${conn.accessToken}` } }
    );
    if (!r.ok) {
      return NextResponse.json({ error: 'Gmail API error' }, { status: r.status });
    }
    const data = await r.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[gmail/attachment]', err);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
}
