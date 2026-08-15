-- Migration: add RPC functions used by the client repository
-- Date: 2026-07-25

/*
  This file adds a set of Postgres functions (RPCs) that the client-side
  `repository` expects to exist on Supabase. Functions are intentionally
  conservative and rely on existing tables/views referenced elsewhere in
  the project (auth_users, members, member_dashboard_balances, loan_distribution,
  approvals, share_distribution, member_transaction_header).

  Review and adapt these implementations to match your precise business rules.
*/

-- 1) Check whether an email is registered in auth_users or members
create or replace function public.email_registered(check_email text)
returns boolean language plpgsql as $$
declare
  found boolean := false;
begin
  if check_email is null then
    return false;
  end if;

  select exists(
    select 1 from auth_users au where lower(au.email) = lower(check_email)
  ) into found;
  if found then
    return true;
  end if;

  select exists(
    select 1 from members m where lower(m.email) = lower(check_email)
  ) into found;

  return coalesce(found, false);
end; $$;


-- 2) Resolve a login identifier to an email (tries auth_users.email, members.username, members.email)
create or replace function public.resolve_login_email(login_identifier text)
returns text language plpgsql as $$
declare
  out_email text := null;
begin
  if login_identifier is null then
    return null;
  end if;

  select au.email into out_email from auth_users au
  where lower(au.email) = lower(login_identifier)
  limit 1;
  if out_email is not null then return out_email; end if;

  select m.email into out_email from members m
  where lower(m.username) = lower(login_identifier)
  limit 1;
  if out_email is not null then return out_email; end if;

  select m.email into out_email from members m
  where lower(m.email) = lower(login_identifier)
  limit 1;
  return out_email;
end; $$;


-- 3) Group finance summary RPC returning server-computed metrics used by the app shell
drop function if exists public.rpc_group_finance_summary(bigint, bigint, date);
drop function if exists public.rpc_group_finance_summary(integer, integer, date);
create or replace function public.rpc_group_finance_summary(p_group_id integer, p_period_id integer, p_as_of_date date)
returns table(
  total_savings numeric,
  total_active_loan numeric,
  total_expenses numeric,
  group_gain numeric,
  remaining_balance numeric,
  monthly_savings numeric,
  monthly_principal numeric,
  monthly_interest numeric,
  monthly_penalty numeric,
  monthly_withdrawn numeric,
  monthly_collections numeric,
  monthly_loan_disbursed numeric
) language plpgsql as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_as_of_date, current_date))::date;
  v_month_end date := (date_trunc('month', coalesce(p_as_of_date, current_date)) + interval '1 month - 1 day')::date;
  v_total_savings numeric;
  v_total_active_loan numeric;
  v_total_expenses numeric;
  v_group_gain numeric;
  v_remaining_balance numeric;
begin
  select coalesce(sum(b.savings),0)
    into v_total_savings
  from member_dashboard_balances b
  where b.group_id = p_group_id;

  select coalesce(sum(b.outstanding_loan),0)
    into v_total_active_loan
  from member_dashboard_balances b
  where b.group_id = p_group_id;

  select coalesce(sum(geh.total_amount),0)
    into v_total_expenses
  from group_expense_header geh
  where geh.group_id = p_group_id
    and upper(coalesce(geh.approval_status, 'PENDING')) in ('COMPLETED', 'APPROVED');

  select coalesce(sum(coalesce(b.earned_from_group,0)),0)
    into v_group_gain
  from member_dashboard_balances b
  where b.group_id = p_group_id;

  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for group finance summary' using errcode = '42501';
  end if;

  v_remaining_balance := v_total_savings + v_group_gain - v_total_active_loan - v_total_expenses;

  return query
  select
    v_total_savings as total_savings,
    v_total_active_loan as total_active_loan,
    v_total_expenses as total_expenses,
    v_group_gain as group_gain,
    v_remaining_balance as remaining_balance,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then l.amount else 0 end) filter (where l.line_type = 'SAVING'),0) as monthly_savings,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then l.amount else 0 end) filter (where l.line_type = 'LOAN_PRINCIPAL'),0) as monthly_principal,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then l.amount else 0 end) filter (where l.line_type = 'LOAN_INTEREST'),0) as monthly_interest,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then l.amount else 0 end) filter (where l.line_type = 'PENALTY'),0) as monthly_penalty,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and h.trx_type = 'Withdrawal' then coalesce(h.total_amount,0) else 0 end),0) as monthly_withdrawn,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then coalesce(h.total_amount,0) else 0 end),0) as monthly_collections,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and h.trx_type = 'Loan Disbursement' then coalesce(h.total_amount,0) else 0 end),0) as monthly_loan_disbursed
  from member_transaction_header h
  left join member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where h.group_id = p_group_id
    and upper(coalesce(h.approval_status,'PENDING')) in ('COMPLETED','APPROVED');
