-- Production-safe tenant RLS helper functions for the XXFP_ (v3) schema.
--
-- Run AFTER the v3 schema and migrate-data files, BEFORE the v3
-- functions-and-triggers file.
-- Goal:
--   - No cross-group data visibility for normal users.
--   - Product owner can support all groups.
--   - Group admins can manage their own group setup, members, periods,
--     transactions, migrations, expenses, corrections and subscriptions.
--   - Members can read their groups and create their own loan/withdrawal/support requests.
--   - Approvers can read/update approval rows assigned to them.
--   - Approved financial history is not deleted directly.
--
-- This file only defines the helper functions. The actual RLS policies live
-- in the v3 functions-and-triggers file (section 7) on the XXFP_ tables.
-- The legacy policy block over the old table names was removed: those tables
-- are dropped by migrate-data and recreated as read-only compatibility views,
-- and policies cannot be created on views.

begin;

grant usage on schema public to anon, authenticated;

create or replace function public.current_auth_user_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select au.user_id
  from public.xxfp_auth_users au
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
    from public.xxfp_auth_users au
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
  from public.xxfp_auth_users au
  join public.xxfp_group_members m
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
  from public.xxfp_group_members m
  where m.member_id in (select public.current_member_ids())

  union

  select distinct g.group_id
  from public.xxfp_groups g
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
      from public.xxfp_groups g
      where g.group_id = target_group_id
        and g.created_by = public.current_auth_user_id()
    )
    or exists (
      select 1
      from public.xxfp_group_members m
      left join public.xxfp_roles r on r.role_id = m.role_id
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
      from public.xxfp_group_members m
      left join public.xxfp_roles r on r.role_id = m.role_id
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
  select m.group_id from public.xxfp_group_members m where m.member_id = target_member_id limit 1
$$;

create or replace function public.transaction_group_id(target_trx_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select h.group_id from public.xxfp_trx_header h where h.member_trx_id = target_trx_id limit 1
$$;

create or replace function public.expense_group_id(target_expense_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select h.group_id from public.xxfp_group_expense_header h where h.group_expense_id = target_expense_id limit 1
$$;

create or replace function public.loan_group_id(target_loan_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select l.group_id from public.xxfp_loan_header l where l.loan_id = target_loan_id limit 1
$$;

commit;
