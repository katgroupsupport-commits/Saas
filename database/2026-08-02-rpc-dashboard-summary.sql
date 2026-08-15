-- Migration: add dashboard summary RPC used by the client dashboard cards
-- Date: 2026-08-02

create or replace function public.rpc_get_dashboard_summary(
  p_group_id integer,
  p_as_of_date date default current_date
)
returns table(
  total_savings numeric,
  active_loan_balance numeric,
  current_month_collections numeric,
  expenses numeric,
  pending_dues numeric,
  remaining_balance numeric,
  group_gain numeric,
  active_loans_count integer
) language plpgsql as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_as_of_date, current_date))::date;
  v_month_end date := (date_trunc('month', coalesce(p_as_of_date, current_date)) + interval '1 month - 1 day')::date;
  v_total_savings numeric := 0;
  v_active_loan_balance numeric := 0;
  v_group_gain numeric := 0;
  v_expenses numeric := 0;
  v_pending_dues numeric := 0;
  v_current_month_collections numeric := 0;
  v_active_loans_count integer := 0;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for dashboard summary' using errcode = '42501';
  end if;

  select coalesce(sum(coalesce(b.savings,0)),0)
    into v_total_savings
  from public.member_dashboard_balances b
  where b.group_id = p_group_id;

  select coalesce(sum(coalesce(b.outstanding_loan,0)),0)
    into v_active_loan_balance
  from public.member_dashboard_balances b
  where b.group_id = p_group_id;

  select coalesce(sum(coalesce(b.earned_from_group,0)),0)
    into v_group_gain
  from public.member_dashboard_balances b
  where b.group_id = p_group_id;

  select coalesce(sum(coalesce(geh.total_amount,0)),0)
    into v_expenses
  from public.group_expense_header geh
  where geh.group_id = p_group_id
    and upper(coalesce(geh.approval_status, 'PENDING')) in ('COMPLETED', 'APPROVED');

  select coalesce(sum(coalesce(b.outstanding_loan,0) + coalesce(b.outstanding_interest,0) + coalesce(b.pending_charges,0)),0)
    into v_pending_dues
  from public.member_dashboard_balances b
  where b.group_id = p_group_id;

  select coalesce(sum(
    case
      when h.trx_type = 'Withdrawal' then -coalesce(h.total_amount,0)
      else coalesce(l.amount,0)
    end
  ),0)
    into v_current_month_collections
  from public.member_transaction_header h
  left join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where h.group_id = p_group_id
    and h.trx_date between v_month_start and v_month_end
    and upper(coalesce(h.approval_status,'PENDING')) in ('COMPLETED','APPROVED');

  select count(*)::integer
    into v_active_loans_count
  from public.loan_distribution ld
  where ld.group_id = p_group_id
    and upper(coalesce(ld.loan_status, '')) in ('ACTIVE', 'COMPLETED', 'APPROVED')
    and coalesce(ld.outstanding_principal,0) > 0;

  return query
  select
    v_total_savings as total_savings,
    v_active_loan_balance as active_loan_balance,
    v_current_month_collections as current_month_collections,
    v_expenses as expenses,
    v_pending_dues as pending_dues,
    v_total_savings + v_group_gain - v_active_loan_balance - v_expenses as remaining_balance,
    v_group_gain as group_gain,
    v_active_loans_count as active_loans_count;
end; $$;

grant execute on function public.rpc_get_dashboard_summary(integer, date) to authenticated;