end; $$;


-- 4) Member finance summary RPC returning the summary fields used by the UI
drop function if exists public.rpc_member_finance_summary(bigint, bigint, bigint, date);
drop function if exists public.rpc_member_finance_summary(integer, integer, integer, date);
create or replace function public.rpc_member_finance_summary(p_group_id integer, p_member_id integer, p_period_id integer, p_as_of_date date)
returns table(
  member_id integer,
  savings numeric,
  outstanding numeric,
  gain numeric,
  expense numeric,
  share_amount numeric,
  share_percent numeric,
  monthly_savings numeric,
  monthly_principal numeric,
  monthly_interest numeric,
  monthly_penalty numeric,
  monthly_withdrawn numeric,
  monthly_collections numeric
) language plpgsql as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_as_of_date, current_date))::date;
  v_month_end date := (date_trunc('month', coalesce(p_as_of_date, current_date)) + interval '1 month - 1 day')::date;
  v_total_share numeric;
  v_member_share numeric;
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for member finance summary' using errcode = '42501';
  end if;

  select coalesce(sum(coalesce(b.earned_from_group,0)),0)
    into v_total_share
  from member_dashboard_balances b
  where b.group_id = p_group_id;

  select coalesce(b.savings,0), coalesce(b.outstanding_loan,0), coalesce(b.earned_from_group,0), coalesce(b.pending_charges,0)
    into v_member_share, v_member_share, v_member_share, v_member_share
  from member_dashboard_balances b
  where b.group_id = p_group_id and b.member_id = p_member_id
  limit 1;

  if v_total_share is null then
    v_total_share := 0;
  end if;

  return query
  select
    b.member_id,
    coalesce(b.savings,0) as savings,
    coalesce(b.outstanding_loan,0) as outstanding,
    coalesce(b.earned_from_group,0) as gain,
    coalesce(b.pending_charges,0) as expense,
    coalesce(b.savings,0) + coalesce(b.earned_from_group,0) - coalesce(b.pending_charges,0) as share_amount,
    case when v_total_share > 0 then ((coalesce(b.savings,0) + coalesce(b.earned_from_group,0) - coalesce(b.pending_charges,0)) / v_total_share) else 0 end as share_percent,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then l.amount else 0 end) filter (where l.line_type = 'SAVING'),0) as monthly_savings,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then l.amount else 0 end) filter (where l.line_type = 'LOAN_PRINCIPAL'),0) as monthly_principal,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then l.amount else 0 end) filter (where l.line_type = 'LOAN_INTEREST'),0) as monthly_interest,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then l.amount else 0 end) filter (where l.line_type = 'PENALTY'),0) as monthly_penalty,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end and h.trx_type = 'Withdrawal' then coalesce(h.total_amount,0) else 0 end),0) as monthly_withdrawn,
    coalesce(sum(case when h.trx_date between v_month_start and v_month_end then coalesce(h.total_amount,0) else 0 end),0) as monthly_collections
  from member_dashboard_balances b
  left join member_transaction_header h on h.group_id = b.group_id and h.member_id = b.member_id
  left join member_transaction_lines l on l.member_trx_id = h.member_trx_id
  where b.group_id = p_group_id
    and b.member_id = p_member_id
  group by b.member_id, b.savings, b.outstanding_loan, b.earned_from_group, b.pending_charges;
end; $$;


