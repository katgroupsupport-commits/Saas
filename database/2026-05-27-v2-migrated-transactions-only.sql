insert into public.member_transaction_header (
  trx_number,
  group_id,
  member_id,
  period_id,
  trx_date,
  trx_type,
  total_amount,
  approval_status,
  remarks,
  created_by,
  last_updated_by
)
select
  'MIG-' || ld.legacy_id,
  ld.group_id,
  ld.member_id,
  (
    select p.period_id
    from public.periods p
    where p.group_id = ld.group_id
      and ld.migration_date between p.start_date and p.end_date
    order by p.start_date desc
    limit 1
  ),
  ld.migration_date,
  'Migrated',
  coalesce(ld.legacy_saving_balance, 0)
    + coalesce(ld.legacy_interest_balance, 0)
    + coalesce(ld.legacy_share_earned, 0),
  coalesce(ld.approval_status, 'COMPLETED'),
  coalesce(ld.remarks, 'Migrated from legacy_data'),
  ld.created_by,
  ld.last_updated_by
from public.legacy_data ld
where not exists (
  select 1
  from public.member_transaction_header h
  where h.trx_number = 'MIG-' || ld.legacy_id
);

insert into public.member_transaction_lines (
  member_trx_id,
  line_type,
  amount,
  reference_id,
  remarks,
  created_by,
  last_updated_by
)
select
  h.member_trx_id,
  line_data.line_type,
  line_data.amount,
  ld.legacy_id,
  'Migrated from legacy_data',
  ld.created_by,
  ld.last_updated_by
from public.legacy_data ld
join public.member_transaction_header h on h.trx_number = 'MIG-' || ld.legacy_id
cross join lateral (
  values
    ('SAVING', coalesce(ld.legacy_saving_balance, 0) + coalesce(ld.legacy_share_earned, 0)),
    ('LOAN_INTEREST', coalesce(ld.legacy_interest_balance, 0)),
    ('OTHER', 0)
) as line_data(line_type, amount)
where line_data.amount <> 0
  and not exists (
    select 1
    from public.member_transaction_lines l
    where l.member_trx_id = h.member_trx_id
      and l.line_type = line_data.line_type
      and l.reference_id = ld.legacy_id
  );

insert into public.loan_distribution (
  loan_number,
  group_id,
  member_id,
  distributed_amount,
  interest_rate,
  distribution_date,
  outstanding_principal,
  outstanding_interest,
  loan_status,
  created_by,
  last_updated_by
)
select
  'MIG-LOAN-' || ld.legacy_id,
  ld.group_id,
  ld.member_id,
  coalesce(ld.legacy_loan_outstanding, 0),
  0,
  ld.migration_date,
  coalesce(ld.legacy_loan_outstanding, 0),
  coalesce(ld.legacy_interest_balance, 0),
  case when upper(coalesce(ld.approval_status, 'COMPLETED')) = 'PENDING' then 'PENDING' else 'ACTIVE' end,
  ld.created_by,
  ld.last_updated_by
from public.legacy_data ld
where coalesce(ld.legacy_loan_outstanding, 0) > 0
  and not exists (
    select 1
    from public.loan_distribution loan
    where loan.loan_number = 'MIG-LOAN-' || ld.legacy_id
  );

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
    + coalesce(s.share_distribution_amount, 0)
    + coalesce(sa.share_adjustment_amount, 0) as total_savings,
  (select count(*) from public.loan_distribution ld where ld.group_id = g.group_id and upper(ld.loan_status) = 'ACTIVE') as active_loans,
  coalesce((select sum(outstanding_principal) from public.loan_distribution ld where ld.group_id = g.group_id), 0) as outstanding_loan_amount,
  coalesce(sum(trx.amount) filter (where trx.line_type = 'LOAN_INTEREST'), 0)
    + coalesce(sum(trx.amount) filter (where trx.line_type = 'PENALTY'), 0)
    - coalesce(e.group_expenses, 0) as group_gain_amount,
  coalesce(sum(trx.amount) filter (where trx.line_type in ('SAVING','LOAN_INTEREST','PENALTY','OTHER','CHARGES')), 0)
    - coalesce(sum(trx.amount) filter (where trx.line_type in ('LOAN_DISTRIBUTION','WITHDRAWAL')), 0)
    - coalesce(e.group_expenses, 0) as remaining_balance
from public.groups g
left join trx on trx.group_id = g.group_id
left join shares s on s.group_id = g.group_id
left join share_adj sa on sa.group_id = g.group_id
left join expenses e on e.group_id = g.group_id
group by g.group_id, s.share_distribution_amount, sa.share_adjustment_amount, e.group_expenses;

create or replace view public.member_dashboard_balances as
with trx as (
  select h.member_id, l.line_type, sum(l.amount) amount
  from public.member_transaction_header h
  join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where upper(h.approval_status) in ('COMPLETED', 'APPROVED')
  group by h.member_id, l.line_type
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
  coalesce(sum(trx.amount) filter (where trx.line_type = 'CHARGES'), 0) as pending_charges
from public.members m
left join trx on trx.member_id = m.member_id
left join shares s on s.member_id = m.member_id
left join share_adj sa on sa.member_id = m.member_id
left join loans lo on lo.member_id = m.member_id
group by m.member_id, m.group_id, s.distribution_amount, sa.adjustment_amount, lo.outstanding_principal, lo.outstanding_interest;

grant select on public.group_dashboard_balances to authenticated;
grant select on public.member_dashboard_balances to authenticated;
