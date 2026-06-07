-- Dashboard migration opening balance fixes.
-- Migrated principal/interest/penalty are opening receivables, not collected repayments or group gain.

create or replace view public.group_dashboard_balances as
with trx as (
  select h.group_id, h.trx_type, l.line_type, sum(l.amount) amount
  from public.member_transaction_header h
  join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.group_id, h.trx_type, l.line_type
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
),
legacy_opening as (
  select
    group_id,
    sum(opening_bank_balance) opening_bank_balance,
    sum(opening_group_expense) opening_group_expense,
    sum(opening_group_gain) opening_group_gain
  from public.legacy_group_opening
  where upper(coalesce(approval_status, 'COMPLETED')) in ('COMPLETED', 'APPROVED')
  group by group_id
),
loan_balance as (
  select group_id, sum(outstanding_principal) outstanding_loan_amount
  from public.loan_distribution
  where upper(loan_status) = 'ACTIVE'
  group by group_id
),
group_base as (
  select
    g.group_id,
    coalesce(sum(trx.amount) filter (where trx.line_type = 'SAVING' and trx.trx_type <> 'Group Expense Share'), 0)
      + coalesce(s.share_distribution_amount, 0)
      + coalesce(sa.share_adjustment_amount, 0) as total_savings,
    coalesce(lb.outstanding_loan_amount, 0) as outstanding_loan_amount,
    coalesce(lo.opening_bank_balance, 0) as opening_bank_balance,
    coalesce(lo.opening_group_expense, 0) as opening_group_expense,
    coalesce(lo.opening_group_gain, 0) as opening_group_gain,
    coalesce(e.group_expenses, 0) as group_expenses,
    coalesce(sum(trx.amount) filter (where trx.line_type = 'LOAN_INTEREST' and trx.trx_type <> 'Migrated'), 0)
      + coalesce(sum(trx.amount) filter (where trx.line_type = 'PENALTY' and trx.trx_type <> 'Migrated'), 0) as collected_gain,
    coalesce(sum(trx.amount) filter (
      where trx.trx_type <> 'Migrated'
        and trx.line_type in ('LOAN_INTEREST','PENALTY','OTHER','CHARGES')
    ), 0) as collected_non_saving,
    coalesce(sum(trx.amount) filter (where trx.line_type = 'SAVING' and trx.trx_type <> 'Group Expense Share'), 0) as collected_saving,
    coalesce(sum(trx.amount) filter (where trx.line_type in ('LOAN_DISTRIBUTION','WITHDRAWAL')), 0) as cash_out
  from public.groups g
  left join trx on trx.group_id = g.group_id
  left join shares s on s.group_id = g.group_id
  left join share_adj sa on sa.group_id = g.group_id
  left join expenses e on e.group_id = g.group_id
  left join legacy_opening lo on lo.group_id = g.group_id
  left join loan_balance lb on lb.group_id = g.group_id
  group by
    g.group_id,
    s.share_distribution_amount,
    sa.share_adjustment_amount,
    lb.outstanding_loan_amount,
    lo.opening_bank_balance,
    lo.opening_group_expense,
    lo.opening_group_gain,
    e.group_expenses
)
select
  group_id,
  total_savings,
  (select count(*) from public.loan_distribution ld where ld.group_id = group_base.group_id and upper(ld.loan_status) = 'ACTIVE') as active_loans,
  outstanding_loan_amount,
  collected_gain
    + opening_group_gain
    + greatest(0, opening_bank_balance + outstanding_loan_amount + opening_group_expense - total_savings) as group_gain_amount,
  collected_saving
    + collected_non_saving
    + opening_bank_balance
    + opening_group_gain
    - cash_out
    - group_expenses
    - opening_group_expense as remaining_balance
from group_base;

create or replace view public.member_dashboard_balances as
with trx as (
  select h.member_id, h.trx_type, l.line_type, sum(l.amount) amount
  from public.member_transaction_header h
  join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.member_id, h.trx_type, l.line_type
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
    + coalesce(s.distribution_amount, 0)
    + coalesce(sa.adjustment_amount, 0) as savings,
  coalesce(lo.outstanding_principal, 0)
    + coalesce(lo.outstanding_interest, 0) as outstanding_loan,
  coalesce(s.distribution_amount, 0) + coalesce(sa.adjustment_amount, 0) as earned_from_group,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'CHARGES'), 0)
    + coalesce(sum(trx.amount) filter (where trx.line_type = 'PENALTY' and trx.trx_type = 'Migrated'), 0) as pending_charges
from public.members m
left join trx on trx.member_id = m.member_id
left join shares s on s.member_id = m.member_id
left join share_adj sa on sa.member_id = m.member_id
left join loans lo on lo.member_id = m.member_id
group by m.member_id, m.group_id, s.distribution_amount, sa.adjustment_amount, lo.outstanding_principal, lo.outstanding_interest;

grant select on public.group_dashboard_balances to authenticated;
grant select on public.member_dashboard_balances to authenticated;
