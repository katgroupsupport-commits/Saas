-- Keeps member-level setup values blank by default so calculations inherit group setup values.
alter table public.member_setup
  alter column custom_saving_amount drop not null,
  alter column custom_saving_amount drop default,
  alter column loan_limit drop not null,
  alter column loan_limit drop default;

alter table public.member_setup
  alter column loan_tenure_months drop not null,
  alter column loan_tenure_months drop default,
  alter column interest_rate drop not null,
  alter column interest_rate drop default,
  alter column interest_type drop default;

update public.member_setup
set custom_saving_amount = null
where custom_saving_amount = 0;

update public.member_setup
set loan_limit = null
where loan_limit = 0;

update public.member_setup
set loan_tenure_months = null
where loan_tenure_months = 0;

update public.member_setup
set interest_rate = null
where interest_rate = 0;

-- Group-level legacy opening must participate in approval status tracking.
alter table public.legacy_group_opening
  add column if not exists approval_status varchar(30) not null default 'COMPLETED';

create index if not exists legacy_group_opening_group_status_idx
  on public.legacy_group_opening(group_id, approval_status, migration_date);

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
    elsif v_reference_type = 'legacy_group_opening' then
      update public.legacy_group_opening
      set approval_status = upper(decision_status), last_update_date = now()
      where legacy_group_opening_id = v_reference_id;
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