-- 5) Pending dues RPC: returns rows for members with outstanding loan or pending charges
drop function if exists public.rpc_pending_dues(bigint, bigint, date);
drop function if exists public.rpc_pending_dues(integer, integer, date);
create or replace function public.rpc_pending_dues(p_group_id integer, p_member_id integer default null, p_as_of_date date default current_date)
returns table(member_id integer, member_name text, outstanding_loan numeric, pending_charges numeric, interest_due numeric, penalty_due numeric) language plpgsql as $$
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for pending dues' using errcode = '42501';
  end if;

  return query
  select
    m.member_id,
    coalesce(m.member_name, m.username, '') as member_name,
    coalesce(b.outstanding_loan,0) as outstanding_loan,
    coalesce(b.pending_charges,0) as pending_charges,
    coalesce(b.outstanding_interest,0) as interest_due,
    coalesce(b.pending_charges,0) as penalty_due
  from member_dashboard_balances b
  join members m on m.member_id = b.member_id
  where b.group_id = p_group_id
    and (p_member_id is null or b.member_id = p_member_id)
    and (coalesce(b.outstanding_loan,0) <> 0 or coalesce(b.pending_charges,0) <> 0 or coalesce(b.outstanding_interest,0) <> 0)
  order by coalesce(b.outstanding_loan,0) desc;
end; $$;


-- 6) Member share distribution RPC using server-computed balances
drop function if exists public.rpc_member_share_distribution(bigint, numeric, date);
drop function if exists public.rpc_member_share_distribution(integer, numeric, date);
create or replace function public.rpc_member_share_distribution(p_group_id integer, p_payout_pool numeric default 0, p_reference_date date default current_date)
returns table(member_id integer, member_name text, share_amount numeric) language plpgsql as $$
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for share distribution' using errcode = '42501';
  end if;

  return query
  select
    m.member_id,
    coalesce(m.member_name, m.username, '') as member_name,
    coalesce(ms.earned_from_group,0) as share_amount
  from members m
  left join member_dashboard_balances ms on ms.member_id = m.member_id and ms.group_id = p_group_id
  where m.group_id = p_group_id
  order by share_amount desc;
end; $$;

grant execute on function public.rpc_member_share_distribution(integer, numeric, date) to authenticated;

-- 7) Decide approval: updates an approval row and records the decision
create or replace function public.decide_approval(target_approval_id integer, decision_status text, decision_remarks text)
returns table(approval_id integer, approval_status text) language plpgsql as $$
declare
  upd record;
begin
  update approvals a
  set approval_status = upper(decision_status), remarks = coalesce(decision_remarks, remarks), last_updated_by = null
  where a.approval_id = target_approval_id
  returning approval_id, approval_status into upd;

  if upd is null then
    return; -- no rows
  end if;

  return query select upd.approval_id, upd.approval_status;
end; $$;


-- 8) Distribute share for transaction: lightweight placeholder that inserts a row in share_distribution
create or replace function public.distribute_share_for_transaction(target_trx_id integer)
returns void language plpgsql as $$
declare
  hdr record;
begin
  select member_trx_id as id, group_id, member_id, total_amount into hdr from member_transaction_header where member_trx_id = target_trx_id limit 1;
  if hdr is null then return; end if;

  -- Insert a small distribution record so the UI can pick it up; real logic should be implemented properly
  insert into share_distribution(group_id, member_id, distribution_date, amount, created_by, last_updated_by)
  values (hdr.group_id, hdr.member_id, current_date, 0, null, null);
  return;
end; $$;

-- Mark functions as safe to be called via RPC (Supabase typically exposes functions in public schema)

-- ===== Additional RPCs: create/update groups, members, transactions, approvals, withdrawals, loans, expenses =====

-- Helper: resolve current app user_id from auth.uid()
create or replace function public.current_app_user_id()
returns integer language plpgsql stable as $$
declare
  uid text := auth.uid();
  app_id integer;
begin
  if uid is null then return null; end if;
  select user_id into app_id from auth_users where supabase_user_id = uid limit 1;
  return app_id;
end; $$;


-- Create group with initial setup and an admin member for the creator
create or replace function public.rpc_create_group(p_payload jsonb)
returns table(group_id integer, group_name text) language plpgsql as $$
declare
  creator integer := public.current_app_user_id();
  grp record;
  mem record;
  setup jsonb := p_payload->'setup';
  monthly numeric := (p_payload->>'monthlySaving')::numeric;
