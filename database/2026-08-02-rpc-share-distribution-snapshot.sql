-- Migration: add share distribution / payout snapshot RPC used by the client reports and monthly distribution screens
-- Date: 2026-08-02

create or replace function public.rpc_share_distribution_snapshot(
  p_group_id integer,
  p_reference_date date default current_date
)
returns table(
  member_id integer,
  member_name text,
  share_amount numeric,
  share_percent numeric,
  payout_status text,
  reference_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_share numeric := 0;
  v_reference_date date := coalesce(p_reference_date, current_date);
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for share distribution snapshot' using errcode = '42501';
  end if;

  select coalesce(sum(coalesce(b.earned_from_group, 0)), 0)
    into v_total_share
  from public.member_dashboard_balances b
  where b.group_id = p_group_id;

  return query
  select
    b.member_id,
    coalesce(m.member_name, m.username, '') as member_name,
    coalesce(b.earned_from_group, 0) as share_amount,
    case when v_total_share > 0 then (coalesce(b.earned_from_group, 0) / v_total_share) else 0 end as share_percent,
    case
      when exists (
        select 1
        from public.share_distribution sd
        where sd.group_id = p_group_id
          and sd.member_id = b.member_id
          and sd.distribution_date::date = v_reference_date
      ) then 'PAID'
      else 'PENDING'
    end as payout_status,
    v_reference_date as reference_date
  from public.member_dashboard_balances b
  join public.members m on m.member_id = b.member_id and m.group_id = b.group_id
  where b.group_id = p_group_id
  order by share_amount desc;
end; $$;

grant execute on function public.rpc_share_distribution_snapshot(integer, date) to authenticated;
