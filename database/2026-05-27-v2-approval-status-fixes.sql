alter table public.legacy_data
  add column if not exists approval_status varchar(30) not null default 'COMPLETED';

drop view if exists public.group_dashboard_balances cascade;
drop view if exists public.member_dashboard_balances cascade;

create or replace view public.group_dashboard_balances as
with trx as (
  select h.group_id, h.trx_type, l.line_type, sum(l.amount) amount
  from public.member_transaction_header h
  join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.group_id, h.trx_type, l.line_type
),
legacy as (
  select group_id,
    sum(legacy_saving_balance) legacy_saving_balance,
    sum(legacy_loan_outstanding) legacy_loan_outstanding,
    sum(legacy_interest_balance) legacy_interest_balance,
    sum(legacy_share_earned) legacy_share_earned,
    sum(legacy_bank_balance) legacy_bank_balance
  from public.legacy_data
  where upper(approval_status) in ('COMPLETED', 'APPROVED')
  group by group_id
),
shares as (
  select m.group_id, sum(sd.distribution_amount) share_distribution_amount
  from public.share_distribution sd
  join public.members m on m.member_id = sd.member_id
  group by m.group_id
),
share_adj as (
  select m.group_id, sum(sa.amount) share_adjustment_amount
  from public.share_adjustments sa
  join public.members m on m.member_id = sa.member_id
  group by m.group_id
),
expenses as (
  select group_id, sum(total_amount) group_expenses
  from public.group_expense_header
  where upper(approval_status) in ('COMPLETED', 'APPROVED')
  group by group_id
)
select
  g.group_id,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'SAVING' and trx.trx_type <> 'Group Expense Share'), 0)
    + coalesce(l.legacy_saving_balance, 0)
    + coalesce(s.share_distribution_amount, 0)
    + coalesce(sa.share_adjustment_amount, 0) as total_savings,
  (select count(*) from public.loan_distribution ld where ld.group_id = g.group_id and upper(ld.loan_status) = 'ACTIVE') as active_loans,
  coalesce((select sum(outstanding_principal) from public.loan_distribution ld where ld.group_id = g.group_id), 0)
    + coalesce(l.legacy_loan_outstanding, 0) as outstanding_loan_amount,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'LOAN_INTEREST'), 0)
    + coalesce(sum(trx.amount) filter (where trx.line_type = 'PENALTY'), 0)
    - coalesce(e.group_expenses, 0) as group_gain_amount,
  coalesce(l.legacy_bank_balance, 0)
    + coalesce(sum(trx.amount) filter (where trx.line_type in ('SAVING','LOAN_INTEREST','PENALTY','OTHER','CHARGES')), 0)
    - coalesce(sum(trx.amount) filter (where trx.line_type in ('LOAN_DISTRIBUTION','WITHDRAWAL')), 0)
    - coalesce(e.group_expenses, 0) as remaining_balance
from public.groups g
left join trx on trx.group_id = g.group_id
left join legacy l on l.group_id = g.group_id
left join shares s on s.group_id = g.group_id
left join share_adj sa on sa.group_id = g.group_id
left join expenses e on e.group_id = g.group_id
group by g.group_id, l.legacy_saving_balance, l.legacy_loan_outstanding, l.legacy_bank_balance, s.share_distribution_amount, sa.share_adjustment_amount, e.group_expenses;

create or replace view public.member_dashboard_balances as
with trx as (
  select h.member_id, l.line_type, sum(l.amount) amount
  from public.member_transaction_header h
  join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.member_id, l.line_type
),
legacy as (
  select member_id,
    sum(legacy_saving_balance) legacy_saving_balance,
    sum(legacy_loan_outstanding) legacy_loan_outstanding,
    sum(legacy_interest_balance) legacy_interest_balance,
    sum(legacy_share_earned) legacy_share_earned
  from public.legacy_data
  where upper(approval_status) in ('COMPLETED', 'APPROVED')
  group by member_id
),
shares as (
  select member_id, sum(distribution_amount) distribution_amount
  from public.share_distribution
  group by member_id
),
share_adj as (
  select member_id, sum(amount) adjustment_amount
  from public.share_adjustments
  group by member_id
),
loans as (
  select member_id, sum(outstanding_principal) outstanding_principal, sum(outstanding_interest) outstanding_interest
  from public.loan_distribution
  where upper(loan_status) = 'ACTIVE'
  group by member_id
)
select
  m.member_id,
  m.group_id,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'SAVING'), 0)
    + coalesce(l.legacy_saving_balance, 0)
    + coalesce(s.distribution_amount, 0)
    + coalesce(sa.adjustment_amount, 0) as savings,
  coalesce(lo.outstanding_principal, 0)
    + coalesce(lo.outstanding_interest, 0)
    + coalesce(l.legacy_loan_outstanding, 0)
    + coalesce(l.legacy_interest_balance, 0) as outstanding_loan,
  coalesce(s.distribution_amount, 0) + coalesce(sa.adjustment_amount, 0) + coalesce(l.legacy_share_earned, 0) as earned_from_group,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'CHARGES'), 0) as pending_charges
from public.members m
left join trx on trx.member_id = m.member_id
left join legacy l on l.member_id = m.member_id
left join shares s on s.member_id = m.member_id
left join share_adj sa on sa.member_id = m.member_id
left join loans lo on lo.member_id = m.member_id
group by m.member_id, m.group_id, l.legacy_saving_balance, l.legacy_loan_outstanding, l.legacy_interest_balance, l.legacy_share_earned, s.distribution_amount, sa.adjustment_amount, lo.outstanding_principal, lo.outstanding_interest;

grant select on public.group_dashboard_balances to authenticated;
grant select on public.member_dashboard_balances to authenticated;
