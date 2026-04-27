/**
 * /api/team/[id] — Modifier (PATCH) ou retirer (DELETE) une membership
 * Réservé aux admins/super_admins.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/org/requireRole';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';

const ALLOWED_ROLES = ['super_admin', 'admin', 'manager', 'lecture'] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const check = await requirePermission(req, 'canManageOrg');
  if (check.error) return check.error;
  const ctx = check.context;

  const { role } = await req.json();
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Vérifier que la membership cible appartient bien à l'org active
  const { data: target } = await supabaseAdmin
    .from('memberships')
    .select('id, user_id, role, organisation_id')
    .eq('id', params.id)
    .single();

  if (!target || target.organisation_id !== ctx.activeOrgId) {
    return NextResponse.json({ error: 'Membership not found in this org' }, { status: 404 });
  }

  // Empêcher de retirer le rôle super_admin du dernier super_admin
  if (target.role === 'super_admin' && role !== 'super_admin') {
    const { count } = await supabaseAdmin
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', ctx.activeOrgId)
      .eq('role', 'super_admin')
      .eq('is_active', true);
    if ((count || 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot demote the last super_admin of the org' },
        { status: 400 }
      );
    }
  }

  // Seul un super_admin peut promouvoir/maintenir un super_admin
  if (role === 'super_admin' && ctx.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Only super_admin can promote to super_admin' },
      { status: 403 }
    );
  }

  const { error } = await supabaseAdmin
    .from('memberships')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    orgId: ctx.activeOrgId,
    userId: ctx.userId,
    action: 'member.role_changed',
    resourceType: 'membership',
    resourceId: params.id,
    metadata: { targetUserId: target.user_id, oldRole: target.role, newRole: role },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const check = await requirePermission(req, 'canManageOrg');
  if (check.error) return check.error;
  const ctx = check.context;

  const { data: target } = await supabaseAdmin
    .from('memberships')
    .select('id, user_id, role, organisation_id')
    .eq('id', params.id)
    .single();

  if (!target || target.organisation_id !== ctx.activeOrgId) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  // Protéger le dernier super_admin
  if (target.role === 'super_admin') {
    const { count } = await supabaseAdmin
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', ctx.activeOrgId)
      .eq('role', 'super_admin')
      .eq('is_active', true);
    if ((count || 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last super_admin' },
        { status: 400 }
      );
    }
  }

  // Empêcher l'auto-retrait sauf si on est plus que 1 dans l'org
  if (target.user_id === ctx.userId) {
    const { count: totalActive } = await supabaseAdmin
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', ctx.activeOrgId)
      .eq('is_active', true);
    if ((totalActive || 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove yourself from a single-member org' },
        { status: 400 }
      );
    }
  }

  // Soft delete : is_active = false
  const { error } = await supabaseAdmin
    .from('memberships')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    orgId: ctx.activeOrgId,
    userId: ctx.userId,
    action: 'member.removed',
    resourceType: 'membership',
    resourceId: params.id,
    metadata: { targetUserId: target.user_id, role: target.role },
  });

  return NextResponse.json({ success: true });
}
