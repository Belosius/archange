/**
 * ═══════════════════════════════════════════════════════════════
 *  lib/inviteEmail.ts — Templates email d'invitation Phase D
 * ═══════════════════════════════════════════════════════════════
 *
 * Construit les 2 versions (HTML brandé RÊVA + fallback texte) du
 * mail envoyé à un nouveau membre invité dans une organisation.
 *
 * Les clients mail modernes affichent le HTML, mais on envoie aussi
 * la version texte pour les clients vieux/CLI et pour la deliverability
 * (Gmail/Outlook scoring favorise les multipart/alternative).
 */

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super-administrateur',
  admin: 'Administrateur',
  manager: 'Gestionnaire',
  lecture: 'Lecture seule',
};

export interface InviteEmailParams {
  /** Nom de l'org qui invite (ex. "RÊVA Paris 13e") */
  orgName: string;
  /** Rôle proposé (super_admin, admin, manager, lecture) */
  role: string;
  /** Nom complet de l'inviteur (ex. "Olivier Teissedre") */
  inviterName: string;
  /** Email de l'inviteur (ex. "olivier@reva.fr") */
  inviterEmail: string;
  /** URL absolue de la landing page d'acceptation */
  inviteUrl: string;
  /** Date d'expiration ISO de l'invitation */
  expiresAt: string;
}

export function buildInviteEmail(params: InviteEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { orgName, role, inviterName, inviterEmail, inviteUrl, expiresAt } = params;
  const roleLabel = ROLE_LABELS[role] || role;

  // Date d'expiration formatée FR
  const expDate = new Date(expiresAt);
  const expFormatted = expDate.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const subject = `${inviterName} vous invite à rejoindre ${orgName} sur Archange`;

  // ───── Version texte (fallback) ─────────────────────────────────
  const text = `Bonjour,

${inviterName} (${inviterEmail}) vous invite à rejoindre l'organisation
"${orgName}" sur Archange en tant que ${roleLabel}.

Archange est l'agent IA qui gère vos emails et réservations.

Pour accepter cette invitation, cliquez sur le lien ci-dessous :
${inviteUrl}

⚠️ Ce lien est personnel et expire le ${expFormatted}.
Si vous n'attendiez pas cette invitation, vous pouvez l'ignorer.

— L'équipe ${orgName}
`;

  // ───── Version HTML brandée RÊVA ────────────────────────────────
  // Note: tout en inline styles pour la compatibilité maximale
  // (Gmail strip <style>, Outlook ignore le CSS externe)
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Invitation Archange</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1A1A1E;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#FAFAF7;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#FFFFFF;border:1px solid #EBEAE5;border-radius:8px;">
        <!-- Header avec logo calice -->
        <tr>
          <td align="center" style="padding:32px 32px 8px 32px;border-bottom:1px solid #EBEAE5;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
                    <circle cx="12" cy="12" r="11" stroke="#B8924F" stroke-width="1"/>
                    <path d="M12 9 C 9.5 9, 7 9.5, 5 10.5 C 6.8 10.8, 8.5 10.7, 10.5 10.2" stroke="#B8924F" stroke-width="0.9" fill="none" stroke-linecap="round"/>
                    <path d="M12 9 C 14.5 9, 17 9.5, 19 10.5 C 17.2 10.8, 15.5 10.7, 13.5 10.2" stroke="#B8924F" stroke-width="0.9" fill="none" stroke-linecap="round"/>
                    <path d="M8.5 9 L 15.5 9" stroke="#B8924F" stroke-width="1.2" stroke-linecap="round"/>
                    <circle cx="12" cy="7" r="1.1" fill="#B8924F"/>
                    <path d="M12 9.6 L 12 18.2" stroke="#B8924F" stroke-width="1.2" stroke-linecap="round"/>
                    <path d="M10.8 17.8 L 12 19.2 L 13.2 17.8 Z" fill="#B8924F"/>
                  </svg>
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-family:Georgia,serif;font-size:22px;font-weight:500;color:#1A1A1E;letter-spacing:0.3px;line-height:1;">Archange</div>
                  <div style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:#6B6E7E;margin-top:2px;">Agent IA</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Corps -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 12px 0;font-size:13px;color:#6B6E7E;letter-spacing:0.05em;text-transform:uppercase;">Invitation</p>
            <h1 style="margin:0 0 20px 0;font-family:Georgia,serif;font-size:24px;font-weight:500;color:#1A1A1E;line-height:1.3;">
              Vous avez été invité·e à rejoindre <span style="color:#B8924F;">${escapeHtml(orgName)}</span>
            </h1>
            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#4A4A52;">
              <strong style="color:#1A1A1E;">${escapeHtml(inviterName)}</strong>
              (${escapeHtml(inviterEmail)}) vous invite à rejoindre son organisation sur Archange,
              l'agent IA qui gère emails et réservations.
            </p>

            <!-- Carte info -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#FAFAF7;border:1px solid #EBEAE5;border-radius:6px;margin-bottom:28px;">
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #EBEAE5;">
                  <div style="font-size:11px;color:#6B6E7E;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Organisation</div>
                  <div style="font-size:14px;color:#1A1A1E;font-weight:500;">${escapeHtml(orgName)}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;">
                  <div style="font-size:11px;color:#6B6E7E;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Votre rôle</div>
                  <div style="font-size:14px;color:#1A1A1E;font-weight:500;">${escapeHtml(roleLabel)}</div>
                </td>
              </tr>
            </table>

            <!-- CTA bouton (table-based pour Outlook) -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 24px auto;">
              <tr>
                <td align="center" style="background:#B8924F;border-radius:6px;">
                  <a href="${inviteUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:500;color:#FFFFFF;text-decoration:none;letter-spacing:0.02em;">
                    Accepter l'invitation
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0 0;font-size:12px;color:#6B6E7E;line-height:1.6;text-align:center;">
              Ou copiez ce lien dans votre navigateur :<br />
              <a href="${inviteUrl}" style="color:#B8924F;word-break:break-all;text-decoration:none;">${inviteUrl}</a>
            </p>

            <p style="margin:24px 0 0 0;font-size:12px;color:#6B6E7E;line-height:1.6;border-top:1px solid #EBEAE5;padding-top:20px;">
              ⏱ Ce lien est personnel et expire le <strong>${expFormatted}</strong>.<br />
              Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 32px;border-top:1px solid #EBEAE5;background:#FAFAF7;border-radius:0 0 8px 8px;">
            <p style="margin:0;font-size:11px;color:#6B6E7E;text-align:center;line-height:1.5;">
              Cet email vous a été envoyé par Archange à la demande de ${escapeHtml(inviterName)}.<br />
              <span style="color:#B8924F;">— L'équipe ${escapeHtml(orgName)}</span>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}

// ─── Échappement HTML pour éviter les injections XSS dans l'email ──────
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
