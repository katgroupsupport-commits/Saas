-- Integrity patch:
-- 1. Store group-level legacy opening once per group.
-- 2. Preserve member-level legacy penalty in history.
-- 3. Provide completed-only legacy/history views so pending data is not used by dashboards.

alter table public.legacy_data
  add column if not exists legacy_penalty_balance numeric(14,2) not null default 0;

create table if not exists public.legacy_group_opening (
  legacy_group_opening_id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(group_id) on delete cascade,
  migration_date date not null default current_date,
  opening_bank_balance numeric(14,2) not null default 0,
  opening_group_expense numeric(14,2) not null default 0,
  opening_group_gain numeric(14,2) not null default 0,
  remarks varchar,
  created_by bigint,
  creation_date timestamptz not null default now(),
  last_updated_by bigint,
  last_update_date timestamptz not null default now(),
  constraint legacy_group_opening_group_unique unique (group_id)
);

alter table public.legacy_group_opening enable row level security;

drop policy if exists "legacy group opening visible within tenant" on public.legacy_group_opening;
create policy "legacy group opening visible within tenant"
on public.legacy_group_opening
for select
to authenticated
using (true);

drop policy if exists "authenticated users can upsert legacy group opening" on public.legacy_group_opening;
create policy "authenticated users can upsert legacy group opening"
on public.legacy_group_opening
for all
to authenticated
using (true)
with check (true);

create or replace view public.v_completed_member_transaction_history as
select
  h.member_trx_id,
  h.trx_number,
  h.group_id,
  h.member_id,
  h.period_id,
  h.trx_date,
  h.trx_type,
  h.approval_status,
  h.parent_trx_id,
  h.adjustment_flag,
  h.reversed_flag,
  h.remarks,
  coalesce(sum(case when l.line_type = 'SAVING' then l.amount else 0 end), 0) as saving_amount,
  coalesce(sum(case when l.line_type = 'LOAN_PRINCIPAL' then l.amount else 0 end), 0) as loan_principal_amount,
  coalesce(sum(case when l.line_type = 'LOAN_INTEREST' then l.amount else 0 end), 0) as loan_interest_amount,
  coalesce(sum(case when l.line_type = 'PENALTY' then l.amount else 0 end), 0) as penalty_amount,
  coalesce(sum(case when l.line_type = 'CHARGES' then l.amount else 0 end), 0) as charges_amount,
  coalesce(sum(case when l.line_type = 'OTHER' then l.amount else 0 end), 0) as other_amount
from public.member_transaction_header h
left join public.member_transaction_lines l
  on l.member_trx_id = h.member_trx_id
where h.approval_status in ('COMPLETED', 'APPROVED')
group by
  h.member_trx_id,
  h.trx_number,
  h.group_id,
  h.member_id,
  h.period_id,
  h.trx_date,
  h.trx_type,
  h.approval_status,
  h.parent_trx_id,
  h.adjustment_flag,
  h.reversed_flag,
  h.remarks;

create or replace view public.v_completed_legacy_member_history as
select
  ld.legacy_id,
  ld.group_id,
  ld.member_id,
  ld.migration_date,
  ld.approval_status,
  ld.legacy_saving_balance,
  ld.legacy_loan_outstanding,
  ld.legacy_interest_balance,
  ld.legacy_penalty_balance,
  ld.legacy_share_earned,
  ld.remarks
from public.legacy_data ld
where coalesce(ld.approval_status, 'COMPLETED') in ('COMPLETED', 'APPROVED');

create index if not exists legacy_group_opening_group_idx
  on public.legacy_group_opening(group_id);

create index if not exists member_transaction_header_completed_group_idx
  on public.member_transaction_header(group_id, approval_status, trx_date);
