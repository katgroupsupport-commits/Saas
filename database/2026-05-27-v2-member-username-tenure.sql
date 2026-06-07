alter table public.members
  add column if not exists username varchar(120);

create unique index if not exists members_group_username_unique
  on public.members(group_id, lower(username))
  where username is not null and username <> '';

alter table public.group_setup
  add column if not exists loan_limit numeric(14,2) not null default 0,
  add column if not exists loan_tenure_months numeric(10,0) not null default 12;

alter table public.member_setup
  add column if not exists loan_tenure_months numeric(10,0) not null default 0;
