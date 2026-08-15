-- =============================================================================
-- Bachat Gat SaaS - XXFP_ TCA-style schema (Oracle-inspired master data model)
-- Date: 2026-08-16
-- Author: Platform team
--
-- This migration introduces the XXFP_ ("XX Finance Platform") physical schema as
-- the system of record. It follows an Oracle EBS TCA-style design:
--
--   HZ_PARTIES         -> XXFP_PERSONS          (person / login identity master)
--   HZ_RELATIONSHIPS   -> XXFP_GROUP_MEMBERS    (membership of a person in a group)
--   XXFP_GROUPS        -> group master (owner = person_id)
--   XXFP_TRX_HEADER/LINES -> header + lines accounting
--   XXFP_APPROVAL_HEADER  -> approval batches
--   XXFP_DOC_SEQUENCES    -> Oracle document-numbering backbone
--   XXFP_STG_* / XXFP_INT_* -> staging / interface tables (like XX EBS interfaces)
--
-- Column names intentionally match the previous v2 tables so the application
-- layer and compatibility views keep working without mapper changes.
--
-- The companion files are:
--   2026-08-16-v3-xxfp-migrate-data.sql        (data copy + compat views)
--   2026-08-16-v3-xxfp-functions-and-triggers.sql (procedures + RLS + grants)
-- =============================================================================

begin;

