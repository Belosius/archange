/**
 * /api/activity — Audit log de l'organisation active
 * Réservé aux rôles avec canViewActivity (admin, super_admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/org/requireRole';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const check = await requirePermission(req, 'canViewActivity');
  if (check.error) return check.error;
  const ctx = check.context;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const before = url.searchParams.get('before');
  const actionFilter = url.searchParams.get('action');

  let query = supabaseAdmin
    .from('activity_logs')
    .select(`
      id,
      action,
      resource_type,
      resource_id,
      metadata,
      ip_address,
      created_at,
      user_id,
      users:user_id (id, name, email, image)
    `)
    .eq('organisation_id', ctx.activeOrgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);
  if (actionFilter) query = query.eq('action', actionFilter);

  const { data, error } = await query;
  if (error) {
    console.error('[activity GET]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  const activities = (data || []).map((a: any) => ({
    id: a.id,
    action: a.action,
    resourceType: a.resource_type,
    resourceId: a.resource_id,
    metadata: a.metadata || {},
    createdAt: a.created_at,
    user: a.users ? {
      id: a.users.id,
      name: a.users.name,
      email: a.users.email,
      image: a.users.image,
    } : null,
  }));

  return NextResponse.json({ activities, hasMore: activities.length === limit });
}
