create extension if not exists "pgcrypto";

create type app_role as enum ('Super Admin', 'Group Admin', 'Collector', 'Approver', 'Member');
create type period_status as enum ('Future', 'Open', 'Closed', 'Permanently Closed');
create type approval_status as enum ('Pending', 'Approved', 'Rejected', 'Returned');
create type loan_status as enum ('Draft', 'Submitted', 'Approved', 'Rejected', 'Active', 'Completed', 'Defaulted');
create type subscription_status as enum ('Trial', 'Active', 'Past Due', 'Expired', 'Cancelled');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null unique,
  email text unique not null,
  mobile_number text unique not null,
  username text unique not null,
  role app_role not null default 'Member',
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  group_code text unique not null,
  group_type text not null,
  currency text not null default 'INR',
  interest_calculation_type text not null default 'Reducing Balance',
  financial_year text not null,
  start_month int not null check (start_month between 1 and 12),
  maximum_loan_limit numeric(14, 2) not null default 0,
  loan_multiplier numeric(8, 2) not null default 3,
  penalty_config jsonb not null default '{}'::jsonb,
  late_fee_config jsonb not null default '{}'::jsonb,
  share_calculation_method text not null default 'Weighted Contribution',
  loan_eligibility_rules jsonb not null default '{}'::jsonb,
  subscription_read_only boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  pending_full_name text,
  pending_email text,
  pending_mobile_number text,
  member_number text,
  member_role app_role not null default 'Member',
  address text,
  aadhaar text,
  pan text,
  date_joined date not null default current_date,
  active boolean not null default true,
  inactive_date date,
  nominee_details jsonb not null default '{}'::jsonb,
  bank_details jsonb not null default '{}'::jsonb,
  profile_image_path text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table public.legacy_member_imports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id) on delete cascade,
  joined_date date,
  exit_date date,
  total_saving numeric(14, 2) not null default 0,
  pending_loan numeric(14, 2) not null default 0,
  interest_amount numeric(14, 2) not null default 0,
  penalty_amount numeric(14, 2) not null default 0,
  excess_amount numeric(14, 2) not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index legacy_member_imports_group_processed_idx
  on public.legacy_member_imports (group_id, processed);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  plan_name text not null,
  billing_cycle text not null check (billing_cycle in ('Monthly', 'Quarterly', 'Half-Yearly', 'Yearly')),
  status subscription_status not null default 'Trial',
  starts_on date not null,
  renews_on date,
  expires_on date,
  max_members int not null,
  max_collectors int not null default 1,
  loan_module_enabled boolean not null default false,
  reports_enabled boolean not null default false,
  approvals_enabled boolean not null default false,
  ai_features_enabled boolean not null default false,
  storage_limit_mb int not null default 512,
  razorpay_subscription_id text,
  created_at timestamptz not null default now()
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  period_name text not null,
  start_date date not null,
  end_date date not null,
  status period_status not null default 'Future',
  closed_by uuid references public.users(id),
  closed_at timestamptz,
  unique (group_id, period_name),
  constraint valid_period_dates check (end_date >= start_date)
);

create unique index one_open_period_per_group
  on public.periods (group_id)
  where status = 'Open';

create table public.document_sequences (
  group_id uuid not null references public.groups(id) on delete cascade,
  document_type text not null check (document_type in ('TRX', 'LOAN', 'ADJ')),
  next_value bigint not null default 1,
  primary key (group_id, document_type)
);

