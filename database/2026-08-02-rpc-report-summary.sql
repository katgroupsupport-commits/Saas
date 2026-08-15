-- Migration: add report summary RPC used by the client repository
-- Date: 2026-08-02

create or replace function public.rpc_get_report_summary(
  p_group_id integer,
  p_member_id integer default null,
  p_start_date date default null,
  p_end_date date default null,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
as $$
declare
  v_group record;
  v_member_rows jsonb;
  v_group_row jsonb;
  v_start_date date := coalesce(p_start_date, date_trunc('month', coalesce(p_as_of_date, current_date))::date);
  v_end_date date := coalesce(p_end_date, coalesce(p_as_of_date, current_date));
begin
  select g.group_id, g.group_name into v_group
  from public.groups g
  where g.group_id = p_group_id;

  if not found then
    return jsonb_build_object('group_summary', '[]'::jsonb, 'member_summary', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row order by row->>'member_name'), '[]'::jsonb)
    into v_member_rows
  from (
    select jsonb_build_object(
      'member_id', m.member_id,
      'member_name', coalesce(m.member_name, m.username, ''),
      'username', coalesce(m.username, ''),
      'status', case when upper(coalesce(m.status, '')) = 'ACTIVE' then 'Active' else coalesce(m.status, 'Inactive') end,
      'collected', coalesce(sum(case when h.trx_date between v_start_date and v_end_date then coalesce(h.total_amount, 0) else 0 end), 0),
      'savings', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and l.line_type = 'SAVING' then l.amount else 0 end), 0),
      'gain', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Share Distribution' then coalesce(h.total_amount, 0) else 0 end), 0),
      'expense', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Group Expense Share' then coalesce(h.total_amount, 0) else 0 end), 0),
      'share_amount', coalesce(sum(case when h.trx_date between v_start_date and v_end_date then (case when l.line_type = 'SAVING' then l.amount else 0 end) + (case when h.trx_type = 'Share Distribution' then coalesce(h.total_amount, 0) else 0 end) - (case when h.trx_type = 'Group Expense Share' then coalesce(h.total_amount, 0) else 0 end) else 0 end), 0),
      'loan_count', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Loan Disbursement' then 1 else 0 end), 0),
      'principal_outstanding', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Loan Disbursement' then coalesce(h.total_amount, 0) else 0 end), 0),
      'interest_due', 0,
      'penalty_due', 0,
      'next_emi_amount', 0,
      'next_due_date', null,
      'total_loan_balance', 0,
      'withdrawn', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Withdrawal' then coalesce(h.total_amount, 0) else 0 end), 0)
    ) as row
    from public.members m
    left join public.member_transaction_header h on h.group_id = m.group_id and h.member_id = m.member_id
    left join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
    where m.group_id = p_group_id
      and (p_member_id is null or m.member_id = p_member_id)
    group by m.member_id, m.member_name, m.username, m.status
  ) row;

  select jsonb_build_object(
    'group_name', v_group.group_name,
    'member_count', coalesce(jsonb_array_length(v_member_rows), 0),
    'collected', coalesce(sum((row->>'collected')::numeric), 0),
    'savings', coalesce(sum((row->>'savings')::numeric), 0),
    'gain', coalesce(sum((row->>'gain')::numeric), 0),
    'expenses', coalesce(sum((row->>'expense')::numeric), 0),
    'remaining', coalesce(sum((row->>'share_amount')::numeric), 0),
    'loan_count', coalesce(sum((row->>'loan_count')::numeric), 0),
    'loan_balance', coalesce(sum((row->>'principal_outstanding')::numeric), 0),
    'interest_due', coalesce(sum((row->>'interest_due')::numeric), 0),
    'penalty_due', coalesce(sum((row->>'penalty_due')::numeric), 0),
    'share_amount', coalesce(sum((row->>'share_amount')::numeric), 0),
    'withdrawn', coalesce(sum((row->>'withdrawn')::numeric), 0)
  )
    into v_group_row
  from jsonb_array_elements(coalesce(v_member_rows, '[]'::jsonb)) as row;

  return jsonb_build_object(
    'group_summary', jsonb_build_array(coalesce(v_group_row, jsonb_build_object('group_name', v_group.group_name, 'member_count', 0, 'collected', 0, 'savings', 0, 'gain', 0, 'expenses', 0, 'remaining', 0, 'loan_count', 0, 'loan_balance', 0, 'interest_due', 0, 'penalty_due', 0, 'share_amount', 0, 'withdrawn', 0))),
    'member_summary', coalesce(v_member_rows, '[]'::jsonb)
  );
end; $$;

grant execute on function public.rpc_get_report_summary(integer, integer, date, date, date) to authenticated;
