/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/emails/[id] — Opérations sur un email de la table `emails`
 * ═══════════════════════════════════════════════════════════════
 *
 * Note : cette route travaille sur la table `emails` (pas `emails_cache`).
 * Dans la prod actuelle, `emails` contient 364 rows et est la table
 * "historique" originale. emails_cache est la table plus moderne.
 *
 * On maintient la compatibilité en filtrant par organisation_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrgContext } from '@/lib/org/getOrgContext';

// ─── PATCH : modifier un email (flags, labels, etc.) ────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (ctx.role === 'lecture') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();

  // Whitelist des champs modifiables
  const allowed = ['is_unread', 'is_starred', 'a_traiter', 'flags', 'labels'];
  const safeUpdates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) safeUpdates[k] = body[k];
  }
  safeUpdates.updated_at = new Date().toISOString();

  // Vérifier que l'email appartient bien à l'org active
  const { data: existing } = await supabaseAdmin
    .from('emails')
    .select('id, organisation_id')
    .eq('id', id)
    .single();

  if (!existing || existing.organisation_id !== ctx.activeOrgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from('emails')
    .update(safeUpdates)
    .eq('id', id)
    .eq('organisation_id', ctx.activeOrgId);

  if (error) {
    console.error('[emails/[id] PATCH]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
