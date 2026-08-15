-- Group-level summary RPCs.
-- These are intended to replace the React-side dashboard and finance-summary calculations.

create or replace function public.rpc_group_finance_summary(
  p_group_id bigint,
  p_period_id bigint default null,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start date;
  v_period_end date;
  v_total_savings numeric := 0;
  v_total_active_loan numeric := 0;
  v_total_expenses numeric := 0;
  v_group_gain numeric := 0;
  v_monthly_savings numeric := 0;
  v_monthly_principal numeric := 0;
  v_monthly_interest numeric := 0;
  v_monthly_penalty numeric := 0;
  v_monthly_withdrawn numeric := 0;
  v_monthly_collections numeric := 0;
  v_monthly_loan_disbursed numeric := 0;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for group finance summary' using errcode = '42501';
  end if;

  if p_period_id is not null then
    select start_date, end_date
    into v_period_start, v_period_end
    from public.periods
    where period_id = p_period_id and group_id = p_group_id;
  else
    v_period_start := date_trunc('month', p_as_of_date)::date;
    v_period_end := (date_trunc('month', p_as_of_date) + interval '1 month - 1 day')::date;
  end if;

  v_total_savings := public._sum_completed_ledger_lines(p_group_id, null, 'SAVING', null, p_as_of_date);

  select coalesce(sum(outstanding_principal), 0)
  into v_total_active_loan
  from public.loan_distribution
  where group_id = p_group_id
    and upper(loan_status) = 'ACTIVE';

  select coalesce(sum(total_amount), 0)
  into v_total_expenses
  from public.group_expense_header
  where group_id = p_group_id
    and upper(approval_status) in ('APPROVED', 'COMPLETED');

  select coalesce(sum(amount), 0)
  into v_group_gain
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and tll.line_type in ('LOAN_INTEREST', 'PENALTY');

  select coalesce(sum(case when tll.line_type = 'SAVING' then tll.amount else 0 end), 0)
  into v_monthly_savings
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  select coalesce(sum(case when tll.line_type = 'LOAN_PRINCIPAL' then tll.amount else 0 end), 0)
  into v_monthly_principal
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  select coalesce(sum(case when tll.line_type = 'LOAN_INTEREST' then tll.amount else 0 end), 0)
  into v_monthly_interest
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  select coalesce(sum(case when tll.line_type = 'PENALTY' then tll.amount else 0 end), 0)
  into v_monthly_penalty
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  select coalesce(sum(abs(tll.amount)), 0)
  into v_monthly_withdrawn
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and upper(coalesce(tlh.trx_type, '')) = 'WITHDRAWAL'
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  v_monthly_collections := v_monthly_savings + v_monthly_principal + v_monthly_interest + v_monthly_penalty - v_monthly_withdrawn;

  select coalesce(sum(distributed_amount), 0)
  into v_monthly_loan_disbursed
  from public.loan_distribution
  where group_id = p_group_id
    and distribution_date between v_period_start and v_period_end
    and upper(loan_status) in ('ACTIVE', 'APPROVED', 'COMPLETED');

  return jsonb_build_object(
    'group_id', p_group_id,
    'total_savings', v_total_savings,
    'total_active_loan', v_total_active_loan,
    'total_expenses', v_total_expenses,
    'group_gain', v_group_gain,
    'remaining_balance', v_total_savings + v_group_gain - v_total_active_loan - v_total_expenses,
    'monthly_savings', v_monthly_savings,
    'monthly_principal', v_monthly_principal,
    'monthly_interest', v_monthly_interest,
    'monthly_penalty', v_monthly_penalty,
    'monthly_withdrawn', v_monthly_withdrawn,
    'monthly_collections', v_monthly_collections,
    'monthly_loan_disbursed', v_monthly_loan_disbursed
  );
end;
$$;

grant execute on function public.rpc_group_finance_summary(bigint, bigint, date) to authenticated;

create or replace function public.rpc_member_finance_summary(
  p_group_id bigint,
  p_member_id bigint,
  p_period_id bigint default null,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start date;
  v_period_end date;
  v_savings numeric := 0;
  v_outstanding numeric := 0;
  v_total_group_gain numeric := 0;
  v_active_member_count numeric := 0;
  v_gain numeric := 0;
  v_expense numeric := 0;
  v_share_amount numeric := 0;
  v_total_share_amount numeric := 0;
  v_share_percent numeric := 0;
  v_monthly_savings numeric := 0;
  v_monthly_principal numeric := 0;
  v_monthly_interest numeric := 0;
  v_monthly_penalty numeric := 0;
  v_monthly_withdrawn numeric := 0;
  v_monthly_collections numeric := 0;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for member finance summary' using errcode = '42501';
  end if;

  if p_period_id is not null then
    select start_date, end_date
    into v_period_start, v_period_end
    from public.periods
    where period_id = p_period_id and group_id = p_group_id;
  else
    v_period_start := date_trunc('month', p_as_of_date)::date;
    v_period_end := (date_trunc('month', p_as_of_date) + interval '1 month - 1 day')::date;
  end if;

  v_savings := public._sum_completed_ledger_lines(p_group_id, p_member_id, 'SAVING', null, p_as_of_date);
  v_outstanding := coalesce((
    select sum(outstanding_principal + outstanding_interest + outstanding_penalty)
    from public.loan_distribution
    where group_id = p_group_id
      and member_id = p_member_id
      and upper(loan_status) = 'ACTIVE'
  ), 0);

  select coalesce(sum(amount), 0)
  into v_total_group_gain
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and tll.line_type in ('LOAN_INTEREST', 'PENALTY');

  select count(*)::numeric
  into v_active_member_count
  from public.members m
  where m.group_id = p_group_id
    and upper(coalesce(m.status, '')) <> 'INACTIVE';

  if v_active_member_count <= 0 then
    v_active_member_count := 1;
  end if;

  v_gain := round(v_total_group_gain / v_active_member_count, 2);

  select coalesce(sum(abs(mth.total_amount)), 0)
  into v_expense
  from public.member_transaction_header mth
  where mth.group_id = p_group_id
    and mth.member_id = p_member_id
    and upper(coalesce(mth.trx_type, '')) = 'GROUP EXPENSE SHARE'
    and upper(coalesce(mth.approval_status, '')) in ('COMPLETED', 'APPROVED');

  v_share_amount := v_savings + v_gain - v_expense;

  select coalesce(sum(case when member_share_amount > 0 then member_share_amount else 0 end), 0)
  into v_total_share_amount
  from (
    select
      m.member_id,
      coalesce(
        public._sum_completed_ledger_lines(p_group_id, m.member_id, 'SAVING', null, p_as_of_date),
        0
      )
      + v_gain
      - coalesce(
        abs(
          (
            select sum(mth.total_amount)
            from public.member_transaction_header mth
            where mth.group_id = p_group_id
              and mth.member_id = m.member_id
              and upper(coalesce(mth.trx_type, '')) = 'GROUP EXPENSE SHARE'
              and upper(coalesce(mth.approval_status, '')) in ('COMPLETED', 'APPROVED')
          )
        ),
        0
      ) as member_share_amount
    from public.members m
    where m.group_id = p_group_id and upper(coalesce(m.status, '')) <> 'INACTIVE'
  ) members;

  v_share_percent := case when v_total_share_amount > 0 then round((case when v_share_amount > 0 then v_share_amount else 0 end) / nullif(v_total_share_amount, 0) * 100, 2) else 0 end;

  select coalesce(sum(case when tll.line_type = 'SAVING' then tll.amount else 0 end), 0)
  into v_monthly_savings
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and tlh.member_id = p_member_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  select coalesce(sum(case when tll.line_type = 'LOAN_PRINCIPAL' then tll.amount else 0 end), 0)
  into v_monthly_principal
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and tlh.member_id = p_member_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  select coalesce(sum(case when tll.line_type = 'LOAN_INTEREST' then tll.amount else 0 end), 0)
  into v_monthly_interest
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and tlh.member_id = p_member_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  select coalesce(sum(case when tll.line_type = 'PENALTY' then tll.amount else 0 end), 0)
  into v_monthly_penalty
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and tlh.member_id = p_member_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  select coalesce(sum(abs(tll.amount)), 0)
  into v_monthly_withdrawn
  from public.member_transaction_lines tll
  join public.member_transaction_header tlh on tlh.member_trx_id = tll.member_trx_id
  where tlh.group_id = p_group_id
    and tlh.member_id = p_member_id
    and upper(coalesce(tlh.approval_status, '')) in ('COMPLETED', 'APPROVED')
    and upper(coalesce(tlh.trx_type, '')) = 'WITHDRAWAL'
    and (
      (p_period_id is not null and tlh.period_id = p_period_id)
      or (p_period_id is null and tlh.trx_date between v_period_start and v_period_end)
    );

  v_monthly_collections := v_monthly_savings + v_monthly_principal + v_monthly_interest + v_monthly_penalty - v_monthly_withdrawn;

  return jsonb_build_object(
    'group_id', p_group_id,
    'member_id', p_member_id,
    'savings', v_savings,
    'outstanding', v_outstanding,
    'gain', v_gain,
    'expense', v_expense,
    'share_amount', v_share_amount,
    'share_percent', v_share_percent,
    'monthly_savings', v_monthly_savings,
    'monthly_principal', v_monthly_principal,
    'monthly_interest', v_monthly_interest,
    'monthly_penalty', v_monthly_penalty,
    'monthly_withdrawn', v_monthly_withdrawn,
    'monthly_collections', v_monthly_collections
  );
end;
$$;

grant execute on function public.rpc_member_finance_summary(bigint, bigint, bigint, date) to authenticated;
