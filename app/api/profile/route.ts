/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/profile — Profil utilisateur (lecture + édition)
 * ═══════════════════════════════════════════════════════════════
 *
 * GET   /api/profile
 *   Retourne le profil enrichi de l'utilisateur connecté :
 *     - Infos personnelles (email Google, prenom, nom, image)
 *     - Boîte Gmail métier de l'org active (si connectée)
 *     - Toutes les organisations (avec rôle + date d'adhésion)
 *     - Rôle dans l'org active
 *
 * PATCH /api/profile
 *   Modifie prenom/nom de l'utilisateur connecté.
 *   Met aussi à jour le champ `name` (concaténation pour compat).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Profil de base
  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id, email, name, prenom, nom, image, active_organisation_id, created_at')
    .eq('email', session.user.email)
    .single();

  if (userErr || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // 2. Toutes les organisations (memberships actifs)
  const { data: rawMemberships } = await supabaseAdmin
    .from('memberships')
    .select(`
      role,
      joined_at,
      organisation_id,
      organisations:organisation_id ( id, nom, name, slug, type )
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('joined_at', { ascending: true });

  const memberships = (rawMemberships || []).map((m: any) => ({
    role: m.role,
    joined_at: m.joined_at,
    organisation: m.organisations
      ? {
          id: m.organisations.id,
          nom: m.organisations.nom || m.organisations.name || 'Sans nom',
          slug: m.organisations.slug,
          type: m.organisations.type,
        }
      : null,
  })).filter(m => m.organisation !== null);

  // 3. Rôle dans l'org active
  const activeMembership = memberships.find(
    m => m.organisation?.id === user.active_organisation_id
  );

  // 4. Boîte Gmail métier de l'org active (peut être différente du compte Google)
  let gmailConnection: { email: string; label: string | null } | null = null;
  if (user.active_organisation_id) {
    const { data: conn } = await supabaseAdmin
      .from('gmail_connections')
      .select('email, label')
      .eq('organisation_id', user.active_organisation_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (conn) {
      gmailConnection = { email: conn.email, label: conn.label };
    }
  }

  return NextResponse.json({
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      prenom: user.prenom,
      nom: user.nom,
      image: user.image,
      active_organisation_id: user.active_organisation_id,
      created_at: user.created_at,
    },
    activeOrgRole: activeMembership?.role || null,
    gmailConnection,
    memberships,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { prenom?: string; nom?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.prenom === 'string') {
    const cleaned = body.prenom.trim().slice(0, 100);
    if (cleaned.length === 0) {
      return NextResponse.json(
        { error: 'Le prénom ne peut pas être vide' },
        { status: 400 }
      );
    }
    updates.prenom = cleaned;
  }

  if (typeof body.nom === 'string') {
    const cleaned = body.nom.trim().slice(0, 100);
    if (cleaned.length === 0) {
      return NextResponse.json(
        { error: 'Le nom ne peut pas être vide' },
        { status: 400 }
      );
    }
    updates.nom = cleaned;
  }

  // Aucun champ valide envoyé
  if (!('prenom' in updates) && !('nom' in updates)) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
  }

  // Récupérer la valeur existante des champs non envoyés (pour reconstruire `name`)
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('prenom, nom')
    .eq('email', session.user.email)
    .single();

  const finalPrenom = (updates.prenom as string | undefined) ?? existing?.prenom ?? '';
  const finalNom = (updates.nom as string | undefined) ?? existing?.nom ?? '';
  updates.name = `${finalPrenom} ${finalNom}`.trim();

  const { data: updated, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('email', session.user.email)
    .select('id, email, name, prenom, nom, image')
    .single();

  if (error || !updated) {
    console.error('[PATCH /api/profile]', error);
    return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 });
  }

  return NextResponse.json({ success: true, profile: updated });
}