begin
  insert into groups(group_name, primary_contact_name, mobile_number, email, status, created_by, last_updated_by)
  values (
    coalesce(p_payload->>'name', p_payload->>'group_name'),
    coalesce(p_payload->>'primaryContact', p_payload->>'primaryContactName', ''),
    p_payload->>'mobile',
    p_payload->>'email',
    'ACTIVE',
    creator,
    creator
  ) returning group_id, group_name into grp;

  insert into group_setup(group_id, monthly_saving_amount, interest_rate, interest_type, penalty_amount, loan_limit, auto_approve_flag, loan_tenure_months, loan_due_day, approver_names, admin_names, created_by, last_updated_by)
  values (grp.group_id, monthly, null, coalesce(setup->>'interestType','Reducing'), null, null, 'N', null, null, '{}'::text[], '{}'::text[], creator, creator);

  -- insert initial periods: previous, current, next
  with months as (
    select generate_series(-1,1) as m_offset
  )
  insert into periods(group_id, period_name, start_date, end_date, status, created_by, last_updated_by)
  select grp.group_id,
    to_char((date_trunc('month', current_date) + (m_offset * interval '1 month')),'TMMonth YYYY'),
    (date_trunc('month', current_date) + (m_offset * interval '1 month'))::date,
    (date_trunc('month', current_date) + (m_offset * interval '1 month') + interval '1 month - 1 day')::date,
    case when m_offset <= 0 then 'CLOSED' else 'FUTURE' end,
    creator, creator
  from months;

  -- create member record for creator
  insert into members(group_id, member_name, username, mobile_number, email, join_date, status, created_by, last_updated_by)
  values (grp.group_id, coalesce((select username from auth_users where user_id = creator limit 1), 'Creator'),
    concat('creator_', grp.group_id), (select mobile_number from auth_users where user_id = creator limit 1), (select email from auth_users where user_id = creator limit 1), current_date, 'ACTIVE', creator, creator)
  returning member_id into mem;

  -- link auth_users to member if possible
  update auth_users set member_id = mem.member_id where user_id = creator;

  return query select grp.group_id, grp.group_name;
end; $$;


-- Create member (simple wrapper that inserts into members and member_setup)
create or replace function public.rpc_create_member(p_payload jsonb)
returns table(member_id integer, username text, member_name text) language plpgsql as $$
declare
  creator integer := public.current_app_user_id();
  r record;
begin
  insert into members(group_id, role_id, member_name, username, mobile_number, email, join_date, status, created_by, last_updated_by)
  values (
    (p_payload->>'groupId')::integer,
    null,
    coalesce(p_payload->>'fullName', p_payload->>'member_name'),
    p_payload->>'username',
    p_payload->>'mobile',
    p_payload->>'email',
    coalesce((p_payload->>'dateJoined')::date, current_date),
    case when lower(coalesce(p_payload->>'status','active')) = 'inactive' then 'INACTIVE' else 'ACTIVE' end,
    creator, creator
  ) returning member_id, username, member_name into r;

  insert into member_setup(member_id, custom_saving_amount, loan_limit, loan_tenure_months, interest_rate, interest_type, active_flag, created_by, last_updated_by)
  values (r.member_id, null, null, null, null, null, 'Y', creator, creator)
  on conflict (member_id) do nothing;

  return query select r.member_id, r.username, r.member_name;
end; $$;


-- Create transaction (header + lines). Expects JSON: {groupId, memberId, periodId, transactionDate, transactionType, allocation: {savings:..., principal:...}, approvalStatus}
create or replace function public.rpc_create_transaction(p_payload jsonb)
returns table(member_trx_id integer, trx_number text, total_amount numeric) language plpgsql as $$
declare
  creator integer := public.current_app_user_id();
  hdr record;
  allocation jsonb := coalesce(p_payload->'allocation', jsonb_build_object('savings', (p_payload->>'amount')::numeric));
  amount numeric := coalesce((p_payload->>'amount')::numeric, 0);
