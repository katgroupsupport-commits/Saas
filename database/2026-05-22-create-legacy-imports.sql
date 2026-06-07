-- Table to store raw legacy member migration imports for later processing
create table if not exists public.legacy_member_imports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id) on delete cascade,
  joined_date date,
  exit_date date,
  total_saving numeric(14,2) default 0,
  pending_loan numeric(14,2) default 0,
  interest_amount numeric(14,2) default 0,
  penalty_amount numeric(14,2) default 0,
  excess_amount numeric(14,2) default 0,
  raw_payload jsonb default '{}'::jsonb,
  processed boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_legacy_member_imports_group_processed on public.legacy_member_imports (group_id, processed);
