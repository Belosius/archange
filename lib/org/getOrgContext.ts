/**
 * ═══════════════════════════════════════════════════════════════
 *  getOrgContext — Helper central multi-tenant
 * ═══════════════════════════════════════════════════════════════
 *
 * Résout le contexte d'une requête :
 *   - Qui est le user authentifié ?
 *   - Dans quelle organisation travaille-t-il actuellement ?
 *   - Quel rôle y tient-il ?
 *   - Quelles permissions en découlent ?
 *
 * Priorité de résolution de l'organisation active :
 *   1. Header `X-Active-Org-Id` (envoyé par le frontend via le switcher)
 *   2. Query param `?org=` (liens partagés, deep links)
 *   3. Colonne `users.active_organisation_id` (préférence persistée)
 *   4. Fallback : première organisation dont le user est membre
 *
 * SÉCURITÉ : vérifie TOUJOURS que le user est membre de l'org résolue.
 * Si le user force un org_id dont il n'est pas membre → retourne null (= 403).
 *
 * USAGE dans une API route :
 *   const ctx = await getOrgContext(req);
 *   if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   // Utiliser ctx.activeOrgId pour filtrer les requêtes Supabase
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase';

export type Role = 'super_admin' | 'admin' | 'manager' | 'lecture';

export interface OrgContext {
  userId: string;
  userEmail: string;
  userName: string | null;
  activeOrgId: string;
  orgName: string;
  orgSlug: string;
  role: Role;
  permissions: {
    /** Peut modifier les Sources ARCHANGE (menus, règles, ton, cas particuliers, règles absolues) */
    canEditSources: boolean;
    /** Peut inviter de nouveaux membres */
    canInviteMembers: boolean;
    /** Peut voir la page Activity (audit log) */
    canViewActivity: boolean;
    /** Peut modifier les paramètres de l'organisation */
    canManageOrg: boolean;
    /** Peut supprimer l'organisation (super_admin uniquement) */
    canDeleteOrg: boolean;
    /** Peut répondre aux mails (tous rôles sauf lecture seule) */
    canReplyToEmails: boolean;
    /** Peut modifier des réservations */
    canEditReservations: boolean;
  };
}

/**
 * Construit le contexte organisation pour la requête courante.
 * Retourne null si :
 *  - Pas de session NextAuth valide
 *  - User pas trouvé dans la table users
 *  - Aucune organisation dont le user est membre
 *  - L'org demandée existe mais le user n'en est pas membre (tentative d'accès frauduleux)
 */
export async function getOrgContext(req?: NextRequest | Request): Promise<OrgContext | null> {
  // ─── 1. Récupérer la session NextAuth ───────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  // ─── 2. Récupérer le user depuis Supabase ───────────────────────────
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, name, active_organisation_id')
    .eq('email', session.user.email)
    .single();
  if (userError || !user) return null;

  // ─── 3. Résoudre l'organisation active ──────────────────────────────
  let requestedOrgId: string | null = null;

  // Priorité 1 : header X-Active-Org-Id
  if (req && 'headers' in req) {
    const headerOrg = req.headers.get('x-active-org-id');
    if (headerOrg) requestedOrgId = headerOrg;
  }

  // Priorité 2 : query param ?org=
  if (!requestedOrgId && req && 'url' in req) {
    try {
      const url = new URL(req.url);
      const queryOrg = url.searchParams.get('org');
      if (queryOrg) requestedOrgId = queryOrg;
    } catch {
      /* URL invalide, on ignore */
    }
  }

  // Priorité 3 : active_organisation_id dans users
  if (!requestedOrgId && user.active_organisation_id) {
    requestedOrgId = user.active_organisation_id;
  }

  // Priorité 4 : fallback sur la première org dont le user est membre
  if (!requestedOrgId) {
    const { data: firstMembership } = await supabaseAdmin
      .from('memberships')
      .select('organisation_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .single();
    if (!firstMembership) return null;
    requestedOrgId = firstMembership.organisation_id;
  }

  // ─── 4. Vérifier que le user est bien membre de l'org (SÉCURITÉ) ────
  const { data: membership } = await supabaseAdmin
    .from('memberships')
    .select('role, organisation_id')
    .eq('user_id', user.id)
    .eq('organisation_id', requestedOrgId)
    .eq('is_active', true)
    .single();
  if (!membership) return null; // 403 — pas membre de cette org

  // ─── 5. Charger les infos de l'org ──────────────────────────────────
  const { data: org } = await supabaseAdmin
    .from('organisations')
    .select('id, nom, slug, is_active')
    .eq('id', requestedOrgId)
    .single();
  if (!org || !org.is_active) return null;

  // ─── 6. Construire les permissions selon le rôle ────────────────────
  const role = membership.role as Role;
  const permissions = buildPermissions(role);

  return {
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    activeOrgId: org.id,
    orgName: org.nom,
    orgSlug: org.slug,
    role,
    permissions,
  };
}

/**
 * Matrice des permissions par rôle.
 * Règles centralisées ici pour cohérence dans toute l'app.
 */
function buildPermissions(role: Role): OrgContext['permissions'] {
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;
  const isManagerOrAbove = role === 'manager' || isAdmin;
  // const isLecture = role === 'lecture';

  return {
    canEditSources: isAdmin, // ← Décision : managers en lecture seule sur Sources ARCHANGE
    canInviteMembers: isAdmin,
    canViewActivity: isAdmin,
    canManageOrg: isAdmin,
    canDeleteOrg: isSuperAdmin,
    canReplyToEmails: isManagerOrAbove,
    canEditReservations: isManagerOrAbove,
  };
}
