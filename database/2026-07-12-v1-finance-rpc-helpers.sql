-- Shared helpers for server-side finance calculations.
-- These helpers preserve the current tenancy model and keep group-level access checks centralized.

create or replace function public._ensure_group_member_access(p_group_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.group_id = p_group_id
      and m.member_id in (
        select au.member_id
        from public.auth_users au
        where au.supabase_user_id = coalesce(
          auth.uid(),
          case
            when current_setting('request.jwt.claims.sub', true) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then current_setting('request.jwt.claims.sub', true)::uuid
            else null
          end
        )
      )
  );
$$;

create or replace function public._sum_completed_ledger_lines(
  p_group_id bigint,
  p_member_id bigint default null,
  p_line_type text default null,
  p_period_id bigint default null,
  p_as_of_date date default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric := 0;
begin
  select coalesce(sum(tll.amount), 0)
  into v_total
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (p_member_id is null or tlh.member_id = p_member_id)
    and (p_line_type is null or tll.line_type = p_line_type)
    and (p_period_id is null or tlh.period_id = p_period_id)
    and (p_as_of_date is null or tlh.trx_date <= p_as_of_date);

  return coalesce(v_total, 0);
end;
$$;

grant execute on function public._ensure_group_member_access(bigint) to authenticated;
grant execute on function public._sum_completed_ledger_lines(bigint, bigint, text, bigint, date) to authenticated;
