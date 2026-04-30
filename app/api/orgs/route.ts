/**
 * ═══════════════════════════════════════════════════════════════
 * /api/orgs — Liste & création d'organisations
 * ═══════════════════════════════════════════════════════════════
 *
 * GET   → liste les organisations dont l'utilisateur courant est membre
 * POST  → crée une nouvelle organisation (le créateur devient super_admin)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase';

// ───── GET : liste des organisations du user courant ──────────────────

export async function GET() {
    const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, active_organisation_id')
      .eq('email', session.user.email)
      .single();

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Récupérer toutes les memberships actives + jointure organisations
  const { data: memberships, error } = await supabaseAdmin
      .from('memberships')
      .select('id, role, joined_at, organisation:organisations(id, nom, slug, type, is_active)')
      .eq('user_id', user.id)
      .eq('is_active', true);

  if (error) {
        console.error('[GET /api/orgs]', error);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  const orgs = (memberships || [])
      .filter((m: any) => m.organisation && m.organisation.is_active)
      .map((m: any) => ({
              id: m.organisation.id,
              nom: m.organisation.nom,
              slug: m.organisation.slug,
              type: m.organisation.type,
              role: m.role,
              joinedAt: m.joined_at,
              isActive: m.organisation.id === user.active_organisation_id,
      }));

  return NextResponse.json({ orgs, activeOrgId: user.active_organisation_id });
}

// ───── POST : créer une nouvelle organisation ─────────────────────────

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { nom?: string; type?: string };
    try {
          body = await req.json();
    } catch {
          return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

  const nom = String(body.nom || '').trim();
    const type = String(body.type || 'brasserie').trim();

  if (!nom || nom.length < 2 || nom.length > 80) {
        return NextResponse.json(
          { error: 'Le nom doit faire entre 2 et 80 caractères' },
          { status: 400 }
              );
  }

  // Récupérer l'user
  const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Slug unique : nom-en-minuscules-tirets + suffixe random si collision
  const baseSlug = nom
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50) || 'org';

  let slug = baseSlug;
    for (let i = 0; i < 10; i++) {
          const { data: existing } = await supabaseAdmin
            .from('organisations')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();

      if (!existing) break;
          slug = baseSlug + '-' + Math.random().toString(36).substring(2, 6);
    }

  // Créer l'organisation
  const { data: newOrg, error: orgErr } = await supabaseAdmin
      .from('organisations')
      .insert({ nom, name: nom, slug, type, is_active: true })
      .select('id, nom, slug, type')
      .single();

  if (orgErr || !newOrg) {
        console.error('[POST /api/orgs] org create', orgErr);
        return NextResponse.json({ error: 'Création échouée' }, { status: 500 });
  }

  // Créer la membership super_admin pour le créateur
  const { error: memErr } = await supabaseAdmin.from('memberships').insert({
        user_id: user.id,
        organisation_id: newOrg.id,
        role: 'super_admin',
        is_active: true,
  });

  if (memErr) {
        console.error('[POST /api/orgs] membership create', memErr);
        await supabaseAdmin.from('organisations').delete().eq('id', newOrg.id);
        return NextResponse.json({ error: 'Membership creation failed' }, { status: 500 });
  }

  // Définir cette nouvelle org comme l'active
  await supabaseAdmin
      .from('users')
      .update({ active_organisation_id: newOrg.id })
      .eq('id', user.id);

  // Logger l'action
  await supabaseAdmin.from('activity_logs').insert({
        user_id: user.id,
        organisation_id: newOrg.id,
        action: 'org.created',
        resource_type: 'organisation',
        resource_id: newOrg.id,
        metadata: { nom, type },
  });

  return NextResponse.json({ org: newOrg }, { status: 201 });
}
