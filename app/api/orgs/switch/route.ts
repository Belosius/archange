/**
 * /api/orgs/switch — Change l'organisation active de l'utilisateur courant
 * Vérifie que le user est bien membre de l'org cible avant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId } = await req.json();
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .single();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Vérifier que le user est bien membre de cette org
  const { data: membership } = await supabaseAdmin
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this org' }, { status: 403 });
  }

  // Mettre à jour l'org active
  const { error } = await supabaseAdmin
    .from('users')
    .update({ active_organisation_id: orgId })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Update failed', details: error.message }, { status: 500 });
  }

  await logActivity({
    orgId,
    userId: user.id,
    action: 'org.switched',
    resourceType: 'organisation',
    resourceId: orgId,
  });

  return NextResponse.json({ success: true });
}
