/**
 * ═══════════════════════════════════════════════════════════════
 *  requireRole & requireOrgMember — Middlewares de protection
 * ═══════════════════════════════════════════════════════════════
 *
 * Wrappers à utiliser en début de route API pour rejeter les requêtes
 * non autorisées avec un NextResponse.json approprié.
 *
 * USAGE :
 *   export async function POST(req: NextRequest) {
 *     const check = await requireRole(req, ['admin', 'super_admin']);
 *     if (check.error) return check.error;
 *     const ctx = check.context;
 *     // ... code métier ...
 *   }
 *
 * Ces helpers encapsulent la logique récurrente de :
 *   1. Appeler getOrgContext
 *   2. Vérifier qu'un contexte existe (401 sinon)
 *   3. Vérifier le rôle / les permissions (403 sinon)
 *
 * On évite de dupliquer ces checks à la main dans chaque route.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getOrgContext, type OrgContext, type Role } from './getOrgContext';

export type RoleCheckResult =
  | { error: NextResponse; context?: never }
  | { error?: never; context: OrgContext };

/**
 * Exige que le user ait l'un des rôles spécifiés dans l'organisation active.
 * Retourne { error: NextResponse } si refus, { context: OrgContext } si OK.
 */
export async function requireRole(
  req: NextRequest | Request,
  allowedRoles: Role[]
): Promise<RoleCheckResult> {
  const ctx = await getOrgContext(req);
  if (!ctx) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      ),
    };
  }
  if (!allowedRoles.includes(ctx.role)) {
    return {
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: `Role '${ctx.role}' is not allowed for this operation. Required: ${allowedRoles.join(', ')}`,
        },
        { status: 403 }
      ),
    };
  }
  return { context: ctx };
}

/**
 * Exige simplement que le user soit membre de l'organisation active
 * (n'importe quel rôle). Équivalent à `requireRole([super_admin, admin, manager, lecture])`.
 */
export async function requireOrgMember(
  req: NextRequest | Request
): Promise<RoleCheckResult> {
  return requireRole(req, ['super_admin', 'admin', 'manager', 'lecture']);
}

/**
 * Exige une permission spécifique (plus granulaire que requireRole).
 *
 * USAGE :
 *   const check = await requirePermission(req, 'canEditSources');
 *   if (check.error) return check.error;
 */
export async function requirePermission(
  req: NextRequest | Request,
  permission: keyof OrgContext['permissions']
): Promise<RoleCheckResult> {
  const ctx = await getOrgContext(req);
  if (!ctx) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (!ctx.permissions[permission]) {
    return {
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: `Permission '${permission}' required`,
        },
        { status: 403 }
      ),
    };
  }
  return { context: ctx };
}
