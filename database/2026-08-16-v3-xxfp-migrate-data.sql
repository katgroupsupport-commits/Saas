-- =============================================================================
-- Bachat Gat SaaS - XXFP_ data migration
-- Date: 2026-08-16
--
-- 1. Copies every row from the v2 tables into the new XXFP_ tables while
--    preserving primary keys (OVERRIDING SYSTEM VALUE).
-- 2. Deduplicates members into XXFP_PERSONS by email -> username -> mobile.
-- 3. Drops the old physical tables (nothing here is deleted destructively --
--    run after taking a dump). Old names are NOT recreated: the consolidated
--    RPCs and the application read the XXFP_ tables directly.
-- 4. Recreates the canonical dashboard-balance views (xxfp_v_* names) and the
--    completed-history views over the XXFP_ tables.
--
-- Safe on a fresh database: data copies are guarded by to_regclass() and are
-- skipped when the old tables do not exist.
-- =============================================================================

begin;

-- Relax setup-inheritance columns on the XXFP_ tables (NULL = not configured,
-- inherit from group/default). Production v2 data uses NULL for this purpose,
-- and the app writes NULLs on group/member creation, so these must stay nullable.
alter table public.xxfp_group_setup
  alter column monthly_saving_amount drop not null,
  alter column monthly_saving_amount drop default,
  alter column interest_rate drop not null,
  alter column interest_rate drop default,
  alter column penalty_amount drop not null,
  alter column penalty_amount drop default,
  alter column loan_limit drop not null,
  alter column loan_limit drop default,
  alter column loan_tenure_months drop not null,
  alter column loan_tenure_months drop default,
  alter column loan_due_day drop not null,
  alter column loan_due_day drop default;

alter table public.xxfp_member_setup
  alter column custom_saving_amount drop not null,
  alter column custom_saving_amount drop default,
  alter column loan_limit drop not null,
  alter column loan_limit drop default,
  alter column loan_tenure_months drop not null,
  alter column loan_tenure_months drop default,
  alter column interest_rate drop not null,
  alter column interest_rate drop default;

