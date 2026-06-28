alter table public.group_setup
  add column if not exists approver_names jsonb not null default '[]'::jsonb,
  add column if not exists admin_names jsonb not null default '[]'::jsonb;

update public.group_setup
set approver_names = '[]'::jsonb
where approver_names is null;

update public.group_setup
set admin_names = '[]'::jsonb
where admin_names is null;
