-- Adds member lifecycle dates used for share distribution.
-- active=false with inactive_date <= current_date means the member is not
-- eligible for periods after that date.

alter table public.group_members
  add column if not exists inactive_date date,
  add column if not exists created_at timestamptz not null default now();

comment on column public.group_members.inactive_date is 'Date the member became inactive or exited the group.';
