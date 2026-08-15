-- Share distribution RPCs.
-- These act as the database-side replacement for the React share-distribution helpers.

create or replace function public.rpc_member_share_distribution(
  p_group_id bigint,
  p_payout_pool numeric default 0,
  p_reference_date date default current_date
)
returns table (
  member_id bigint,
  member_name text,
  share_weight numeric,
  share_amount numeric,
  share_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_weight numeric := 0;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for share distribution' using errcode = '42501';
  end if;

  select count(*)::numeric
  into v_total_weight
  from public.members m
  where m.group_id = p_group_id and upper(coalesce(m.status, '')) <> 'INACTIVE';

  if v_total_weight <= 0 then
    v_total_weight := 1;
  end if;

  return query
  select
    m.member_id as member_id,
    coalesce(m.member_name, m.member_id::text) as member_name,
    1::numeric as share_weight,
    round((1 / nullif(v_total_weight, 0)) * nullif(p_payout_pool, 0), 2)::numeric as share_amount,
    round((1 / nullif(v_total_weight, 0)) * 100, 2)::numeric as share_percent
  from public.members m
  where m.group_id = p_group_id
    and upper(coalesce(m.status, '')) <> 'INACTIVE'
  order by member_name;
end;
$$;

grant execute on function public.rpc_member_share_distribution(bigint, numeric, date) to authenticated;
