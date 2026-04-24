/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/emails/sync — Sync différentielle Gmail → emails_cache
 * ═══════════════════════════════════════════════════════════════
 *
 * Utilise l'API Gmail history pour ne récupérer que les emails
 * nouveaux/modifiés depuis le dernier history_id.
 *
 * Écrit dans emails_cache avec organisation_id = org active.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/org/getOrgContext';
import { getGmailConnection, updateGmailHistoryId } from '@/lib/gmail/getGmailConnection';
import { supabaseAdmin } from '@/lib/supabase';
import { syncRecentEmails } from '@/lib/gmail';

// ─── GET : retourne l'état de sync de l'org active ──────────────────────
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('gmail_connections')
    .select('email, history_id, last_sync_at, watch_expiry')
    .eq('organisation_id', ctx.activeOrgId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!data) return NextResponse.json({ synced: false });

  return NextResponse.json({
    synced: true,
    email: data.email,
    last_history_id: data.history_id,
    last_sync_at: data.last_sync_at,
    watch_expiry: data.watch_expiry,
  });
}

// ─── POST : lancer une sync différentielle ──────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (ctx.role === 'lecture') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const conn = await getGmailConnection(ctx.activeOrgId);
  if (!conn) {
    return NextResponse.json({ error: 'No Gmail connection' }, { status: 400 });
  }

  try {
    // Appel à la fonction de sync existante (dans lib/gmail.ts)
    // Elle a été modifiée pour accepter une connexion au lieu d'un user_id
    const result = await syncRecentEmails({
      accessToken: conn.accessToken,
      organisationId: ctx.activeOrgId,
      lastHistoryId: conn.historyId,
      email: conn.email,
    });

    // Mettre à jour le history_id
    if (result.newHistoryId) {
      await updateGmailHistoryId(conn.id, result.newHistoryId);
    }

    // Mettre à jour last_sync_at
    await supabaseAdmin
      .from('gmail_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', conn.id);

    return NextResponse.json({
      success: true,
      count: result.count || 0,
      new_history_id: result.newHistoryId?.toString(),
    });
  } catch (err) {
    console.error('[emails/sync]', err);
    return NextResponse.json(
      { error: 'Sync failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
