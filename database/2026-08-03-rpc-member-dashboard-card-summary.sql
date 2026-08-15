-- Migration: add member dashboard card summary RPC backed by Supabase SQL
-- Date: 2026-08-03

drop function if exists public.rpc_member_dashboard_card_summary(integer, integer, date);

create or replace function public.rpc_member_dashboard_card_summary(
  p_group_id integer,
  p_member_id integer,
  p_as_of_date date default current_date
)
returns table(
  savings numeric,
  collected_in_period numeric,
  share_amount numeric,
  loan_balance numeric,
  next_minimum_due numeric,
  share_percent numeric,
  validation_savings boolean,
  validation_collected_in_period boolean,
  validation_share_amount boolean,
  validation_loan_balance boolean,
  validation_next_minimum_due boolean,
  validation_share_percent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_as_of_date, current_date))::date;
  v_month_end date := (date_trunc('month', coalesce(p_as_of_date, current_date)) + interval '1 month - 1 day')::date;
  v_savings numeric := 0;
  v_earned_from_group numeric := 0;
  v_pending_charges numeric := 0;
  v_loan_balance numeric := 0;
  v_outstanding_loan numeric := 0;
  v_outstanding_interest numeric := 0;
  v_collected_in_period numeric := 0;
  v_share_amount numeric := 0;
  v_share_percent numeric := 0;
  v_total_share_amount numeric := 0;
  v_next_minimum_due numeric := 0;
  v_validation_savings boolean := true;
  v_validation_collected_in_period boolean := true;
  v_validation_share_amount boolean := true;
  v_validation_loan_balance boolean := true;
  v_validation_next_minimum_due boolean := true;
  v_validation_share_percent boolean := true;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for member dashboard card summary' using errcode = '42501';
  end if;

  select coalesce(b.savings,0), coalesce(b.earned_from_group,0), coalesce(b.pending_charges,0), coalesce(b.outstanding_loan,0), coalesce(b.outstanding_interest,0)
    into v_savings, v_earned_from_group, v_pending_charges, v_loan_balance, v_outstanding_interest
  from public.member_dashboard_balances b
  where b.group_id = p_group_id
    and b.member_id = p_member_id
  limit 1;

  v_collected_in_period := coalesce(
    (select sum(case when h.trx_type = 'Withdrawal' then -coalesce(h.total_amount,0) else coalesce(l.amount,0) end)
      from public.member_transaction_header h
      left join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
      where h.group_id = p_group_id
        and h.member_id = p_member_id
        and h.trx_date between v_month_start and v_month_end
        and upper(coalesce(h.approval_status,'PENDING')) in ('COMPLETED','APPROVED')),
    0
  );

  v_share_amount := coalesce(v_savings,0) + coalesce(v_earned_from_group,0) - coalesce(v_pending_charges,0);
  v_next_minimum_due := coalesce(v_outstanding_loan,0) + coalesce(v_outstanding_interest,0) + coalesce(v_pending_charges,0);

  select coalesce(sum(case when coalesce(b.savings,0) + coalesce(b.earned_from_group,0) - coalesce(b.pending_charges,0) > 0
                          then coalesce(b.savings,0) + coalesce(b.earned_from_group,0) - coalesce(b.pending_charges,0)
                          else 0 end),0)
    into v_total_share_amount
  from public.member_dashboard_balances b
  where b.group_id = p_group_id;

  if v_total_share_amount > 0 then
    v_share_percent := round((coalesce(v_share_amount,0) / v_total_share_amount) * 100, 2)::numeric;
  else
    v_share_percent := 0;
  end if;

  return query
  select
    v_savings as savings,
    v_collected_in_period as collected_in_period,
    v_share_amount as share_amount,
    v_loan_balance as loan_balance,
    v_next_minimum_due as next_minimum_due,
    v_share_percent as share_percent,
    v_validation_savings as validation_savings,
    v_validation_collected_in_period as validation_collected_in_period,
    v_validation_share_amount as validation_share_amount,
    v_validation_loan_balance as validation_loan_balance,
    v_validation_next_minimum_due as validation_next_minimum_due,
    v_validation_share_percent as validation_share_percent;
end;
$$;

grant execute on function public.rpc_member_dashboard_card_summary(integer, integer, date) to authenticated;
