create or replace function public.decide_approval(
  target_approval_id bigint,
  decision_status varchar,
  decision_remarks varchar default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval approvals%rowtype;
  v_batch_id varchar(80);
  v_reference_type varchar(40);
  v_reference_id bigint;
  v_pending_count integer;
  v_rejected_count integer;
  v_result text := 'decision_saved';
  v_request loan_requests%rowtype;
  v_interest_rate numeric(8,2) := 0;
begin
  select *
  into v_approval
  from public.approvals
  where approval_id = target_approval_id
  for update;

  if not found then
    raise exception 'Approval % not found', target_approval_id;
  end if;

  update public.approvals
  set approval_status = upper(decision_status),
      approval_date = current_date,
      remarks = coalesce(decision_remarks, remarks),
      last_update_date = now()
  where approval_id = target_approval_id
  returning approval_batch_id, reference_type, reference_id
  into v_batch_id, v_reference_type, v_reference_id;

  if upper(decision_status) in ('REJECTED', 'RETURNED') then
    if v_reference_type = 'transaction' then
      update public.member_transaction_header
      set approval_status = upper(decision_status), last_update_date = now()
      where member_trx_id = v_reference_id;
    elsif v_reference_type = 'loan_request' then
      update public.loan_requests
      set approval_status = upper(decision_status), status = upper(decision_status), last_update_date = now()
      where loan_request_id = v_reference_id;
    elsif v_reference_type = 'expense' then
      update public.group_expense_header
      set approval_status = upper(decision_status), last_update_date = now()
      where group_expense_id = v_reference_id;

      update public.member_transaction_header
      set approval_status = upper(decision_status), last_update_date = now()
      where trx_type = 'Group Expense Share'
        and remarks = 'Expense share for expense ' || v_reference_id;
    end if;

    return jsonb_build_object('status', lower(decision_status), 'reference_type', v_reference_type, 'reference_id', v_reference_id);
  end if;

  select count(*)
  into v_pending_count
  from public.approvals
  where approval_batch_id = v_batch_id
    and upper(approval_status) <> 'APPROVED';

  select count(*)
  into v_rejected_count
  from public.approvals
  where approval_batch_id = v_batch_id
    and upper(approval_status) in ('REJECTED', 'RETURNED');

  if v_pending_count = 0 and v_rejected_count = 0 then
    if v_reference_type = 'transaction' then
      update public.member_transaction_header
      set approval_status = 'COMPLETED', last_update_date = now()
      where member_trx_id = v_reference_id;

      perform public.distribute_share_for_transaction(v_reference_id);
      v_result := 'transaction_completed';
    elsif v_reference_type = 'loan_request' then
      select *
      into v_request
      from public.loan_requests
      where loan_request_id = v_reference_id
      for update;

      if not found then
        raise exception 'Loan request % not found', v_reference_id;
      end if;

      select coalesce(gs.interest_rate, 0)
      into v_interest_rate
      from public.group_setup gs
      where gs.group_id = v_request.group_id;

      update public.loan_requests
      set approval_status = 'APPROVED', status = 'APPROVED', last_update_date = now()
      where loan_request_id = v_reference_id;

      insert into public.loan_distribution (
        loan_number, loan_request_id, group_id, member_id, distributed_amount,
        interest_rate, distribution_date, outstanding_principal, outstanding_interest,
        loan_status, created_by, last_updated_by
      )
      select
        'LN-' || to_char(current_date, 'YYYYMMDD') || '-' || v_reference_id,
        v_request.loan_request_id, v_request.group_id, v_request.member_id,
        v_request.requested_amount, coalesce(v_interest_rate, 0), current_date,
        v_request.requested_amount, 0, 'ACTIVE', v_request.created_by, v_request.last_updated_by
      where not exists (
        select 1 from public.loan_distribution ld where ld.loan_request_id = v_request.loan_request_id
      );

      v_result := 'loan_activated';
    elsif v_reference_type = 'expense' then
      update public.group_expense_header
      set approval_status = 'COMPLETED', last_update_date = now()
      where group_expense_id = v_reference_id;

      update public.member_transaction_header
      set approval_status = 'COMPLETED', last_update_date = now()
      where trx_type = 'Group Expense Share'
        and remarks = 'Expense share for expense ' || v_reference_id;

      v_result := 'expense_completed';
    end if;
  end if;

  return jsonb_build_object('status', v_result, 'reference_type', v_reference_type, 'reference_id', v_reference_id);
end;
$$;

grant execute on function public.decide_approval(bigint, varchar, varchar) to authenticated;

drop view if exists public.group_dashboard_balances cascade;

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
  coalesce(sum(trx.amount) filter (where trx.line_type in ('SAVING','LOAN_INTEREST','PENALTY','OTHER','CHARGES') and trx.trx_type <> 'Group Expense Share'), 0)
    - coalesce(sum(trx.amount) filter (where trx.line_type in ('LOAN_DISTRIBUTION','WITHDRAWAL')), 0)
    - coalesce(e.group_expenses, 0) as remaining_balance
from public.groups g
left join trx on trx.group_id = g.group_id
left join shares s on s.group_id = g.group_id
left join share_adj sa on sa.group_id = g.group_id
left join expenses e on e.group_id = g.group_id
group by g.group_id, s.share_distribution_amount, sa.share_adjustment_amount, e.group_expenses;
