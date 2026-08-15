-- Migration: add approval summary RPC used by the approvals screen
-- Date: 2026-08-02

create or replace function public.rpc_get_approval_summary(
  p_group_id integer,
  p_approver_member_id integer default null,
  p_status text default null,
  p_reference_type text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_counts jsonb;
  v_pending_rows jsonb;
  v_batch_rows jsonb;
begin
  select jsonb_build_object(
    'pending_count', count(*) filter (where upper(coalesce(approval_status, 'PENDING')) = 'PENDING'),
    'approved_count', count(*) filter (where upper(coalesce(approval_status, 'PENDING')) = 'APPROVED'),
    'rejected_count', count(*) filter (where upper(coalesce(approval_status, 'PENDING')) = 'REJECTED'),
    'returned_count', count(*) filter (where upper(coalesce(approval_status, 'PENDING')) = 'RETURNED')
  )
    into v_counts
  from public.approvals a
  where a.group_id = p_group_id
    and (p_approver_member_id is null or a.approver_member_id = p_approver_member_id)
    and (p_status is null or upper(coalesce(a.approval_status, 'PENDING')) = upper(p_status))
    and (p_reference_type is null or upper(coalesce(a.reference_type, '')) = upper(p_reference_type));

  select coalesce(jsonb_agg(to_jsonb(row) order by row->>'created_at' desc), '[]'::jsonb)
    into v_pending_rows
  from (
    select
      a.approval_id as id,
      a.group_id,
      a.approval_batch_id as batch_id,
      a.reference_id,
      a.reference_type,
      a.transaction_type as action,
      coalesce(a.requester_name, a.created_by) as requester,
      a.approver_member_id,
      a.approver_name,
      (case
        when upper(coalesce(a.approval_status, 'PENDING')) = 'APPROVED' then 'Approved'
        when upper(coalesce(a.approval_status, 'PENDING')) = 'REJECTED' then 'Rejected'
        when upper(coalesce(a.approval_status, 'PENDING')) = 'RETURNED' then 'Returned'
        else 'Pending'
      end) as status,
      a.amount,
      a.remarks,
      a.remarks as details,
      a.creation_date as created_at,
      coalesce(
        (
          select string_agg(distinct coalesce(x.approver_name, 'Approver'), ', ' order by coalesce(x.approver_name, 'Approver'))
          from public.approvals x
          where x.approval_batch_id = a.approval_batch_id
            and upper(coalesce(x.approval_status, 'PENDING')) = 'PENDING'
        ),
        'No pending approver'
      ) as pending_with
    from public.approvals a
    where a.group_id = p_group_id
      and (p_approver_member_id is null or a.approver_member_id = p_approver_member_id)
      and (p_status is null or upper(coalesce(a.approval_status, 'PENDING')) = upper(p_status))
      and (p_reference_type is null or upper(coalesce(a.reference_type, '')) = upper(p_reference_type))
  ) row;

  select coalesce(jsonb_agg(to_jsonb(row) order by row->>'batch_id'), '[]'::jsonb)
    into v_batch_rows
  from (
    select
      a.approval_batch_id as batch_id,
      count(*) as approval_count,
      count(*) filter (where upper(coalesce(a.approval_status, 'PENDING')) = 'PENDING') as pending_count,
      count(*) filter (where upper(coalesce(a.approval_status, 'PENDING')) = 'APPROVED') as approved_count,
      count(*) filter (where upper(coalesce(a.approval_status, 'PENDING')) = 'REJECTED') as rejected_count,
      count(*) filter (where upper(coalesce(a.approval_status, 'PENDING')) = 'RETURNED') as returned_count
    from public.approvals a
    where a.group_id = p_group_id
      and (p_approver_member_id is null or a.approver_member_id = p_approver_member_id)
      and (p_reference_type is null or upper(coalesce(a.reference_type, '')) = upper(p_reference_type))
    group by a.approval_batch_id
  ) row;

  return jsonb_build_object(
    'counts', v_counts,
    'pending_rows', v_pending_rows,
    'batch_rows', v_batch_rows
  );
end; $$;

grant execute on function public.rpc_get_approval_summary(integer, integer, text, text) to authenticated;
