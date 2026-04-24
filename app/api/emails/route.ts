/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/emails — Gestion du cache email par organisation
 * ═══════════════════════════════════════════════════════════════
 *
 * Table : `emails_cache` (+ lecture `user_settings` pour gmail sync state)
 * Opérations : GET (liste avec filtres), POST (insert batch), 
 *              PATCH (mark as read/starred/archived), DELETE
 *
 * Filtres supportés en GET :
 *   - direction=received|sent
 *   - is_unread=true|false
 *   - is_starred=true|false
 *   - is_archived=true|false
 *   - gmail_id=<id>  (récupérer un mail spécifique)
 *
 * Filtrage TOUJOURS par `organisation_id`, plus par user_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrgContext } from '@/lib/org/getOrgContext';

// ─── GET : liste des emails avec filtres ────────────────────────────────
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const direction = url.searchParams.get('direction');
  const isUnread = url.searchParams.get('is_unread');
  const isStarred = url.searchParams.get('is_starred');
  const isArchived = url.searchParams.get('is_archived');
  const gmailId = url.searchParams.get('gmail_id');
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  let query = supabaseAdmin
    .from('emails_cache')
    .select('*')
    .eq('organisation_id', ctx.activeOrgId)
    .order('date_iso', { ascending: false })
    .limit(limit);

  if (direction) query = query.eq('direction', direction);
  if (isUnread !== null) query = query.eq('is_unread', isUnread === 'true');
  if (isStarred !== null) query = query.eq('is_starred', isStarred === 'true');
  if (isArchived !== null) query = query.eq('is_archived', isArchived === 'true');
  if (gmailId) query = query.eq('gmail_id', gmailId);

  const { data, error } = await query;

  if (error) {
    console.error('[emails GET]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// ─── POST : insert batch d'emails (venant de la sync Gmail) ─────────────
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (ctx.role === 'lecture') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const emails = Array.isArray(body) ? body : [body];

  // Récupérer le user_id du super_admin pour remplir la FK
  const { data: superAdmin } = await supabaseAdmin
    .from('memberships')
    .select('user_id')
    .eq('organisation_id', ctx.activeOrgId)
    .eq('role', 'super_admin')
    .limit(1)
    .single();
  const userIdForFk = superAdmin?.user_id || ctx.userId;

  const payload = emails.map((e) => ({
    ...e,
    user_id: userIdForFk,
    organisation_id: ctx.activeOrgId,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabaseAdmin
    .from('emails_cache')
    .upsert(payload, { onConflict: 'gmail_id' })
    .select();

  if (error) {
    console.error('[emails POST]', error);
    return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: data?.length || 0 });
}

// ─── PATCH : mettre à jour un email (read/starred/archived/labels) ──────
export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (ctx.role === 'lecture') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { gmail_id, ...updates } = body;
  if (!gmail_id) return NextResponse.json({ error: 'gmail_id required' }, { status: 400 });

  // Champs autorisés seulement
  const allowed = ['is_unread', 'is_starred', 'is_archived', 'labels'];
  const safeUpdates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in updates) safeUpdates[k] = updates[k];
  }
  safeUpdates.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('emails_cache')
    .update(safeUpdates)
    .eq('gmail_id', gmail_id)
    .eq('organisation_id', ctx.activeOrgId); // sécurité

  if (error) {
    console.error('[emails PATCH]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ─── DELETE : supprimer de la cache (ne supprime pas dans Gmail) ────────
export async function DELETE(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (ctx.role === 'lecture') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const gmailId = url.searchParams.get('gmail_id');
  if (!gmailId) return NextResponse.json({ error: 'gmail_id required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('emails_cache')
    .delete()
    .eq('gmail_id', gmailId)
    .eq('organisation_id', ctx.activeOrgId);

  if (error) {
    console.error('[emails DELETE]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
