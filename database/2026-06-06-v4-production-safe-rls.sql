-- Production-safe tenant RLS for the standardized Bachat Gat schema.
--
-- Run after the standardized architecture and later v2/v3 patches.
-- Goal:
--   - No cross-group data visibility for normal users.
--   - Product owner can support all groups.
--   - Group admins can manage their own group setup, members, periods,
--     transactions, migrations, expenses, corrections and subscriptions.
--   - Members can read their groups and create their own loan/withdrawal/support requests.
--   - Approvers can read/update approval rows assigned to them.
--   - Approved financial history is not deleted directly.

begin;

grant usage on schema public to anon, authenticated;

-- Keep table API reachable for authenticated users; RLS below decides which rows.
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Public/anon access should be narrow.
grant select on public.subscription_plans to anon;
grant execute on function public.email_registered(text) to anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- Never grant blanket delete on financial tables.
revoke delete on all tables in schema public from authenticated;
grant delete on public.members to authenticated;
grant delete on public.member_status_history to authenticated;
grant delete on public.group_setup to authenticated;
grant delete on public.member_setup to authenticated;
grant delete on public.periods to authenticated;
grant delete on public.group_subscriptions to authenticated;

create or replace function public.current_auth_user_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select au.user_id
  from public.auth_users au
  where au.supabase_user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.is_product_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.auth_users au
    where au.supabase_user_id = (select auth.uid())
      and lower(au.email) = 'katgroupsupport@gmail.com'
  )
$$;

create or replace function public.current_member_ids()
returns table(member_id bigint)
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.member_id
  from public.auth_users au
  join public.members m
    on m.member_id = au.member_id
    or (au.email is not null and m.email is not null and lower(m.email) = lower(au.email))
    or (au.mobile_number is not null and m.mobile_number is not null and m.mobile_number = au.mobile_number)
    or (au.username is not null and m.username is not null and lower(m.username) = lower(au.username))
  where au.supabase_user_id = (select auth.uid())
$$;

create or replace function public.user_group_ids()
returns table(group_id bigint)
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.group_id
  from public.members m
  where m.member_id in (select public.current_member_ids())

  union

  select distinct g.group_id
  from public.groups g
  where g.created_by = public.current_auth_user_id()
$$;

