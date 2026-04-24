/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/events — CRUD des événements/réservations de l'organisation
 * ═══════════════════════════════════════════════════════════════
 *
 * Table : `evenements`
 * Opérations : GET (liste), POST (créer), PATCH (modifier), DELETE (supprimer)
 *
 * Filtrage par `organisation_id` au lieu de `user_id`.
 * Le champ user_id reste peuplé mais pointe vers le super_admin
 * de l'org (pour respecter la FK existante).
 *
 * Permissions :
 *   - lecture : GET uniquement
 *   - manager, admin, super_admin : GET + POST + PATCH + DELETE
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrgContext } from '@/lib/org/getOrgContext';

// ─── GET : liste des événements de l'organisation ───────────────────────
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('evenements')
    .select('*')
    .eq('organisation_id', ctx.activeOrgId)
    .order('date_debut', { ascending: true });

  if (error) {
    console.error('[events GET]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// ─── POST : créer un événement ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ctx.permissions.canEditReservations) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Insufficient permissions to create events' },
      { status: 403 }
    );
  }

  const body = await req.json();

  // user_id FK : pointeur symbolique vers le super_admin
  const { data: superAdmin } = await supabaseAdmin
    .from('memberships')
    .select('user_id')
    .eq('organisation_id', ctx.activeOrgId)
    .eq('role', 'super_admin')
    .limit(1)
    .single();

  const userIdForFk = superAdmin?.user_id || ctx.userId;

  const payload = {
    ...body,
    user_id: userIdForFk,
    organisation_id: ctx.activeOrgId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('evenements')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[events POST]', error);
    return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
  }

  // Audit log
  await supabaseAdmin.from('activity_logs').insert({
    organisation_id: ctx.activeOrgId,
    user_id: ctx.userId,
    action: 'event.created',
    resource_type: 'evenement',
    resource_id: data.id,
    metadata: { nom: data.nom, date_debut: data.date_debut },
  });

  return NextResponse.json(data);
}

// ─── PATCH : modifier un événement ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ctx.permissions.canEditReservations) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Vérifier que l'événement appartient à l'org active (sécurité)
  const { data: existing } = await supabaseAdmin
    .from('evenements')
    .select('id, organisation_id')
    .eq('id', id)
    .single();

  if (!existing || existing.organisation_id !== ctx.activeOrgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('evenements')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', ctx.activeOrgId) // double filtre de sécurité
    .select()
    .single();

  if (error) {
    console.error('[events PATCH]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ─── DELETE : supprimer un événement ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ctx.permissions.canEditReservations) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('evenements')
    .delete()
    .eq('id', id)
    .eq('organisation_id', ctx.activeOrgId);

  if (error) {
    console.error('[events DELETE]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // Audit log
  await supabaseAdmin.from('activity_logs').insert({
    organisation_id: ctx.activeOrgId,
    user_id: ctx.userId,
    action: 'event.deleted',
    resource_type: 'evenement',
    resource_id: id,
  });

  return NextResponse.json({ success: true });
}
