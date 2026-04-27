/**
 * /api/invitations — Créer une invitation à rejoindre l'organisation active
 * 
 * - Réservé aux admins/super_admins
 * - Génère un token unique
 * - Envoie un email via Gmail (utilise la connexion Gmail de l'org active)
 * - Si pas de connexion Gmail : crée l'invitation quand même + renvoie l'URL à copier
 * 
 * GET : liste les invitations (pending) pour la page settings/team
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/org/requireRole';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity, generateInvitationToken } from '@/lib/activity';
import { getGmailConnection } from '@/lib/gmail/getGmailConnection';

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

  // Vérifier qu'il n'y a pas déjà une invitation pending
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
    return NextResponse.json({ error: 'Failed to create invitation', details: invErr?.message }, { status: 500 });
  }

  // Construire l'URL d'acceptation
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (req.headers.get('origin') ?? '')
    || 'https://archange-olive.vercel.app';
  const acceptUrl = `${baseUrl}/onboarding/accept/${token}`;

  // Tenter d'envoyer par Gmail
  let emailSent = false;
  let emailError: string | null = null;
  try {
    const conn = await getGmailConnection(ctx.activeOrgId);
    if (conn) {
      const subject = `Invitation à rejoindre ${ctx.orgName} sur ARCHANGE`;
      const htmlBody = buildInvitationEmail({
        orgName: ctx.orgName,
        inviterName: ctx.userName || ctx.userEmail,
        inviterEmail: ctx.userEmail,
        role,
        acceptUrl,
        expiresInDays: 7,
      });

      const headers = [
        `From: ${conn.email}`,
        `To: ${cleanEmail}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
      ].join('\r\n');
      const rfcMessage = `${headers}\r\n\r\n${htmlBody}`;
      const raw = Buffer.from(rfcMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });
      if (r.ok) {
        emailSent = true;
      } else {
        emailError = await r.text();
        console.error('[invitations POST] Gmail send failed:', emailError);
      }
    } else {
      emailError = 'No Gmail connection for this org';
    }
  } catch (err: any) {
    emailError = err?.message || String(err);
    console.error('[invitations POST] Send exception:', err);
  }

  await logActivity({
    orgId: ctx.activeOrgId,
    userId: ctx.userId,
    action: 'member.invited',
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: { email: cleanEmail, role, emailSent, emailError },
  });

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expires_at: invitation.expires_at,
    },
    acceptUrl,  // Toujours renvoyé pour permettre copie/collage manuel
    emailSent,
    emailError,
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

// ─── Template d'email d'invitation ──────────────────────────────────────
function buildInvitationEmail(args: {
  orgName: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
}): string {
  const { orgName, inviterName, inviterEmail, role, acceptUrl, expiresInDays } = args;
  const roleLabel: Record<string, string> = {
    super_admin: 'Super-administrateur',
    admin: 'Administrateur',
    manager: 'Manager (peut répondre aux mails)',
    lecture: 'Lecture seule',
  };

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f5f1eb;margin:0;padding:32px 16px;color:#2c2419;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:32px;font-weight:600;color:#8b6f47;letter-spacing:1px;">ARCHANGE</div>
      <div style="font-size:13px;color:#8a7a64;margin-top:4px;">Agent email IA</div>
    </div>
    <h1 style="font-size:20px;font-weight:600;margin:24px 0 16px;text-align:center;">
      Vous êtes invité à rejoindre <span style="color:#8b6f47;">${orgName}</span>
    </h1>
    <p style="line-height:1.6;color:#5a4d3a;">
      <strong>${inviterName}</strong> (${inviterEmail}) vous invite à rejoindre l'équipe
      <strong>${orgName}</strong> sur ARCHANGE en tant que <strong>${roleLabel[role] || role}</strong>.
    </p>
    <p style="line-height:1.6;color:#5a4d3a;">
      ARCHANGE est un agent IA qui aide à gérer les emails et réservations de la brasserie au quotidien.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${acceptUrl}" 
         style="display:inline-block;background:#8b6f47;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;">
        Accepter l'invitation
      </a>
    </div>
    <p style="font-size:13px;color:#8a7a64;line-height:1.5;text-align:center;">
      Ce lien expire dans ${expiresInDays} jours.<br>
      Vous devrez vous connecter avec le compte Google associé à <strong>l'email auquel ce message a été envoyé</strong>.
    </p>
    <hr style="border:none;border-top:1px solid #ede5d6;margin:32px 0;">
    <p style="font-size:12px;color:#a89876;text-align:center;line-height:1.5;">
      Si vous n'attendiez pas cette invitation, vous pouvez ignorer ce message.<br>
      Lien direct : <a href="${acceptUrl}" style="color:#8b6f47;word-break:break-all;">${acceptUrl}</a>
    </p>
  </div>
</body>
</html>`;
}
