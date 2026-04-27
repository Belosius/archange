/**
 * ═══════════════════════════════════════════════════════════════
 * /api/orgs — Lister/créer des organisations
 * ═══════════════════════════════════════════════════════════════
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';

// ─── GET : liste les orgs dont je suis membre ──────────────────────────
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

  if (!user) return NextResponse.json({ orgs: [], activeOrgId: null });

  const { data: memberships } = await supabaseAdmin
    .from('memberships')
    .select(`
      role,
      is_active,
      organisation_id,
      organisations:organisation_id (id, nom, slug, type, is_active)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true);

  const orgs = (memberships || [])
    .filter((m: any) => m.organisations && m.organisations.is_active)
    .map((m: any) => ({
      id: m.organisations.id,
      nom: m.organisations.nom,
      slug: m.organisations.slug,
      type: m.organisations.type,
      role: m.role,
    }));

  return NextResponse.json({
    orgs,
    activeOrgId: user.active_organisation_id || (orgs[0]?.id ?? null),
  });
}

// ─── POST : créer une nouvelle organisation ────────────────────────────
// Le créateur devient automatiquement super_admin de l'org.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { nom, type } = body;
  if (!nom?.trim()) {
    return NextResponse.json({ error: 'nom required' }, { status: 400 });
  }

  // Slug auto : nom en minuscules, sans accents, espaces -> tirets
  const slug = nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) + '-' + Math.random().toString(36).slice(2, 8);

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Créer l'org
  const { data: newOrg, error: orgErr } = await supabaseAdmin
    .from('organisations')
    .insert({
      nom: nom.trim(),
      name: nom.trim(),  // colonne legacy
      slug,
      type: type || 'brasserie',
      is_active: true,
    })
    .select()
    .single();

  if (orgErr || !newOrg) {
    console.error('[orgs POST] Create failed:', orgErr);
    return NextResponse.json({ error: 'Failed to create org', details: orgErr?.message }, { status: 500 });
  }

  // Ajouter le créateur comme super_admin
  const { error: memErr } = await supabaseAdmin
    .from('memberships')
    .insert({
      user_id: user.id,
      organisation_id: newOrg.id,
      role: 'super_admin',
      is_active: true,
    });

  if (memErr) {
    console.error('[orgs POST] Membership failed:', memErr);
    // Cleanup l'org orpheline
    await supabaseAdmin.from('organisations').delete().eq('id', newOrg.id);
    return NextResponse.json({ error: 'Failed to create membership', details: memErr.message }, { status: 500 });
  }

  // Définir comme org active si c'est la première
  await supabaseAdmin
    .from('users')
    .update({ active_organisation_id: newOrg.id })
    .eq('id', user.id);

  await logActivity({
    orgId: newOrg.id,
    userId: user.id,
    action: 'org.created',
    resourceType: 'organisation',
    resourceId: newOrg.id,
    metadata: { nom: newOrg.nom, type: newOrg.type },
  });

  return NextResponse.json({ org: newOrg }, { status: 201 });
}
