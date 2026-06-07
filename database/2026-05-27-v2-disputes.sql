create table if not exists public.support_disputes (
  dispute_id bigint generated always as identity primary key,
  group_id bigint references public.groups(group_id) on delete set null,
  member_id bigint references public.members(member_id) on delete set null,
  group_name varchar(255),
  member_name varchar(255),
  contact_number varchar(40) not null,
  issue text not null,
  attachment_name varchar(255),
  attachment_data text,
  status varchar(40) not null default 'OPEN',
  owner_reply text,
  created_by bigint references public.auth_users(user_id),
  creation_date timestamptz not null default now(),
  last_updated_by bigint references public.auth_users(user_id),
  last_update_date timestamptz not null default now()
);

alter table public.support_disputes enable row level security;

drop policy if exists support_disputes_authenticated_all on public.support_disputes;
create policy support_disputes_authenticated_all
on public.support_disputes
for all to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.support_disputes to authenticated;
grant usage, select on sequence public.support_disputes_dispute_id_seq to authenticated;
