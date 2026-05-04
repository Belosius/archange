/**
 * /api/invitations/resend — Renvoyer un email d'invitation déjà créée
 *
 * POST { id: string } — Renvoie l'email d'invitation au destinataire,
 * en réutilisant le token existant (pas de nouvelle invitation créée).
 *
 * Cas d'usage : l'invité n'a pas reçu le premier email (spam, faute de
 * frappe corrigée côté Gmail, etc.) → bouton "Renvoyer" sur /settings/team.
 *
 * Garde-fous :
 *   - Réservé aux admins/super_admins de l'org
 *   - L'invitation doit être pending et non expirée
 *   - Rate-limit léger (max 1 renvoi par invitation toutes les 60s)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/org/requireRole';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { sendInviteEmail } from '@/lib/sendInviteEmail';

export async function POST(req: NextRequest) {
  const check = await requirePermission(req, 'canInviteMembers');
  if (check.error) return check.error;
  const ctx = check.context;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Récupérer l'invitation et vérifier qu'elle appartient à l'org active
  const { data: invitation } = await supabaseAdmin
    .from('invitations')
    .select('id, organisation_id, email, role, token, status, expires_at, email_sent_at, invited_by')
    .eq('id', id)
    .maybeSingle();

  if (!invitation || invitation.organisation_id !== ctx.activeOrgId) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot resend a ${invitation.status} invitation` },
      { status: 400 }
    );
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'Cette invitation a expiré. Annulez-la et créez-en une nouvelle.' },
      { status: 410 }
    );
  }

  // Rate-limit : interdire renvoi si dernier envoi < 60s
  if (invitation.email_sent_at) {
    const elapsedMs = Date.now() - new Date(invitation.email_sent_at).getTime();
    if (elapsedMs < 60_000) {
      const waitSec = Math.ceil((60_000 - elapsedMs) / 1000);
      return NextResponse.json(
        { error: `Patientez ${waitSec}s avant de renvoyer cet email.` },
        { status: 429 }
      );
    }
  }

  // Construire l'URL et renvoyer
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (req.headers.get('origin') ?? '')
    || 'https://archange-olive.vercel.app';
  const acceptUrl = `${baseUrl}/onboarding/accept/${invitation.token}`;

  const sendResult = await sendInviteEmail({
    organisationId: ctx.activeOrgId,
    recipientEmail: invitation.email,
    orgName: ctx.orgName,
    role: invitation.role,
    inviterName: ctx.userName || ctx.userEmail,
    inviterEmail: ctx.userEmail,
    inviteUrl: acceptUrl,
    expiresAt: invitation.expires_at,
  });

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
    action: 'invitation.resent',
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: {
      email: invitation.email,
      emailSent: sendResult.ok,
      emailError: sendResult.ok ? null : sendResult.error,
    },
  });

  return NextResponse.json({
    success: sendResult.ok,
    emailSent: sendResult.ok,
    emailError: sendResult.ok ? null : sendResult.error,
    acceptUrl, // Renvoi du lien si l'envoi a échoué (fallback copy-paste)
  });
}
