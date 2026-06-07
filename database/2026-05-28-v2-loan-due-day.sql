alter table public.group_setup
  add column if not exists loan_due_day numeric(2,0) not null default 1;
