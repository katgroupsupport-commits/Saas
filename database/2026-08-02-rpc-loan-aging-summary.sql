-- Migration: add loan aging / EMI due RPC used by the client member summary
-- Date: 2026-08-02

create or replace function public.rpc_loan_aging_summary(
  p_group_id integer,
  p_member_id integer,
  p_as_of_date date default current_date
)
returns table(
  member_id integer,
  outstanding_principal numeric,
  overdue_days integer,
  next_due_amount numeric,
  due_date date,
  repayment_status text
)
language plpgsql
as $$
declare
  v_as_of_date date := coalesce(p_as_of_date, current_date);
  v_due_day integer := 1;
  v_due_date date;
  v_next_due_amount numeric := 0;
  v_overdue_days integer := 0;
  v_repayment_status text := 'UP_TO_DATE';
begin
  select coalesce(g.loan_due_day, 1)
    into v_due_day
  from public.groups g
  where g.group_id = p_group_id
  limit 1;

  v_due_date := make_date(
    extract(year from v_as_of_date)::integer,
    extract(month from v_as_of_date)::integer,
    least(28, greatest(1, v_due_day))
  );

  if v_due_date < v_as_of_date then
    v_due_date := (v_due_date + interval '1 month')::date;
  end if;

  return query
  select
    b.member_id,
    coalesce(b.outstanding_loan, 0) as outstanding_principal,
    case
      when coalesce(b.outstanding_loan, 0) + coalesce(b.outstanding_interest, 0) + coalesce(b.pending_charges, 0) > 0 and v_due_date < v_as_of_date
        then v_as_of_date - v_due_date
      else 0
    end::integer as overdue_days,
    coalesce(b.outstanding_loan, 0) + coalesce(b.outstanding_interest, 0) + coalesce(b.pending_charges, 0) as next_due_amount,
    v_due_date as due_date,
    case
      when coalesce(b.outstanding_loan, 0) + coalesce(b.outstanding_interest, 0) + coalesce(b.pending_charges, 0) > 0 and v_due_date < v_as_of_date
        then 'OVERDUE'
      else 'UP_TO_DATE'
    end as repayment_status
  from public.member_dashboard_balances b
  where b.group_id = p_group_id
    and b.member_id = p_member_id;
end; $$;

grant execute on function public.rpc_loan_aging_summary(integer, integer, date) to authenticated;