begin
  if creator is null then raise exception 'unauthenticated'; end if;

  insert into member_transaction_header(trx_number, group_id, member_id, period_id, trx_date, trx_type, total_amount, approval_status, parent_trx_id, adjustment_flag, reversed_flag, remarks, created_by, last_updated_by)
  values (
    coalesce(p_payload->>'transactionNumber', concat('TRX-', to_char(current_timestamp,'YYYYMMDD'), '-', (floor(random()*1000000))::text)),
    (p_payload->>'groupId')::integer,
    (p_payload->>'memberId')::integer,
    case when p_payload->>'periodId' is null then null else (p_payload->>'periodId')::integer end,
    coalesce((p_payload->>'transactionDate')::date, current_date),
    coalesce(p_payload->>'transactionType','Savings Collection'),
    amount,
    upper(coalesce(p_payload->>'approvalStatus','PENDING')),
    null, 'N', 'N', coalesce(p_payload->>'remarks',''), creator, creator
  ) returning member_trx_id, trx_number, total_amount into hdr;

  -- insert lines
  if jsonb_typeof(allocation) = 'object' then
    insert into member_transaction_lines(member_trx_id, line_type, amount, remarks, created_by, last_updated_by)
    select hdr.member_trx_id,
      case when e.key = 'savings' then 'SAVING' when e.key = 'principal' then 'LOAN_PRINCIPAL' when e.key = 'interest' then 'LOAN_INTEREST' when e.key = 'penalty' then 'PENALTY' else 'OTHER' end,
      (e.value::text)::numeric,
      coalesce(p_payload->>'remarks',''), creator, creator
    from jsonb_each(allocation) as e(key, value)
    where (e.value::text)::numeric <> 0;
  end if;

  if upper(coalesce(p_payload->>'approvalStatus','PENDING')) in ('COMPLETED','APPROVED') then
    perform public.distribute_share_for_transaction(hdr.member_trx_id);
  end if;

  return query select hdr.member_trx_id, hdr.trx_number, hdr.total_amount;
end; $$;


-- Create approval requests in bulk. Accepts JSON array of approvals and inserts rows.
create or replace function public.rpc_create_approval_requests(p_group_id integer, p_approvals jsonb)
returns table(approval_id integer, amount numeric) language plpgsql as $$
declare
  creator integer := public.current_app_user_id();
  row jsonb;
  inserted record;
begin
  if p_approvals is null then return; end if;
  for row in select * from jsonb_array_elements(p_approvals) loop
    insert into approvals(group_id, approval_batch_id, transaction_type, reference_type, reference_id, approver_member_id, requester_name, approver_name, amount, approval_status, remarks, created_by, last_updated_by)
    values (
      p_group_id,
      (row->>'batchId')::text,
      row->>'action',
      row->>'referenceType',
      case when (row->>'referenceId') is null then null else (row->>'referenceId')::integer end,
      case when (row->>'approverId') is null then null else (row->>'approverId')::integer end,
      row->>'requester',
      row->>'approverName',
      coalesce((row->>'amount')::numeric,0),
      'PENDING',
      coalesce(row->>'details', row->>'remarks',''),
      creator, creator
    ) returning approval_id, amount into inserted;
    return query select inserted.approval_id, inserted.amount;
  end loop;
end; $$;


-- Simple create withdrawal request
create or replace function public.rpc_create_withdrawal_request(p_payload jsonb)
returns table(withdrawal_request_id integer, request_number text, requested_amount numeric) language plpgsql as $$
declare
  creator integer := public.current_app_user_id();
  hdr record;
begin
  insert into withdrawal_requests(request_number, group_id, member_id, requested_amount, request_date, reason, status, approval_status, created_by, last_updated_by)
  values (coalesce(p_payload->>'requestNumber', concat('WR-', to_char(current_timestamp,'YYYYMMDD'), '-', (floor(random()*1000000))::text)),
    (p_payload->>'groupId')::integer,
    (p_payload->>'memberId')::integer,
    coalesce((p_payload->>'amount')::numeric,0),
    coalesce((p_payload->>'requestDate')::date, current_date),
    p_payload->>'reason', 'REQUESTED', upper(coalesce(p_payload->>'approvalStatus','PENDING')),
    creator, creator)
  returning withdrawal_request_id, request_number, requested_amount into hdr;
  return query select hdr.withdrawal_request_id, hdr.request_number, hdr.requested_amount;
end; $$;


-- Create loan request
create or replace function public.rpc_create_loan_request(p_payload jsonb)
returns table(loan_request_id integer, request_number text, requested_amount numeric) language plpgsql as $$
declare
  creator integer := public.current_app_user_id();
  r record;
