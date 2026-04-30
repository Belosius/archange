/**
 * ═══════════════════════════════════════════════════════════════
 * /api/team/[membershipId] — Modifier ou retirer un membre
 * ═══════════════════════════════════════════════════════════════
 *
 * PATCH { role } → change le rôle d'un membre (admin+ requis)
 * DELETE         → désactive la membership (admin+ requis)
 *
 * Règles :
 * - On ne peut pas se retirer soi-même (pour éviter d'orphaniser l'org)
 * - On ne peut pas changer le rôle de soi-même
 * - Seul un super_admin peut promouvoir/rétrograder un super_admin
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requirePermission } from '@/lib/org/requireRole';
import { supabaseAdmin } from '@/lib/supabase';

const VALID_ROLES = ['super_admin', 'admin', 'manager', 'lecture'];

async function loadMembership(membershipId: string, orgId: string) {
    const { data } = await supabaseAdmin
      .from('memberships')
      .select('id, user_id, organisation_id, role, is_active')
      .eq('id', membershipId)
      .eq('organisation_id', orgId)
      .maybeSingle();
    return data;
}

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ membershipId: string }> }
  ) {
    const check = await requirePermission(req, 'canInviteMembers');
    if (check.error) return check.error;
    const ctx = check.context;

  const { membershipId } = await context.params;

  let body: { role?: string };
    try {
          body = await req.json();
    } catch {
          return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

  const newRole = String(body.role || '').trim();
    if (!VALID_ROLES.includes(newRole)) {
          return NextResponse.json(
            { error: `Rôle invalide. Valeurs : ${VALID_ROLES.join(', ')}` },
            { status: 400 }
                );
    }

  const target = await loadMembership(membershipId, ctx.activeOrgId);
    if (!target) {
          return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
    }

  if (target.user_id === ctx.userId) {
        return NextResponse.json(
          { error: 'Vous ne pouvez pas changer votre propre rôle' },
          { status: 400 }
              );
  }

  // Seul un super_admin peut toucher un super_admin (existant ou cible)
  if ((target.role === 'super_admin' || newRole === 'super_admin') && ctx.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Seul un super_admin peut promouvoir ou rétrograder un super_admin' },
          { status: 403 }
              );
  }

  const { error } = await supabaseAdmin
      .from('memberships')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', membershipId);

  if (error) {
        console.error('[PATCH /api/team/:id]', error);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  await supabaseAdmin.from('activity_logs').insert({
        user_id: ctx.userId,
        organisation_id: ctx.activeOrgId,
        action: 'team.role_changed',
        resource_type: 'membership',
        resource_id: membershipId,
        metadata: { from_role: target.role, to_role: newRole, target_user_id: target.user_id },
  });

  return NextResponse.json({ ok: true, role: newRole });
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ membershipId: string }> }
  ) {
    const check = await requirePermission(req, 'canInviteMembers');
    if (check.error) return check.error;
    const ctx = check.context;

  const { membershipId } = await context.params;

  const target = await loadMembership(membershipId, ctx.activeOrgId);
    if (!target) {
          return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
    }

  if (target.user_id === ctx.userId) {
        return NextResponse.json(
          { error: 'Vous ne pouvez pas vous retirer vous-même' },
          { status: 400 }
              );
  }

  if (target.role === 'super_admin' && ctx.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Seul un super_admin peut retirer un autre super_admin' },
          { status: 403 }
              );
  }

  const { error } = await supabaseAdmin
      .from('memberships')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', membershipId);

  if (error) {
        console.error('[DELETE /api/team/:id]', error);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  await supabaseAdmin.from('activity_logs').insert({
        user_id: ctx.userId,
        organisation_id: ctx.activeOrgId,
        action: 'team.member_removed',
        resource_type: 'membership',
        resource_id: membershipId,
        metadata: { removed_role: target.role, target_user_id: target.user_id },
  });

  return NextResponse.json({ ok: true });
}
