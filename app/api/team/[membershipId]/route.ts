loadMembership(membershipId, ctx.activeOrgId);
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
