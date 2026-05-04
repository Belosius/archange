/**
 * ═══════════════════════════════════════════════════════════════
 *  lib/role-labels.ts — Labels et descriptions des rôles
 * ═══════════════════════════════════════════════════════════════
 *
 * Centralise les libellés affichés et les descriptions des permissions
 * pour les 4 rôles supportés. Utilisé par /settings/profile et
 * /settings/team pour expliquer ce que chaque rôle permet de faire.
 */

export type Role = 'super_admin' | 'admin' | 'manager' | 'lecture';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super-administrateur',
  admin: 'Administrateur',
  manager: 'Gestionnaire',
  lecture: 'Lecture seule',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin:
    'Accès complet à l\'organisation. Peut gérer les paramètres, les membres, les invitations, et le compte Gmail connecté. Peut promouvoir d\'autres super-admins.',
  admin:
    'Peut inviter et gérer les membres, lire et répondre aux mails, gérer les événements et les Sources ARCHANGE. Ne peut pas modifier les paramètres critiques de l\'organisation.',
  manager:
    'Peut lire et répondre aux mails, gérer les événements et les réservations. N\'a pas accès à la gestion de l\'équipe.',
  lecture:
    'Accès en lecture uniquement. Peut consulter les mails, événements et statistiques mais ne peut rien modifier.',
};

export function getRoleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABELS[role as Role] || role;
}

export function getRoleDescription(role: string | null | undefined): string {
  if (!role) return '';
  return ROLE_DESCRIPTIONS[role as Role] || '';
}

// Couleur de l'accent du rôle (pour badges)
export const ROLE_COLORS: Record<Role, { bg: string; fg: string; border: string }> = {
  super_admin: { bg: '#FBF6E8', fg: '#8B6914', border: '#E8D89C' },
  admin:       { bg: '#F2F1F8', fg: '#4A3F8C', border: '#D8D5E8' },
  manager:     { bg: '#E9F4ED', fg: '#1F6B3A', border: '#C8E0D2' },
  lecture:     { bg: '#F1F1F1', fg: '#5A5A5A', border: '#D8D8D8' },
};

export function getRoleColors(role: string | null | undefined) {
  if (!role) return ROLE_COLORS.lecture;
  return ROLE_COLORS[role as Role] || ROLE_COLORS.lecture;
}

