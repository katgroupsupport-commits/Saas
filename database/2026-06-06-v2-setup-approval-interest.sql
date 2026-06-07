-- Setup approval + member interest persistence support.
-- Run this after the standardized architecture scripts.

alter table public.group_setup
  add column if not exists interest_type varchar(30) not null default 'Reducing';

alter table public.member_setup
  add column if not exists interest_rate numeric(8,2) not null default 0,
  add column if not exists interest_type varchar(30) not null default 'Reducing';

update public.member_setup
set interest_rate = 0
where interest_rate is null;

update public.member_setup
set interest_type = 'Reducing'
where interest_type is null or trim(interest_type) = '';

update public.group_setup
set interest_type = 'Reducing'
where interest_type is null or trim(interest_type) = '';

create table if not exists public.pending_setup_changes (
  setup_change_id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  approval_batch_id varchar(80) not null,
  setup_type varchar(30) not null check (setup_type in ('group', 'member')),
  target_id bigint not null,
  target_name varchar(255),
  payload jsonb not null default '{}'::jsonb,
  old_value jsonb not null default '{}'::jsonb,
  change_summary text,
  status varchar(30) not null default 'PENDING',
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

create index if not exists idx_pending_setup_changes_group
  on public.pending_setup_changes(group_id);

create index if not exists idx_pending_setup_changes_batch
  on public.pending_setup_changes(approval_batch_id);
