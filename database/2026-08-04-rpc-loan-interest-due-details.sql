-- Migration: add RPC detail rows for per-loan interest due
-- Date: 2026-08-04

create or replace function public.rpc_member_loan_interest_due_details(
  p_group_id bigint,
  p_member_id bigint,
  p_as_of_date date default current_date
)
returns table (
  loan_id bigint,
  loan_number text,
  interest_rate numeric,
  outstanding_principal numeric,
  outstanding_interest numeric,
  outstanding_penalty numeric,
  interest_due numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for loan interest due details' using errcode = '42501';
  end if;

  return query
  select
    ld.loan_id,
    ld.loan_number,
    coalesce(ld.interest_rate, 0)::numeric as interest_rate,
    coalesce(ld.outstanding_principal, 0)::numeric as outstanding_principal,
    coalesce(ld.outstanding_interest, 0)::numeric as outstanding_interest,
    coalesce(ld.outstanding_penalty, 0)::numeric as outstanding_penalty,
    coalesce(ld.outstanding_interest, 0)::numeric as interest_due
  from public.loan_distribution ld
  where ld.group_id = p_group_id
    and ld.member_id = p_member_id
    and upper(ld.loan_status) = 'ACTIVE';
end;
$$;

grant execute on function public.rpc_member_loan_interest_due_details(bigint, bigint, date) to authenticated;
