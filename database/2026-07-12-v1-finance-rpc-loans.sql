-- Loan and due-date RPCs.
-- Keep the pending-due wheel server-side so React requests only read a single payload.

drop function if exists public.rpc_pending_dues(bigint, bigint, date);

create or replace function public.rpc_member_loan_interest_due(
  p_group_id bigint,
  p_member_id bigint,
  p_as_of_date date default current_date
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interest_due numeric := 0;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for loan interest due' using errcode = '42501';
  end if;

  select coalesce(sum(outstanding_interest), 0)
  into v_interest_due
  from public.loan_distribution
  where group_id = p_group_id
    and member_id = p_member_id
    and upper(loan_status) = 'ACTIVE';

  return coalesce(v_interest_due, 0);
end;
$$;

grant execute on function public.rpc_member_loan_interest_due(bigint, bigint, date) to authenticated;

create or replace function public.rpc_pending_dues(
  p_group_id bigint,
  p_member_id bigint default null,
  p_as_of_date date default current_date
)
returns table (
  member_id bigint,
  member_name text,
  due_date date,
  saving_due numeric,
  principal_due numeric,
  interest_due numeric,
  penalty_due numeric,
  total_due numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for pending dues' using errcode = '42501';
  end if;

  return query
  select
    m.member_id as member_id,
    coalesce(m.member_name, m.member_id::text) as member_name,
    coalesce((select max(p.end_date) from public.periods p where p.group_id = p_group_id), p_as_of_date) as due_date,
    0::numeric as saving_due,
    coalesce(ld.outstanding_principal, 0)::numeric as principal_due,
    coalesce(ld.outstanding_interest, 0)::numeric as interest_due,
    coalesce(ld.outstanding_penalty, 0)::numeric as penalty_due,
    (coalesce(ld.outstanding_principal, 0) + coalesce(ld.outstanding_interest, 0) + coalesce(ld.outstanding_penalty, 0))::numeric as total_due
  from public.members m
  left join public.loan_distribution ld
    on ld.group_id = m.group_id
   and ld.member_id = m.member_id
   and upper(ld.loan_status) = 'ACTIVE'
  where m.group_id = p_group_id
    and upper(coalesce(m.status, '')) <> 'INACTIVE'
    and (p_member_id is null or m.member_id = p_member_id)
    and (
      ld.loan_id is not null
      or coalesce(ld.outstanding_principal, 0) > 0
    );
end;
$$;

grant execute on function public.rpc_pending_dues(bigint, bigint, date) to authenticated;
