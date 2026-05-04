/**
 * ═══════════════════════════════════════════════════════════════
 * /api/invitations/[token] — Lookup et acceptation d'une invitation
 * ═══════════════════════════════════════════════════════════════
 *
 * GET  → infos publiques (nom de l'org, rôle proposé, email cible)
 *        Pas de session requise — utilisé par la landing page /invite/[token]
 * POST → accepter l'invitation (session NextAuth requise, email doit matcher)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase';

async function loadInvitation(token: string) {
  const { data: inv } = await supabaseAdmin
    .from('invitations')
    .select('id, organisation_id, email, role, token, expires_at, accepted_at, invited_by')
    .eq('token', token)
    .maybeSingle();
  return inv;
}

// ───── GET : info publique sur l'invitation ───────────────────────────
export async function GET(
  _req: NextRequest,
  context: { params: { token: string } }
) {
  const { token } = context.params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const inv = await loadInvitation(token);
  if (!inv) {
    return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
  }

  if (inv.accepted_at) {
    return NextResponse.json(
      { error: 'Cette invitation a déjà été acceptée', alreadyAccepted: true },
      { status: 410 }
    );
  }

  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'Cette invitation a expiré', expired: true },
      { status: 410 }
    );
  }

  const { data: org } = await supabaseAdmin
    .from('organisations')
    .select('id, nom, slug')
    .eq('id', inv.organisation_id)
    .single();

  const { data: inviter } = await supabaseAdmin
    .from('users')
    .select('email, name')
    .eq('id', inv.invited_by)
    .maybeSingle();

  return NextResponse.json({
    invitation: {
      email: inv.email,
      role: inv.role,
      orgName: org?.nom || 'Organisation',
      orgSlug: org?.slug || '',
      invitedByName: (inviter as any)?.name || (inviter as any)?.email || 'Un membre',
      expiresAt: inv.expires_at,
    },
  });
}

// ───── POST : accepter l'invitation ───────────────────────────────────
export async function POST(
  _req: NextRequest,
  context: { params: { token: string } }
) {
  const { token } = context.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Vous devez être connecté pour accepter une invitation' },
      { status: 401 }
    );
  }

  const inv = await loadInvitation(token);
  if (!inv) {
    return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
  }
  if (inv.accepted_at) {
    return NextResponse.json({ error: 'Déjà acceptée' }, { status: 410 });
  }
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Invitation expirée' }, { status: 410 });
  }

  if (session.user.email.toLowerCase() !== inv.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: `Cette invitation est destinée à ${inv.email}. Connectez-vous avec ce compte Google.`,
        wrongAccount: true,
        expectedEmail: inv.email,
      },
      { status: 403 }
    );
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User non trouvé' }, { status: 404 });
  }

  const { data: existing } = await supabaseAdmin
    .from('memberships')
    .select('id, is_active, role')
    .eq('user_id', user.id)
    .eq('organisation_id', inv.organisation_id)
    .maybeSingle();

  if (existing) {
    if (existing.is_active) {
      await supabaseAdmin
        .from('invitations')
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by: user.id,
          status: 'accepted',
        })
        .eq('id', inv.id);
      return NextResponse.json({
        ok: true,
        orgId: inv.organisation_id,
        alreadyMember: true,
      });
    } else {
      await supabaseAdmin
        .from('memberships')
        .update({
          is_active: true,
          role: inv.role,
          invited_by: inv.invited_by,
          joined_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
  } else {
    const { error: memErr } = await supabaseAdmin.from('memberships').insert({
      user_id: user.id,
      organisation_id: inv.organisation_id,
      role: inv.role,
      is_active: true,
      invited_by: inv.invited_by,
    });
    if (memErr) {
      console.error('[POST /api/invitations/:token]', memErr);
      return NextResponse.json({ error: 'Membership creation failed' }, { status: 500 });
    }
  }

  await supabaseAdmin
    .from('invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
      status: 'accepted',
    })
    .eq('id', inv.id);

  await supabaseAdmin
    .from('users')
    .update({ active_organisation_id: inv.organisation_id })
    .eq('id', user.id);

  await supabaseAdmin.from('activity_logs').insert({
    user_id: user.id,
    organisation_id: inv.organisation_id,
    action: 'invitation.accepted',
    resource_type: 'invitation',
    resource_id: inv.id,
    metadata: { role: inv.role, invited_by: inv.invited_by },
  });

  return NextResponse.json({ ok: true, orgId: inv.organisation_id });
}