create or replace function public.is_group_member(target_group_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_product_owner()
    or target_group_id in (select public.user_group_ids())
$$;

create or replace function public.is_group_admin(target_group_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_product_owner()
    or exists (
      select 1
      from public.groups g
      where g.group_id = target_group_id
        and g.created_by = public.current_auth_user_id()
    )
    or exists (
      select 1
      from public.members m
      left join public.roles r on r.role_id = m.role_id
      where m.group_id = target_group_id
        and m.member_id in (select public.current_member_ids())
        and upper(coalesce(r.role_name, m.status, '')) in ('GROUP ADMIN', 'ADMIN', 'SUPER ADMIN')
    )
$$;

create or replace function public.is_group_approver(target_group_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_product_owner()
    or public.is_group_admin(target_group_id)
    or exists (
      select 1
      from public.members m
      left join public.roles r on r.role_id = m.role_id
      where m.group_id = target_group_id
        and m.member_id in (select public.current_member_ids())
        and upper(coalesce(r.role_name, '')) in ('APPROVER', 'COLLECTOR')
    )
$$;

create or replace function public.member_group_id(target_member_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select m.group_id from public.members m where m.member_id = target_member_id limit 1
$$;

create or replace function public.transaction_group_id(target_trx_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select h.group_id from public.member_transaction_header h where h.member_trx_id = target_trx_id limit 1
$$;

create or replace function public.expense_group_id(target_expense_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select h.group_id from public.group_expense_header h where h.group_expense_id = target_expense_id limit 1
$$;

create or replace function public.loan_group_id(target_loan_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select l.group_id from public.loan_distribution l where l.loan_id = target_loan_id limit 1
$$;

do $$
declare
  obj record;
begin
  for obj in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'roles',
        'auth_users',
        'groups',
        'members',
        'member_status_history',
        'group_setup',
        'member_setup',
        'periods',
        'member_transaction_header',
        'member_transaction_lines',
        'loan_requests',
        'loan_distribution',
        'loan_repayment_schedule',
        'approvals',
        'legacy_data',
        'group_expense_header',
        'group_expense_lines',
        'share_distribution',
        'share_adjustments',
        'trx_audit_history',
        'subscription_plans',
        'group_subscriptions',
        'support_disputes',
        'withdrawal_requests',
        'legacy_group_opening',
        'pending_setup_changes'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', obj.policyname, obj.schemaname, obj.tablename);
  end loop;
end $$;

alter table public.roles enable row level security;
alter table public.auth_users enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.member_status_history enable row level security;
alter table public.group_setup enable row level security;
alter table public.member_setup enable row level security;
alter table public.periods enable row level security;
alter table public.member_transaction_header enable row level security;
alter table public.member_transaction_lines enable row level security;
alter table public.loan_requests enable row level security;
alter table public.loan_distribution enable row level security;
alter table public.loan_repayment_schedule enable row level security;
alter table public.approvals enable row level security;
alter table public.legacy_data enable row level security;
alter table public.group_expense_header enable row level security;
alter table public.group_expense_lines enable row level security;
alter table public.share_distribution enable row level security;
alter table public.share_adjustments enable row level security;
alter table public.trx_audit_history enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.group_subscriptions enable row level security;

do $$
begin
  if to_regclass('public.support_disputes') is not null then
    execute 'alter table public.support_disputes enable row level security';
  end if;
  if to_regclass('public.withdrawal_requests') is not null then
    execute 'alter table public.withdrawal_requests enable row level security';
  end if;
  if to_regclass('public.legacy_group_opening') is not null then
    execute 'alter table public.legacy_group_opening enable row level security';
  end if;
  if to_regclass('public.pending_setup_changes') is not null then
    execute 'alter table public.pending_setup_changes enable row level security';
  end if;
end $$;

create policy roles_read on public.roles
for select to authenticated
using (true);

create policy roles_owner_manage on public.roles
for all to authenticated
using (public.is_product_owner())
with check (public.is_product_owner());

create policy auth_users_read_own_or_owner on public.auth_users
for select to authenticated
using (public.is_product_owner() or supabase_user_id = (select auth.uid()) or user_id = public.current_auth_user_id());

create policy auth_users_insert_own on public.auth_users
for insert to authenticated
with check (supabase_user_id = (select auth.uid()));

create policy auth_users_update_own_or_owner on public.auth_users
for update to authenticated
using (public.is_product_owner() or supabase_user_id = (select auth.uid()))
with check (public.is_product_owner() or supabase_user_id = (select auth.uid()));

create policy groups_read_tenant on public.groups
for select to authenticated
using (public.is_product_owner() or group_id in (select public.user_group_ids()) or created_by = public.current_auth_user_id());

create policy groups_insert_own on public.groups
for insert to authenticated
with check (public.is_product_owner() or created_by = public.current_auth_user_id());

create policy groups_update_admin on public.groups
for update to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

create policy groups_delete_owner_only on public.groups
for delete to authenticated
using (public.is_product_owner());

create policy members_read_tenant on public.members
for select to authenticated
using (public.is_group_member(group_id));

create policy members_insert_admin on public.members
for insert to authenticated
with check (public.is_group_admin(group_id));

create policy members_update_admin_or_self on public.members
for update to authenticated
using (public.is_group_admin(group_id) or member_id in (select public.current_member_ids()))
with check (public.is_group_admin(group_id) or member_id in (select public.current_member_ids()));

create policy members_delete_admin on public.members
for delete to authenticated
using (public.is_group_admin(group_id));

create policy member_status_read_tenant on public.member_status_history
for select to authenticated
using (public.is_group_member(group_id));

create policy member_status_manage_admin on public.member_status_history
for all to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

create policy group_setup_read_tenant on public.group_setup
for select to authenticated
using (public.is_group_member(group_id));

create policy group_setup_manage_admin on public.group_setup
for all to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

create policy member_setup_read_tenant on public.member_setup
for select to authenticated
using (public.is_group_member(public.member_group_id(member_id)));

create policy member_setup_manage_admin on public.member_setup
for all to authenticated
using (public.is_group_admin(public.member_group_id(member_id)))
with check (public.is_group_admin(public.member_group_id(member_id)));

create policy periods_read_tenant on public.periods
for select to authenticated
using (public.is_group_member(group_id));

create policy periods_manage_admin on public.periods
for all to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

create policy trx_header_read_tenant on public.member_transaction_header
for select to authenticated
using (public.is_group_member(group_id));

create policy trx_header_insert_admin_or_self on public.member_transaction_header
for insert to authenticated
with check (
  public.is_group_admin(group_id)
  or (
    public.is_group_member(group_id)
    and member_id in (select public.current_member_ids())
  )
);

create policy trx_header_update_pending_admin_or_approver on public.member_transaction_header
for update to authenticated
using (
  public.is_group_approver(group_id)
  and upper(coalesce(approval_status, '')) not in ('COMPLETED', 'APPROVED')
)
with check (public.is_group_approver(group_id));

create policy trx_lines_read_tenant on public.member_transaction_lines
for select to authenticated
using (public.is_group_member(public.transaction_group_id(member_trx_id)));

create policy trx_lines_insert_tenant on public.member_transaction_lines
for insert to authenticated
with check (public.is_group_member(public.transaction_group_id(member_trx_id)));

create policy trx_lines_update_pending_admin_or_approver on public.member_transaction_lines
for update to authenticated
using (public.is_group_approver(public.transaction_group_id(member_trx_id)))
with check (public.is_group_approver(public.transaction_group_id(member_trx_id)));

create policy loan_requests_read_tenant on public.loan_requests
for select to authenticated
using (public.is_group_member(group_id));

create policy loan_requests_insert_admin_or_self on public.loan_requests
for insert to authenticated
with check (
  public.is_group_admin(group_id)
  or (
    public.is_group_member(group_id)
    and member_id in (select public.current_member_ids())
  )
);

create policy loan_requests_update_admin_or_approver on public.loan_requests
for update to authenticated
using (public.is_group_approver(group_id))
with check (public.is_group_approver(group_id));

create policy loan_distribution_read_tenant on public.loan_distribution
for select to authenticated
using (public.is_group_member(group_id));

create policy loan_distribution_manage_admin_or_approver on public.loan_distribution
for all to authenticated
using (public.is_group_approver(group_id))
with check (public.is_group_approver(group_id));

create policy loan_schedule_read_tenant on public.loan_repayment_schedule
for select to authenticated
using (public.is_group_member(public.loan_group_id(loan_id)));

create policy loan_schedule_manage_admin_or_approver on public.loan_repayment_schedule
for all to authenticated
using (public.is_group_approver(public.loan_group_id(loan_id)))
with check (public.is_group_approver(public.loan_group_id(loan_id)));

create policy approvals_read_assigned_or_tenant_admin on public.approvals
for select to authenticated
using (
  public.is_product_owner()
  or approver_member_id in (select public.current_member_ids())
  or public.is_group_admin(group_id)
);

create policy approvals_insert_admin on public.approvals
for insert to authenticated
with check (public.is_group_admin(group_id));

create policy approvals_update_assigned on public.approvals
for update to authenticated
using (
  public.is_product_owner()
  or approver_member_id in (select public.current_member_ids())
  or public.is_group_admin(group_id)
)
with check (
  public.is_product_owner()
  or approver_member_id in (select public.current_member_ids())
  or public.is_group_admin(group_id)
);

create policy legacy_data_read_tenant on public.legacy_data
for select to authenticated
using (public.is_group_member(group_id));

create policy legacy_data_manage_admin on public.legacy_data
for all to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

create policy expense_header_read_tenant on public.group_expense_header
for select to authenticated
using (public.is_group_member(group_id));

create policy expense_header_manage_admin on public.group_expense_header
for all to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

create policy expense_lines_read_tenant on public.group_expense_lines
for select to authenticated
using (public.is_group_member(public.expense_group_id(group_expense_id)));

create policy expense_lines_manage_admin on public.group_expense_lines
for all to authenticated
using (public.is_group_admin(public.expense_group_id(group_expense_id)))
with check (public.is_group_admin(public.expense_group_id(group_expense_id)));

create policy share_distribution_read_tenant on public.share_distribution
for select to authenticated
using (public.is_group_member(public.member_group_id(member_id)));

create policy share_distribution_insert_admin on public.share_distribution
for insert to authenticated
with check (public.is_group_admin(public.member_group_id(member_id)));

create policy share_adjustments_read_tenant on public.share_adjustments
for select to authenticated
using (public.is_group_member(public.member_group_id(member_id)));

create policy share_adjustments_manage_admin on public.share_adjustments
for all to authenticated
using (public.is_group_admin(public.member_group_id(member_id)))
with check (public.is_group_admin(public.member_group_id(member_id)));

create policy audit_read_tenant on public.trx_audit_history
for select to authenticated
using (
  public.is_product_owner()
  or public.is_group_member(public.transaction_group_id(trx_id))
  or trx_id is null
);

create policy audit_insert_tenant on public.trx_audit_history
for insert to authenticated
with check (
  public.is_product_owner()
  or public.is_group_member(public.transaction_group_id(trx_id))
  or trx_id is null
);

create policy subscription_plans_public_read on public.subscription_plans
for select to anon, authenticated
using (true);

create policy subscription_plans_owner_manage on public.subscription_plans
for all to authenticated
using (public.is_product_owner())
with check (public.is_product_owner());

create policy group_subscriptions_read_tenant on public.group_subscriptions
for select to authenticated
using (public.is_group_member(group_id));

create policy group_subscriptions_manage_admin on public.group_subscriptions
for all to authenticated
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

do $$
begin
  if to_regclass('public.support_disputes') is not null then
    execute $pol$
      create policy support_disputes_read_tenant on public.support_disputes
      for select to authenticated
      using (
        public.is_product_owner()
        or public.is_group_member(group_id)
        or member_id in (select public.current_member_ids())
        or created_by = public.current_auth_user_id()
      )
    $pol$;

    execute $pol$
      create policy support_disputes_insert_self on public.support_disputes
      for insert to authenticated
      with check (
        public.is_product_owner()
        or public.is_group_member(group_id)
        or member_id in (select public.current_member_ids())
      )
    $pol$;

    execute $pol$
      create policy support_disputes_update_owner_or_creator on public.support_disputes
      for update to authenticated
      using (
        public.is_product_owner()
        or created_by = public.current_auth_user_id()
      )
      with check (
        public.is_product_owner()
        or created_by = public.current_auth_user_id()
      )
    $pol$;
  end if;

  if to_regclass('public.withdrawal_requests') is not null then
    execute $pol$
      create policy withdrawal_requests_read_tenant on public.withdrawal_requests
      for select to authenticated
      using (
        public.is_product_owner()
        or public.is_group_member(group_id)
        or member_id in (select public.current_member_ids())
      )
    $pol$;

    execute $pol$
      create policy withdrawal_requests_insert_self on public.withdrawal_requests
      for insert to authenticated
      with check (
        public.is_group_member(group_id)
        and member_id in (select public.current_member_ids())
      )
    $pol$;

    execute $pol$
      create policy withdrawal_requests_update_admin_or_approver on public.withdrawal_requests
      for update to authenticated
      using (public.is_group_approver(group_id))
      with check (public.is_group_approver(group_id))
    $pol$;
  end if;

  if to_regclass('public.legacy_group_opening') is not null then
    execute $pol$
      create policy legacy_group_opening_read_tenant on public.legacy_group_opening
      for select to authenticated
      using (public.is_group_member(group_id))
    $pol$;

    execute $pol$
      create policy legacy_group_opening_manage_admin on public.legacy_group_opening
      for all to authenticated
      using (public.is_group_admin(group_id))
      with check (public.is_group_admin(group_id))
    $pol$;
  end if;

  if to_regclass('public.pending_setup_changes') is not null then
    execute $pol$
      create policy pending_setup_changes_read_tenant on public.pending_setup_changes
      for select to authenticated
      using (
        public.is_product_owner()
        or public.is_group_member(group_id)
      )
    $pol$;

    execute $pol$
      create policy pending_setup_changes_insert_admin on public.pending_setup_changes
      for insert to authenticated
      with check (public.is_group_admin(group_id))
    $pol$;

    execute $pol$
      create policy pending_setup_changes_update_admin_or_approver on public.pending_setup_changes
      for update to authenticated
      using (public.is_group_approver(group_id))
      with check (public.is_group_approver(group_id))
    $pol$;
  end if;
end $$;

commit;
