/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/gmail/watch — Setup/renouvellement du Gmail Push
 * ═══════════════════════════════════════════════════════════════
 *
 * Gmail push watch doit être renouvelé tous les 7 jours max.
 * On stocke l'expiration + history_id dans gmail_connections.
 *
 * POST : setup ou renouvellement du watch pour la connexion Gmail
 *        de l'organisation active
 * GET  : statut du watch (expiry, history_id)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/org/getOrgContext';
import { getGmailConnection } from '@/lib/gmail/getGmailConnection';
import { supabaseAdmin } from '@/lib/supabase';

const PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC || 'projects/archange-reva/topics/gmail-watch';

// ─── GET : status du watch de la connexion active ───────────────────────
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('gmail_connections')
    .select('id, email, history_id, watch_expiry, last_sync_at')
    .eq('organisation_id', ctx.activeOrgId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!data) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: data.email,
    history_id: data.history_id,
    watch_expiry: data.watch_expiry,
    last_sync_at: data.last_sync_at,
    is_expired: data.watch_expiry ? new Date(data.watch_expiry) < new Date() : true,
  });
}

// ─── POST : démarrer/renouveler le watch ────────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ctx.permissions.canManageOrg) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const conn = await getGmailConnection(ctx.activeOrgId);
  if (!conn) {
    return NextResponse.json({ error: 'No Gmail connection' }, { status: 400 });
  }

  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName: PUBSUB_TOPIC,
        labelIds: ['INBOX'],
        labelFilterAction: 'include',
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('[gmail/watch] Gmail API error:', errText);
      return NextResponse.json({ error: 'Watch setup failed', details: errText }, { status: r.status });
    }

    const { historyId, expiration } = await r.json();
    const expiryDate = new Date(Number(expiration));

    // Persister
    await supabaseAdmin
      .from('gmail_connections')
      .update({
        history_id: historyId,
        watch_expiry: expiryDate.toISOString(),
      })
      .eq('id', conn.id);

    return NextResponse.json({
      success: true,
      history_id: historyId,
      watch_expiry: expiryDate.toISOString(),
    });
  } catch (err) {
    console.error('[gmail/watch] Exception:', err);
    return NextResponse.json({ error: 'Watch setup failed' }, { status: 500 });
  }
}
