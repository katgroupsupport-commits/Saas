-- Migration: member-based pending dues with saving, principal, interest, penalty, minimum and maximum due
-- Date: 2026-08-03

drop function if exists public.rpc_pending_dues(integer, integer, date);
drop function if exists public.rpc_pending_dues(bigint, bigint, date);

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
  minimum_due numeric,
  maximum_due numeric,
  total_due numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_as_of_date date := coalesce(p_as_of_date, current_date);
  v_due_day integer := 1;
  v_due_date date;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for pending dues' using errcode = '42501';
  end if;

  select coalesce(gs.loan_due_day, 1)
    into v_due_day
  from public.group_setup gs
  where gs.group_id = p_group_id
  limit 1;

  v_due_date := make_date(
    extract(year from v_as_of_date)::integer,
    extract(month from v_as_of_date)::integer,
    least(28, greatest(1, coalesce(v_due_day, 1)))
  );

  if v_due_date < v_as_of_date then
    v_due_date := (v_due_date + interval '1 month')::date;
  end if;

  return query
  with member_candidates as (
    select
      m.member_id,
      coalesce(m.member_name, m.username, m.email, m.member_id::text) as member_name
    from public.members m
    where m.group_id = p_group_id
      and upper(coalesce(m.status, '')) <> 'INACTIVE'
      and (p_member_id is null or m.member_id = p_member_id)
  ),
  setup_values as (
    select
      mc.member_id,
      mc.member_name,
      coalesce(gs.monthly_saving_amount, 0)::numeric as group_saving_due,
      nullif(gs.loan_tenure_months, 0)::integer as group_tenure_months,
      coalesce(ms.custom_saving_amount, 0)::numeric as member_saving_due,
      nullif(ms.loan_tenure_months, 0)::integer as member_tenure_months,
      coalesce(b.outstanding_loan, 0)::numeric as outstanding_loan,
      coalesce(b.outstanding_interest, 0)::numeric as outstanding_interest,
      coalesce(b.pending_charges, 0)::numeric as pending_charges
    from member_candidates mc
    left join public.group_setup gs on gs.group_id = p_group_id
    left join public.member_setup ms on ms.member_id = mc.member_id
    left join public.member_dashboard_balances b
      on b.group_id = p_group_id and b.member_id = mc.member_id
  )
  select
    sv.member_id,
    sv.member_name,
    v_due_date as due_date,
    (case when sv.member_saving_due > 0 then sv.member_saving_due else sv.group_saving_due end)::numeric as saving_due,
    (
      case
        when sv.outstanding_loan > 0 then
          case
            when coalesce(sv.member_tenure_months, sv.group_tenure_months) > 0 then
              least(
                sv.outstanding_loan,
                greatest(
                  0,
                  sv.outstanding_loan / nullif(coalesce(sv.member_tenure_months, sv.group_tenure_months), 0)
                )
              )
            else
              sv.outstanding_loan
          end
        else 0
      end
    )::numeric as principal_due,
    sv.outstanding_interest::numeric as interest_due,
    sv.pending_charges::numeric as penalty_due,
    (
      (case when sv.member_saving_due > 0 then sv.member_saving_due else sv.group_saving_due end)::numeric
      + sv.outstanding_interest::numeric
      + sv.pending_charges::numeric
      + (
        case
          when sv.outstanding_loan > 0 then
            case
              when coalesce(sv.member_tenure_months, sv.group_tenure_months) > 0 then
                least(
                  sv.outstanding_loan,
                  greatest(
                    0,
                    sv.outstanding_loan / nullif(coalesce(sv.member_tenure_months, sv.group_tenure_months), 0)
                  )
                )
              else
                sv.outstanding_loan
            end
          else 0
        end
      )::numeric
    )::numeric as minimum_due,
    (
      (case when sv.member_saving_due > 0 then sv.member_saving_due else sv.group_saving_due end)::numeric
      + sv.outstanding_interest::numeric
      + sv.pending_charges::numeric
      + sv.outstanding_loan::numeric
    )::numeric as maximum_due,
    (
      (case when sv.member_saving_due > 0 then sv.member_saving_due else sv.group_saving_due end)::numeric
      + sv.outstanding_interest::numeric
      + sv.pending_charges::numeric
      + (
        case
          when sv.outstanding_loan > 0 then
            case
              when coalesce(sv.member_tenure_months, sv.group_tenure_months) > 0 then
                least(
                  sv.outstanding_loan,
                  greatest(
                    0,
                    sv.outstanding_loan / nullif(coalesce(sv.member_tenure_months, sv.group_tenure_months), 0)
                  )
                )
              else
                sv.outstanding_loan
            end
          else 0
        end
      )::numeric
    )::numeric as total_due
  from setup_values sv
  where (
    coalesce(sv.outstanding_loan, 0) > 0
    or coalesce(sv.outstanding_interest, 0) > 0
    or coalesce(sv.pending_charges, 0) > 0
    or coalesce((case when sv.member_saving_due > 0 then sv.member_saving_due else sv.group_saving_due end), 0) > 0
  )
  order by sv.member_name, sv.member_id;
end;
$$;

grant execute on function public.rpc_pending_dues(bigint, bigint, date) to authenticated;