begin
  insert into loan_requests(request_number, group_id, member_id, requested_amount, requested_months, purpose, request_date, status, approval_status, created_by, last_updated_by)
  values (coalesce(p_payload->>'requestNumber', concat('LR-', to_char(current_timestamp,'YYYYMMDD'), '-', (floor(random()*1000000))::text)),
    (p_payload->>'groupId')::integer,
    (p_payload->>'memberId')::integer,
    coalesce((p_payload->>'amount')::numeric,0),
    case when (p_payload->>'durationMonths') is null then null else (p_payload->>'durationMonths')::integer end,
    p_payload->>'reason', coalesce((p_payload->>'startDate')::date, current_date),
    'REQUESTED', upper(coalesce(p_payload->>'approvalStatus','PENDING')),
    creator, creator)
  returning loan_request_id, request_number, requested_amount into r;
  return query select r.loan_request_id, r.request_number, r.requested_amount;
end; $$;


-- Save legacy group opening
create or replace function public.rpc_save_legacy_group_opening(p_payload jsonb)
returns table(legacy_group_opening_id integer, group_id integer) language plpgsql as $$
declare
  creator integer := public.current_app_user_id();
  r record;
begin
  insert into legacy_group_opening(group_id, migration_date, opening_bank_balance, opening_group_expense, opening_group_gain, approval_status, remarks, created_by, last_updated_by)
  values ((p_payload->>'groupId')::integer, coalesce((p_payload->>'migrationDate')::date, current_date), coalesce((p_payload->>'openingBankBalance')::numeric,0), coalesce((p_payload->>'openingGroupExpense')::numeric,0), coalesce((p_payload->>'openingGroupGain')::numeric,0), upper(coalesce(p_payload->>'approvalStatus','COMPLETED')), p_payload->>'remarks', creator, creator)
  returning legacy_group_opening_id, group_id into r;
  return query select r.legacy_group_opening_id, r.group_id;
end; $$;

-- Conservative RPC stubs for client-side repository fallbacks

create or replace function public.rpc_update_group(p_group_id integer, p_updates jsonb)
returns table(group_id integer, group_name text) language plpgsql security definer as $$
declare
  updater integer := public.current_app_user_id();
  g record;
begin
  update groups set
    group_name = coalesce(p_updates->>'name', p_updates->>'group_name', group_name),
    mobile_number = coalesce(p_updates->>'mobile', mobile_number),
    email = coalesce(p_updates->>'email', email),
    last_updated_by = updater
  where group_id = p_group_id
  returning group_id, group_name into g;
  if not found then return; end if;
  return query select g.group_id, g.group_name;
end; $$;

create or replace function public.rpc_update_member(p_member_id integer, p_updates jsonb)
returns table(member_id integer, username text, member_name text) language plpgsql security definer as $$
declare
  updater integer := public.current_app_user_id();
  m record;
begin
  update members set
    member_name = coalesce(p_updates->>'member_name', p_updates->>'fullName', member_name),
    username = coalesce(p_updates->>'username', username),
    mobile_number = coalesce(p_updates->>'mobile', mobile_number),
    email = coalesce(p_updates->>'email', email),
    exit_date = case when (p_updates->>'exit_date') is null then exit_date else (p_updates->>'exit_date')::date end,
    status = coalesce(p_updates->>'status', status),
    last_updated_by = updater
  where member_id = p_member_id
  returning member_id, username, member_name into m;
  if not found then return; end if;
  return query select m.member_id, m.username, m.member_name;
end; $$;

create or replace function public.rpc_create_group_expense(p_payload jsonb)
returns table(header jsonb, lines jsonb) language plpgsql security definer as $$
declare
  hdr record;
  inserted_lines jsonb := '[]'::jsonb;
  l jsonb;
begin
  insert into group_expense_header(expense_number, group_id, period_id, expense_date, expense_type, total_amount, payment_mode, approval_status, remarks, created_by, last_updated_by)
  values (
    coalesce(p_payload->>'expenseNumber', concat('EXP-', to_char(current_timestamp,'YYYYMMDD'), '-', (floor(random()*1000000))::text)),
    (p_payload->>'groupId')::integer,
    case when p_payload->>'periodId' is null then null else (p_payload->>'periodId')::integer end,
    (p_payload->>'expenseDate')::date,
    coalesce(p_payload->>'expenseType','Group Expense'),
    coalesce((p_payload->>'amount')::numeric,0),
    coalesce(p_payload->>'paymentMode','Cash'),
    upper(coalesce(p_payload->>'approvalStatus','PENDING')),
    coalesce(p_payload->>'remarks',''),
    public.current_app_user_id(), public.current_app_user_id()
  ) returning group_expense_id into hdr;

  if p_payload ? 'lines' then
    for l in select * from jsonb_array_elements(p_payload->'lines') loop
      insert into group_expense_lines(group_expense_id, expense_category, amount, remarks, created_by, last_updated_by)
      values (hdr.group_expense_id, coalesce(l->>'category', 'General'), coalesce((l->>'amount')::numeric,0), coalesce(l->>'remarks',''), public.current_app_user_id(), public.current_app_user_id());
    end loop;
  end if;

  select to_jsonb(hdr.*) into hdr from group_expense_header hdr where hdr.group_expense_id = hdr.group_expense_id;
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into inserted_lines from group_expense_lines l where l.group_expense_id = hdr.group_expense_id;
  return query select hdr::jsonb as header, inserted_lines as lines;
