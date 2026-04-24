/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/webhooks/gmail — Webhook Pub/Sub de Gmail
 * ═══════════════════════════════════════════════════════════════
 *
 * Gmail Push envoie ici une notif Pub/Sub à chaque nouvel email.
 * Le body contient : { emailAddress: "...", historyId: 12345 }
 *
 * CRITIQUE : cette route est appelée par Google Pub/Sub, PAS par un user
 * authentifié. Il n'y a donc PAS de session NextAuth.
 *
 * Comment identifier l'organisation :
 *   → l'adresse email destinataire nous permet de retrouver la
 *     gmail_connection correspondante via getGmailConnectionByEmail,
 *     qui nous donne l'organisation_id.
 *
 * Sécurité :
 *   - Vérifier que la requête vient bien de Pub/Sub (token dans le header)
 *   - Ne traiter que si on trouve une gmail_connection matchant
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGmailConnectionByEmail, updateGmailHistoryId } from '@/lib/gmail/getGmailConnection';
import { supabaseAdmin } from '@/lib/supabase';
import { syncRecentEmails } from '@/lib/gmail';

const PUBSUB_TOKEN = process.env.GMAIL_PUBSUB_TOKEN; // token partagé pour sécuriser l'endpoint

export async function POST(req: NextRequest) {
  // Vérification du token (si configuré côté Pub/Sub)
  if (PUBSUB_TOKEN) {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (token !== PUBSUB_TOKEN) {
      console.warn('[webhooks/gmail] Invalid token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await req.json();

    // Pub/Sub envoie { message: { data: base64(...) } }
    if (!body?.message?.data) {
      return NextResponse.json({ error: 'Invalid Pub/Sub payload' }, { status: 400 });
    }

    const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded) as { emailAddress: string; historyId: number };
    const { emailAddress, historyId } = payload;

    if (!emailAddress || !historyId) {
      return NextResponse.json({ error: 'Missing emailAddress or historyId' }, { status: 400 });
    }

    // Retrouver la connexion Gmail correspondante
    const conn = await getGmailConnectionByEmail(emailAddress);
    if (!conn) {
      console.warn(`[webhooks/gmail] No connection found for ${emailAddress}`);
      // On acknowledge quand même pour éviter que Pub/Sub retry
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Lancer la sync différentielle pour cette connexion
    const result = await syncRecentEmails({
      accessToken: conn.accessToken,
      organisationId: conn.organisationId,
      lastHistoryId: conn.historyId,
      email: emailAddress,
    });

    // Mettre à jour le history_id
    if (result.newHistoryId || historyId) {
      await updateGmailHistoryId(conn.id, result.newHistoryId || historyId);
    }

    // Log
    await supabaseAdmin.from('activity_logs').insert({
      organisation_id: conn.organisationId,
      user_id: null,
      action: 'gmail.webhook_triggered',
      resource_type: 'gmail_connection',
      resource_id: conn.id,
      metadata: { email: emailAddress, history_id: historyId, synced_count: result.count || 0 },
    });

    return NextResponse.json({ ok: true, synced: result.count || 0 });
  } catch (err) {
    console.error('[webhooks/gmail]', err);
    // Retourner 200 pour que Pub/Sub ne retry pas indéfiniment sur un bug de parsing
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