create or replace function public.next_document_number(target_group_id uuid, target_document_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  insert into public.document_sequences (group_id, document_type, next_value)
  values (target_group_id, target_document_type, 2)
  on conflict (group_id, document_type)
  do update set next_value = public.document_sequences.next_value + 1
  returning next_value - 1 into v_next;

  return target_document_type || '-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_next::text, 6, '0');
end;
$$;

create table public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id),
  period_id uuid not null references public.periods(id),
  transaction_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  transaction_type text not null check (transaction_type in ('Savings Collection', 'Extra Deposit', 'Withdrawal', 'Legacy Migration', 'Adjustment', 'Reversal')),
  approval_status approval_status not null default 'Pending',
  transaction_number text,
  source_type text not null default 'Manual',
  entry_status text not null default 'Posted',
  reversed_by uuid references public.savings_transactions(id),
  reversal_of uuid references public.savings_transactions(id),
  reversal_reason text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique (group_id, transaction_number)
);

create table public.loan_master (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id),
  period_id uuid references public.periods(id),
  loan_number text,
  loan_amount numeric(14, 2) not null check (loan_amount > 0),
  loan_reason text not null,
  interest_rate numeric(8, 2) not null check (interest_rate >= 0),
  duration_months int not null check (duration_months >= 0),
  installment_frequency text not null default 'Monthly',
  emi_type text not null default 'Reducing Balance',
  start_date date not null,
  status loan_status not null default 'Draft',
  principal_outstanding numeric(14, 2) not null default 0,
  interest_outstanding numeric(14, 2) not null default 0,
  penalty_outstanding numeric(14, 2) not null default 0,
  source_type text not null default 'Manual',
  reversed_by uuid references public.loan_master(id),
  reversal_of uuid references public.loan_master(id),
  reversal_reason text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (group_id, loan_number)
);

create table public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loan_master(id) on delete cascade,
  due_date date not null,
  principal_due numeric(14, 2) not null default 0,
  interest_due numeric(14, 2) not null default 0,
  penalty_due numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  paid_on date
);

create table public.repayment_transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  loan_id uuid not null references public.loan_master(id),
  member_id uuid not null references public.group_members(id),
  period_id uuid not null references public.periods(id),
  transaction_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  savings_component numeric(14, 2) not null default 0,
  principal_component numeric(14, 2) not null default 0,
  interest_component numeric(14, 2) not null default 0,
  penalty_component numeric(14, 2) not null default 0,
  transaction_number text,
  entry_status text not null default 'Posted',
  reversed_by uuid references public.repayment_transactions(id),
  reversal_of uuid references public.repayment_transactions(id),
  reversal_reason text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique (group_id, transaction_number)
);

create table public.transaction_ledger_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.savings_transactions(id) on delete cascade,
  transaction_number text not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id),
  period_id uuid references public.periods(id),
  line_number int not null check (line_number > 0),
  line_type text not null check (line_type in ('SAVINGS', 'LOAN_PRINCIPAL', 'LOAN_INTEREST', 'LOAN_PENALTY', 'EXCESS')),
  line_amount numeric(14, 2) not null check (line_amount <> 0),
  accounting_date date not null,
  entry_status text not null default 'Posted' check (entry_status in ('Posted', 'Reversed')),
  reversal_of uuid references public.transaction_ledger_lines(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (transaction_id, line_number)
);

create table public.loan_account_lines (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loan_master(id) on delete cascade,
  loan_number text not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id),
  line_number int not null check (line_number > 0),
  line_type text not null check (line_type in ('PRINCIPAL_DISBURSEMENT', 'INTEREST_OPENING', 'PENALTY_OPENING', 'PRINCIPAL_ADJUSTMENT', 'INTEREST_ADJUSTMENT', 'PENALTY_ADJUSTMENT', 'REVERSAL')),
  line_amount numeric(14, 2) not null check (line_amount <> 0),
  accounting_date date not null,
  entry_status text not null default 'Posted' check (entry_status in ('Posted', 'Reversed')),
  reversal_of uuid references public.loan_account_lines(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (loan_id, line_number)
);

create or replace function public.assign_transaction_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transaction_number is null then
    new.transaction_number := public.next_document_number(new.group_id, 'TRX');
  end if;
  return new;
end;
$$;

create or replace function public.assign_loan_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.loan_number is null then
    new.loan_number := public.next_document_number(new.group_id, 'LOAN');
  end if;
  return new;
