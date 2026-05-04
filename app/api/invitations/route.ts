/**
 * /api/invitations — Créer/annuler une invitation à rejoindre l'organisation active
 *
 * - Réservé aux admins/super_admins
 * - Génère un token unique
 * - Envoie un email via Gmail (template RÊVA HTML + fallback texte)
 *   en utilisant la connexion Gmail de l'org active
 * - Si pas de connexion Gmail ou si l'envoi échoue : crée l'invitation
 *   quand même + renvoie l'URL à copier (le frontend bascule sur "copier le lien")
 *
 * GET : voir /api/team (qui inclut déjà les invitations pending)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/org/requireRole';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity, generateInvitationToken } from '@/lib/activity';
import { sendInviteEmail } from '@/lib/sendInviteEmail';

const ALLOWED_ROLES = ['admin', 'manager', 'lecture'] as const;
// Note: super_admin volontairement exclu — seul un super_admin existant peut promouvoir,
// et ça se fait via PATCH /api/team/[id] APRÈS acceptation.

export async function POST(req: NextRequest) {
  const check = await requirePermission(req, 'canInviteMembers');
  if (check.error) return check.error;
  const ctx = check.context;

  const { email, role } = await req.json();
  if (!email?.trim()) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` },
      { status: 400 }
    );
  }

  const cleanEmail = email.trim().toLowerCase();

  // Vérifier que la personne n'est pas déjà membre
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (existingUser) {
    const { data: existingMembership } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', existingUser.id)
      .eq('organisation_id', ctx.activeOrgId)
      .eq('is_active', true)
      .maybeSingle();
    if (existingMembership) {
      return NextResponse.json(
        { error: `${cleanEmail} est déjà membre de cette organisation` },
        { status: 409 }
      );
    }
  }

  // Vérifier qu'il n'y a pas déjà une invitation pending non expirée
  const { data: existingInvit } = await supabaseAdmin
    .from('invitations')
    .select('id')
    .eq('email', cleanEmail)
    .eq('organisation_id', ctx.activeOrgId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existingInvit) {
    return NextResponse.json(
      { error: `Une invitation est déjà en attente pour ${cleanEmail}` },
      { status: 409 }
    );
  }

  // Créer l'invitation
  const token = generateInvitationToken();
  const { data: invitation, error: invErr } = await supabaseAdmin
    .from('invitations')
    .insert({
      organisation_id: ctx.activeOrgId,
      email: cleanEmail,
      role,
      token,
      invited_by: ctx.userId,
      status: 'pending',
    })
    .select()
    .single();

  if (invErr || !invitation) {
    return NextResponse.json(
      { error: 'Failed to create invitation', details: invErr?.message },
      { status: 500 }
    );
  }

  // Construire l'URL d'acceptation
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (req.headers.get('origin') ?? '')
    || 'https://archange-olive.vercel.app';
  const acceptUrl = `${baseUrl}/onboarding/accept/${token}`;

  // Tenter d'envoyer par Gmail via le helper Phase D
  const sendResult = await sendInviteEmail({
    organisationId: ctx.activeOrgId,
    recipientEmail: cleanEmail,
    orgName: ctx.orgName,
    role,
    inviterName: ctx.userName || ctx.userEmail,
    inviterEmail: ctx.userEmail,
    inviteUrl: acceptUrl,
    expiresAt: invitation.expires_at,
  });

  // Persister le résultat de l'envoi
  if (sendResult.ok) {
    await supabaseAdmin
      .from('invitations')
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);
  }

  await logActivity({
    orgId: ctx.activeOrgId,
    userId: ctx.userId,
    action: 'member.invited',
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: {
      email: cleanEmail,
      role,
      emailSent: sendResult.ok,
      emailError: sendResult.ok ? null : sendResult.error,
    },
  });

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expires_at: invitation.expires_at,
      email_sent: sendResult.ok,
    },
    acceptUrl, // Toujours renvoyé pour permettre copie/collage manuel
    emailSent: sendResult.ok,
    emailError: sendResult.ok ? null : sendResult.error,
  }, { status: 201 });
}

// Annuler une invitation (DELETE /api/invitations?id=XXX)
export async function DELETE(req: NextRequest) {
  const check = await requirePermission(req, 'canInviteMembers');
  if (check.error) return check.error;
  const ctx = check.context;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: target } = await supabaseAdmin
    .from('invitations')
    .select('id, organisation_id, email')
    .eq('id', id)
    .single();
  if (!target || target.organisation_id !== ctx.activeOrgId) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from('invitations')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    orgId: ctx.activeOrgId,
    userId: ctx.userId,
    action: 'invitation.cancelled',
    resourceType: 'invitation',
    resourceId: id,
    metadata: { email: target.email },
  });

  return NextResponse.json({ success: true });
}