end; $$;

create or replace function public.rpc_create_pending_setup_change(p_payload jsonb)
returns table(setup_change_id integer, group_id integer, status text) language plpgsql security definer as $$
declare
  r record;
begin
  insert into pending_setup_changes(group_id, approval_batch_id, setup_type, target_id, target_name, payload, old_value, change_summary, status, created_by, last_updated_by)
  values (
    (p_payload->>'groupId')::integer,
    p_payload->>'batchId',
    p_payload->>'setupType',
    case when p_payload->>'targetId' is null then null else (p_payload->>'targetId')::integer end,
    p_payload->>'targetName',
    coalesce(p_payload->'payload','{}'::jsonb),
    coalesce(p_payload->'oldValue','{}'::jsonb),
    coalesce(p_payload->>'changeSummary',''),
    'PENDING', public.current_app_user_id(), public.current_app_user_id()
  ) returning setup_change_id, group_id, status into r;
  return query select r.setup_change_id, r.group_id, r.status;
end; $$;

create or replace function public.rpc_update_pending_setup_change_status(p_change_id integer, p_status text)
returns table(setup_change_id integer, status text) language plpgsql security definer as $$
declare
  r record;
begin
  update pending_setup_changes set status = upper(p_status), last_updated_by = public.current_app_user_id() where setup_change_id = p_change_id returning setup_change_id, status into r;
  if not found then return; end if;
  return query select r.setup_change_id, r.status;
end; $$;

create or replace function public.rpc_create_legacy_import(p_payload jsonb)
returns table(legacy_id integer, group_id integer, member_id integer, migration_date date) language plpgsql security definer as $$
declare
  hdr record;
  v_savings numeric := coalesce((p_payload->>'savings')::numeric, 0);
  v_principal numeric := coalesce((p_payload->>'principal')::numeric, 0);
  v_interest numeric := coalesce((p_payload->>'interest')::numeric, 0);
  v_penalty numeric := coalesce((p_payload->>'penalty')::numeric, 0);
begin
  insert into member_transaction_header(trx_number, group_id, member_id, period_id, trx_date, trx_type, total_amount, approval_status, remarks, created_by, last_updated_by)
  values (coalesce(p_payload->>'transactionNumber', concat('MIG-', to_char(current_timestamp,'YYYYMMDD'), '-', (floor(random()*1000000))::text)), (p_payload->>'groupId')::integer, (p_payload->>'memberId')::integer, case when p_payload->>'periodId' is null then null else (p_payload->>'periodId')::integer end, coalesce((p_payload->>'transactionDate')::date, current_date), 'Migrated', coalesce((p_payload->>'amount')::numeric, v_savings), upper(coalesce(p_payload->>'approvalStatus','COMPLETED')), coalesce(p_payload->>'remarks',''), public.current_app_user_id(), public.current_app_user_id())
  returning member_trx_id into hdr;

  if v_savings <> 0 then
    insert into member_transaction_lines(member_trx_id, line_type, amount, remarks, created_by, last_updated_by) values (hdr.member_trx_id, 'SAVING', v_savings, 'Legacy import', public.current_app_user_id(), public.current_app_user_id());
  end if;
  if v_principal <> 0 then
    insert into member_transaction_lines(member_trx_id, line_type, amount, remarks, created_by, last_updated_by) values (hdr.member_trx_id, 'LOAN_PRINCIPAL', v_principal, 'Legacy import', public.current_app_user_id(), public.current_app_user_id());
  end if;
  if v_interest <> 0 then
    insert into member_transaction_lines(member_trx_id, line_type, amount, remarks, created_by, last_updated_by) values (hdr.member_trx_id, 'LOAN_INTEREST', v_interest, 'Legacy import', public.current_app_user_id(), public.current_app_user_id());
  end if;
  if v_penalty <> 0 then
    insert into member_transaction_lines(member_trx_id, line_type, amount, remarks, created_by, last_updated_by) values (hdr.member_trx_id, 'PENALTY', v_penalty, 'Legacy import', public.current_app_user_id(), public.current_app_user_id());
  end if;
  return query select hdr.member_trx_id, (p_payload->>'groupId')::integer, (p_payload->>'memberId')::integer, coalesce((p_payload->>'transactionDate')::date, current_date);
