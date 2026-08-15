-- Migration: add member collection report rows RPC for Supabase-backed report aggregation
-- Date: 2026-08-05

drop function if exists public.rpc_member_collection_report_rows(integer, integer, date, date, boolean, text);

create or replace function public.rpc_member_collection_report_rows(
  p_group_id integer,
  p_member_id integer default null,
  p_start_date date default null,
  p_end_date date default null,
  p_include_loan_columns boolean default false,
  p_period_label text default null
)
returns table(
  member_id bigint,
  member_name text,
  username text,
  status text,
  amount_collected numeric,
  saving numeric,
  principle_collected numeric,
  interest_collected numeric,
  penalty numeric,
  loan_repayments numeric,
  loan_outstanding numeric,
  period_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date := coalesce(p_start_date, date_trunc('month', current_date)::date);
  v_end_date date := coalesce(p_end_date, current_date);
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for member collection report rows' using errcode = '42501';
  end if;

  return query
  select
    m.member_id,
    coalesce(m.member_name, m.username, m.email, '') as member_name,
    coalesce(m.username, '') as username,
    case when upper(coalesce(m.status, '')) = 'ACTIVE' then 'Active' else coalesce(m.status, 'Inactive') end as status,
    coalesce(sum(
      case
        when upper(coalesce(h.trx_type, '')) = 'WITHDRAWAL' then -coalesce(h.total_amount, 0)
        when h.trx_date between v_start_date and v_end_date then coalesce(l.amount, 0)
        else 0
      end
    ), 0) as amount_collected,
    coalesce(sum(
      case
        when h.trx_date between v_start_date and v_end_date and upper(coalesce(l.line_type, '')) = 'SAVING' then coalesce(l.amount, 0)
        else 0
      end
    ), 0) as saving,
    coalesce(sum(
      case
        when h.trx_date between v_start_date and v_end_date and upper(coalesce(l.line_type, '')) = 'LOAN_PRINCIPAL' then coalesce(l.amount, 0)
        else 0
      end
    ), 0) as principle_collected,
    coalesce(sum(
      case
        when h.trx_date between v_start_date and v_end_date and upper(coalesce(l.line_type, '')) = 'LOAN_INTEREST' then coalesce(l.amount, 0)
        else 0
      end
    ), 0) as interest_collected,
    coalesce(sum(
      case
        when h.trx_date between v_start_date and v_end_date and upper(coalesce(l.line_type, '')) = 'PENALTY' then coalesce(l.amount, 0)
        else 0
      end
    ), 0) as penalty,
    coalesce(sum(
      case
        when h.trx_date between v_start_date and v_end_date and upper(coalesce(l.line_type, '')) in ('LOAN_PRINCIPAL', 'LOAN_INTEREST', 'PENALTY') then coalesce(l.amount, 0)
        else 0
      end
    ), 0) as loan_repayments,
    coalesce(b.outstanding_loan, 0) + coalesce(b.outstanding_interest, 0) + coalesce(b.pending_charges, 0) as loan_outstanding,
    p_period_label as period_label
  from public.members m
  left join public.member_dashboard_balances b on b.group_id = m.group_id and b.member_id = m.member_id
  left join public.member_transaction_header h on h.group_id = m.group_id and h.member_id = m.member_id
    and upper(coalesce(h.approval_status, 'PENDING')) in ('COMPLETED', 'APPROVED')
  left join public.member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where m.group_id = p_group_id
    and (p_member_id is null or m.member_id = p_member_id)
  group by m.member_id, m.member_name, m.username, m.status, b.outstanding_loan, b.outstanding_interest, b.pending_charges, p_period_label
  order by coalesce(m.member_name, m.username, '');
end;
$$;

grant execute on function public.rpc_member_collection_report_rows(integer, integer, date, date, boolean, text) to authenticated;