-- =============================================================================
-- A. DATA COPY (guarded)
-- =============================================================================
do $$
begin
  if to_regclass('public.members') is null then
    raise notice 'v2 tables not found; skipping data copy';
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- A0. Build member -> person mapping (dedupe by email -> username -> mobile)
  -- ---------------------------------------------------------------------------
  create temp table tmp_person_key on commit drop as
    select
      m.member_id,
      coalesce(
        nullif(lower(trim(m.email)), ''),
        nullif(lower(trim(m.username)), ''),
        nullif(regexp_replace(coalesce(m.mobile_number, ''), '\D', '', 'g'), '')
      ) as person_key
    from public.members m;

  create temp table tmp_person_map on commit drop as
    select min(member_id) as person_id, person_key
    from tmp_person_key
    where person_key is not null
    group by person_key;

  create temp table tmp_member_to_person on commit drop as
    select
      t.member_id,
      coalesce(pm.person_id, t.member_id) as person_id
    from tmp_person_key t
    left join tmp_person_map pm on pm.person_key = t.person_key;

  -- ---------------------------------------------------------------------------
  -- A1. Roles (preserve existing role ids so FKs stay valid)
  -- ---------------------------------------------------------------------------
  if to_regclass('public.roles') is not null then
    insert into public.xxfp_roles (role_id, role_name, description, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select role_id, role_name, description, created_by, creation_date, last_updated_by, last_update_date
    from public.roles
    on conflict (role_id) do nothing;
  end if;

  -- ---------------------------------------------------------------------------
  -- A2. Persons
  -- ---------------------------------------------------------------------------
  if to_regclass('public.auth_users') is not null then
    insert into public.xxfp_persons (person_id, person_number, full_name, username, email, mobile_number, auth_user_id, status, profile_photo_data, created_by, creation_date, last_updated_by, last_update_date)
    overriding system value
    select
      mp.person_id,
      'P' || lpad(mp.person_id::text, 8, '0'),
      coalesce(m.member_name, ''),
      m.username,
      m.email,
      m.mobile_number,
      au.supabase_user_id,
      case
        when exists (
          select 1
          from public.members x
          join tmp_member_to_person y on y.member_id = x.member_id
          where y.person_id = mp.person_id and upper(x.status) = 'ACTIVE'
        ) then 'ACTIVE'
        else 'INACTIVE'
      end,
      m.profile_photo_data,
      m.created_by,
      m.creation_date,
      m.last_updated_by,
      m.last_update_date
    from tmp_member_to_person mp
    join public.members m on m.member_id = mp.person_id
    left join public.auth_users au on au.member_id = mp.person_id
    on conflict (person_id) do nothing;
  end if;

  -- ---------------------------------------------------------------------------
  -- A3. Groups (owner = person behind the creating auth user)
  -- ---------------------------------------------------------------------------
  if to_regclass('public.groups') is not null and to_regclass('public.auth_users') is not null then
    insert into public.xxfp_groups (group_id, group_name, code, primary_contact_name, mobile_number, email, status, owner_person_id, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select
      g.group_id,
      g.group_name,
      'BG-' || lpad(g.group_id::text, 4, '0'),
      g.primary_contact_name,
      g.mobile_number,
      g.email,
      g.status,
      mp.person_id,
      g.created_by,
      g.creation_date,
      g.last_updated_by,
      g.last_update_date
    from public.groups g
    left join public.auth_users au on au.user_id = g.created_by
    left join tmp_member_to_person mp on mp.member_id = au.member_id
    on conflict (group_id) do nothing;
  end if;

  -- ---------------------------------------------------------------------------
  -- A4. Group members (memberships) -> XXFP_GROUP_MEMBERS
  -- ---------------------------------------------------------------------------
  insert into public.xxfp_group_members (member_id, group_id, person_id, role_id, member_name, username, mobile_number, email, profile_photo_data, join_date, exit_date, status, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
  select
    m.member_id,
    m.group_id,
    mp.person_id,
    m.role_id,
    m.member_name,
    m.username,
    m.mobile_number,
    m.email,
    m.profile_photo_data,
    m.join_date,
    m.exit_date,
    m.status,
    m.created_by,
    m.creation_date,
    m.last_updated_by,
    m.last_update_date
  from public.members m
  join tmp_member_to_person mp on mp.member_id = m.member_id
  on conflict (member_id) do nothing;

  -- ---------------------------------------------------------------------------
  -- A5. Auth users
  -- ---------------------------------------------------------------------------
  if to_regclass('public.auth_users') is not null then
    insert into public.xxfp_auth_users (user_id, supabase_user_id, member_id, person_id, username, password_hash, email, mobile_number, status, last_login_date, profile_photo_data, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select
      au.user_id,
      au.supabase_user_id,
      au.member_id,
      mp.person_id,
      au.username,
      au.password_hash,
      au.email,
      au.mobile_number,
      au.status,
      au.last_login_date,
      au.profile_photo_data,
      au.created_by,
      au.creation_date,
      au.last_updated_by,
      au.last_update_date
    from public.auth_users au
    left join tmp_member_to_person mp on mp.member_id = au.member_id
    on conflict (user_id) do nothing;
  end if;

  -- ---------------------------------------------------------------------------
  -- A6. Remaining tables (ID-preserving direct copies)
  -- ---------------------------------------------------------------------------
  if to_regclass('public.member_status_history') is not null then
    insert into public.xxfp_member_status_history (member_status_id, member_id, group_id, status, start_date, end_date, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select member_status_id, member_id, group_id, status, start_date, end_date, created_by, creation_date, last_updated_by, last_update_date
    from public.member_status_history
    on conflict (member_status_id) do nothing;
  end if;

  if to_regclass('public.group_setup') is not null then
    insert into public.xxfp_group_setup (group_setup_id, group_id, monthly_saving_amount, interest_rate, interest_type, penalty_amount, loan_limit, loan_tenure_months, loan_due_day, auto_approve_flag, current_open_period, approver_names, admin_names, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select group_setup_id, group_id, monthly_saving_amount, interest_rate, coalesce(interest_type, 'Reducing'), penalty_amount, loan_limit, loan_tenure_months, loan_due_day, auto_approve_flag, current_open_period, coalesce(approver_names, '[]'::jsonb), coalesce(admin_names, '[]'::jsonb), created_by, creation_date, last_updated_by, last_update_date
    from public.group_setup
    on conflict (group_setup_id) do nothing;
  end if;

  if to_regclass('public.member_setup') is not null then
    insert into public.xxfp_member_setup (member_setup_id, member_id, custom_saving_amount, loan_limit, loan_tenure_months, interest_rate, interest_type, active_flag, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select member_setup_id, member_id, custom_saving_amount, loan_limit, loan_tenure_months, interest_rate, coalesce(interest_type, 'Reducing'), active_flag, created_by, creation_date, last_updated_by, last_update_date
    from public.member_setup
    on conflict (member_setup_id) do nothing;
  end if;

  if to_regclass('public.periods') is not null then
    insert into public.xxfp_periods (period_id, group_id, period_name, start_date, end_date, status, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select period_id, group_id, period_name, start_date, end_date, status, created_by, creation_date, last_updated_by, last_update_date
    from public.periods
    on conflict (period_id) do nothing;
  end if;

  if to_regclass('public.member_transaction_header') is not null then
    insert into public.xxfp_trx_header (member_trx_id, trx_number, group_id, member_id, period_id, trx_date, trx_type, total_amount, approval_status, parent_trx_id, adjustment_flag, reversed_flag, remarks, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select member_trx_id, trx_number, group_id, member_id, period_id, trx_date, trx_type, total_amount, approval_status, parent_trx_id, adjustment_flag, reversed_flag, remarks, created_by, creation_date, last_updated_by, last_update_date
    from public.member_transaction_header
    on conflict (member_trx_id) do nothing;
  end if;

  if to_regclass('public.member_transaction_lines') is not null then
    insert into public.xxfp_trx_lines (member_trx_line_id, member_trx_id, line_type, amount, reference_id, remarks, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select member_trx_line_id, member_trx_id, line_type, amount, reference_id, remarks, created_by, creation_date, last_updated_by, last_update_date
    from public.member_transaction_lines
    on conflict (member_trx_line_id) do nothing;
  end if;

  if to_regclass('public.loan_requests') is not null then
    insert into public.xxfp_loan_requests (loan_request_id, request_number, group_id, member_id, requested_amount, requested_months, purpose, request_date, status, approval_status, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select loan_request_id, request_number, group_id, member_id, requested_amount, requested_months, purpose, request_date, status, approval_status, created_by, creation_date, last_updated_by, last_update_date
    from public.loan_requests
    on conflict (loan_request_id) do nothing;
  end if;

  if to_regclass('public.loan_distribution') is not null then
    insert into public.xxfp_loan_header (loan_id, loan_number, loan_request_id, group_id, member_id, distributed_amount, interest_rate, distribution_date, outstanding_principal, outstanding_interest, loan_status, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select loan_id, loan_number, loan_request_id, group_id, member_id, distributed_amount, interest_rate, distribution_date, outstanding_principal, outstanding_interest, loan_status, created_by, creation_date, last_updated_by, last_update_date
    from public.loan_distribution
    on conflict (loan_id) do nothing;
  end if;

  if to_regclass('public.loan_repayment_schedule') is not null then
    insert into public.xxfp_loan_schedule (loan_schedule_id, loan_id, installment_no, due_date, principal_amount, interest_amount, paid_flag, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select loan_schedule_id, loan_id, installment_no, due_date, principal_amount, interest_amount, paid_flag, created_by, creation_date, last_updated_by, last_update_date
    from public.loan_repayment_schedule
    on conflict (loan_schedule_id) do nothing;
  end if;

  if to_regclass('public.approvals') is not null then
    insert into public.xxfp_approval_header (approval_id, transaction_type, reference_id, reference_type, group_id, approval_batch_id, requester_member_id, approver_member_id, requester_name, approver_name, amount, approval_status, approval_date, remarks, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select approval_id, transaction_type, reference_id, coalesce(reference_type, 'transaction'), group_id, approval_batch_id, null, approver_member_id, requester_name, approver_name, amount, approval_status, approval_date, remarks, created_by, creation_date, last_updated_by, last_update_date
    from public.approvals
    on conflict (approval_id) do nothing;
  end if;

  if to_regclass('public.legacy_data') is not null then
    insert into public.xxfp_legacy_data (legacy_id, group_id, member_id, legacy_saving_balance, legacy_loan_outstanding, legacy_interest_balance, legacy_penalty_balance, legacy_share_earned, legacy_bank_balance, approval_status, migration_date, remarks, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select legacy_id, group_id, member_id, legacy_saving_balance, legacy_loan_outstanding, legacy_interest_balance, legacy_penalty_balance, legacy_share_earned, legacy_bank_balance, approval_status, migration_date, remarks, created_by, creation_date, last_updated_by, last_update_date
    from public.legacy_data
    on conflict (legacy_id) do nothing;
  end if;

  if to_regclass('public.group_expense_header') is not null then
    insert into public.xxfp_group_expense_header (group_expense_id, expense_number, group_id, period_id, expense_date, expense_type, total_amount, payment_mode, approval_status, remarks, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select group_expense_id, expense_number, group_id, period_id, expense_date, expense_type, total_amount, payment_mode, approval_status, remarks, created_by, creation_date, last_updated_by, last_update_date
    from public.group_expense_header
    on conflict (group_expense_id) do nothing;
  end if;

  if to_regclass('public.group_expense_lines') is not null then
    insert into public.xxfp_group_expense_lines (group_expense_line_id, group_expense_id, expense_category, amount, remarks, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select group_expense_line_id, group_expense_id, expense_category, amount, remarks, created_by, creation_date, last_updated_by, last_update_date
    from public.group_expense_lines
    on conflict (group_expense_line_id) do nothing;
  end if;

  if to_regclass('public.share_distribution') is not null then
    insert into public.xxfp_share_distribution (distribution_id, earning_trx_id, member_id, distribution_amount, source_type, distribution_date, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select distribution_id, earning_trx_id, member_id, distribution_amount, source_type, distribution_date, created_by, creation_date, last_updated_by, last_update_date
    from public.share_distribution
    on conflict (distribution_id) do nothing;
  end if;

  if to_regclass('public.share_adjustments') is not null then
    insert into public.xxfp_share_adjustments (share_adjustment_id, member_id, amount, reason, source_reference, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select share_adjustment_id, member_id, amount, reason, source_reference, created_by, creation_date, last_updated_by, last_update_date
    from public.share_adjustments
    on conflict (share_adjustment_id) do nothing;
  end if;

  if to_regclass('public.trx_audit_history') is not null then
    insert into public.xxfp_audit_log (audit_id, trx_id, action_type, old_value, new_value, changed_by, changed_date, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select audit_id, trx_id, action_type, old_value, new_value, changed_by, changed_date, created_by, creation_date, last_updated_by, last_update_date
    from public.trx_audit_history
    on conflict (audit_id) do nothing;
  end if;

  if to_regclass('public.subscription_plans') is not null then
    -- Past re-seeds left duplicate (plan_name, duration) rows with different ids.
    -- Keep the lowest subscription_plan_id per name/duration and remap references.
    create temp table tmp_plan_id_map on commit drop as
      select sp.subscription_plan_id as old_id, k.survivor_id
      from public.subscription_plans sp
      join (
        select plan_name, duration, min(subscription_plan_id) as survivor_id
        from public.subscription_plans
        group by plan_name, duration
        having count(*) > 1
      ) k on k.plan_name = sp.plan_name and k.duration = sp.duration
      where sp.subscription_plan_id <> k.survivor_id;

    insert into public.xxfp_subscription_plans (subscription_plan_id, plan_name, duration, amount, max_members, features, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select subscription_plan_id, plan_name, duration, amount, max_members, features, created_by, creation_date, last_updated_by, last_update_date
    from public.subscription_plans
    order by subscription_plan_id
    on conflict (plan_name, duration) do nothing;
  end if;

  if to_regclass('public.group_subscriptions') is not null then
    insert into public.xxfp_group_subscriptions (group_subscription_id, group_id, subscription_plan_id, start_date, end_date, payment_status, transaction_reference, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select gs.group_subscription_id, gs.group_id, coalesce(m.survivor_id, gs.subscription_plan_id), gs.start_date, gs.end_date, gs.payment_status, gs.transaction_reference, gs.created_by, gs.creation_date, gs.last_updated_by, gs.last_update_date
    from public.group_subscriptions gs
    left join tmp_plan_id_map m on m.old_id = gs.subscription_plan_id
    on conflict (group_subscription_id) do nothing;
  end if;

  if to_regclass('public.withdrawal_requests') is not null then
    insert into public.xxfp_withdrawal_requests (withdrawal_request_id, request_number, group_id, member_id, requested_amount, request_date, reason, status, approval_status, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select withdrawal_request_id, request_number, group_id, member_id, requested_amount, request_date, reason, status, approval_status, created_by, creation_date, last_updated_by, last_update_date
    from public.withdrawal_requests
    on conflict (withdrawal_request_id) do nothing;
  end if;

  if to_regclass('public.support_disputes') is not null then
    insert into public.xxfp_support_disputes (dispute_id, group_id, member_id, group_name, member_name, contact_number, issue, attachment_name, attachment_data, status, owner_reply, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select dispute_id, group_id, member_id, group_name, member_name, contact_number, issue, attachment_name, attachment_data, status, owner_reply, created_by, creation_date, last_updated_by, last_update_date
    from public.support_disputes
    on conflict (dispute_id) do nothing;
  end if;

  if to_regclass('public.legacy_group_opening') is not null then
    insert into public.xxfp_legacy_group_opening (legacy_group_opening_id, group_id, migration_date, opening_bank_balance, opening_group_expense, opening_group_gain, approval_status, remarks, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select legacy_group_opening_id, group_id, migration_date, opening_bank_balance, opening_group_expense, opening_group_gain, coalesce(approval_status, 'COMPLETED'), remarks, created_by, creation_date, last_updated_by, last_update_date
    from public.legacy_group_opening
    on conflict (legacy_group_opening_id) do nothing;
  end if;

  if to_regclass('public.pending_setup_changes') is not null then
    insert into public.xxfp_pending_setup_changes (setup_change_id, group_id, approval_batch_id, setup_type, target_id, target_name, payload, old_value, change_summary, status, created_by, creation_date, last_updated_by, last_update_date)
  overriding system value
    select setup_change_id, group_id, approval_batch_id, setup_type, target_id, target_name, payload, old_value, change_summary, status, created_by, creation_date, last_updated_by, last_update_date
    from public.pending_setup_changes
    on conflict (setup_change_id) do nothing;
  end if;

  raise notice 'XXFP data copy completed';
end $$;

-- =============================================================================
-- B. SEED DOCUMENT SEQUENCES FROM EXISTING DATA
-- =============================================================================
insert into public.xxfp_doc_sequences (group_id, doc_type, last_number, prefix)
select group_id, 'TRX', count(*), 'TRX' from public.xxfp_trx_header group by group_id
on conflict (group_id, doc_type) do update set last_number = excluded.last_number;

insert into public.xxfp_doc_sequences (group_id, doc_type, last_number, prefix)
select group_id, 'LOAN', count(*), 'LOAN' from public.xxfp_loan_header group by group_id
on conflict (group_id, doc_type) do update set last_number = excluded.last_number;

insert into public.xxfp_doc_sequences (group_id, doc_type, last_number, prefix)
select group_id, 'EXP', count(*), 'EXP' from public.xxfp_group_expense_header group by group_id
on conflict (group_id, doc_type) do update set last_number = excluded.last_number;

insert into public.xxfp_doc_sequences (group_id, doc_type, last_number, prefix)
select group_id, 'LR', count(*), 'LR' from public.xxfp_loan_requests group by group_id
on conflict (group_id, doc_type) do update set last_number = excluded.last_number;

insert into public.xxfp_doc_sequences (group_id, doc_type, last_number, prefix)
select group_id, 'WR', count(*), 'WR' from public.xxfp_withdrawal_requests group by group_id
on conflict (group_id, doc_type) do update set last_number = excluded.last_number;

-- =============================================================================
-- C. SYNC IDENTITY SEQUENCES (so new rows do not collide with copied ids)
-- =============================================================================
select setval(pg_get_serial_sequence('public.xxfp_roles', 'role_id'), coalesce((select max(role_id) from public.xxfp_roles), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_persons', 'person_id'), coalesce((select max(person_id) from public.xxfp_persons), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_groups', 'group_id'), coalesce((select max(group_id) from public.xxfp_groups), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_group_members', 'member_id'), coalesce((select max(member_id) from public.xxfp_group_members), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_auth_users', 'user_id'), coalesce((select max(user_id) from public.xxfp_auth_users), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_member_status_history', 'member_status_id'), coalesce((select max(member_status_id) from public.xxfp_member_status_history), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_group_setup', 'group_setup_id'), coalesce((select max(group_setup_id) from public.xxfp_group_setup), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_member_setup', 'member_setup_id'), coalesce((select max(member_setup_id) from public.xxfp_member_setup), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_periods', 'period_id'), coalesce((select max(period_id) from public.xxfp_periods), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_trx_header', 'member_trx_id'), coalesce((select max(member_trx_id) from public.xxfp_trx_header), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_trx_lines', 'member_trx_line_id'), coalesce((select max(member_trx_line_id) from public.xxfp_trx_lines), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_loan_requests', 'loan_request_id'), coalesce((select max(loan_request_id) from public.xxfp_loan_requests), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_loan_header', 'loan_id'), coalesce((select max(loan_id) from public.xxfp_loan_header), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_loan_schedule', 'loan_schedule_id'), coalesce((select max(loan_schedule_id) from public.xxfp_loan_schedule), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_approval_header', 'approval_id'), coalesce((select max(approval_id) from public.xxfp_approval_header), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_legacy_data', 'legacy_id'), coalesce((select max(legacy_id) from public.xxfp_legacy_data), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_group_expense_header', 'group_expense_id'), coalesce((select max(group_expense_id) from public.xxfp_group_expense_header), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_group_expense_lines', 'group_expense_line_id'), coalesce((select max(group_expense_line_id) from public.xxfp_group_expense_lines), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_share_distribution', 'distribution_id'), coalesce((select max(distribution_id) from public.xxfp_share_distribution), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_share_adjustments', 'share_adjustment_id'), coalesce((select max(share_adjustment_id) from public.xxfp_share_adjustments), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_audit_log', 'audit_id'), coalesce((select max(audit_id) from public.xxfp_audit_log), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_subscription_plans', 'subscription_plan_id'), coalesce((select max(subscription_plan_id) from public.xxfp_subscription_plans), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_group_subscriptions', 'group_subscription_id'), coalesce((select max(group_subscription_id) from public.xxfp_group_subscriptions), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_withdrawal_requests', 'withdrawal_request_id'), coalesce((select max(withdrawal_request_id) from public.xxfp_withdrawal_requests), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_support_disputes', 'dispute_id'), coalesce((select max(dispute_id) from public.xxfp_support_disputes), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_legacy_group_opening', 'legacy_group_opening_id'), coalesce((select max(legacy_group_opening_id) from public.xxfp_legacy_group_opening), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_pending_setup_changes', 'setup_change_id'), coalesce((select max(setup_change_id) from public.xxfp_pending_setup_changes), 1), true);
select setval(pg_get_serial_sequence('public.xxfp_doc_sequences', 'doc_sequence_id'), coalesce((select max(doc_sequence_id) from public.xxfp_doc_sequences), 1), true);

-- =============================================================================
-- D. DROP OLD PHYSICAL TABLES / COMPAT VIEWS (no compatibility views are
--    recreated - the consolidated RPCs and the application read the XXFP_
--    tables directly). Handles both leftover physical tables and views created
--    by an earlier run of this migration.
-- =============================================================================
drop view if exists public.member_dashboard_balances cascade;
drop view if exists public.group_dashboard_balances cascade;
drop view if exists public.v_completed_member_transaction_history cascade;
drop view if exists public.v_completed_legacy_member_history cascade;

do $$
declare
  obj record;
  relkind char;
begin
  for obj in select unnest(array[
    'group_subscriptions', 'subscription_plans', 'trx_audit_history',
    'share_adjustments', 'share_distribution', 'group_expense_lines',
    'group_expense_header', 'legacy_data', 'approvals',
    'loan_repayment_schedule', 'loan_distribution', 'loan_requests',
    'member_transaction_lines', 'member_transaction_header', 'periods',
    'member_setup', 'group_setup', 'member_status_history', 'auth_users',
    'members', 'groups', 'roles', 'pending_setup_changes',
    'withdrawal_requests', 'support_disputes', 'legacy_group_opening',
    'document_sequences'
  ]) as name
  loop
    select c.relkind into relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = obj.name
    limit 1;

    if relkind in ('r', 'p') then
      execute format('drop table if exists public.%I cascade', obj.name);
    elsif relkind = 'v' then
      execute format('drop view if exists public.%I cascade', obj.name);
    elsif relkind = 'm' then
      execute format('drop materialized view if exists public.%I cascade', obj.name);
    end if;
  end loop;
end $$;

-- =============================================================================
-- F. DASHBOARD BALANCE VIEWS  (canonical xxfp_v_* names only)
-- =============================================================================
create or replace view public.xxfp_v_group_dashboard_balances with (security_invoker = true) as
with trx as (
  select h.group_id, h.trx_type, l.line_type, sum(l.amount) amount
  from public.xxfp_trx_header h
  join public.xxfp_trx_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.group_id, h.trx_type, l.line_type
),
shares as (
  select m.group_id, sum(sd.distribution_amount) share_distribution_amount
  from public.xxfp_share_distribution sd
  join public.xxfp_group_members m on m.member_id = sd.member_id
  group by m.group_id
),
share_adj as (
  select m.group_id, sum(sa.amount) share_adjustment_amount
  from public.xxfp_share_adjustments sa
  join public.xxfp_group_members m on m.member_id = sa.member_id
  group by m.group_id
),
expenses as (
  select group_id, sum(total_amount) group_expenses
  from public.xxfp_group_expense_header
  where upper(approval_status) in ('COMPLETED', 'APPROVED')
  group by group_id
),
legacy_opening as (
  select
    group_id,
    sum(opening_bank_balance) opening_bank_balance,
    sum(opening_group_expense) opening_group_expense,
    sum(opening_group_gain) opening_group_gain
  from public.xxfp_legacy_group_opening
  where upper(coalesce(approval_status, 'COMPLETED')) in ('COMPLETED', 'APPROVED')
  group by group_id
),
loan_balance as (
  select group_id, sum(outstanding_principal) outstanding_loan_amount
  from public.xxfp_loan_header
  where upper(loan_status) = 'ACTIVE'
  group by group_id
),
group_base as (
  select
    g.group_id,
    coalesce(sum(trx.amount) filter (where trx.line_type = 'SAVING' and trx.trx_type <> 'Group Expense Share'), 0)
      + coalesce(s.share_distribution_amount, 0)
      + coalesce(sa.share_adjustment_amount, 0) as total_savings,
    coalesce(lb.outstanding_loan_amount, 0) as outstanding_loan_amount,
    coalesce(lo.opening_bank_balance, 0) as opening_bank_balance,
    coalesce(lo.opening_group_expense, 0) as opening_group_expense,
    coalesce(lo.opening_group_gain, 0) as opening_group_gain,
    coalesce(e.group_expenses, 0) as group_expenses,
    coalesce(sum(trx.amount) filter (where trx.line_type = 'LOAN_INTEREST' and trx.trx_type <> 'Migrated'), 0)
      + coalesce(sum(trx.amount) filter (where trx.line_type = 'PENALTY' and trx.trx_type <> 'Migrated'), 0) as collected_gain,
    coalesce(sum(trx.amount) filter (
      where trx.trx_type <> 'Migrated'
        and trx.line_type in ('LOAN_INTEREST','PENALTY','OTHER','CHARGES')
    ), 0) as collected_non_saving,
    coalesce(sum(trx.amount) filter (where trx.line_type = 'SAVING' and trx.trx_type <> 'Group Expense Share'), 0) as collected_saving,
    coalesce(sum(trx.amount) filter (where trx.line_type in ('LOAN_DISTRIBUTION','WITHDRAWAL')), 0) as cash_out
  from public.xxfp_groups g
  left join trx on trx.group_id = g.group_id
  left join shares s on s.group_id = g.group_id
  left join share_adj sa on sa.group_id = g.group_id
  left join expenses e on e.group_id = g.group_id
  left join legacy_opening lo on lo.group_id = g.group_id
  left join loan_balance lb on lb.group_id = g.group_id
  group by
    g.group_id,
    s.share_distribution_amount,
    sa.share_adjustment_amount,
    lb.outstanding_loan_amount,
    lo.opening_bank_balance,
    lo.opening_group_expense,
    lo.opening_group_gain,
    e.group_expenses
)
select
  group_id,
  total_savings,
  (select count(*) from public.xxfp_loan_header ld where ld.group_id = group_base.group_id and upper(ld.loan_status) = 'ACTIVE') as active_loans,
  outstanding_loan_amount,
  collected_gain
    + opening_group_gain
    + greatest(0, opening_bank_balance + outstanding_loan_amount + opening_group_expense - total_savings) as group_gain_amount,
  collected_saving
    + collected_non_saving
    + opening_bank_balance
    + opening_group_gain
    - cash_out
    - group_expenses
    - opening_group_expense as remaining_balance
from group_base;

create or replace view public.xxfp_v_member_dashboard_balances with (security_invoker = true) as
with trx as (
  select h.member_id, h.trx_type, l.line_type, sum(l.amount) amount
  from public.xxfp_trx_header h
  join public.xxfp_trx_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.member_id, h.trx_type, l.line_type
),
shares as (
  select member_id, sum(distribution_amount) distribution_amount
  from public.xxfp_share_distribution
  group by member_id
),
share_adj as (
  select member_id, sum(amount) adjustment_amount
  from public.xxfp_share_adjustments
  group by member_id
),
loans as (
  select member_id, sum(outstanding_principal) outstanding_principal, sum(outstanding_interest) outstanding_interest
  from public.xxfp_loan_header
  where upper(loan_status) = 'ACTIVE'
  group by member_id
)
select
  m.member_id,
  m.group_id,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'SAVING'), 0)
    + coalesce(s.distribution_amount, 0)
    + coalesce(sa.adjustment_amount, 0) as savings,
  coalesce(lo.outstanding_principal, 0)
    + coalesce(lo.outstanding_interest, 0) as outstanding_loan,
  coalesce(s.distribution_amount, 0) + coalesce(sa.adjustment_amount, 0) as earned_from_group,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'CHARGES'), 0)
    + coalesce(sum(trx.amount) filter (where trx.line_type = 'PENALTY' and trx.trx_type = 'Migrated'), 0) as pending_charges
from public.xxfp_group_members m
left join trx on trx.member_id = m.member_id
left join shares s on s.member_id = m.member_id
left join share_adj sa on sa.member_id = m.member_id
left join loans lo on lo.member_id = m.member_id
group by m.member_id, m.group_id, s.distribution_amount, sa.adjustment_amount, lo.outstanding_principal, lo.outstanding_interest;

-- Completed-history views used by reconciliation/reports
create or replace view public.v_completed_member_transaction_history with (security_invoker = true) as
select
  h.member_trx_id,
  h.trx_number,
  h.group_id,
  h.member_id,
  h.period_id,
  h.trx_date,
  h.trx_type,
  h.approval_status,
  h.parent_trx_id,
  h.adjustment_flag,
  h.reversed_flag,
  h.remarks,
  coalesce(sum(case when l.line_type = 'SAVING' then l.amount else 0 end), 0) as saving_amount,
  coalesce(sum(case when l.line_type = 'LOAN_PRINCIPAL' then l.amount else 0 end), 0) as loan_principal_amount,
  coalesce(sum(case when l.line_type = 'LOAN_INTEREST' then l.amount else 0 end), 0) as loan_interest_amount,
  coalesce(sum(case when l.line_type = 'PENALTY' then l.amount else 0 end), 0) as penalty_amount,
  coalesce(sum(case when l.line_type = 'CHARGES' then l.amount else 0 end), 0) as charges_amount,
  coalesce(sum(case when l.line_type = 'OTHER' then l.amount else 0 end), 0) as other_amount
from public.xxfp_trx_header h
left join public.xxfp_trx_lines l
  on l.member_trx_id = h.member_trx_id
where h.approval_status in ('COMPLETED', 'APPROVED')
group by
  h.member_trx_id,
  h.trx_number,
  h.group_id,
  h.member_id,
  h.period_id,
  h.trx_date,
  h.trx_type,
  h.approval_status,
  h.parent_trx_id,
  h.adjustment_flag,
  h.reversed_flag,
  h.remarks;

create or replace view public.v_completed_legacy_member_history with (security_invoker = true) as
select
  ld.legacy_id,
  ld.group_id,
  ld.member_id,
  ld.migration_date,
  ld.approval_status,
  ld.legacy_saving_balance,
  ld.legacy_loan_outstanding,
  ld.legacy_interest_balance,
  ld.legacy_penalty_balance,
  ld.legacy_share_earned,
  ld.remarks
from public.xxfp_legacy_data ld
where coalesce(ld.approval_status, 'COMPLETED') in ('COMPLETED', 'APPROVED');

-- =============================================================================
-- G. GRANTS ON VIEWS
-- =============================================================================
grant select on
  public.xxfp_v_group_dashboard_balances,
  public.xxfp_v_member_dashboard_balances,
  public.v_completed_member_transaction_history,
  public.v_completed_legacy_member_history
to authenticated;

grant select on
  public.xxfp_v_group_dashboard_balances,
  public.xxfp_v_member_dashboard_balances
to anon;

commit;
