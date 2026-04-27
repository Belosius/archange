/**
 * ═══════════════════════════════════════════════════════════════
 * logActivity — Helper centralisé pour l'audit log
 * ═══════════════════════════════════════════════════════════════
 *
 * USAGE :
 *   await logActivity({
 *     orgId: ctx.activeOrgId,
 *     userId: ctx.userId,
 *     action: 'org.created',
 *     resourceType: 'organisation',
 *     resourceId: newOrg.id,
 *     metadata: { name: newOrg.nom },
 *   });
 *
 * Échec silencieux : si l'insert échoue, on log en console mais on ne
 * casse pas la requête métier (audit log = bonus, pas critique).
 */
import { supabaseAdmin } from '@/lib/supabase';

export type ActivityAction =
  | 'org.created'
  | 'org.updated'
  | 'org.deleted'
  | 'org.switched'
  | 'member.invited'
  | 'member.joined'
  | 'member.removed'
  | 'member.role_changed'
  | 'invitation.cancelled'
  | 'invitation.expired'
  | 'sources.modified'
  | 'email.sent'
  | 'email.deleted'
  | 'gmail.connected'
  | 'gmail.disconnected';

export interface LogActivityArgs {
  orgId: string;
  userId: string;
  action: ActivityAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logActivity(args: LogActivityArgs): Promise<void> {
  try {
    await supabaseAdmin.from('activity_logs').insert({
      organisation_id: args.orgId,
      user_id: args.userId,
      action: args.action,
      resource_type: args.resourceType || null,
      resource_id: args.resourceId || null,
      metadata: args.metadata || {},
      ip_address: args.ipAddress || null,
      user_agent: args.userAgent || null,
    });
  } catch (err) {
    console.error('[logActivity] Failed to log:', args.action, err);
  }
}

/** Génère un token URL-safe (32 chars hexa). */
export function generateInvitationToken(): string {
  const arr = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    // fallback Node
    const { randomBytes } = require('crypto');
    return randomBytes(32).toString('hex');
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
