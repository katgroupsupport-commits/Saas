-- Loan approvals must activate the loan on the requested start date, not the
-- database server's current date. The dashboard maps loan_distribution.
-- distribution_date to loan.startDate, so using current_date makes EMI
-- interest start from approval day.

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
  v_loan_start_date date;
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
    update public.approvals
    set approval_status = upper(decision_status),
        approval_date = current_date,
        remarks = coalesce(remarks, 'Closed because one approver ' || lower(decision_status) || ' this request.'),
        last_update_date = now()
    where approval_batch_id = v_batch_id
      and upper(approval_status) = 'PENDING';

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
    elsif v_reference_type = 'legacy_group_opening' then
      update public.legacy_group_opening
      set approval_status = upper(decision_status), last_update_date = now()
      where legacy_group_opening_id = v_reference_id;
    elsif v_reference_type = 'withdrawal_request' then
      update public.withdrawal_requests
      set approval_status = upper(decision_status), status = upper(decision_status), last_update_date = now()
      where withdrawal_request_id = v_reference_id;
    elsif v_reference_type = 'member_addition' then
      update public.members
      set status = 'INACTIVE', exit_date = coalesce(exit_date, current_date), last_update_date = now()
      where member_id = v_reference_id;
    elsif v_reference_type in ('group_setup', 'member_setup') then
      update public.pending_setup_changes
      set status = upper(decision_status), last_update_date = now()
      where approval_batch_id = v_batch_id;
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

      v_loan_start_date := coalesce(v_request.request_date, current_date);

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
        'LN-' || to_char(v_loan_start_date, 'YYYYMMDD') || '-' || v_reference_id,
        v_request.loan_request_id, v_request.group_id, v_request.member_id,
        v_request.requested_amount, coalesce(v_interest_rate, 0), v_loan_start_date,
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
    elsif v_reference_type = 'legacy_group_opening' then
      update public.legacy_group_opening
      set approval_status = 'COMPLETED', last_update_date = now()
      where legacy_group_opening_id = v_reference_id;

      v_result := 'legacy_group_opening_completed';
    end if;
  end if;

  return jsonb_build_object('status', v_result, 'reference_type', v_reference_type, 'reference_id', v_reference_id);
end;
$$;

grant execute on function public.decide_approval(bigint, varchar, varchar) to authenticated;

update public.loan_distribution ld
set distribution_date = lr.request_date,
    loan_number = case
      when ld.loan_number is null or ld.loan_number like 'LN-%'
        then 'LN-' || to_char(coalesce(lr.request_date, ld.distribution_date), 'YYYYMMDD') || '-' || lr.loan_request_id
      else ld.loan_number
    end,
    last_update_date = now()
from public.loan_requests lr
where ld.loan_request_id = lr.loan_request_id
  and lr.request_date is not null
  and ld.distribution_date <> lr.request_date;
