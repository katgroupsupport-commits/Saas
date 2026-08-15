-- Migration: add range-based share distribution RPC for server-owned report range share calculations
-- Date: 2026-08-02

create or replace function public.rpc_share_distribution_range(
  p_group_id integer,
  p_start_date date default null,
  p_end_date date default current_date
)
returns table (
  member_id integer,
  member_name text,
  share_amount numeric,
  share_percent numeric,
  payout_status text,
  range_start date,
  range_end date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date := coalesce(p_start_date, p_end_date);
  v_end_date date := coalesce(p_end_date, current_date);
  v_total_share numeric := 0;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for share distribution range' using errcode = '42501';
  end if;

  with range_share as (
    select
      m.member_id,
      coalesce(sum(sd.distribution_amount), 0) as share_amount
    from public.members m
    left join public.share_distribution sd
      on sd.member_id = m.member_id
     and sd.distribution_date::date between v_start_date and v_end_date
    where m.group_id = p_group_id
    group by m.member_id
  )
  select coalesce(sum(share_amount), 0)
    into v_total_share
  from range_share;

  return query
  with range_share as (
    select
      m.member_id,
      coalesce(sum(sd.distribution_amount), 0) as share_amount
    from public.members m
    left join public.share_distribution sd
      on sd.member_id = m.member_id
     and sd.distribution_date::date between v_start_date and v_end_date
    where m.group_id = p_group_id
    group by m.member_id
  )
  select
    m.member_id,
    coalesce(m.member_name, m.username, '') as member_name,
    coalesce(rs.share_amount, 0) as share_amount,
    case
      when v_total_share > 0 then round((coalesce(rs.share_amount, 0) / v_total_share) * 100, 2)
      else 0
    end as share_percent,
    case
      when coalesce(rs.share_amount, 0) > 0 then 'PAID'
      else 'PENDING'
    end as payout_status,
    v_start_date as range_start,
    v_end_date as range_end
  from public.members m
  left join range_share rs on rs.member_id = m.member_id
  where m.group_id = p_group_id
  order by share_amount desc, member_name;
end;
$$;

grant execute on function public.rpc_share_distribution_range(integer, date, date) to authenticated;
