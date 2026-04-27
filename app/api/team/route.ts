/**
 * /api/team — Liste les membres de l'organisation active
 * Inclut aussi les invitations en attente (pour affichage dans /settings/team)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireOrgMember } from '@/lib/org/requireRole';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const check = await requireOrgMember(req);
  if (check.error) return check.error;
  const ctx = check.context;

  // Membres actifs
  const { data: memberships } = await supabaseAdmin
    .from('memberships')
    .select(`
      id,
      role,
      is_active,
      joined_at,
      user_id,
      users:user_id (id, email, name, image)
    `)
    .eq('organisation_id', ctx.activeOrgId)
    .eq('is_active', true)
    .order('joined_at', { ascending: true });

  const members = (memberships || []).map((m: any) => ({
    membershipId: m.id,
    userId: m.user_id,
    email: m.users?.email,
    name: m.users?.name,
    image: m.users?.image,
    role: m.role,
    joinedAt: m.joined_at,
    isMe: m.user_id === ctx.userId,
  }));

  // Invitations en attente (non expirées)
  const { data: invitations } = await supabaseAdmin
    .from('invitations')
    .select('id, email, role, status, created_at, expires_at, invited_by')
    .eq('organisation_id', ctx.activeOrgId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  return NextResponse.json({
    members,
    invitations: invitations || [],
    canInvite: ctx.permissions.canInviteMembers,
    canManage: ctx.permissions.canManageOrg,
    myRole: ctx.role,
  });
}