-- =============================================================================
-- 1. MASTER DATA - ROLES
-- =============================================================================
create table if not exists public.xxfp_roles (
  role_id            bigint generated always as identity primary key,
  role_code          varchar(40) unique,
  role_name          varchar(80) not null unique,
  description        varchar(500),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

insert into public.xxfp_roles (role_code, role_name, description)
values
  ('SUPER_ADMIN',  'Super Admin',   'Platform administrator'),
  ('PRODUCT_OWNER','Product Owner', 'Product / platform owner'),
  ('GROUP_ADMIN',  'Group Admin',   'Group owner or administrator'),
  ('COLLECTOR',    'Collector',     'Collection operator'),
  ('APPROVER',     'Approver',      'Approval authority'),
  ('MEMBER',       'Member',        'Group member')
on conflict (role_name) do nothing;

-- =============================================================================
-- 2. MASTER DATA - PERSONS  (HZ_PARTIES equivalent)
-- =============================================================================
create table if not exists public.xxfp_persons (
  person_id          bigint generated always as identity primary key,
  person_number      varchar(40) unique,
  full_name          varchar(255) not null,
  username           varchar(120),
  email              varchar(255),
  mobile_number      varchar(30),
  auth_user_id       uuid references auth.users(id) on delete set null,
  status             varchar(30) not null default 'ACTIVE',
  profile_photo_data text,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

create unique index if not exists xxfp_persons_lower_email_uq
  on public.xxfp_persons (lower(email)) where email is not null and email <> '';
create unique index if not exists xxfp_persons_lower_username_uq
  on public.xxfp_persons (lower(username)) where username is not null and username <> '';
create unique index if not exists xxfp_persons_mobile_uq
  on public.xxfp_persons (mobile_number) where mobile_number is not null and mobile_number <> '';

-- =============================================================================
-- 3. GROUP MASTER
-- =============================================================================
-- Note: created_by / last_updated_by stay as plain bigint (audit ids, no FK)
-- to avoid circular FK constraints between groups <-> auth_users.
create table if not exists public.xxfp_groups (
  group_id            bigint generated always as identity primary key,
  group_name          varchar(255) not null,
  code                varchar(40) unique,
  primary_contact_name varchar(255),
  mobile_number       varchar(30),
  email               varchar(255),
  status              varchar(30) not null default 'ACTIVE',
  owner_person_id     bigint references public.xxfp_persons(person_id),
  created_by          bigint,
  creation_date       timestamptz not null default now(),
  last_updated_by     bigint,
  last_update_date    timestamptz not null default now()
);

-- =============================================================================
-- 4. MEMBERSHIPS  (HZ_RELATIONSHIPS equivalent)
-- =============================================================================
create table if not exists public.xxfp_group_members (
  member_id          bigint generated always as identity primary key,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  person_id          bigint references public.xxfp_persons(person_id),
  role_id            bigint references public.xxfp_roles(role_id),
  member_name        varchar(255) not null,
  username           varchar(120),
  mobile_number      varchar(30),
  email              varchar(255),
  profile_photo_data text,
  join_date          date not null default current_date,
  exit_date          date,
  status             varchar(30) not null default 'ACTIVE',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

create unique index if not exists xxfp_group_members_grp_username_uq
  on public.xxfp_group_members (group_id, lower(username)) where username is not null and username <> '';
create unique index if not exists xxfp_group_members_username_uq
  on public.xxfp_group_members (lower(username)) where username is not null and username <> '';
create index if not exists xxfp_group_members_person_idx
  on public.xxfp_group_members (person_id);

-- =============================================================================
-- 5. AUTH USERS  (links supabase auth <-> person <-> membership)
-- =============================================================================
create table if not exists public.xxfp_auth_users (
  user_id            bigint generated always as identity primary key,
  supabase_user_id   uuid unique references auth.users(id) on delete cascade,
  member_id          bigint references public.xxfp_group_members(member_id) on delete set null,
  person_id          bigint references public.xxfp_persons(person_id),
  username           varchar(120) unique not null,
  password_hash      varchar(255),
  email              varchar(255) unique not null,
  mobile_number      varchar(30) unique,
  status             varchar(30) not null default 'ACTIVE',
  last_login_date    timestamptz,
  profile_photo      text,
  profile_photo_data text,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 6. MEMBER STATUS HISTORY
-- =============================================================================
create table if not exists public.xxfp_member_status_history (
  member_status_id   bigint generated always as identity primary key,
  member_id          bigint not null references public.xxfp_group_members(member_id) on delete cascade,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  status             varchar(30) not null,
  start_date         date not null,
  end_date           date,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);
create index if not exists xxfp_member_status_history_member_idx
  on public.xxfp_member_status_history (member_id);

-- =============================================================================
-- 7. GROUP SETUP  (group-level configuration)
-- =============================================================================
create table if not exists public.xxfp_group_setup (
  group_setup_id     bigint generated always as identity primary key,
  group_id           bigint not null unique references public.xxfp_groups(group_id) on delete cascade,
  monthly_saving_amount numeric(14,2),
  interest_rate      numeric(8,2),
  interest_type      varchar(30) not null default 'Reducing',
  penalty_amount     numeric(14,2),
  loan_limit         numeric(14,2),
  loan_tenure_months numeric(10,0),
  loan_due_day       numeric(2,0),
  auto_approve_flag  varchar(1) not null default 'N',
  current_open_period varchar(80),
  approver_names     jsonb not null default '[]'::jsonb,
  admin_names        jsonb not null default '[]'::jsonb,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 8. MEMBER SETUP  (member-level configuration)
-- =============================================================================
create table if not exists public.xxfp_member_setup (
  member_setup_id    bigint generated always as identity primary key,
  member_id          bigint not null unique references public.xxfp_group_members(member_id) on delete cascade,
  custom_saving_amount numeric(14,2),
  loan_limit         numeric(14,2),
  loan_tenure_months numeric(10,0),
  interest_rate      numeric(8,2),
  interest_type      varchar(30) not null default 'Reducing',
  active_flag        varchar(1) not null default 'Y',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 9. PERIODS
-- =============================================================================
create table if not exists public.xxfp_periods (
  period_id          bigint generated always as identity primary key,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  period_name        varchar(80) not null,
  start_date         date not null,
  end_date           date not null,
  status             varchar(30) not null default 'FUTURE',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now(),
  unique (group_id, period_name),
  check (end_date >= start_date)
);
create unique index if not exists xxfp_periods_one_open_per_group
  on public.xxfp_periods (group_id) where upper(status) = 'OPEN';

-- =============================================================================
-- 10. TRANSACTION HEADER / LINES  (numbered, auditable financial entries)
-- =============================================================================
create table if not exists public.xxfp_trx_header (
  member_trx_id      bigint generated always as identity primary key,
  trx_number         varchar(80) not null unique,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  member_id          bigint not null references public.xxfp_group_members(member_id),
  period_id          bigint references public.xxfp_periods(period_id),
  trx_date           date not null,
  trx_type           varchar(80) not null,
  total_amount       numeric(14,2) not null,
  approval_status    varchar(30) not null default 'PENDING',
  parent_trx_id      bigint references public.xxfp_trx_header(member_trx_id),
  adjustment_flag    varchar(1) not null default 'N',
  reversed_flag      varchar(1) not null default 'N',
  remarks            varchar(1000),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);
create index if not exists xxfp_trx_header_group_status_idx
  on public.xxfp_trx_header (group_id, approval_status, trx_date);
create index if not exists xxfp_trx_header_member_idx
  on public.xxfp_trx_header (member_id);

create table if not exists public.xxfp_trx_lines (
  member_trx_line_id bigint generated always as identity primary key,
  member_trx_id      bigint not null references public.xxfp_trx_header(member_trx_id) on delete cascade,
  line_type          varchar(40) not null check (line_type in ('SAVING','LOAN_PRINCIPAL','LOAN_INTEREST','PENALTY','CHARGES','OTHER','LOAN_DISTRIBUTION','WITHDRAWAL')),
  amount             numeric(14,2) not null,
  reference_id       bigint,
  remarks            varchar(1000),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);
create index if not exists xxfp_trx_lines_header_idx
  on public.xxfp_trx_lines (member_trx_id);

-- =============================================================================
-- 11. LOANS
-- =============================================================================
create table if not exists public.xxfp_loan_requests (
  loan_request_id    bigint generated always as identity primary key,
  request_number     varchar(80) not null unique,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  member_id          bigint not null references public.xxfp_group_members(member_id),
  requested_amount   numeric(14,2) not null,
  requested_months   numeric(10,0) not null,
  purpose            varchar(1000),
  request_date       date not null default current_date,
  status             varchar(30) not null default 'SUBMITTED',
  approval_status    varchar(30) not null default 'PENDING',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

create table if not exists public.xxfp_loan_header (
  loan_id            bigint generated always as identity primary key,
  loan_number        varchar(80) not null unique,
  loan_request_id    bigint references public.xxfp_loan_requests(loan_request_id),
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  member_id          bigint not null references public.xxfp_group_members(member_id),
  distributed_amount numeric(14,2) not null,
  interest_rate      numeric(8,2) not null default 0,
  distribution_date  date not null,
  outstanding_principal numeric(14,2) not null default 0,
  outstanding_interest  numeric(14,2) not null default 0,
  loan_status        varchar(30) not null default 'ACTIVE',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);
create index if not exists xxfp_loan_header_member_idx
  on public.xxfp_loan_header (member_id);

create table if not exists public.xxfp_loan_schedule (
  loan_schedule_id   bigint generated always as identity primary key,
  loan_id            bigint not null references public.xxfp_loan_header(loan_id) on delete cascade,
  installment_no     numeric(10,0) not null,
  due_date           date not null,
  principal_amount   numeric(14,2) not null default 0,
  interest_amount    numeric(14,2) not null default 0,
  paid_flag          varchar(1) not null default 'N',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 12. APPROVALS  (batchable approval workbench)
-- =============================================================================
create table if not exists public.xxfp_approval_header (
  approval_id        bigint generated always as identity primary key,
  transaction_type   varchar(80) not null,
  reference_id       bigint not null,
  reference_type     varchar(40) not null default 'transaction',
  group_id           bigint references public.xxfp_groups(group_id) on delete cascade,
  approval_batch_id  varchar(80),
  requester_member_id bigint references public.xxfp_group_members(member_id),
  approver_member_id bigint references public.xxfp_group_members(member_id),
  requester_name     varchar(200),
  approver_name      varchar(200),
  amount             numeric(14,2) not null default 0,
  approval_status    varchar(30) not null default 'PENDING',
  approval_date      date,
  remarks            varchar(1000),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);
create index if not exists xxfp_approval_header_batch_idx
  on public.xxfp_approval_header (approval_batch_id);
create index if not exists xxfp_approval_header_group_idx
  on public.xxfp_approval_header (group_id);

-- =============================================================================
-- 13. GROUP EXPENSES
-- =============================================================================
create table if not exists public.xxfp_group_expense_header (
  group_expense_id   bigint generated always as identity primary key,
  expense_number     varchar(80) not null unique,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  period_id          bigint references public.xxfp_periods(period_id),
  expense_date       date not null,
  expense_type       varchar(80) not null,
  total_amount       numeric(14,2) not null,
  payment_mode       varchar(80),
  approval_status    varchar(30) not null default 'PENDING',
  remarks            varchar(1000),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

create table if not exists public.xxfp_group_expense_lines (
  group_expense_line_id bigint generated always as identity primary key,
  group_expense_id   bigint not null references public.xxfp_group_expense_header(group_expense_id) on delete cascade,
  expense_category   varchar(120) not null,
  amount             numeric(14,2) not null,
  remarks            varchar(1000),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 14. SHARE DISTRIBUTION / ADJUSTMENTS
-- =============================================================================
create table if not exists public.xxfp_share_distribution (
  distribution_id    bigint generated always as identity primary key,
  earning_trx_id     bigint not null references public.xxfp_trx_header(member_trx_id),
  member_id          bigint not null references public.xxfp_group_members(member_id),
  distribution_amount numeric(14,2) not null,
  source_type        varchar(40) not null check (source_type in ('LOAN_INTEREST','PENALTY','OTHER_INCOME')),
  distribution_date  date not null,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now(),
  unique (earning_trx_id, member_id, source_type)
);

create table if not exists public.xxfp_share_adjustments (
  share_adjustment_id bigint generated always as identity primary key,
  member_id          bigint not null references public.xxfp_group_members(member_id),
  amount             numeric(14,2) not null,
  reason             varchar(1000),
  source_reference   bigint,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 15. AUDIT LOG  (Oracle AUDIT_TRAIL equivalent)
-- =============================================================================
create table if not exists public.xxfp_audit_log (
  audit_id           bigint generated always as identity primary key,
  trx_id             bigint,
  action_type        varchar(80) not null,
  old_value          varchar,
  new_value          varchar,
  changed_by         varchar(255),
  changed_date       timestamptz not null default now(),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 16. SUBSCRIPTIONS
-- =============================================================================
create table if not exists public.xxfp_subscription_plans (
  subscription_plan_id bigint generated always as identity primary key,
  plan_name          varchar(120) not null,
  duration           varchar(40) not null,
  amount             numeric(14,2) not null,
  max_members        numeric(10,0) not null,
  features           varchar,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now(),
  unique (plan_name, duration)
);

insert into public.xxfp_subscription_plans (plan_name, duration, amount, max_members, features)
values
  ('Free', 'Free', 0, 5, '1 group,5 members,Basic savings and loan tracking,Member app access'),
  ('Starter', 'Monthly', 99, 999999, '1 group,Unlimited members,Approvals,Audit control,Role control,Free member app access,Contact support to setup your group,Technical issue support'),
  ('Starter', 'Yearly', 999, 999999, '1 group,Unlimited members,Approvals,Audit control,Role control,Free member app access,Contact support to setup your group,Technical issue support'),
  ('Growth', 'Monthly', 299, 999999, 'Everything in Starter,Group management query support,Assisted transaction entry support,Daily/monthly adjustment support'),
  ('Growth', 'Yearly', 2999, 999999, 'Everything in Starter,Group management query support,Assisted transaction entry support,Daily/monthly adjustment support'),
  ('Premium', 'Monthly', 999, 999999, 'Everything in Growth,Priority support,Advanced reconciliation support,Dedicated setup guidance'),
  ('Premium', 'Yearly', 9999, 999999, 'Everything in Growth,Priority support,Advanced reconciliation support,Dedicated setup guidance')
on conflict (plan_name, duration) do nothing;

create table if not exists public.xxfp_group_subscriptions (
  group_subscription_id bigint generated always as identity primary key,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  subscription_plan_id bigint references public.xxfp_subscription_plans(subscription_plan_id),
  start_date         date not null,
  end_date           date not null,
  payment_status     varchar(40) not null default 'PENDING',
  transaction_reference varchar(255),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 17. LEGACY / MIGRATION TABLES
-- =============================================================================
create table if not exists public.xxfp_legacy_data (
  legacy_id          bigint generated always as identity primary key,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  member_id          bigint not null references public.xxfp_group_members(member_id),
  legacy_saving_balance   numeric(14,2) not null default 0,
  legacy_loan_outstanding numeric(14,2) not null default 0,
  legacy_interest_balance numeric(14,2) not null default 0,
  legacy_penalty_balance  numeric(14,2) not null default 0,
  legacy_share_earned     numeric(14,2) not null default 0,
  legacy_bank_balance     numeric(14,2) not null default 0,
  approval_status    varchar(30) not null default 'COMPLETED',
  migration_date     date not null default current_date,
  remarks            varchar(1000),
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

create table if not exists public.xxfp_legacy_group_opening (
  legacy_group_opening_id bigint generated always as identity primary key,
  group_id           bigint not null unique references public.xxfp_groups(group_id) on delete cascade,
  migration_date     date not null default current_date,
  opening_bank_balance   numeric(14,2) not null default 0,
  opening_group_expense  numeric(14,2) not null default 0,
  opening_group_gain     numeric(14,2) not null default 0,
  approval_status    varchar(30) not null default 'COMPLETED',
  remarks            varchar,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 18. WITHDRAWAL REQUESTS / SUPPORT DISPUTES
-- =============================================================================
create table if not exists public.xxfp_withdrawal_requests (
  withdrawal_request_id bigint generated always as identity primary key,
  request_number     varchar,
  group_id           bigint references public.xxfp_groups(group_id) on delete cascade,
  member_id          bigint references public.xxfp_group_members(member_id) on delete cascade,
  requested_amount   numeric not null default 0,
  request_date       date not null default current_date,
  reason             varchar,
  status             varchar not null default 'REQUESTED',
  approval_status    varchar not null default 'PENDING',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);
create index if not exists xxfp_withdrawal_requests_group_idx
  on public.xxfp_withdrawal_requests (group_id);
create index if not exists xxfp_withdrawal_requests_member_idx
  on public.xxfp_withdrawal_requests (member_id);

create table if not exists public.xxfp_support_disputes (
  dispute_id         bigint generated always as identity primary key,
  group_id           bigint references public.xxfp_groups(group_id) on delete set null,
  member_id          bigint references public.xxfp_group_members(member_id) on delete set null,
  group_name         varchar(255),
  member_name        varchar(255),
  contact_number     varchar(40) not null,
  issue              text not null,
  attachment_name    varchar(255),
  attachment_data    text,
  status             varchar(40) not null default 'OPEN',
  owner_reply        text,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 19. PENDING SETUP CHANGES  (setup approval queue)
-- =============================================================================
create table if not exists public.xxfp_pending_setup_changes (
  setup_change_id    bigint generated always as identity primary key,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  approval_batch_id  varchar(80) not null,
  setup_type         varchar(30) not null check (setup_type in ('group', 'member')),
  target_id          bigint not null,
  target_name        varchar(255),
  payload            jsonb not null default '{}'::jsonb,
  old_value          jsonb not null default '{}'::jsonb,
  change_summary     text,
  status             varchar(30) not null default 'PENDING',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);
create index if not exists idx_xxfp_pending_setup_changes_group
  on public.xxfp_pending_setup_changes (group_id);
create index if not exists idx_xxfp_pending_setup_changes_batch
  on public.xxfp_pending_setup_changes (approval_batch_id);

-- =============================================================================
-- 20. DOCUMENT SEQUENCES  (Oracle document-numbering backbone)
-- =============================================================================
create table if not exists public.xxfp_doc_sequences (
  doc_sequence_id    bigint generated always as identity primary key,
  group_id           bigint not null references public.xxfp_groups(group_id) on delete cascade,
  doc_type           varchar(40) not null check (doc_type in ('TRX','LOAN','ADJ','EXP','LR','WR','MIG')),
  last_number        bigint not null default 0,
  prefix             varchar(20) not null default 'DOC',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now(),
  unique (group_id, doc_type)
);

-- =============================================================================
-- 21. STAGING / INTERFACE TABLES  (XX EBS-style import interfaces)
-- =============================================================================
create table if not exists public.xxfp_int_import_batch (
  import_batch_id    bigint generated always as identity primary key,
  group_id           bigint references public.xxfp_groups(group_id),
  source_system      varchar(80) not null default 'MANUAL',
  batch_number       varchar(80),
  status             varchar(30) not null default 'NEW',
  total_rows         integer not null default 0,
  processed_rows     integer not null default 0,
  error_count        integer not null default 0,
  error_log          jsonb not null default '[]'::jsonb,
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

create table if not exists public.xxfp_stg_member_imp (
  stg_id             bigint generated always as identity primary key,
  import_batch_id    bigint references public.xxfp_int_import_batch(import_batch_id),
  group_id           bigint references public.xxfp_groups(group_id),
  row_number         integer not null default 0,
  record_status      varchar(30) not null default 'NEW',
  error_message      varchar(2000),
  raw_json           jsonb not null default '{}'::jsonb,
  processed_flag     varchar(1) not null default 'N',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

create table if not exists public.xxfp_stg_trx_imp (
  stg_id             bigint generated always as identity primary key,
  import_batch_id    bigint references public.xxfp_int_import_batch(import_batch_id),
  group_id           bigint references public.xxfp_groups(group_id),
  row_number         integer not null default 0,
  record_status      varchar(30) not null default 'NEW',
  error_message      varchar(2000),
  raw_json           jsonb not null default '{}'::jsonb,
  processed_flag     varchar(1) not null default 'N',
  created_by         bigint,
  creation_date      timestamptz not null default now(),
  last_updated_by    bigint,
  last_update_date   timestamptz not null default now()
);

-- =============================================================================
-- 22. WHO COLUMN TRIGGERS (Oracle WHO/audit columns equivalent)
-- =============================================================================
create or replace function public.xxfp_touch_last_update()
returns trigger
language plpgsql
as $$
begin
  new.last_update_date = now();
  if new.last_updated_by is null then
    select user_id into new.last_updated_by
    from public.xxfp_auth_users
    where supabase_user_id = auth.uid();
  end if;
  return new;
end;
$$;

do $$
declare
  obj record;
begin
  for obj in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name like 'xxfp\_%'
      and column_name = 'last_update_date'
  loop
    execute format(
      'drop trigger if exists %I on public.%I; create trigger %I before update on public.%I for each row execute function public.xxfp_touch_last_update()',
      obj.table_name || '_touch', obj.table_name, obj.table_name || '_touch', obj.table_name
    );
  end loop;
end $$;

commit;