end; $$;

create or replace function public.rpc_delete_member(p_member_id integer)
returns table(member_id integer, username text) language plpgsql security definer as $$
declare r record; begin
  delete from members where member_id = p_member_id returning member_id, username into r;
  if not found then return; end if;
  return query select r.member_id, r.username;
end; $$;

create or replace function public.rpc_update_legacy_group_opening_status(p_id integer, p_status text)
returns table(legacy_group_opening_id integer, approval_status text) language plpgsql security definer as $$
declare r record; begin
  update legacy_group_opening set approval_status = upper(p_status), last_updated_by = public.current_app_user_id() where legacy_group_opening_id = p_id returning legacy_group_opening_id, approval_status into r;
  if not found then return; end if;
  return query select r.legacy_group_opening_id, r.approval_status;
end; $$;

create or replace function public.rpc_update_legacy_import(p_id integer, p_changes jsonb)
returns table(legacy_id integer, legacy_saving_balance numeric) language plpgsql security definer as $$
declare
  upd jsonb := p_changes;
  r record;
begin
  update legacy_data set
    legacy_saving_balance = coalesce((upd->>'legacy_saving_balance')::numeric, legacy_saving_balance),
    legacy_loan_outstanding = coalesce((upd->>'legacy_loan_outstanding')::numeric, legacy_loan_outstanding),
    legacy_interest_balance = coalesce((upd->>'legacy_interest_balance')::numeric, legacy_interest_balance),
    legacy_bank_balance = coalesce((upd->>'legacy_bank_balance')::numeric, legacy_bank_balance),
    remarks = coalesce(upd->>'remarks', remarks),
    last_updated_by = public.current_app_user_id()
  where legacy_id = p_id
  returning legacy_id, legacy_saving_balance into r;
  if not found then return; end if;
  return query select r.legacy_id, r.legacy_saving_balance;
end; $$;

create or replace function public.rpc_create_audit_log(p_payload jsonb)
returns table(trx_id integer, action_type text) language plpgsql security definer as $$
declare r record; begin
  insert into trx_audit_history(trx_id, action_type, old_value, new_value, changed_by, created_by, last_updated_by)
  values ((p_payload->>'recordId')::integer, p_payload->>'action', p_payload->>'oldValue', p_payload->>'newValue', p_payload->>'changedBy', public.current_app_user_id(), public.current_app_user_id())
  returning trx_id, action_type into r;
  return query select r.trx_id, r.action_type;
end; $$;

create or replace function public.rpc_create_support_dispute(p_payload jsonb)
returns table(dispute_id integer, status text) language plpgsql security definer as $$
declare r record; begin
  insert into support_disputes(group_id, member_id, group_name, member_name, contact_number, issue, attachment_name, attachment_data, status, created_by, last_updated_by)
  values ((p_payload->>'groupId')::integer, (p_payload->>'memberId')::integer, p_payload->>'groupName', p_payload->>'memberName', p_payload->>'contactNumber', p_payload->>'issue', p_payload->>'attachmentName', p_payload->>'attachmentData', 'OPEN', public.current_app_user_id(), public.current_app_user_id())
  returning dispute_id, status into r;
  return query select r.dispute_id, r.status;
end; $$;

create or replace function public.rpc_reply_support_dispute(p_dispute_id integer, p_owner_reply text)
returns table(dispute_id integer, status text) language plpgsql security definer as $$
declare r record; begin
  update support_disputes set owner_reply = p_owner_reply, status = 'REPLIED', last_updated_by = public.current_app_user_id() where dispute_id = p_dispute_id returning dispute_id, status into r;
  if not found then return; end if;
  return query select r.dispute_id, r.status;
end; $$;

