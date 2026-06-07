-- Add deferred membership capture fields to public.group_members
alter table public.group_members
  alter column user_id drop not null;

alter table public.group_members
  add column if not exists pending_full_name text;

alter table public.group_members
  add column if not exists pending_email text;

alter table public.group_members
  add column if not exists pending_mobile_number text;
