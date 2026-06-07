-- Bachat Gat SaaS v2 standardized backend architecture.
-- This intentionally removes old conflicting public objects and recreates the
-- accounting-safe architecture from scratch.

create extension if not exists "pgcrypto";

do $$
declare
  obj record;
begin
  for obj in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', obj.policyname, obj.schemaname, obj.tablename);
  end loop;

  for obj in
    select trigger_schema, event_object_table, trigger_name
    from information_schema.triggers
    where trigger_schema = 'public'
  loop
    execute format('drop trigger if exists %I on %I.%I', obj.trigger_name, obj.trigger_schema, obj.event_object_table);
  end loop;

  for obj in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('drop function if exists %I.%I(%s) cascade', obj.nspname, obj.proname, obj.args);
  end loop;
end $$;

do $$
declare
  obj record;
begin
  for obj in
    select schemaname, viewname
    from pg_views
    where schemaname = 'public'
  loop
    execute format('drop view if exists %I.%I cascade', obj.schemaname, obj.viewname);
  end loop;

  for obj in
    select schemaname, matviewname
    from pg_matviews
    where schemaname = 'public'
  loop
    execute format('drop materialized view if exists %I.%I cascade', obj.schemaname, obj.matviewname);
  end loop;

  for obj in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('drop table if exists %I.%I cascade', obj.schemaname, obj.tablename);
  end loop;

  for obj in
    select sequence_schema, sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
  loop
    execute format('drop sequence if exists %I.%I cascade', obj.sequence_schema, obj.sequence_name);
  end loop;

  for obj in
    select n.nspname, t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'c', 'd')
  loop
    execute format('drop type if exists %I.%I cascade', obj.nspname, obj.typname);
  end loop;
end $$;

drop view if exists public.member_dashboard_balances cascade;
drop view if exists public.group_dashboard_balances cascade;

drop table if exists public.schema_backup_runs cascade;
drop table if exists public.group_subscriptions cascade;
drop table if exists public.subscription_plans cascade;
drop table if exists public.trx_audit_history cascade;
drop table if exists public.share_adjustments cascade;
drop table if exists public.share_distribution cascade;
drop table if exists public.group_expense_lines cascade;
drop table if exists public.group_expense_header cascade;
drop table if exists public.legacy_data cascade;
drop table if exists public.approvals cascade;
drop table if exists public.loan_repayment_schedule cascade;
drop table if exists public.loan_distribution cascade;
drop table if exists public.loan_requests cascade;
drop table if exists public.member_transaction_lines cascade;
drop table if exists public.member_transaction_header cascade;
drop table if exists public.periods cascade;
drop table if exists public.member_setup cascade;
drop table if exists public.group_setup cascade;
drop table if exists public.member_status_history cascade;
drop table if exists public.auth_users cascade;
drop table if exists public.members cascade;
drop table if exists public.roles cascade;

drop table if exists public.audit_logs cascade;
drop table if exists public.configurable_fields cascade;
drop table if exists public.notifications cascade;
drop table if exists public.loan_account_lines cascade;
drop table if exists public.transaction_ledger_lines cascade;
drop table if exists public.document_sequences cascade;
drop table if exists public.approvals cascade;
drop table if exists public.repayment_transactions cascade;
drop table if exists public.savings_transactions cascade;
drop table if exists public.loan_installments cascade;
drop table if exists public.loan_master cascade;
drop table if exists public.legacy_member_imports cascade;
drop table if exists public.group_members cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.periods cascade;
drop table if exists public.groups cascade;
drop table if exists public.users cascade;

drop type if exists public.app_role cascade;
drop type if exists public.period_status cascade;
drop type if exists public.approval_status cascade;
drop type if exists public.loan_status cascade;
drop type if exists public.subscription_status cascade;

create table public.roles (
  role_id bigint generated always as identity primary key,
  role_name varchar(80) not null unique,
  description varchar(500),
  created_by bigint,
  creation_date timestamptz not null default now(),
  last_updated_by bigint,
  last_update_date timestamptz not null default now()
);

create table public.auth_users (
  user_id bigint generated always as identity primary key,
  supabase_user_id uuid unique references auth.users(id) on delete cascade,
  member_id bigint,
  username varchar(120) unique not null,
  password_hash varchar(255),
  email varchar(255) unique not null,
  mobile_number varchar(30) unique,
  status varchar(30) not null default 'ACTIVE',
  last_login_date timestamptz,
  created_by bigint,
  creation_date timestamptz not null default now(),
  last_updated_by bigint,
  last_update_date timestamptz not null default now()
);

