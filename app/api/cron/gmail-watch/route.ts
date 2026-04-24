/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/cron/gmail-watch — Renouveler tous les watches Gmail
 * ═══════════════════════════════════════════════════════════════
 *
 * Appelée par Vercel Cron toutes les 24h.
 * Itère sur TOUTES les gmail_connections actives et renouvelle les
 * watches dont l'expiration approche (<48h).
 *
 * Auth : vérification du header d'autorisation Vercel Cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGmailConnection } from '@/lib/gmail/getGmailConnection';

const PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC || 'projects/archange-reva/topics/gmail-watch';
const CRON_SECRET = process.env.CRON_SECRET;
const RENEWAL_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48h

export async function GET(req: NextRequest) {
  // Sécurité : vérifier le header Vercel Cron ou un secret
  if (CRON_SECRET) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Récupérer TOUTES les connexions Gmail actives
  const { data: connections, error } = await supabaseAdmin
    .from('gmail_connections')
    .select('id, organisation_id, email, watch_expiry')
    .eq('is_active', true);

  if (error) {
    console.error('[cron/gmail-watch]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  const results = { renewed: 0, skipped: 0, failed: 0, errors: [] as string[] };
  const now = Date.now();

  for (const c of connections || []) {
    try {
      const needsRenewal =
        !c.watch_expiry ||
        new Date(c.watch_expiry).getTime() - now < RENEWAL_THRESHOLD_MS;
      if (!needsRenewal) {
        results.skipped++;
        continue;
      }

      // Récupérer un token frais (refresh auto)
      const conn = await getGmailConnection(c.organisation_id, c.email);
      if (!conn) {
        results.failed++;
        results.errors.push(`${c.email}: no valid token`);
        continue;
      }

      // Renouveler le watch
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
        results.failed++;
        results.errors.push(`${c.email}: Gmail API ${r.status}`);
        continue;
      }

      const { historyId, expiration } = await r.json();
      await supabaseAdmin
        .from('gmail_connections')
        .update({
          history_id: historyId,
          watch_expiry: new Date(Number(expiration)).toISOString(),
        })
        .eq('id', c.id);

      results.renewed++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${c.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json(results);
}