end;
$$;

create trigger assign_savings_transaction_number
before insert on public.savings_transactions
for each row execute function public.assign_transaction_number();

create trigger assign_repayment_transaction_number
before insert on public.repayment_transactions
for each row execute function public.assign_transaction_number();

create trigger assign_loan_number
before insert on public.loan_master
for each row execute function public.assign_loan_number();

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action_name text not null,
  approval_level int not null check (approval_level in (1, 2)),
  approver_id uuid references public.users(id),
  status approval_status not null default 'Pending',
  comments text,
  requested_by uuid not null references public.users(id),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  channel text not null default 'In App',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.configurable_fields (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  screen_name text not null,
  field_key text not null,
  label_en text not null,
  label_mr text,
  mandatory boolean not null default false,
  hidden boolean not null default false,
  editable boolean not null default true,
  read_only boolean not null default false,
  validation_rules jsonb not null default '{}'::jsonb,
  unique (group_id, screen_name, field_key)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role app_role not null,
  permission_key text not null,
  unique (role, permission_key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  actor_id uuid references public.users(id),
  table_name text not null,
  record_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    full_name,
    email,
    mobile_number,
    username,
    role,
    preferred_language
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'mobile_number', new.id::text),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'Member'::app_role),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'en')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.user_group_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select group_id from public.group_members where user_id = auth.uid() and active = true;
$$;

create or replace function public.is_group_admin(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
      and gm.active = true
      and gm.member_role in ('Super Admin', 'Group Admin')
  );
$$;

create or replace function public.is_group_collector_or_admin(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
      and gm.active = true
      and gm.member_role in ('Super Admin', 'Group Admin', 'Collector')
  );
$$;

create or replace function public.is_group_approver_or_admin(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
      and gm.active = true
      and gm.member_role in ('Super Admin', 'Group Admin', 'Approver')
  );
$$;

create or replace function public.resolve_login_email(login_identifier text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.users
  where username = login_identifier
     or mobile_number = login_identifier
  limit 1;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
grant execute on function public.next_document_number(uuid, text) to authenticated;
grant execute on function public.user_group_ids() to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.is_group_collector_or_admin(uuid) to authenticated;
grant execute on function public.is_group_approver_or_admin(uuid) to authenticated;

alter table public.users enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.periods enable row level security;
alter table public.document_sequences enable row level security;
alter table public.savings_transactions enable row level security;
alter table public.loan_master enable row level security;
alter table public.loan_installments enable row level security;
alter table public.repayment_transactions enable row level security;
alter table public.transaction_ledger_lines enable row level security;
alter table public.loan_account_lines enable row level security;
alter table public.approvals enable row level security;
alter table public.notifications enable row level security;
alter table public.configurable_fields enable row level security;
alter table public.audit_logs enable row level security;
alter table public.legacy_member_imports enable row level security;

create policy "users can read their own profile"
on public.users for select
using (
  id = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.user_id = auth.uid()
      and gm.member_role in ('Super Admin', 'Group Admin')
  )
);

create policy "users can create their own profile"
on public.users for insert
with check (
  id = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.user_id = auth.uid()
      and gm.member_role in ('Super Admin', 'Group Admin')
  )
);

create policy "users can update their own profile"
on public.users for update
using (
  id = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.user_id = auth.uid()
      and gm.member_role in ('Super Admin', 'Group Admin')
  )
)
with check (
  id = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.user_id = auth.uid()
      and gm.member_role in ('Super Admin', 'Group Admin')
  )
);

create policy "members can read own groups"
on public.groups for select
using (id in (select public.user_group_ids()));

create policy "admins can create groups"
on public.groups for insert
with check (
  exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('Super Admin', 'Group Admin')
  )
);

create policy "admins can update own groups"
on public.groups for update
using (
  id in (select public.user_group_ids())
  and exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('Super Admin', 'Group Admin')
  )
)
with check (id in (select public.user_group_ids()));

