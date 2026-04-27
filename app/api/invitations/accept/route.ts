/**
 * /api/invitations/accept — Accepter une invitation à rejoindre une org
 * 
 * Le user doit être authentifié avec NextAuth.
 * On vérifie que l'email Google connecté == l'email de l'invitation.
 * On crée la membership et on bascule l'org active.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized', needLogin: true }, { status: 401 });
  }

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  // Charger l'invitation
  const { data: invitation } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('token', token)
    .single();

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid invitation token' }, { status: 404 });
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json(
      { error: `Invitation already ${invitation.status}` },
      { status: 410 }
    );
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabaseAdmin.from('invitations').update({ status: 'expired' }).eq('id', invitation.id);
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
  }

  const sessionEmail = session.user.email.toLowerCase();
  if (sessionEmail !== invitation.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: 'Email mismatch',
        message: `Cette invitation a été envoyée à ${invitation.email}. Vous êtes connecté avec ${sessionEmail}.`,
        expectedEmail: invitation.email,
        actualEmail: sessionEmail,
      },
      { status: 403 }
    );
  }

  // Récupérer/créer le user dans la table users
  let { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', sessionEmail)
    .maybeSingle();

  if (!user) {
    // Cas rare : NextAuth a créé l'auth mais pas la row users — on la crée
    const { data: newUser, error: userErr } = await supabaseAdmin
      .from('users')
      .insert({
        email: sessionEmail,
        name: session.user.name || null,
        image: session.user.image || null,
      })
      .select('id')
      .single();
    if (userErr || !newUser) {
      return NextResponse.json({ error: 'Failed to create user', details: userErr?.message }, { status: 500 });
    }
    user = newUser;
  }

  // Vérifier qu'il n'est pas déjà membre (idempotence)
  const { data: existing } = await supabaseAdmin
    .from('memberships')
    .select('id, is_active')
    .eq('user_id', user.id)
    .eq('organisation_id', invitation.organisation_id)
    .maybeSingle();

  if (existing) {
    // Réactiver si soft-deleted, sinon ignorer
    if (!existing.is_active) {
      await supabaseAdmin
        .from('memberships')
        .update({ is_active: true, role: invitation.role, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
  } else {
    // Créer la membership
    const { error: memErr } = await supabaseAdmin
      .from('memberships')
      .insert({
        user_id: user.id,
        organisation_id: invitation.organisation_id,
        role: invitation.role,
        is_active: true,
        invited_by: invitation.invited_by,
      });
    if (memErr) {
      return NextResponse.json({ error: 'Failed to create membership', details: memErr.message }, { status: 500 });
    }
  }

  // Marquer l'invitation comme acceptée
  await supabaseAdmin
    .from('invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  // Basculer l'org active sur la nouvelle org
  await supabaseAdmin
    .from('users')
    .update({ active_organisation_id: invitation.organisation_id })
    .eq('id', user.id);

  // Log
  await logActivity({
    orgId: invitation.organisation_id,
    userId: user.id,
    action: 'member.joined',
    resourceType: 'membership',
    metadata: { email: sessionEmail, role: invitation.role, invitationId: invitation.id },
  });

  // Récupérer l'org pour la réponse
  const { data: org } = await supabaseAdmin
    .from('organisations')
    .select('id, nom, slug')
    .eq('id', invitation.organisation_id)
    .single();

  return NextResponse.json({
    success: true,
    org,
    role: invitation.role,
  });
}

// GET pour pré-vérifier la validité du token avant que le user clique "accepter"
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const { data: invitation } = await supabaseAdmin
    .from('invitations')
    .select('id, email, role, status, expires_at, organisation_id')
    .eq('token', token)
    .single();

  if (!invitation) return NextResponse.json({ valid: false, reason: 'not_found' });
  if (invitation.status !== 'pending') return NextResponse.json({ valid: false, reason: invitation.status });
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' });
  }

  // Charger le nom de l'org pour l'affichage
  const { data: org } = await supabaseAdmin
    .from('organisations')
    .select('nom, slug, type')
    .eq('id', invitation.organisation_id)
    .single();

  // Charger l'inviteur
  const { data: inviter } = await supabaseAdmin
    .from('users')
    .select('name, email')
    .eq('id', (await supabaseAdmin.from('invitations').select('invited_by').eq('id', invitation.id).single()).data?.invited_by)
    .maybeSingle();

  return NextResponse.json({
    valid: true,
    invitation: {
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expires_at,
    },
    org,
    inviter,
  });
}
