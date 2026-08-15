-- Migration: add member statement RPC used by the client member ledger path
-- Date: 2026-08-02

create or replace function public.rpc_member_statement_summary(
  p_group_id integer,
  p_member_id integer,
  p_as_of_date date default current_date
)
returns table(
  member_id integer,
  opening_balance numeric,
  savings_collected numeric,
  principal_collected numeric,
  interest_collected numeric,
  penalty_collected numeric,
  withdrawals numeric,
  share_allocation numeric,
  expense_allocation numeric,
  closing_balance numeric
)
language plpgsql
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_as_of_date, current_date))::date;
  v_month_end date := (date_trunc('month', coalesce(p_as_of_date, current_date)) + interval '1 month - 1 day')::date;
begin
  return query
  select
    b.member_id,
    coalesce(b.savings, 0) as opening_balance,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and l.line_type = 'SAVING' then l.amount else 0 end), 0) as savings_collected,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and l.line_type = 'LOAN_PRINCIPAL' then l.amount else 0 end), 0) as principal_collected,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and l.line_type = 'LOAN_INTEREST' then l.amount else 0 end), 0) as interest_collected,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and l.line_type = 'PENALTY' then l.amount else 0 end), 0) as penalty_collected,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and h.trx_type = 'Withdrawal' then coalesce(h.total_amount, 0) else 0 end), 0) as withdrawals,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and h.trx_type = 'Share Distribution' then coalesce(h.total_amount, 0) else 0 end), 0) as share_allocation,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and h.trx_type = 'Group Expense Share' then coalesce(h.total_amount, 0) else 0 end), 0) as expense_allocation,
    coalesce(b.savings, 0) + coalesce(b.earned_from_group, 0) - coalesce(b.pending_charges, 0) as closing_balance
  from public.member_dashboard_balances b
  left join public.member_transaction_header h
    on h.group_id = b.group_id and h.member_id = b.member_id
  left join public.member_transaction_lines l
    on l.member_trx_id = h.member_trx_id
  where b.group_id = p_group_id
    and b.member_id = p_member_id
  group by b.member_id, b.savings, b.earned_from_group, b.pending_charges;
end; $$;

grant execute on function public.rpc_member_statement_summary(integer, integer, date) to authenticated;
