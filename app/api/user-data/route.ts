/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/user-data — Lecture/écriture des données métier de l'org
 * ═══════════════════════════════════════════════════════════════
 *
 * Historique : cette route gérait un gros blob JSON par utilisateur
 * (contexte ARCHANGE, règles, réservations, etc.) via la table user_data
 * filtrée par `user_id`.
 *
 * Nouveau modèle : la table user_data a conservé sa structure, mais les
 * données sont maintenant "owned" par une organisation (colonne
 * organisation_id). On filtre donc par organisation_id, plus par user_id.
 *
 * Le champ user_id reste peuplé (FK vers users) pour garder les FK de la
 * prod, mais il pointe sur le super_admin de l'org. Ce n'est plus la clé
 * de sélection.
 *
 * Sécurité : le user doit être membre de l'org pour lire.
 * Pour écrire, il doit avoir `canEditSources` (exclut les managers).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrgContext } from '@/lib/org/getOrgContext';

// ─── GET : lire les user_data de l'organisation active ──────────────────
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('user_data')
    .select('*')
    .eq('organisation_id', ctx.activeOrgId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = 0 rows, OK pour une org qui démarre
    console.error('[user-data GET]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // Si pas de row user_data, on retourne un blob vide
  return NextResponse.json(data || {});
}

// ─── POST : upsert des user_data pour l'organisation active ─────────────
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Seuls admin et super_admin peuvent écrire les Sources ARCHANGE
  // Les managers peuvent écrire les réservations/statuts/relances (sous-set du user_data)
  // Pour simplifier : tous les membres sauf "lecture" peuvent écrire
  if (ctx.role === 'lecture') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Read-only users cannot modify data' },
      { status: 403 }
    );
  }

  const body = await req.json();

  // Si le rôle est manager, on vérifie qu'il ne modifie PAS les champs Sources
  if (ctx.role === 'manager') {
    const sourcesFields = [
      'context',
      'links',
      'links_fetched',
      'espaces',
      'regles_commerciales',
      'ton_style',
      'apprentissages',
      'cas_particuliers',
      'regles_absolues',
    ];
    const illegalEdits = sourcesFields.filter((f) => f in body);
    if (illegalEdits.length > 0) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: `Role 'manager' cannot edit Sources ARCHANGE fields: ${illegalEdits.join(', ')}`,
        },
        { status: 403 }
      );
    }
  }

  // Upsert : utilise organisation_id comme clé de conflit (UNIQUE dans user_data)
  // Note : si c'est la première fois, on pré-remplit user_id avec le super_admin
  const { data: existing } = await supabaseAdmin
    .from('user_data')
    .select('user_id')
    .eq('organisation_id', ctx.activeOrgId)
    .single();

  let userIdForRow: string;
  if (existing) {
    userIdForRow = existing.user_id;
  } else {
    // Récupérer le super_admin de l'org pour le user_id initial
    const { data: superAdmin } = await supabaseAdmin
      .from('memberships')
      .select('user_id')
      .eq('organisation_id', ctx.activeOrgId)
      .eq('role', 'super_admin')
      .limit(1)
      .single();
    userIdForRow = superAdmin?.user_id || ctx.userId;
  }

  const payload = {
    ...body,
    user_id: userIdForRow,
    organisation_id: ctx.activeOrgId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('user_data')
    .upsert(payload, { onConflict: 'organisation_id' });

  if (error) {
    console.error('[user-data POST]', error);
    return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
  }

  // Log d'activité pour les modifs de Sources (auditable)
  if (ctx.role !== 'manager') {
    const hasSourcesChanges = [
      'context',
      'regles_commerciales',
      'ton_style',
      'apprentissages',
      'cas_particuliers',
      'regles_absolues',
    ].some((f) => f in body);

    if (hasSourcesChanges) {
      await supabaseAdmin.from('activity_logs').insert({
        organisation_id: ctx.activeOrgId,
        user_id: ctx.userId,
        action: 'sources.modified',
        resource_type: 'user_data',
        metadata: { fields: Object.keys(body) },
      });
    }
  }

  return NextResponse.json({ success: true });
}
