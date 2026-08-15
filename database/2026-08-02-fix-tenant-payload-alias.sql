-- Migration: fix tenant payload RPC alias issue
-- Date: 2026-08-02

create or replace function public.rpc_get_tenant_payload(p_profile_id uuid)
returns jsonb
language plpgsql
as $$
declare
    v_profile record;
    v_is_product_owner boolean;
    v_visible_group_ids bigint[];
    v_visible_member_ids bigint[];
    v_groups jsonb;
    v_group_setup jsonb;
    v_members jsonb;
    v_member_setup jsonb;
    v_periods jsonb;
    v_balances jsonb;
    v_loans jsonb;
    v_approvals jsonb;
    v_plans jsonb;
    v_subscriptions jsonb;
    v_headers jsonb;
    v_lines jsonb;
    v_legacy_rows jsonb;
    v_share_distributions jsonb;
    v_share_adjustments jsonb;
    v_audits jsonb;
    v_expense_headers jsonb;
    v_expense_lines jsonb;
    v_disputes jsonb;
    v_withdrawal_requests jsonb;
    v_legacy_group_openings jsonb;
    v_pending_setup_changes jsonb;
begin
    select au.user_id, au.supabase_user_id, au.member_id, au.email, au.mobile_number, au.username
      into v_profile
    from public.auth_users au
    where au.supabase_user_id = p_profile_id
    limit 1;

    if not found then
        return jsonb_build_object(
            'groups', '[]'::jsonb,
            'group_setup', '[]'::jsonb,
            'members', '[]'::jsonb,
            'member_setup', '[]'::jsonb,
            'periods', '[]'::jsonb,
            'member_dashboard_balances', '[]'::jsonb,
            'loan_distribution', '[]'::jsonb,
            'approvals', '[]'::jsonb,
            'subscription_plans', '[]'::jsonb,
            'group_subscriptions', '[]'::jsonb,
            'member_transaction_header', '[]'::jsonb,
            'member_transaction_lines', '[]'::jsonb,
            'legacy_data', '[]'::jsonb,
            'share_distribution', '[]'::jsonb,
            'share_adjustments', '[]'::jsonb,
            'trx_audit_history', '[]'::jsonb,
            'group_expense_header', '[]'::jsonb,
            'group_expense_lines', '[]'::jsonb,
            'support_disputes', '[]'::jsonb,
            'withdrawal_requests', '[]'::jsonb,
            'legacy_group_opening', '[]'::jsonb,
            'pending_setup_changes', '[]'::jsonb
        );
    end if;

    v_is_product_owner := lower(coalesce(v_profile.email, '')) = 'katgroupsupport@gmail.com';

    if v_is_product_owner then
        select array_agg(distinct g.group_id)
          into v_visible_group_ids
        from public.groups g;
    else
        select array_agg(distinct group_id)
          into v_visible_group_ids
        from (
            select m.group_id
            from public.members m
            where (
                m.member_id = v_profile.member_id
                or (nullif(trim(coalesce(m.email, '')), '') <> '' and nullif(trim(coalesce(v_profile.email, '')), '') <> '' and lower(m.email) = lower(v_profile.email))
                or (nullif(trim(coalesce(m.mobile_number, '')), '') <> '' and nullif(trim(coalesce(v_profile.mobile_number, '')), '') <> '' and m.mobile_number = v_profile.mobile_number)
            )
            union
            select g.group_id
            from public.groups g
            where g.created_by = v_profile.user_id
        ) visible_groups;
    end if;

    if v_visible_group_ids is null then
        v_visible_group_ids := array[]::bigint[];
    end if;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_id), '[]'::jsonb)
      into v_groups
    from (
        select *
        from public.groups g
        where g.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_id), '[]'::jsonb)
      into v_group_setup
    from (
        select *
        from public.group_setup gs
        where gs.group_id = any(v_visible_group_ids)
    ) r;

    select array_agg(distinct m.member_id)
      into v_visible_member_ids
    from public.members m
    where m.group_id = any(v_visible_group_ids);

    if v_visible_member_ids is null then
        v_visible_member_ids := array[]::bigint[];
    end if;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_members
    from (
        select *
        from public.members m
        where m.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_member_setup
    from (
        select *
        from public.member_setup ms
        where ms.member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.period_id), '[]'::jsonb)
      into v_periods
    from (
        select *
        from public.periods p
        where p.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_balances
    from (
        select *
        from public.member_dashboard_balances b
        where b.member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.loan_id), '[]'::jsonb)
      into v_loans
    from (
        select *
        from public.loan_distribution ld
        where ld.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.approval_id), '[]'::jsonb)
      into v_approvals
    from (
        select *
        from public.approvals a
        where a.group_id = any(v_visible_group_ids)
           or a.approver_member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.subscription_plan_id), '[]'::jsonb)
      into v_plans
    from (
        select *
        from public.subscription_plans sp
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_subscription_id), '[]'::jsonb)
      into v_subscriptions
    from (
        select gs.*, jsonb_build_object('group_name', g.group_name) as groups
        from public.group_subscriptions gs
        left join public.groups g on g.group_id = gs.group_id
        where gs.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_trx_id), '[]'::jsonb)
      into v_headers
    from (
        select *
        from public.member_transaction_header h
        where h.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_trx_id), '[]'::jsonb)
      into v_lines
    from (
        select *
        from public.member_transaction_lines l
        where l.member_trx_id in (
            select h.member_trx_id
            from public.member_transaction_header h
            where h.group_id = any(v_visible_group_ids)
        )
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.legacy_id), '[]'::jsonb)
      into v_legacy_rows
    from (
        select *
        from public.legacy_data ld
        where ld.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_share_distributions
    from (
        select *
        from public.share_distribution sd
        where sd.member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_share_adjustments
    from (
        select *
        from public.share_adjustments sa
        where sa.member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.audit_id), '[]'::jsonb)
      into v_audits
    from (
        select ah.*
        from public.trx_audit_history ah
        join public.member_transaction_header h on ah.trx_id = h.member_trx_id
        where h.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_expense_id), '[]'::jsonb)
      into v_expense_headers
    from (
        select *
        from public.group_expense_header geh
        where geh.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_expense_id), '[]'::jsonb)
      into v_expense_lines
    from (
        select *
        from public.group_expense_lines gel
        where gel.group_expense_id in (
            select geh.group_expense_id
            from public.group_expense_header geh
            where geh.group_id = any(v_visible_group_ids)
        )
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.dispute_id), '[]'::jsonb)
      into v_disputes
    from (
        select *
        from public.support_disputes sd
        where sd.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.withdrawal_request_id), '[]'::jsonb)
      into v_withdrawal_requests
    from (
        select *
        from public.withdrawal_requests wr
        where wr.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.legacy_group_opening_id), '[]'::jsonb)
      into v_legacy_group_openings
    from (
        select *
        from public.legacy_group_opening lgo
        where lgo.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.setup_change_id), '[]'::jsonb)
      into v_pending_setup_changes
    from (
        select *
        from public.pending_setup_changes psc
        where psc.group_id = any(v_visible_group_ids)
    ) r;

    return jsonb_build_object(
        'groups', v_groups,
        'group_setup', v_group_setup,
        'members', v_members,
        'member_setup', v_member_setup,
        'periods', v_periods,
        'member_dashboard_balances', v_balances,
        'loan_distribution', v_loans,
        'approvals', v_approvals,
        'subscription_plans', v_plans,
        'group_subscriptions', v_subscriptions,
        'member_transaction_header', v_headers,
        'member_transaction_lines', v_lines,
        'legacy_data', v_legacy_rows,
        'share_distribution', v_share_distributions,
        'share_adjustments', v_share_adjustments,
        'trx_audit_history', v_audits,
        'group_expense_header', v_expense_headers,
        'group_expense_lines', v_expense_lines,
        'support_disputes', v_disputes,
        'withdrawal_requests', v_withdrawal_requests,
        'legacy_group_opening', v_legacy_group_openings,
        'pending_setup_changes', v_pending_setup_changes
    );
end;
$$;