create table public.groups (
  group_id bigint generated always as identity primary key,
  group_name varchar(255) not null,
  primary_contact_name varchar(255),
  mobile_number varchar(30),
  email varchar(255),
  status varchar(30) not null default 'ACTIVE',
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.members (
  member_id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  role_id bigint references public.roles(role_id),
  member_name varchar(255) not null,
  username varchar(120),
  mobile_number varchar(30),
  email varchar(255),
  join_date date not null default current_date,
  exit_date date,
  status varchar(30) not null default 'ACTIVE',
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

alter table public.auth_users
  add constraint auth_users_member_fk foreign key (member_id) references public.members(member_id) on delete set null;

create table public.member_status_history (
  member_status_id bigint generated always as identity primary key,
  member_id bigint not null references public.members(member_id) on delete cascade,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  status varchar(30) not null,
  start_date date not null,
  end_date date,
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.group_setup (
  group_setup_id bigint generated always as identity primary key,
  group_id bigint not null unique references public.groups(group_id) on delete cascade,
  monthly_saving_amount numeric(14,2) not null default 0,
  interest_rate numeric(8,2) not null default 0,
  penalty_amount numeric(14,2) not null default 0,
  loan_limit numeric(14,2) not null default 0,
  loan_tenure_months numeric(10,0) not null default 12,
  loan_due_day numeric(2,0) not null default 1,
  auto_approve_flag varchar(1) not null default 'N',
  current_open_period varchar(80),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.member_setup (
  member_setup_id bigint generated always as identity primary key,
  member_id bigint not null unique references public.members(member_id) on delete cascade,
  custom_saving_amount numeric(14,2) not null default 0,
  loan_limit numeric(14,2) not null default 0,
  loan_tenure_months numeric(10,0) not null default 0,
  active_flag varchar(1) not null default 'Y',
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.periods (
  period_id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  period_name varchar(80) not null,
  start_date date not null,
  end_date date not null,
  status varchar(30) not null default 'FUTURE',
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now(),
  unique (group_id, period_name),
  check (end_date >= start_date)
);

create unique index members_group_username_unique
  on public.members(group_id, lower(username))
  where username is not null and username <> '';

create unique index members_username_unique
  on public.members(lower(username))
  where username is not null and username <> '';

create unique index periods_one_open_per_group on public.periods(group_id) where upper(status) = 'OPEN';

create table public.member_transaction_header (
  member_trx_id bigint generated always as identity primary key,
  trx_number varchar(80) not null unique,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  member_id bigint not null references public.members(member_id),
  period_id bigint references public.periods(period_id),
  trx_date date not null,
  trx_type varchar(80) not null,
  total_amount numeric(14,2) not null,
  approval_status varchar(30) not null default 'PENDING',
  parent_trx_id bigint references public.member_transaction_header(member_trx_id),
  adjustment_flag varchar(1) not null default 'N',
  reversed_flag varchar(1) not null default 'N',
  remarks varchar(1000),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.member_transaction_lines (
  member_trx_line_id bigint generated always as identity primary key,
  member_trx_id bigint not null references public.member_transaction_header(member_trx_id) on delete cascade,
  line_type varchar(40) not null check (line_type in ('SAVING','LOAN_PRINCIPAL','LOAN_INTEREST','PENALTY','CHARGES','OTHER','LOAN_DISTRIBUTION','WITHDRAWAL')),
  amount numeric(14,2) not null,
  reference_id bigint,
  remarks varchar(1000),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.loan_requests (
  loan_request_id bigint generated always as identity primary key,
  request_number varchar(80) not null unique,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  member_id bigint not null references public.members(member_id),
  requested_amount numeric(14,2) not null,
  requested_months numeric(10,0) not null,
  purpose varchar(1000),
  request_date date not null default current_date,
  status varchar(30) not null default 'SUBMITTED',
  approval_status varchar(30) not null default 'PENDING',
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.loan_distribution (
  loan_id bigint generated always as identity primary key,
  loan_number varchar(80) not null unique,
  loan_request_id bigint references public.loan_requests(loan_request_id),
  group_id bigint not null references public.groups(group_id) on delete cascade,
  member_id bigint not null references public.members(member_id),
  distributed_amount numeric(14,2) not null,
  interest_rate numeric(8,2) not null default 0,
  distribution_date date not null,
  outstanding_principal numeric(14,2) not null default 0,
  outstanding_interest numeric(14,2) not null default 0,
  loan_status varchar(30) not null default 'ACTIVE',
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.loan_repayment_schedule (
  loan_schedule_id bigint generated always as identity primary key,
  loan_id bigint not null references public.loan_distribution(loan_id) on delete cascade,
  installment_no numeric(10,0) not null,
  due_date date not null,
  principal_amount numeric(14,2) not null default 0,
  interest_amount numeric(14,2) not null default 0,
  paid_flag varchar(1) not null default 'N',
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.approvals (
  approval_id bigint generated always as identity primary key,
  transaction_type varchar(80) not null,
  reference_id bigint not null,
  approver_member_id bigint references public.members(member_id),
  approval_status varchar(30) not null default 'PENDING',
  approval_date date,
  remarks varchar(1000),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.legacy_data (
  legacy_id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  member_id bigint not null references public.members(member_id),
  legacy_saving_balance numeric(14,2) not null default 0,
  legacy_loan_outstanding numeric(14,2) not null default 0,
  legacy_interest_balance numeric(14,2) not null default 0,
  legacy_share_earned numeric(14,2) not null default 0,
  legacy_bank_balance numeric(14,2) not null default 0,
  approval_status varchar(30) not null default 'COMPLETED',
  migration_date date not null default current_date,
  remarks varchar(1000),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.group_expense_header (
  group_expense_id bigint generated always as identity primary key,
  expense_number varchar(80) not null unique,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  period_id bigint references public.periods(period_id),
  expense_date date not null,
  expense_type varchar(80) not null,
  total_amount numeric(14,2) not null,
  payment_mode varchar(80),
  approval_status varchar(30) not null default 'PENDING',
  remarks varchar(1000),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.group_expense_lines (
  group_expense_line_id bigint generated always as identity primary key,
  group_expense_id bigint not null references public.group_expense_header(group_expense_id) on delete cascade,
  expense_category varchar(120) not null,
  amount numeric(14,2) not null,
  remarks varchar(1000),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.share_distribution (
  distribution_id bigint generated always as identity primary key,
  earning_trx_id bigint not null references public.member_transaction_header(member_trx_id),
  member_id bigint not null references public.members(member_id),
  distribution_amount numeric(14,2) not null,
  source_type varchar(40) not null check (source_type in ('LOAN_INTEREST','PENALTY','OTHER_INCOME')),
  distribution_date date not null,
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now(),
  unique (earning_trx_id, member_id, source_type)
);

create table public.share_adjustments (
  share_adjustment_id bigint generated always as identity primary key,
  member_id bigint not null references public.members(member_id),
  amount numeric(14,2) not null,
  reason varchar(1000),
  source_reference bigint,
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.trx_audit_history (
  audit_id bigint generated always as identity primary key,
  trx_id bigint,
  action_type varchar(80) not null,
  old_value varchar,
  new_value varchar,
  changed_by varchar(255),
  changed_date timestamptz not null default now(),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.subscription_plans (
  subscription_plan_id bigint generated always as identity primary key,
  plan_name varchar(120) not null,
  duration varchar(40) not null,
  amount numeric(14,2) not null,
  max_members numeric(10,0) not null,
  features varchar,
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create table public.group_subscriptions (
  group_subscription_id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  subscription_plan_id bigint references public.subscription_plans(subscription_plan_id),
  start_date date not null,
  end_date date not null,
  payment_status varchar(40) not null default 'PENDING',
  transaction_reference varchar(255),
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

insert into public.roles (role_name, description)
values
  ('Super Admin', 'Platform administrator'),
  ('Group Admin', 'Group owner or administrator'),
  ('Collector', 'Collection operator'),
  ('Approver', 'Approval authority'),
  ('Member', 'Group member')
on conflict (role_name) do nothing;

insert into public.subscription_plans (plan_name, duration, amount, max_members, features)
values
  ('Free', 'Free', 0, 5, '1 group,5 members,Basic savings and loan tracking,Member app access'),
  ('Starter', 'Monthly', 99, 999999, '1 group,Unlimited members,Approvals,Audit control,Role control,Free member app access,Contact support to setup your group,Technical issue support'),
  ('Starter', 'Yearly', 999, 999999, '1 group,Unlimited members,Approvals,Audit control,Role control,Free member app access,Contact support to setup your group,Technical issue support'),
  ('Growth', 'Monthly', 299, 999999, 'Everything in Starter,Group management query support,Assisted transaction entry support,Daily/monthly adjustment support'),
  ('Growth', 'Yearly', 2999, 999999, 'Everything in Starter,Group management query support,Assisted transaction entry support,Daily/monthly adjustment support'),
  ('Premium', 'Monthly', 999, 999999, 'Everything in Growth,Priority support,Advanced reconciliation support,Dedicated setup guidance'),
  ('Premium', 'Yearly', 9999, 999999, 'Everything in Growth,Priority support,Advanced reconciliation support,Dedicated setup guidance');

create or replace function public.touch_last_update()
returns trigger
language plpgsql
as $$
begin
  new.last_update_date = now();
  if new.last_updated_by is null then
    select user_id into new.last_updated_by
    from public.auth_users
    where supabase_user_id = auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.audit_financial_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Approved financial records cannot be deleted. Use reversal entries.';
  end if;

  if old.approval_status = 'APPROVED' and (
    old.total_amount is distinct from new.total_amount
    or old.trx_date is distinct from new.trx_date
    or old.trx_type is distinct from new.trx_type
    or old.member_id is distinct from new.member_id
  ) then
    raise exception 'Approved financial records cannot be edited. Use adjustment or reversal entries.';
  end if;

  insert into public.trx_audit_history (trx_id, action_type, old_value, new_value, changed_by)
  values (old.member_trx_id, tg_op, row_to_json(old)::text, row_to_json(new)::text, auth.uid()::text);
  return new;
end;
$$;

create trigger member_transaction_header_guard
before update or delete on public.member_transaction_header
for each row execute function public.audit_financial_change();

do $$
declare
  obj record;
begin
  for obj in
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'last_update_date'
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_last_update()', obj.table_name || '_touch', obj.table_name);
  end loop;
end $$;

create or replace function public.resolve_login_email(login_identifier text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.auth_users
  where lower(username) = lower(login_identifier)
     or mobile_number = regexp_replace(login_identifier, '\D', '', 'g')
     or lower(email) = lower(login_identifier)
  limit 1;
$$;

create or replace function public.email_registered(check_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users au
    where lower(au.email) = lower(check_email)
  )
  or exists (
    select 1
    from public.auth_users pu
    where lower(pu.email) = lower(check_email)
  );
$$;

grant execute on function public.email_registered(text) to anon, authenticated;

create or replace function public.active_member_ids(target_group_id bigint, earning_date date)
returns table(member_id bigint)
language sql
stable
set search_path = public
as $$
  select distinct msh.member_id
  from public.member_status_history msh
  where msh.group_id = target_group_id
    and upper(msh.status) = 'ACTIVE'
    and msh.start_date <= earning_date
    and (msh.end_date is null or msh.end_date >= earning_date);
$$;

create or replace function public.distribute_share_for_transaction(target_trx_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trx record;
  source record;
  active_count numeric;
begin
  select * into trx from public.member_transaction_header where member_trx_id = target_trx_id;
  if not found then return; end if;

  select count(*) into active_count from public.active_member_ids(trx.group_id, trx.trx_date);
  if active_count = 0 then return; end if;

  for source in
    select
      case
        when line_type = 'LOAN_INTEREST' then 'LOAN_INTEREST'
        when line_type = 'PENALTY' then 'PENALTY'
        else 'OTHER_INCOME'
      end as source_type,
      sum(amount) as amount
    from public.member_transaction_lines
    where member_trx_id = target_trx_id
      and line_type in ('LOAN_INTEREST', 'PENALTY', 'OTHER')
      and amount > 0
    group by 1
  loop
    insert into public.share_distribution (
      earning_trx_id,
      member_id,
      distribution_amount,
      source_type,
      distribution_date,
      created_by,
      last_updated_by
    )
    select
      target_trx_id,
      am.member_id,
      round(source.amount / active_count, 2),
      source.source_type,
      trx.trx_date,
      trx.created_by,
      trx.created_by
    from public.active_member_ids(trx.group_id, trx.trx_date) am
    on conflict (earning_trx_id, member_id, source_type) do nothing;
  end loop;
end;
$$;

create or replace function public.member_transaction_after_insert()
returns trigger
language plpgsql
as $$
begin
  perform public.distribute_share_for_transaction(new.member_trx_id);
  insert into public.trx_audit_history (trx_id, action_type, new_value, changed_by, created_by, last_updated_by)
  values (new.member_trx_id, 'CREATE', row_to_json(new)::text, auth.uid()::text, new.created_by, new.created_by);
  return new;
end;
$$;

create trigger member_transaction_after_insert
after insert on public.member_transaction_header
for each row execute function public.member_transaction_after_insert();

create or replace view public.group_dashboard_balances as
with trx as (
  select h.group_id, h.trx_type, l.line_type, sum(l.amount) amount
  from public.member_transaction_header h
  join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.group_id, h.trx_type, l.line_type
),
shares as (
  select m.group_id, sum(sd.distribution_amount) share_distribution_amount
  from public.share_distribution sd
  join public.members m on m.member_id = sd.member_id
  group by m.group_id
),
share_adj as (
  select m.group_id, sum(sa.amount) share_adjustment_amount
  from public.share_adjustments sa
  join public.members m on m.member_id = sa.member_id
  group by m.group_id
),
expenses as (
  select group_id, sum(total_amount) group_expenses
  from public.group_expense_header
  where upper(approval_status) in ('COMPLETED', 'APPROVED')
  group by group_id
)
select
  g.group_id,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'SAVING' and trx.trx_type <> 'Group Expense Share'), 0)
    + coalesce(s.share_distribution_amount, 0)
    + coalesce(sa.share_adjustment_amount, 0) as total_savings,
  (select count(*) from public.loan_distribution ld where ld.group_id = g.group_id and upper(ld.loan_status) = 'ACTIVE') as active_loans,
  coalesce((select sum(outstanding_principal) from public.loan_distribution ld where ld.group_id = g.group_id), 0) as outstanding_loan_amount,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'LOAN_INTEREST'), 0)
    + coalesce(sum(trx.amount) filter (where trx.line_type = 'PENALTY'), 0)
    - coalesce(e.group_expenses, 0) as group_gain_amount,
  coalesce(sum(trx.amount) filter (where trx.line_type in ('SAVING','LOAN_INTEREST','PENALTY','OTHER','CHARGES')), 0)
    - coalesce(sum(trx.amount) filter (where trx.line_type in ('LOAN_DISTRIBUTION','WITHDRAWAL')), 0)
    - coalesce(e.group_expenses, 0) as remaining_balance
from public.groups g
left join trx on trx.group_id = g.group_id
left join shares s on s.group_id = g.group_id
left join share_adj sa on sa.group_id = g.group_id
left join expenses e on e.group_id = g.group_id
group by g.group_id, s.share_distribution_amount, sa.share_adjustment_amount, e.group_expenses;

create or replace view public.member_dashboard_balances as
with trx as (
  select h.member_id, l.line_type, sum(l.amount) amount
  from public.member_transaction_header h
  join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.member_id, l.line_type
),
shares as (
  select member_id, sum(distribution_amount) distribution_amount
  from public.share_distribution
  group by member_id
),
share_adj as (
  select member_id, sum(amount) adjustment_amount
  from public.share_adjustments
  group by member_id
),
loans as (
  select member_id, sum(outstanding_principal) outstanding_principal, sum(outstanding_interest) outstanding_interest
  from public.loan_distribution
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
  coalesce(sum(trx.amount) filter (where trx.line_type = 'CHARGES'), 0) as pending_charges
from public.members m
left join trx on trx.member_id = m.member_id
left join shares s on s.member_id = m.member_id
left join share_adj sa on sa.member_id = m.member_id
left join loans lo on lo.member_id = m.member_id
group by m.member_id, m.group_id, s.distribution_amount, sa.adjustment_amount, lo.outstanding_principal, lo.outstanding_interest;

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
declare
  obj record;
begin
  for obj in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', obj.tablename || '_authenticated_all', obj.tablename);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to anon;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to anon;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant usage, select on sequences to anon;
alter default privileges in schema public grant execute on functions to authenticated;
alter default privileges in schema public grant execute on functions to anon;