create policy "group members visible within tenant"
on public.group_members for select
using (user_id = auth.uid() or public.is_group_admin(group_id));

create policy "members can read pending group memberships"
on public.group_members for select
using (
  user_id = auth.uid()
  or public.is_group_admin(group_id)
  or (
    user_id is null
    and (
      (pending_email is not null and pending_email = (select email from public.users where id = auth.uid()))
      or (pending_mobile_number is not null and pending_mobile_number = (select mobile_number from public.users where id = auth.uid()))
    )
  )
);

create policy "members can claim pending group memberships"
on public.group_members for update
using (
  auth.uid() is not null
  and user_id is null
  and (
    (pending_email is not null and pending_email = (select email from public.users where id = auth.uid()))
    or (pending_mobile_number is not null and pending_mobile_number = (select mobile_number from public.users where id = auth.uid()))
  )
)
with check (
  auth.uid() is not null
  and new.user_id = auth.uid()
);

create policy "admins can manage group members"
on public.group_members for all
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

create policy "legacy imports visible within tenant"
on public.legacy_member_imports for select
using (group_id in (select public.user_group_ids()));

create policy "authenticated users can insert legacy imports"
on public.legacy_member_imports for insert
with check (
  auth.uid() is not null
  and group_id in (select public.user_group_ids())
);

create policy "group creators can join new group as admin"
on public.group_members for insert
with check (
  auth.uid() is not null
  and new.user_id = auth.uid()
  and exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('Super Admin', 'Group Admin')
  )
);

create policy "subscriptions visible within tenant"
on public.subscriptions for select
using (group_id in (select public.user_group_ids()));

create policy "periods visible within tenant"
on public.periods for select
using (group_id in (select public.user_group_ids()));

create policy "document sequences visible within tenant"
on public.document_sequences for select
using (group_id in (select public.user_group_ids()));

create policy "admins can manage periods"
on public.periods for all
using (public.is_group_admin(group_id))
with check (public.is_group_admin(group_id));

create policy "savings visible within tenant"
on public.savings_transactions for select
using (group_id in (select public.user_group_ids()));

create policy "collectors can create savings transactions"
on public.savings_transactions for insert
with check (public.is_group_collector_or_admin(group_id));

create policy "transaction ledger visible within tenant"
on public.transaction_ledger_lines for select
using (group_id in (select public.user_group_ids()));

create policy "collectors can create transaction ledger lines"
on public.transaction_ledger_lines for insert
with check (public.is_group_collector_or_admin(group_id));

create policy "loans visible within tenant"
on public.loan_master for select
using (group_id in (select public.user_group_ids()));

create policy "collectors and admins can create loans"
on public.loan_master for insert
with check (public.is_group_collector_or_admin(group_id));

create policy "loan lines visible within tenant"
on public.loan_account_lines for select
using (group_id in (select public.user_group_ids()));

create policy "collectors and admins can create loan lines"
on public.loan_account_lines for insert
with check (public.is_group_collector_or_admin(group_id));

create policy "repayments visible within tenant"
on public.repayment_transactions for select
using (group_id in (select public.user_group_ids()));

create policy "collectors can create repayment transactions"
on public.repayment_transactions for insert
with check (public.is_group_collector_or_admin(group_id));

create policy "approvals visible within tenant"
on public.approvals for select
using (group_id in (select public.user_group_ids()));

create policy "approvers can update approvals"
on public.approvals for update
using (public.is_group_approver_or_admin(group_id))
with check (group_id in (select public.user_group_ids()));

create policy "notifications visible to recipient"
on public.notifications for select
using (user_id = auth.uid() or group_id in (select public.user_group_ids()));

create policy "config fields visible within tenant"
on public.configurable_fields for select
using (group_id in (select public.user_group_ids()));

create policy "audit visible within tenant"
on public.audit_logs for select
using (group_id in (select public.user_group_ids()));
