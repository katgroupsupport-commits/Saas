-- =============================================================================
-- Bachat Gat SaaS - XXFP_ packages: procedures, triggers, RLS and grants
-- Date: 2026-08-16
--
-- Re-points every write-path database function (RPC) from the v2 tables to the
-- new XXFP_ physical tables. Read-only RPCs keep working untouched through the
-- compatibility views created by the migrate-data file.
--
-- Oracle equivalents:
--   SECURITY DEFINER RPCs      -> definer-rights stored procedures
--   xxfp_doc_sequences         -> document numbering backbone (like Oracle sequences)
--   triggers                   -> database triggers / WHO columns
--   RLS policies               -> VPD (fine-grained access control)
-- =============================================================================

begin;

-- =============================================================================
-- 1. DOCUMENT NUMBERING  (Oracle sequence backbone)
-- =============================================================================
drop function if exists public.next_document_number(uuid, text);

create or replace function public.next_document_number(target_group_id bigint, target_document_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_prefix varchar(20);
begin
  insert into public.xxfp_doc_sequences (group_id, doc_type, last_number, prefix)
  values (target_group_id, upper(target_document_type), 1, upper(target_document_type))
  on conflict (group_id, doc_type)
  do update set last_number = public.xxfp_doc_sequences.last_number + 1,
                last_update_date = now()
  returning last_number into v_next;

  select prefix into v_prefix
  from public.xxfp_doc_sequences
  where group_id = target_group_id and doc_type = upper(target_document_type);

  return coalesce(v_prefix, upper(target_document_type)) || '-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.assign_transaction_number()
returns trigger
language plpgsql
as $$
begin
  if new.trx_number is null or trim(new.trx_number) = '' then
    new.trx_number := public.next_document_number(new.group_id, 'TRX');
  end if;
  return new;
end;
$$;

create or replace function public.assign_loan_number()
returns trigger
language plpgsql
as $$
begin
  if new.loan_number is null or trim(new.loan_number) = '' then
    new.loan_number := public.next_document_number(new.group_id, 'LOAN');
  end if;
  return new;
end;
$$;

create or replace function public.assign_expense_number()
returns trigger
language plpgsql
as $$
begin
  if new.expense_number is null or trim(new.expense_number) = '' then
    new.expense_number := public.next_document_number(new.group_id, 'EXP');
  end if;
  return new;
end;
$$;

drop trigger if exists xxfp_trx_header_assign_number on public.xxfp_trx_header;
create trigger xxfp_trx_header_assign_number
before insert on public.xxfp_trx_header
for each row execute function public.assign_transaction_number();

drop trigger if exists xxfp_loan_header_assign_number on public.xxfp_loan_header;
create trigger xxfp_loan_header_assign_number
before insert on public.xxfp_loan_header
for each row execute function public.assign_loan_number();

drop trigger if exists xxfp_group_expense_header_assign_number on public.xxfp_group_expense_header;
create trigger xxfp_group_expense_header_assign_number
before insert on public.xxfp_group_expense_header
for each row execute function public.assign_expense_number();

-- =============================================================================
-- 2. AUDIT / WHO TRIGGERS
-- =============================================================================
create or replace function public.xxfp_audit_financial_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Approved financial records cannot be deleted. Use reversal entries.';
  end if;

  if old.approval_status = 'APPROVED' and (
    old.total_amount is distinct from new.total_amount
    or old.trx_date is distinct from new.trx_date
    or old.trx_type is distinct from new.trx_type
    or old.member_id is distinct from new.member_id
  ) then
    raise exception 'Approved financial records cannot be edited. Use adjustment or reversal entries.';
  end if;

  insert into public.xxfp_audit_log (trx_id, action_type, old_value, new_value, changed_by, created_by, last_updated_by)
  values (old.member_trx_id, tg_op, row_to_json(old)::text, row_to_json(new)::text, auth.uid()::text, old.created_by, old.created_by);
  return new;
end;
$$;

drop trigger if exists xxfp_trx_header_guard on public.xxfp_trx_header;
create trigger xxfp_trx_header_guard
before update or delete on public.xxfp_trx_header
for each row execute function public.xxfp_audit_financial_change();

-- =============================================================================
-- 3. SHARE DISTRIBUTION ENGINE
-- =============================================================================
create or replace function public.active_member_ids(target_group_id bigint, earning_date date)
returns table(member_id bigint)
language sql
stable
set search_path = public
as $$
  select distinct msh.member_id
  from public.xxfp_member_status_history msh
  where msh.group_id = target_group_id
    and upper(msh.status) = 'ACTIVE'
    and msh.start_date <= earning_date
    and (msh.end_date is null or msh.end_date >= earning_date);
$$;

drop function if exists public.distribute_share_for_transaction(integer);
drop function if exists public.distribute_share_for_transaction(bigint);

create or replace function public.distribute_share_for_transaction(target_trx_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trx record;
  source record;
  active_count numeric;
begin
  select * into trx from public.xxfp_trx_header where member_trx_id = target_trx_id;
  if not found then return; end if;

  select count(*) into active_count from public.active_member_ids(trx.group_id, trx.trx_date);
  if active_count = 0 then return; end if;

  for source in
    select
      case
        when line_type = 'LOAN_INTEREST' then 'LOAN_INTEREST'
        when line_type = 'PENALTY' then 'PENALTY'
        else 'OTHER_INCOME'
      end as source_type,
      sum(amount) as amount
    from public.xxfp_trx_lines
    where member_trx_id = target_trx_id
      and line_type in ('LOAN_INTEREST', 'PENALTY', 'OTHER')
      and amount > 0
    group by 1
  loop
    insert into public.xxfp_share_distribution (
      earning_trx_id,
      member_id,
      distribution_amount,
      source_type,
      distribution_date,
      created_by,
      last_updated_by
    )
    select
      target_trx_id,
      am.member_id,
      round(source.amount / active_count, 2),
      source.source_type,
      trx.trx_date,
      trx.created_by,
      trx.created_by
    from public.active_member_ids(trx.group_id, trx.trx_date) am
    on conflict (earning_trx_id, member_id, source_type) do nothing;
  end loop;
end;
$$;

create or replace function public.xxfp_member_transaction_after_insert()
returns trigger
language plpgsql
as $$
begin
  if upper(new.approval_status) in ('COMPLETED', 'APPROVED') then
    perform public.distribute_share_for_transaction(new.member_trx_id);
  end if;

  insert into public.xxfp_audit_log (trx_id, action_type, new_value, changed_by, created_by, last_updated_by)
  values (new.member_trx_id, 'CREATE', row_to_json(new)::text, auth.uid()::text, new.created_by, new.created_by);
  return new;
end;
$$;

drop trigger if exists xxfp_member_transaction_after_insert on public.xxfp_trx_header;
create trigger xxfp_member_transaction_after_insert
after insert on public.xxfp_trx_header
for each row execute function public.xxfp_member_transaction_after_insert();

-- =============================================================================
-- 4. HELPERS
-- =============================================================================
create or replace function public.current_app_user_id()
returns integer
language plpgsql
stable
as $$
declare
  uid text := auth.uid();
  app_id integer;
begin
  if uid is null then return null; end if;
  select user_id into app_id from public.xxfp_auth_users where supabase_user_id = uid limit 1;
  return app_id;
end;
$$;

-- =============================================================================
-- 5. WRITE RPCs (re-pointed to XXFP_ tables)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_group(p_payload jsonb)
returns table(group_id integer, group_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  creator integer := public.current_app_user_id();
  grp record;
  mem record;
  person_id bigint;
  setup jsonb := p_payload->'setup';
  monthly numeric := coalesce((p_payload->>'monthlySaving')::numeric, (p_payload->>'monthly_saving_amount')::numeric, 0);
begin
  insert into public.xxfp_groups (group_name, code, primary_contact_name, mobile_number, email, status, owner_person_id, created_by, last_updated_by)
  values (
    coalesce(p_payload->>'name', p_payload->>'group_name'),
    'BG-' || lpad(((select coalesce(max(group_id),0) + 1 from public.xxfp_groups))::text, 4, '0'),
    coalesce(p_payload->>'primaryContact', p_payload->>'primaryContactName', ''),
    p_payload->>'mobile',
    p_payload->>'email',
    'ACTIVE',
    null,
    creator,
    creator
  ) returning group_id, group_name into grp;

  insert into public.xxfp_group_setup (group_id, monthly_saving_amount, interest_rate, interest_type, penalty_amount, loan_limit, auto_approve_flag, loan_tenure_months, loan_due_day, approver_names, admin_names, created_by, last_updated_by)
  values (grp.group_id, monthly, null, coalesce(setup->>'interestType','Reducing'), null, null, 'N', null, null, '[]'::jsonb, '[]'::jsonb, creator, creator);

  with months as (
    select generate_series(-1,1) as m_offset
  )
  insert into public.xxfp_periods (group_id, period_name, start_date, end_date, status, created_by, last_updated_by)
  select grp.group_id,
    to_char((date_trunc('month', current_date) + (m_offset * interval '1 month')),'TMMonth YYYY'),
    (date_trunc('month', current_date) + (m_offset * interval '1 month'))::date,
    (date_trunc('month', current_date) + (m_offset * interval '1 month') + interval '1 month - 1 day')::date,
    case when m_offset <= 0 then 'CLOSED' else 'FUTURE' end,
    creator, creator
  from months;

  -- Person for the creator (dedupe by email)
  insert into public.xxfp_persons (full_name, username, email, mobile_number, auth_user_id, status, created_by, last_updated_by)
  select
    coalesce((select username from public.xxfp_auth_users where user_id = creator limit 1), 'Creator'),
    concat('creator_', grp.group_id),
    (select email from public.xxfp_auth_users where user_id = creator limit 1),
    (select mobile_number from public.xxfp_auth_users where user_id = creator limit 1),
    (select supabase_user_id from public.xxfp_auth_users where user_id = creator limit 1),
    'ACTIVE',
    creator, creator
  on conflict do nothing
  returning person_id into person_id;

  if person_id is null then
    select p.person_id into person_id
    from public.xxfp_persons p
    join public.xxfp_auth_users au on au.user_id = creator and au.person_id = p.person_id;
  end if;

  insert into public.xxfp_group_members (group_id, person_id, role_id, member_name, username, mobile_number, email, join_date, status, created_by, last_updated_by)
  values (
    grp.group_id,
    person_id,
    (select role_id from public.xxfp_roles where upper(role_name) = 'GROUP ADMIN'),
    coalesce((select username from public.xxfp_auth_users where user_id = creator limit 1), 'Creator'),
    concat('creator_', grp.group_id),
    (select mobile_number from public.xxfp_auth_users where user_id = creator limit 1),
    (select email from public.xxfp_auth_users where user_id = creator limit 1),
    current_date, 'ACTIVE', creator, creator
  ) returning member_id into mem;

  -- link person <-> auth user <-> membership
  update public.xxfp_auth_users
  set member_id = mem.member_id,
      person_id = coalesce(person_id, mem.person_id),
      last_update_date = now()
  where user_id = creator;

  update public.xxfp_groups
  set owner_person_id = coalesce(owner_person_id, (select person_id from public.xxfp_group_members where member_id = mem.member_id)),
      last_update_date = now()
  where group_id = grp.group_id;

  return query select grp.group_id, grp.group_name;
end;
$$;

create or replace function public.rpc_update_group(p_group_id integer, p_updates jsonb)
returns table(group_id integer, group_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  updater integer := public.current_app_user_id();
  g record;
begin
  update public.xxfp_groups set
    group_name = coalesce(p_updates->>'name', p_updates->>'group_name', group_name),
    primary_contact_name = coalesce(p_updates->>'primary_contact_name', p_updates->>'primaryContact', primary_contact_name),
    mobile_number = coalesce(p_updates->>'mobile', mobile_number),
    email = coalesce(p_updates->>'email', email),
    status = coalesce(p_updates->>'status', status),
    last_updated_by = updater,
    last_update_date = now()
  where group_id = p_group_id
  returning group_id, group_name into g;
  if not found then return; end if;
  return query select g.group_id, g.group_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_member(p_payload jsonb)
returns table(member_id integer, username text, member_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  creator integer := public.current_app_user_id();
  r record;
  person_id bigint;
begin
  -- upsert person (dedupe by email -> username -> mobile)
  insert into public.xxfp_persons (full_name, username, email, mobile_number, status, created_by, last_updated_by)
  values (
    coalesce(p_payload->>'fullName', p_payload->>'member_name'),
    p_payload->>'username',
    p_payload->>'email',
    p_payload->>'mobile',
    'ACTIVE', creator, creator
  )
  on conflict do nothing
  returning person_id into person_id;

  if person_id is null then
    select p.person_id into person_id
    from public.xxfp_persons p
    where (p_payload->>'email') is not null and lower(p.email) = lower((p_payload->>'email'))
       or (p_payload->>'username') is not null and lower(p.username) = lower((p_payload->>'username'))
       or (p_payload->>'mobile') is not null and p.mobile_number = (p_payload->>'mobile')
    order by p.person_id
    limit 1;
  end if;

  insert into public.xxfp_group_members (group_id, person_id, role_id, member_name, username, mobile_number, email, join_date, status, created_by, last_updated_by)
  values (
    (p_payload->>'groupId')::integer,
    person_id,
    case when (p_payload->>'roleId') is null then null else (p_payload->>'roleId')::bigint end,
    coalesce(p_payload->>'fullName', p_payload->>'member_name'),
    p_payload->>'username',
    p_payload->>'mobile',
    p_payload->>'email',
    coalesce((p_payload->>'dateJoined')::date, current_date),
    case when lower(coalesce(p_payload->>'status','active')) = 'inactive' then 'INACTIVE' else 'ACTIVE' end,
    creator, creator
  ) returning member_id, username, member_name into r;

  insert into public.xxfp_member_setup (member_id, custom_saving_amount, loan_limit, loan_tenure_months, interest_rate, interest_type, active_flag, created_by, last_updated_by)
  values (r.member_id, null, null, null, null, null, 'Y', creator, creator)
  on conflict (member_id) do nothing;

  insert into public.xxfp_member_status_history (member_id, group_id, status, start_date, created_by, last_updated_by)
  values (r.member_id, (p_payload->>'groupId')::integer, 'ACTIVE', current_date, creator, creator);

  return query select r.member_id, r.username, r.member_name;
end;
$$;

create or replace function public.rpc_update_member(p_member_id integer, p_updates jsonb)
returns table(member_id integer, username text, member_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  updater integer := public.current_app_user_id();
  m record;
begin
  update public.xxfp_group_members set
    member_name = coalesce(p_updates->>'member_name', p_updates->>'fullName', member_name),
    username = coalesce(p_updates->>'username', username),
    mobile_number = coalesce(p_updates->>'mobile', mobile_number),
    email = coalesce(p_updates->>'email', email),
    role_id = case when (p_updates->>'roleId') is null then role_id else (p_updates->>'roleId')::bigint end,
    exit_date = case when (p_updates->>'exit_date') is null then exit_date else (p_updates->>'exit_date')::date end,
    status = coalesce(p_updates->>'status', status),
    last_updated_by = updater,
    last_update_date = now()
  where member_id = p_member_id
  returning member_id, username, member_name into m;
  if not found then return; end if;

  if p_updates->>'status' is not null then
    insert into public.xxfp_member_status_history (member_id, group_id, status, start_date, created_by, last_updated_by)
    select m.member_id, gm.group_id, upper((p_updates->>'status')), current_date, updater, updater
    from public.xxfp_group_members gm where gm.member_id = m.member_id
    on conflict do nothing;
  end if;

  return query select m.member_id, m.username, m.member_name;
end;
$$;

create or replace function public.rpc_delete_member(p_member_id integer)
returns table(member_id integer, username text)
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  delete from public.xxfp_group_members where member_id = p_member_id returning member_id, username into r;
  if not found then return; end if;
  return query select r.member_id, r.username;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_transaction(p_payload jsonb)
returns table(member_trx_id integer, trx_number text, total_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  creator integer := public.current_app_user_id();
  hdr record;
  allocation jsonb := coalesce(p_payload->'allocation', jsonb_build_object('savings', (p_payload->>'amount')::numeric));
  amount numeric := coalesce((p_payload->>'amount')::numeric, 0);
begin
  if creator is null then raise exception 'unauthenticated'; end if;

  insert into public.xxfp_trx_header (trx_number, group_id, member_id, period_id, trx_date, trx_type, total_amount, approval_status, parent_trx_id, adjustment_flag, reversed_flag, remarks, created_by, last_updated_by)
  values (
    coalesce(p_payload->>'transactionNumber', null),
    (p_payload->>'groupId')::integer,
    (p_payload->>'memberId')::integer,
    case when p_payload->>'periodId' is null then null else (p_payload->>'periodId')::integer end,
    coalesce((p_payload->>'transactionDate')::date, current_date),
    coalesce(p_payload->>'transactionType','Savings Collection'),
    amount,
    upper(coalesce(p_payload->>'approvalStatus','PENDING')),
    null, 'N', 'N', coalesce(p_payload->>'remarks',''), creator, creator
  ) returning member_trx_id, trx_number, total_amount into hdr;

  if jsonb_typeof(allocation) = 'object' then
    insert into public.xxfp_trx_lines (member_trx_id, line_type, amount, remarks, created_by, last_updated_by)
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
end;
$$;

-- ---------------------------------------------------------------------------
-- Group expenses
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_group_expense(p_payload jsonb)
returns table(header jsonb, lines jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  hdr record;
  inserted_lines jsonb := '[]'::jsonb;
  l jsonb;
begin
  insert into public.xxfp_group_expense_header (expense_number, group_id, period_id, expense_date, expense_type, total_amount, payment_mode, approval_status, remarks, created_by, last_updated_by)
  values (
    null,
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
      insert into public.xxfp_group_expense_lines (group_expense_id, expense_category, amount, remarks, created_by, last_updated_by)
      values (hdr.group_expense_id, coalesce(l->>'category', 'General'), coalesce((l->>'amount')::numeric,0), coalesce(l->>'remarks',''), public.current_app_user_id(), public.current_app_user_id());
    end loop;
  end if;

  select to_jsonb(h) into hdr from public.xxfp_group_expense_header h where h.group_expense_id = hdr.group_expense_id;
  select coalesce(jsonb_agg(to_jsonb(ll)), '[]'::jsonb) into inserted_lines from public.xxfp_group_expense_lines ll where ll.group_expense_id = hdr.group_expense_id;
  return query select hdr::jsonb as header, inserted_lines as lines;
end;
$$;

-- ---------------------------------------------------------------------------
-- Loan requests
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_loan_request(p_payload jsonb)
returns table(loan_request_id integer, request_number text, requested_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  creator integer := public.current_app_user_id();
  r record;
begin
  insert into public.xxfp_loan_requests (request_number, group_id, member_id, requested_amount, requested_months, purpose, request_date, status, approval_status, created_by, last_updated_by)
  values (null,
    (p_payload->>'groupId')::integer,
    (p_payload->>'memberId')::integer,
    coalesce((p_payload->>'amount')::numeric,0),
    case when (p_payload->>'durationMonths') is null then null else (p_payload->>'durationMonths')::integer end,
    p_payload->>'reason',
    coalesce((p_payload->>'startDate')::date, current_date),
    'REQUESTED', upper(coalesce(p_payload->>'approvalStatus','PENDING')),
    creator, creator)
  returning loan_request_id, request_number, requested_amount into r;
  return query select r.loan_request_id, r.request_number, r.requested_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- Withdrawal requests
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_withdrawal_request(p_payload jsonb)
returns table(withdrawal_request_id integer, request_number text, requested_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  creator integer := public.current_app_user_id();
  hdr record;
begin
  insert into public.xxfp_withdrawal_requests (request_number, group_id, member_id, requested_amount, request_date, reason, status, approval_status, created_by, last_updated_by)
  values (null,
    (p_payload->>'groupId')::integer,
    (p_payload->>'memberId')::integer,
    coalesce((p_payload->>'amount')::numeric,0),
    coalesce((p_payload->>'requestDate')::date, current_date),
    p_payload->>'reason', 'REQUESTED', upper(coalesce(p_payload->>'approvalStatus','PENDING')),
    creator, creator)
  returning withdrawal_request_id, request_number, requested_amount into hdr;
  return query select hdr.withdrawal_request_id, hdr.request_number, hdr.requested_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approvals (bulk create)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_approval_requests(p_group_id integer, p_approvals jsonb)
returns table(approval_id integer, amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  creator integer := public.current_app_user_id();
  row jsonb;
  inserted record;
begin
  if p_approvals is null then return; end if;
  for row in select * from jsonb_array_elements(p_approvals) loop
    insert into public.xxfp_approval_header (group_id, approval_batch_id, transaction_type, reference_type, reference_id, approver_member_id, requester_name, approver_name, amount, approval_status, remarks, created_by, last_updated_by)
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
end;
$$;

-- ---------------------------------------------------------------------------
-- Pending setup changes
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_pending_setup_change(p_payload jsonb)
returns table(setup_change_id integer, group_id integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  insert into public.xxfp_pending_setup_changes (group_id, approval_batch_id, setup_type, target_id, target_name, payload, old_value, change_summary, status, created_by, last_updated_by)
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
end;
$$;

create or replace function public.rpc_update_pending_setup_change_status(p_change_id integer, p_status text)
returns table(setup_change_id integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  update public.xxfp_pending_setup_changes set status = upper(p_status), last_updated_by = public.current_app_user_id(), last_update_date = now() where setup_change_id = p_change_id returning setup_change_id, status into r;
  if not found then return; end if;
  return query select r.setup_change_id, r.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Legacy import / openings
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_legacy_import(p_payload jsonb)
returns table(legacy_id integer, group_id integer, member_id integer, migration_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  hdr record;
  v_savings numeric := coalesce((p_payload->>'savings')::numeric, 0);
  v_principal numeric := coalesce((p_payload->>'principal')::numeric, 0);
  v_interest numeric := coalesce((p_payload->>'interest')::numeric, 0);
  v_penalty numeric := coalesce((p_payload->>'penalty')::numeric, 0);
begin
  insert into public.xxfp_trx_header (trx_number, group_id, member_id, period_id, trx_date, trx_type, total_amount, approval_status, remarks, created_by, last_updated_by)
  values (null, (p_payload->>'groupId')::integer, (p_payload->>'memberId')::integer, case when p_payload->>'periodId' is null then null else (p_payload->>'periodId')::integer end, coalesce((p_payload->>'transactionDate')::date, current_date), 'Migrated', coalesce((p_payload->>'amount')::numeric, v_savings), upper(coalesce(p_payload->>'approvalStatus','COMPLETED')), coalesce(p_payload->>'remarks',''), public.current_app_user_id(), public.current_app_user_id())
  returning member_trx_id into hdr;

  if v_savings <> 0 then
    insert into public.xxfp_trx_lines (member_trx_id, line_type, amount, remarks, created_by, last_updated_by) values (hdr.member_trx_id, 'SAVING', v_savings, 'Legacy import', public.current_app_user_id(), public.current_app_user_id());
  end if;
  if v_principal <> 0 then
    insert into public.xxfp_trx_lines (member_trx_id, line_type, amount, remarks, created_by, last_updated_by) values (hdr.member_trx_id, 'LOAN_PRINCIPAL', v_principal, 'Legacy import', public.current_app_user_id(), public.current_app_user_id());
  end if;
  if v_interest <> 0 then
    insert into public.xxfp_trx_lines (member_trx_id, line_type, amount, remarks, created_by, last_updated_by) values (hdr.member_trx_id, 'LOAN_INTEREST', v_interest, 'Legacy import', public.current_app_user_id(), public.current_app_user_id());
  end if;
  if v_penalty <> 0 then
    insert into public.xxfp_trx_lines (member_trx_id, line_type, amount, remarks, created_by, last_updated_by) values (hdr.member_trx_id, 'PENALTY', v_penalty, 'Legacy import', public.current_app_user_id(), public.current_app_user_id());
  end if;
  return query select hdr.member_trx_id, (p_payload->>'groupId')::integer, (p_payload->>'memberId')::integer, coalesce((p_payload->>'transactionDate')::date, current_date);
end;
$$;

create or replace function public.rpc_save_legacy_group_opening(p_payload jsonb)
returns table(legacy_group_opening_id integer, group_id integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  creator integer := public.current_app_user_id();
  r record;
begin
  insert into public.xxfp_legacy_group_opening (group_id, migration_date, opening_bank_balance, opening_group_expense, opening_group_gain, approval_status, remarks, created_by, last_updated_by)
  values ((p_payload->>'groupId')::integer, coalesce((p_payload->>'migrationDate')::date, current_date), coalesce((p_payload->>'openingBankBalance')::numeric,0), coalesce((p_payload->>'openingGroupExpense')::numeric,0), coalesce((p_payload->>'openingGroupGain')::numeric,0), upper(coalesce(p_payload->>'approvalStatus','COMPLETED')), p_payload->>'remarks', creator, creator)
  on conflict (group_id) do update set
    opening_bank_balance = excluded.opening_bank_balance,
    opening_group_expense = excluded.opening_group_expense,
    opening_group_gain = excluded.opening_group_gain,
    approval_status = excluded.approval_status,
    remarks = excluded.remarks,
    last_updated_by = excluded.last_updated_by,
    last_update_date = now()
  returning legacy_group_opening_id, group_id into r;
  return query select r.legacy_group_opening_id, r.group_id;
end;
$$;

create or replace function public.rpc_update_legacy_group_opening_status(p_id integer, p_status text)
returns table(legacy_group_opening_id integer, approval_status text)
language plpgsql
security definer
set search_path = public
as $$
declare r record; begin
  update public.xxfp_legacy_group_opening set approval_status = upper(p_status), last_updated_by = public.current_app_user_id(), last_update_date = now() where legacy_group_opening_id = p_id returning legacy_group_opening_id, approval_status into r;
  if not found then return; end if;
  return query select r.legacy_group_opening_id, r.approval_status;
end;
$$;

create or replace function public.rpc_update_legacy_import(p_id integer, p_changes jsonb)
returns table(legacy_id integer, legacy_saving_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  upd jsonb := p_changes;
  r record;
begin
  update public.xxfp_legacy_data set
    legacy_saving_balance = coalesce((upd->>'legacy_saving_balance')::numeric, legacy_saving_balance),
    legacy_loan_outstanding = coalesce((upd->>'legacy_loan_outstanding')::numeric, legacy_loan_outstanding),
    legacy_interest_balance = coalesce((upd->>'legacy_interest_balance')::numeric, legacy_interest_balance),
    legacy_bank_balance = coalesce((upd->>'legacy_bank_balance')::numeric, legacy_bank_balance),
    approval_status = coalesce((upd->>'approval_status')::text, approval_status),
    remarks = coalesce(upd->>'remarks', remarks),
    last_updated_by = public.current_app_user_id(),
    last_update_date = now()
  where legacy_id = p_id
  returning legacy_id, legacy_saving_balance into r;
  if not found then return; end if;
  return query select r.legacy_id, r.legacy_saving_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_audit_log(p_payload jsonb)
returns table(trx_id integer, action_type text)
language plpgsql
security definer
set search_path = public
as $$
declare r record; begin
  insert into public.xxfp_audit_log (trx_id, action_type, old_value, new_value, changed_by, created_by, last_updated_by)
  values ((p_payload->>'recordId')::integer, p_payload->>'action', p_payload->>'oldValue', p_payload->>'newValue', p_payload->>'changedBy', public.current_app_user_id(), public.current_app_user_id())
  returning trx_id, action_type into r;
  return query select r.trx_id, r.action_type;
end;
$$;

-- ---------------------------------------------------------------------------
-- Support disputes
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_support_dispute(p_payload jsonb)
returns table(dispute_id integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare r record; begin
  insert into public.xxfp_support_disputes (group_id, member_id, group_name, member_name, contact_number, issue, attachment_name, attachment_data, status, created_by, last_updated_by)
  values ((p_payload->>'groupId')::integer, (p_payload->>'memberId')::integer, p_payload->>'groupName', p_payload->>'memberName', p_payload->>'contactNumber', p_payload->>'issue', p_payload->>'attachmentName', p_payload->>'attachmentData', 'OPEN', public.current_app_user_id(), public.current_app_user_id())
  returning dispute_id, status into r;
  return query select r.dispute_id, r.status;
end;
$$;

create or replace function public.rpc_reply_support_dispute(p_dispute_id integer, p_owner_reply text)
returns table(dispute_id integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare r record; begin
  update public.xxfp_support_disputes set owner_reply = p_owner_reply, status = 'REPLIED', last_updated_by = public.current_app_user_id(), last_update_date = now() where dispute_id = p_dispute_id returning dispute_id, status into r;
  if not found then return; end if;
  return query select r.dispute_id, r.status;
end;
$$;

-- =============================================================================
-- 6. DECIDE APPROVAL  (full workflow, ported from 2026-07-04 onto XXFP_ tables)
-- =============================================================================
drop function if exists public.decide_approval(integer, text, text);
drop function if exists public.decide_approval(bigint, varchar, varchar);

create or replace function public.decide_approval(
  target_approval_id bigint,
  decision_status varchar,
  decision_remarks varchar default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval xxfp_approval_header%rowtype;
  v_batch_id varchar(80);
  v_reference_type varchar(40);
  v_reference_id bigint;
  v_pending_count integer;
  v_rejected_count integer;
  v_result text := 'decision_saved';
  v_request xxfp_loan_requests%rowtype;
  v_interest_rate numeric(8,2) := 0;
  v_loan_start_date date;
begin
  select *
  into v_approval
  from public.xxfp_approval_header
  where approval_id = target_approval_id
  for update;

  if not found then
    raise exception 'Approval % not found', target_approval_id;
  end if;

  update public.xxfp_approval_header
  set approval_status = upper(decision_status),
      approval_date = current_date,
      remarks = coalesce(decision_remarks, remarks),
      last_update_date = now()
  where approval_id = target_approval_id
  returning approval_batch_id, reference_type, reference_id
  into v_batch_id, v_reference_type, v_reference_id;

  if upper(decision_status) in ('REJECTED', 'RETURNED') then
    update public.xxfp_approval_header
    set approval_status = upper(decision_status),
        approval_date = current_date,
        remarks = coalesce(remarks, 'Closed because one approver ' || lower(decision_status) || ' this request.'),
        last_update_date = now()
    where approval_batch_id = v_batch_id
      and upper(approval_status) = 'PENDING';

    if v_reference_type = 'transaction' then
      update public.xxfp_trx_header
      set approval_status = upper(decision_status), last_update_date = now()
      where member_trx_id = v_reference_id;
    elsif v_reference_type = 'loan_request' then
      update public.xxfp_loan_requests
      set approval_status = upper(decision_status), status = upper(decision_status), last_update_date = now()
      where loan_request_id = v_reference_id;
    elsif v_reference_type = 'expense' then
      update public.xxfp_group_expense_header
      set approval_status = upper(decision_status), last_update_date = now()
      where group_expense_id = v_reference_id;

      update public.xxfp_trx_header
      set approval_status = upper(decision_status), last_update_date = now()
      where trx_type = 'Group Expense Share'
        and remarks = 'Expense share for expense ' || v_reference_id;
    elsif v_reference_type = 'legacy_group_opening' then
      update public.xxfp_legacy_group_opening
      set approval_status = upper(decision_status), last_update_date = now()
      where legacy_group_opening_id = v_reference_id;
    elsif v_reference_type = 'withdrawal_request' then
      update public.xxfp_withdrawal_requests
      set approval_status = upper(decision_status), status = upper(decision_status), last_update_date = now()
      where withdrawal_request_id = v_reference_id;
    elsif v_reference_type = 'member_addition' then
      update public.xxfp_group_members
      set status = 'INACTIVE', exit_date = coalesce(exit_date, current_date), last_update_date = now()
      where member_id = v_reference_id;
    elsif v_reference_type in ('group_setup', 'member_setup') then
      update public.xxfp_pending_setup_changes
      set status = upper(decision_status), last_update_date = now()
      where approval_batch_id = v_batch_id;
    end if;

    return jsonb_build_object('status', lower(decision_status), 'reference_type', v_reference_type, 'reference_id', v_reference_id);
  end if;

  select count(*)
  into v_pending_count
  from public.xxfp_approval_header
  where approval_batch_id = v_batch_id
    and upper(approval_status) <> 'APPROVED';

  select count(*)
  into v_rejected_count
  from public.xxfp_approval_header
  where approval_batch_id = v_batch_id
    and upper(approval_status) in ('REJECTED', 'RETURNED');

  if v_pending_count = 0 and v_rejected_count = 0 then
    if v_reference_type = 'transaction' then
      update public.xxfp_trx_header
      set approval_status = 'COMPLETED', last_update_date = now()
      where member_trx_id = v_reference_id;

      perform public.distribute_share_for_transaction(v_reference_id);
      v_result := 'transaction_completed';
    elsif v_reference_type = 'loan_request' then
      select *
      into v_request
      from public.xxfp_loan_requests
      where loan_request_id = v_reference_id
      for update;

      if not found then
        raise exception 'Loan request % not found', v_reference_id;
      end if;

      v_loan_start_date := coalesce(v_request.request_date, current_date);

      select coalesce(gs.interest_rate, 0)
      into v_interest_rate
      from public.xxfp_group_setup gs
      where gs.group_id = v_request.group_id;

      update public.xxfp_loan_requests
      set approval_status = 'APPROVED', status = 'APPROVED', last_update_date = now()
      where loan_request_id = v_reference_id;

      insert into public.xxfp_loan_header (
        loan_number, loan_request_id, group_id, member_id, distributed_amount,
        interest_rate, distribution_date, outstanding_principal, outstanding_interest,
        loan_status, created_by, last_updated_by
      )
      select
        'LN-' || to_char(v_loan_start_date, 'YYYYMMDD') || '-' || v_reference_id,
        v_request.loan_request_id, v_request.group_id, v_request.member_id,
        v_request.requested_amount, coalesce(v_interest_rate, 0), v_loan_start_date,
        v_request.requested_amount, 0, 'ACTIVE', v_request.created_by, v_request.last_updated_by
      where not exists (
        select 1 from public.xxfp_loan_header ld where ld.loan_request_id = v_request.loan_request_id
      );

      v_result := 'loan_activated';
    elsif v_reference_type = 'expense' then
      update public.xxfp_group_expense_header
      set approval_status = 'COMPLETED', last_update_date = now()
      where group_expense_id = v_reference_id;

      update public.xxfp_trx_header
      set approval_status = 'COMPLETED', last_update_date = now()
      where trx_type = 'Group Expense Share'
        and remarks = 'Expense share for expense ' || v_reference_id;

      v_result := 'expense_completed';
    elsif v_reference_type = 'legacy_group_opening' then
      update public.xxfp_legacy_group_opening
      set approval_status = 'COMPLETED', last_update_date = now()
      where legacy_group_opening_id = v_reference_id;

      v_result := 'legacy_group_opening_completed';
    end if;
  end if;

  return jsonb_build_object('status', v_result, 'reference_type', v_reference_type, 'reference_id', v_reference_id);
end;
$$;

grant execute on function public.decide_approval(bigint, varchar, varchar) to authenticated;

-- =============================================================================
-- 6a. READ-ONLY / AUTH RPCS (consolidated from the legacy standalone RPC files
--     into a single source of truth). They read the XXFP_ tables directly.
--     Grants come from the blanket grant below.
-- =============================================================================

-- Shared helper: group-level access check (was 2026-07-12-v1-finance-rpc-helpers.sql)
create or replace function public._ensure_group_member_access(p_group_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.xxfp_group_members m
    where m.group_id = p_group_id
      and m.member_id in (
        select au.member_id
        from public.xxfp_auth_users au
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

-- Email registration guard (was 2026-05-28-v2-registration-email-guard.sql)
create or replace function public.email_registered(check_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users au
    where lower(au.email) = lower(check_email)
  )
  or exists (
    select 1
    from public.xxfp_auth_users pu
    where lower(pu.email) = lower(check_email)
  );
$$;

-- Resolve a login identifier to an email (was 2026-07-25-add-rpc-functions.sql)
create or replace function public.resolve_login_email(login_identifier text)
returns text language plpgsql as $$
declare
  out_email text := null;
begin
  if login_identifier is null then
    return null;
  end if;

  select au.email into out_email from public.xxfp_auth_users au
  where lower(au.email) = lower(login_identifier)
  limit 1;
  if out_email is not null then return out_email; end if;

  select m.email into out_email from public.xxfp_group_members m
  where lower(m.username) = lower(login_identifier)
  limit 1;
  if out_email is not null then return out_email; end if;

  select m.email into out_email from public.xxfp_group_members m
  where lower(m.email) = lower(login_identifier)
  limit 1;
  return out_email;
end; $$;

-- Tenant bootstrap payload (was 2026-08-02-fix-tenant-payload-alias.sql)
create or replace function public.rpc_get_tenant_payload(p_profile_id uuid)
returns jsonb
language plpgsql
as $$
declare
    v_profile record;
    v_is_product_owner boolean;
    v_visible_group_ids bigint[];
    v_visible_member_ids bigint[];
    v_groups jsonb;
    v_group_setup jsonb;
    v_members jsonb;
    v_member_setup jsonb;
    v_periods jsonb;
    v_balances jsonb;
    v_loans jsonb;
    v_approvals jsonb;
    v_plans jsonb;
    v_subscriptions jsonb;
    v_headers jsonb;
    v_lines jsonb;
    v_legacy_rows jsonb;
    v_share_distributions jsonb;
    v_share_adjustments jsonb;
    v_audits jsonb;
    v_expense_headers jsonb;
    v_expense_lines jsonb;
    v_disputes jsonb;
    v_withdrawal_requests jsonb;
    v_legacy_group_openings jsonb;
    v_pending_setup_changes jsonb;
begin
    select au.user_id, au.supabase_user_id, au.member_id, au.email, au.mobile_number, au.username
      into v_profile
    from public.xxfp_auth_users au
    where au.supabase_user_id = p_profile_id
    limit 1;

    if not found then
        return jsonb_build_object(
            'groups', '[]'::jsonb,
            'group_setup', '[]'::jsonb,
            'members', '[]'::jsonb,
            'member_setup', '[]'::jsonb,
            'periods', '[]'::jsonb,
            'member_dashboard_balances', '[]'::jsonb,
            'loan_distribution', '[]'::jsonb,
            'approvals', '[]'::jsonb,
            'subscription_plans', '[]'::jsonb,
            'group_subscriptions', '[]'::jsonb,
            'member_transaction_header', '[]'::jsonb,
            'member_transaction_lines', '[]'::jsonb,
            'legacy_data', '[]'::jsonb,
            'share_distribution', '[]'::jsonb,
            'share_adjustments', '[]'::jsonb,
            'trx_audit_history', '[]'::jsonb,
            'group_expense_header', '[]'::jsonb,
            'group_expense_lines', '[]'::jsonb,
            'support_disputes', '[]'::jsonb,
            'withdrawal_requests', '[]'::jsonb,
            'legacy_group_opening', '[]'::jsonb,
            'pending_setup_changes', '[]'::jsonb
        );
    end if;

    v_is_product_owner := lower(coalesce(v_profile.email, '')) = 'katgroupsupport@gmail.com';

    if v_is_product_owner then
        select array_agg(distinct g.group_id)
          into v_visible_group_ids
        from public.xxfp_groups g;
    else
        select array_agg(distinct group_id)
          into v_visible_group_ids
        from (
            select m.group_id
            from public.xxfp_group_members m
            where (
                m.member_id = v_profile.member_id
                or (nullif(trim(coalesce(m.email, '')), '') <> '' and nullif(trim(coalesce(v_profile.email, '')), '') <> '' and lower(m.email) = lower(v_profile.email))
                or (nullif(trim(coalesce(m.mobile_number, '')), '') <> '' and nullif(trim(coalesce(v_profile.mobile_number, '')), '') <> '' and m.mobile_number = v_profile.mobile_number)
            )
            union
            select g.group_id
            from public.xxfp_groups g
            where g.created_by = v_profile.user_id
        ) visible_groups;
    end if;

    if v_visible_group_ids is null then
        v_visible_group_ids := array[]::bigint[];
    end if;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_id), '[]'::jsonb)
      into v_groups
    from (
        select *
        from public.xxfp_groups g
        where g.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_id), '[]'::jsonb)
      into v_group_setup
    from (
        select *
        from public.xxfp_group_setup gs
        where gs.group_id = any(v_visible_group_ids)
    ) r;

    select array_agg(distinct m.member_id)
      into v_visible_member_ids
    from public.xxfp_group_members m
    where m.group_id = any(v_visible_group_ids);

    if v_visible_member_ids is null then
        v_visible_member_ids := array[]::bigint[];
    end if;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_members
    from (
        select *
        from public.xxfp_group_members m
        where m.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_member_setup
    from (
        select *
        from public.xxfp_member_setup ms
        where ms.member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.period_id), '[]'::jsonb)
      into v_periods
    from (
        select *
        from public.xxfp_periods p
        where p.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_balances
    from (
        select *
        from public.xxfp_v_member_dashboard_balances b
        where b.member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.loan_id), '[]'::jsonb)
      into v_loans
    from (
        select *
        from public.xxfp_loan_header ld
        where ld.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.approval_id), '[]'::jsonb)
      into v_approvals
    from (
        select *
        from public.xxfp_approval_header a
        where a.group_id = any(v_visible_group_ids)
           or a.approver_member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.subscription_plan_id), '[]'::jsonb)
      into v_plans
    from (
        select *
        from public.xxfp_subscription_plans sp
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_subscription_id), '[]'::jsonb)
      into v_subscriptions
    from (
        select gs.*, jsonb_build_object('group_name', g.group_name) as groups
        from public.xxfp_group_subscriptions gs
        left join public.xxfp_groups g on g.group_id = gs.group_id
        where gs.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_trx_id), '[]'::jsonb)
      into v_headers
    from (
        select *
        from public.xxfp_trx_header h
        where h.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_trx_id), '[]'::jsonb)
      into v_lines
    from (
        select *
        from public.xxfp_trx_lines l
        where l.member_trx_id in (
            select h.member_trx_id
            from public.xxfp_trx_header h
            where h.group_id = any(v_visible_group_ids)
        )
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.legacy_id), '[]'::jsonb)
      into v_legacy_rows
    from (
        select *
        from public.xxfp_legacy_data ld
        where ld.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_share_distributions
    from (
        select *
        from public.xxfp_share_distribution sd
        where sd.member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.member_id), '[]'::jsonb)
      into v_share_adjustments
    from (
        select *
        from public.xxfp_share_adjustments sa
        where sa.member_id = any(v_visible_member_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.audit_id), '[]'::jsonb)
      into v_audits
    from (
        select ah.*
        from public.xxfp_audit_log ah
        join public.xxfp_trx_header h on ah.trx_id = h.member_trx_id
        where h.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_expense_id), '[]'::jsonb)
      into v_expense_headers
    from (
        select *
        from public.xxfp_group_expense_header geh
        where geh.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.group_expense_id), '[]'::jsonb)
      into v_expense_lines
    from (
        select *
        from public.xxfp_group_expense_lines gel
        where gel.group_expense_id in (
            select geh.group_expense_id
            from public.xxfp_group_expense_header geh
            where geh.group_id = any(v_visible_group_ids)
        )
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.dispute_id), '[]'::jsonb)
      into v_disputes
    from (
        select *
        from public.xxfp_support_disputes sd
        where sd.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.withdrawal_request_id), '[]'::jsonb)
      into v_withdrawal_requests
    from (
        select *
        from public.xxfp_withdrawal_requests wr
        where wr.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.legacy_group_opening_id), '[]'::jsonb)
      into v_legacy_group_openings
    from (
        select *
        from public.xxfp_legacy_group_opening lgo
        where lgo.group_id = any(v_visible_group_ids)
    ) r;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.setup_change_id), '[]'::jsonb)
      into v_pending_setup_changes
    from (
        select *
        from public.xxfp_pending_setup_changes psc
        where psc.group_id = any(v_visible_group_ids)
    ) r;

    return jsonb_build_object(
        'groups', v_groups,
        'group_setup', v_group_setup,
        'members', v_members,
        'member_setup', v_member_setup,
        'periods', v_periods,
        'member_dashboard_balances', v_balances,
        'loan_distribution', v_loans,
        'approvals', v_approvals,
        'subscription_plans', v_plans,
        'group_subscriptions', v_subscriptions,
        'member_transaction_header', v_headers,
        'member_transaction_lines', v_lines,
        'legacy_data', v_legacy_rows,
        'share_distribution', v_share_distributions,
        'share_adjustments', v_share_adjustments,
        'trx_audit_history', v_audits,
        'group_expense_header', v_expense_headers,
        'group_expense_lines', v_expense_lines,
        'support_disputes', v_disputes,
        'withdrawal_requests', v_withdrawal_requests,
        'legacy_group_opening', v_legacy_group_openings,
        'pending_setup_changes', v_pending_setup_changes
    );
end;
$$;

-- Pending dues (was 2026-08-03-rpc-pending-dues-aggregate.sql)
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
  from public.xxfp_group_setup gs
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
    from public.xxfp_group_members m
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
    left join public.xxfp_group_setup gs on gs.group_id = p_group_id
    left join public.xxfp_member_setup ms on ms.member_id = mc.member_id
    left join public.xxfp_v_member_dashboard_balances b
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

-- Approval summary (was 2026-08-02-rpc-approval-summary.sql)
create or replace function public.rpc_get_approval_summary(
  p_group_id integer,
  p_approver_member_id integer default null,
  p_status text default null,
  p_reference_type text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_counts jsonb;
  v_pending_rows jsonb;
  v_batch_rows jsonb;
begin
  select jsonb_build_object(
    'pending_count', count(*) filter (where upper(coalesce(approval_status, 'PENDING')) = 'PENDING'),
    'approved_count', count(*) filter (where upper(coalesce(approval_status, 'PENDING')) = 'APPROVED'),
    'rejected_count', count(*) filter (where upper(coalesce(approval_status, 'PENDING')) = 'REJECTED'),
    'returned_count', count(*) filter (where upper(coalesce(approval_status, 'PENDING')) = 'RETURNED')
  )
    into v_counts
  from public.xxfp_approval_header a
  where a.group_id = p_group_id
    and (p_approver_member_id is null or a.approver_member_id = p_approver_member_id)
    and (p_status is null or upper(coalesce(a.approval_status, 'PENDING')) = upper(p_status))
    and (p_reference_type is null or upper(coalesce(a.reference_type, '')) = upper(p_reference_type));

  select coalesce(jsonb_agg(to_jsonb(row) order by row->>'created_at' desc), '[]'::jsonb)
    into v_pending_rows
  from (
    select
      a.approval_id as id,
      a.group_id,
      a.approval_batch_id as batch_id,
      a.reference_id,
      a.reference_type,
      a.transaction_type as action,
      coalesce(a.requester_name, a.created_by) as requester,
      a.approver_member_id,
      a.approver_name,
      (case
        when upper(coalesce(a.approval_status, 'PENDING')) = 'APPROVED' then 'Approved'
        when upper(coalesce(a.approval_status, 'PENDING')) = 'REJECTED' then 'Rejected'
        when upper(coalesce(a.approval_status, 'PENDING')) = 'RETURNED' then 'Returned'
        else 'Pending'
      end) as status,
      a.amount,
      a.remarks,
      a.remarks as details,
      a.creation_date as created_at,
      coalesce(
        (
          select string_agg(distinct coalesce(x.approver_name, 'Approver'), ', ' order by coalesce(x.approver_name, 'Approver'))
          from public.xxfp_approval_header x
          where x.approval_batch_id = a.approval_batch_id
            and upper(coalesce(x.approval_status, 'PENDING')) = 'PENDING'
        ),
        'No pending approver'
      ) as pending_with
    from public.xxfp_approval_header a
    where a.group_id = p_group_id
      and (p_approver_member_id is null or a.approver_member_id = p_approver_member_id)
      and (p_status is null or upper(coalesce(a.approval_status, 'PENDING')) = upper(p_status))
      and (p_reference_type is null or upper(coalesce(a.reference_type, '')) = upper(p_reference_type))
  ) row;

  select coalesce(jsonb_agg(to_jsonb(row) order by row->>'batch_id'), '[]'::jsonb)
    into v_batch_rows
  from (
    select
      a.approval_batch_id as batch_id,
      count(*) as approval_count,
      count(*) filter (where upper(coalesce(a.approval_status, 'PENDING')) = 'PENDING') as pending_count,
      count(*) filter (where upper(coalesce(a.approval_status, 'PENDING')) = 'APPROVED') as approved_count,
      count(*) filter (where upper(coalesce(a.approval_status, 'PENDING')) = 'REJECTED') as rejected_count,
      count(*) filter (where upper(coalesce(a.approval_status, 'PENDING')) = 'RETURNED') as returned_count
    from public.xxfp_approval_header a
    where a.group_id = p_group_id
      and (p_approver_member_id is null or a.approver_member_id = p_approver_member_id)
      and (p_reference_type is null or upper(coalesce(a.reference_type, '')) = upper(p_reference_type))
    group by a.approval_batch_id
  ) row;

  return jsonb_build_object(
    'counts', v_counts,
    'pending_rows', v_pending_rows,
    'batch_rows', v_batch_rows
  );
end; $$;

-- Report summary (was 2026-08-02-rpc-report-summary.sql)
create or replace function public.rpc_get_report_summary(
  p_group_id integer,
  p_member_id integer default null,
  p_start_date date default null,
  p_end_date date default null,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
as $$
declare
  v_group record;
  v_member_rows jsonb;
  v_group_row jsonb;
  v_start_date date := coalesce(p_start_date, date_trunc('month', coalesce(p_as_of_date, current_date))::date);
  v_end_date date := coalesce(p_end_date, coalesce(p_as_of_date, current_date));
begin
  select g.group_id, g.group_name into v_group
  from public.xxfp_groups g
  where g.group_id = p_group_id;

  if not found then
    return jsonb_build_object('group_summary', '[]'::jsonb, 'member_summary', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row order by row->>'member_name'), '[]'::jsonb)
    into v_member_rows
  from (
    select jsonb_build_object(
      'member_id', m.member_id,
      'member_name', coalesce(m.member_name, m.username, ''),
      'username', coalesce(m.username, ''),
      'status', case when upper(coalesce(m.status, '')) = 'ACTIVE' then 'Active' else coalesce(m.status, 'Inactive') end,
      'collected', coalesce(sum(case when h.trx_date between v_start_date and v_end_date then coalesce(h.total_amount, 0) else 0 end), 0),
      'savings', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and l.line_type = 'SAVING' then l.amount else 0 end), 0),
      'gain', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Share Distribution' then coalesce(h.total_amount, 0) else 0 end), 0),
      'expense', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Group Expense Share' then coalesce(h.total_amount, 0) else 0 end), 0),
      'share_amount', coalesce(sum(case when h.trx_date between v_start_date and v_end_date then (case when l.line_type = 'SAVING' then l.amount else 0 end) + (case when h.trx_type = 'Share Distribution' then coalesce(h.total_amount, 0) else 0 end) - (case when h.trx_type = 'Group Expense Share' then coalesce(h.total_amount, 0) else 0 end) else 0 end), 0),
      'loan_count', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Loan Disbursement' then 1 else 0 end), 0),
      'principal_outstanding', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Loan Disbursement' then coalesce(h.total_amount, 0) else 0 end), 0),
      'interest_due', 0,
      'penalty_due', 0,
      'next_emi_amount', 0,
      'next_due_date', null,
      'total_loan_balance', 0,
      'withdrawn', coalesce(sum(case when h.trx_date between v_start_date and v_end_date and h.trx_type = 'Withdrawal' then coalesce(h.total_amount, 0) else 0 end), 0)
    ) as row
    from public.xxfp_group_members m
    left join public.xxfp_trx_header h on h.group_id = m.group_id and h.member_id = m.member_id
    left join public.xxfp_trx_lines l on l.member_trx_id = h.member_trx_id
    where m.group_id = p_group_id
      and (p_member_id is null or m.member_id = p_member_id)
    group by m.member_id, m.member_name, m.username, m.status
  ) row;

  select jsonb_build_object(
    'group_name', v_group.group_name,
    'member_count', coalesce(jsonb_array_length(v_member_rows), 0),
    'collected', coalesce(sum((row->>'collected')::numeric), 0),
    'savings', coalesce(sum((row->>'savings')::numeric), 0),
    'gain', coalesce(sum((row->>'gain')::numeric), 0),
    'expenses', coalesce(sum((row->>'expense')::numeric), 0),
    'remaining', coalesce(sum((row->>'share_amount')::numeric), 0),
    'loan_count', coalesce(sum((row->>'loan_count')::numeric), 0),
    'loan_balance', coalesce(sum((row->>'principal_outstanding')::numeric), 0),
    'interest_due', coalesce(sum((row->>'interest_due')::numeric), 0),
    'penalty_due', coalesce(sum((row->>'penalty_due')::numeric), 0),
    'share_amount', coalesce(sum((row->>'share_amount')::numeric), 0),
    'withdrawn', coalesce(sum((row->>'withdrawn')::numeric), 0)
  )
    into v_group_row
  from jsonb_array_elements(coalesce(v_member_rows, '[]'::jsonb)) as row;

  return jsonb_build_object(
    'group_summary', jsonb_build_array(coalesce(v_group_row, jsonb_build_object('group_name', v_group.group_name, 'member_count', 0, 'collected', 0, 'savings', 0, 'gain', 0, 'expenses', 0, 'remaining', 0, 'loan_count', 0, 'loan_balance', 0, 'interest_due', 0, 'penalty_due', 0, 'share_amount', 0, 'withdrawn', 0))),
    'member_summary', coalesce(v_member_rows, '[]'::jsonb)
  );
end; $$;

-- Share distribution range (was 2026-08-02-rpc-share-distribution-range.sql)
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
    from public.xxfp_group_members m
    left join public.xxfp_share_distribution sd
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
    from public.xxfp_group_members m
    left join public.xxfp_share_distribution sd
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
  from public.xxfp_group_members m
  left join range_share rs on rs.member_id = m.member_id
  where m.group_id = p_group_id
  order by share_amount desc, member_name;
end;
$$;

-- Share distribution snapshot (was 2026-08-02-rpc-share-distribution-snapshot.sql)
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
  from public.xxfp_v_member_dashboard_balances b
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
        from public.xxfp_share_distribution sd
        where sd.group_id = p_group_id
          and sd.member_id = b.member_id
          and sd.distribution_date::date = v_reference_date
      ) then 'PAID'
      else 'PENDING'
    end as payout_status,
    v_reference_date as reference_date
  from public.xxfp_v_member_dashboard_balances b
  join public.xxfp_group_members m on m.member_id = b.member_id and m.group_id = b.group_id
  where b.group_id = p_group_id
  order by share_amount desc;
end; $$;

-- Member collection report rows (was 2026-08-05-rpc-member-collection-report.sql)
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
  from public.xxfp_group_members m
  left join public.xxfp_v_member_dashboard_balances b on b.group_id = m.group_id and b.member_id = m.member_id
  left join public.xxfp_trx_header h on h.group_id = m.group_id and h.member_id = m.member_id
    and upper(coalesce(h.approval_status, 'PENDING')) in ('COMPLETED', 'APPROVED')
  left join public.xxfp_trx_lines l on l.member_trx_id = h.member_trx_id
  where m.group_id = p_group_id
    and (p_member_id is null or m.member_id = p_member_id)
  group by m.member_id, m.member_name, m.username, m.status, b.outstanding_loan, b.outstanding_interest, b.pending_charges, p_period_label
  order by coalesce(m.member_name, m.username, '');
end;
$$;

-- Member share distribution (was 2026-07-25-add-rpc-functions.sql, integer variant)
create or replace function public.rpc_member_share_distribution(
  p_group_id integer,
  p_payout_pool numeric default 0,
  p_reference_date date default current_date
)
returns table(member_id integer, member_name text, share_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._ensure_group_member_access(p_group_id) then
    raise exception 'Access denied for share distribution' using errcode = '42501';
  end if;

  return query
  select
    m.member_id,
    coalesce(m.member_name, m.username, '') as member_name,
    coalesce(ms.earned_from_group, 0) as share_amount
  from public.xxfp_group_members m
  left join public.xxfp_v_member_dashboard_balances ms on ms.member_id = m.member_id and ms.group_id = p_group_id
  where m.group_id = p_group_id
  order by share_amount desc;
end;
$$;

-- =============================================================================
-- 7. ROW LEVEL SECURITY ON XXFP_ TABLES
--    The helper functions (current_auth_user_id, is_product_owner,
--    current_member_ids, user_group_ids, is_group_member, is_group_admin,
--    is_group_approver, member_group_id, transaction_group_id,
--    expense_group_id, loan_group_id) are defined in
--    2026-06-06-v4-production-safe-rls.sql and read the XXFP_ tables directly.
-- =============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

grant select on public.xxfp_subscription_plans to anon;
grant execute on function public.email_registered(text) to anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- Never grant blanket delete on financial tables.
revoke delete on all tables in schema public from authenticated;
grant delete on public.xxfp_group_members to authenticated;
grant delete on public.xxfp_member_status_history to authenticated;
grant delete on public.xxfp_group_setup to authenticated;
grant delete on public.xxfp_member_setup to authenticated;
grant delete on public.xxfp_periods to authenticated;
grant delete on public.xxfp_group_subscriptions to authenticated;
grant delete on public.xxfp_withdrawal_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 7a. RLS enablement
-- ---------------------------------------------------------------------------
alter table public.xxfp_roles enable row level security;
alter table public.xxfp_persons enable row level security;
alter table public.xxfp_groups enable row level security;
alter table public.xxfp_group_members enable row level security;
alter table public.xxfp_auth_users enable row level security;
alter table public.xxfp_member_status_history enable row level security;
alter table public.xxfp_group_setup enable row level security;
alter table public.xxfp_member_setup enable row level security;
alter table public.xxfp_periods enable row level security;
alter table public.xxfp_trx_header enable row level security;
alter table public.xxfp_trx_lines enable row level security;
alter table public.xxfp_loan_requests enable row level security;
alter table public.xxfp_loan_header enable row level security;
alter table public.xxfp_loan_schedule enable row level security;
alter table public.xxfp_approval_header enable row level security;
alter table public.xxfp_legacy_data enable row level security;
alter table public.xxfp_group_expense_header enable row level security;
alter table public.xxfp_group_expense_lines enable row level security;
alter table public.xxfp_share_distribution enable row level security;
alter table public.xxfp_share_adjustments enable row level security;
alter table public.xxfp_audit_log enable row level security;
alter table public.xxfp_subscription_plans enable row level security;
alter table public.xxfp_group_subscriptions enable row level security;
alter table public.xxfp_withdrawal_requests enable row level security;
alter table public.xxfp_support_disputes enable row level security;
alter table public.xxfp_legacy_group_opening enable row level security;
alter table public.xxfp_pending_setup_changes enable row level security;
alter table public.xxfp_doc_sequences enable row level security;
alter table public.xxfp_int_import_batch enable row level security;
alter table public.xxfp_stg_member_imp enable row level security;
alter table public.xxfp_stg_trx_imp enable row level security;

-- ---------------------------------------------------------------------------
-- 7b. Master / lookup tables
-- ---------------------------------------------------------------------------
create policy xxfp_roles_read on public.xxfp_roles
for select to authenticated using (true);
create policy xxfp_roles_owner_manage on public.xxfp_roles
for all to authenticated using (public.is_product_owner()) with check (public.is_product_owner());

create policy xxfp_persons_read on public.xxfp_persons
for select to authenticated using (true);
create policy xxfp_persons_self_update on public.xxfp_persons
for update to authenticated
using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));

create policy xxfp_auth_users_read_own_or_owner on public.xxfp_auth_users
for select to authenticated
using (public.is_product_owner() or supabase_user_id = (select auth.uid()) or user_id = public.current_auth_user_id());
create policy xxfp_auth_users_insert_own on public.xxfp_auth_users
for insert to authenticated
with check (supabase_user_id = (select auth.uid()));
create policy xxfp_auth_users_update_own_or_owner on public.xxfp_auth_users
for update to authenticated
using (public.is_product_owner() or supabase_user_id = (select auth.uid()))
with check (public.is_product_owner() or supabase_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 7c. Group-scoped tables
-- ---------------------------------------------------------------------------
create policy xxfp_groups_read_tenant on public.xxfp_groups
for select to authenticated
using (public.is_product_owner() or group_id in (select public.user_group_ids()) or created_by = public.current_auth_user_id());
create policy xxfp_groups_insert_own on public.xxfp_groups
for insert to authenticated
with check (public.is_product_owner() or created_by = public.current_auth_user_id());
create policy xxfp_groups_update_admin on public.xxfp_groups
for update to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy xxfp_groups_delete_owner_only on public.xxfp_groups
for delete to authenticated
using (public.is_product_owner());

create policy xxfp_members_read_tenant on public.xxfp_group_members
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_members_insert_admin on public.xxfp_group_members
for insert to authenticated
with check (public.is_group_admin(group_id));
create policy xxfp_members_update_admin_or_self on public.xxfp_group_members
for update to authenticated
using (public.is_group_admin(group_id) or member_id in (select public.current_member_ids()))
with check (public.is_group_admin(group_id) or member_id in (select public.current_member_ids()));
create policy xxfp_members_delete_admin on public.xxfp_group_members
for delete to authenticated
using (public.is_group_admin(group_id));

create policy xxfp_member_status_read_tenant on public.xxfp_member_status_history
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_member_status_manage_admin on public.xxfp_member_status_history
for all to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy xxfp_group_setup_read_tenant on public.xxfp_group_setup
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_group_setup_manage_admin on public.xxfp_group_setup
for all to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy xxfp_member_setup_read_tenant on public.xxfp_member_setup
for select to authenticated
using (public.is_group_member(public.member_group_id(member_id)));
create policy xxfp_member_setup_manage_admin on public.xxfp_member_setup
for all to authenticated
using (public.is_group_admin(public.member_group_id(member_id)))
with check (public.is_group_admin(public.member_group_id(member_id)));

create policy xxfp_periods_read_tenant on public.xxfp_periods
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_periods_manage_admin on public.xxfp_periods
for all to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy xxfp_trx_header_read_tenant on public.xxfp_trx_header
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_trx_header_insert_admin_or_self on public.xxfp_trx_header
for insert to authenticated
with check (
  public.is_group_admin(group_id)
  or (public.is_group_member(group_id) and member_id in (select public.current_member_ids()))
);
create policy xxfp_trx_header_update_pending_admin_or_approver on public.xxfp_trx_header
for update to authenticated
using (
  public.is_group_approver(group_id)
  and upper(coalesce(approval_status, '')) not in ('COMPLETED', 'APPROVED')
)
with check (public.is_group_approver(group_id));

create policy xxfp_trx_lines_read_tenant on public.xxfp_trx_lines
for select to authenticated
using (public.is_group_member(public.transaction_group_id(member_trx_id)));
create policy xxfp_trx_lines_insert_tenant on public.xxfp_trx_lines
for insert to authenticated
with check (public.is_group_member(public.transaction_group_id(member_trx_id)));
create policy xxfp_trx_lines_update_pending_admin_or_approver on public.xxfp_trx_lines
for update to authenticated
using (public.is_group_approver(public.transaction_group_id(member_trx_id)))
with check (public.is_group_approver(public.transaction_group_id(member_trx_id)));

create policy xxfp_loan_requests_read_tenant on public.xxfp_loan_requests
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_loan_requests_insert_admin_or_self on public.xxfp_loan_requests
for insert to authenticated
with check (
  public.is_group_admin(group_id)
  or (public.is_group_member(group_id) and member_id in (select public.current_member_ids()))
);
create policy xxfp_loan_requests_update_admin_or_approver on public.xxfp_loan_requests
for update to authenticated
using (public.is_group_approver(group_id)) with check (public.is_group_approver(group_id));

create policy xxfp_loan_header_read_tenant on public.xxfp_loan_header
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_loan_header_manage_admin_or_approver on public.xxfp_loan_header
for all to authenticated
using (public.is_group_approver(group_id)) with check (public.is_group_approver(group_id));

create policy xxfp_loan_schedule_read_tenant on public.xxfp_loan_schedule
for select to authenticated
using (public.is_group_member(public.loan_group_id(loan_id)));
create policy xxfp_loan_schedule_manage_admin_or_approver on public.xxfp_loan_schedule
for all to authenticated
using (public.is_group_approver(public.loan_group_id(loan_id)))
with check (public.is_group_approver(public.loan_group_id(loan_id)));

create policy xxfp_approvals_read_assigned_or_tenant_admin on public.xxfp_approval_header
for select to authenticated
using (
  public.is_product_owner()
  or approver_member_id in (select public.current_member_ids())
  or public.is_group_admin(group_id)
);
create policy xxfp_approvals_insert_admin on public.xxfp_approval_header
for insert to authenticated
with check (public.is_group_admin(group_id));
create policy xxfp_approvals_update_assigned on public.xxfp_approval_header
for update to authenticated
using (
  public.is_product_owner()
  or approver_member_id in (select public.current_member_ids())
  or public.is_group_admin(group_id)
)
with check (
  public.is_product_owner()
  or approver_member_id in (select public.current_member_ids())
  or public.is_group_admin(group_id)
);

create policy xxfp_legacy_data_read_tenant on public.xxfp_legacy_data
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_legacy_data_manage_admin on public.xxfp_legacy_data
for all to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy xxfp_expense_header_read_tenant on public.xxfp_group_expense_header
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_expense_header_manage_admin on public.xxfp_group_expense_header
for all to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy xxfp_expense_lines_read_tenant on public.xxfp_group_expense_lines
for select to authenticated
using (public.is_group_member(public.expense_group_id(group_expense_id)));
create policy xxfp_expense_lines_manage_admin on public.xxfp_group_expense_lines
for all to authenticated
using (public.is_group_admin(public.expense_group_id(group_expense_id)))
with check (public.is_group_admin(public.expense_group_id(group_expense_id)));

create policy xxfp_share_distribution_read_tenant on public.xxfp_share_distribution
for select to authenticated
using (public.is_group_member(public.member_group_id(member_id)));
create policy xxfp_share_distribution_insert_admin on public.xxfp_share_distribution
for insert to authenticated
with check (public.is_group_admin(public.member_group_id(member_id)));

create policy xxfp_share_adjustments_read_tenant on public.xxfp_share_adjustments
for select to authenticated
using (public.is_group_member(public.member_group_id(member_id)));
create policy xxfp_share_adjustments_manage_admin on public.xxfp_share_adjustments
for all to authenticated
using (public.is_group_admin(public.member_group_id(member_id)))
with check (public.is_group_admin(public.member_group_id(member_id)));

create policy xxfp_audit_read_tenant on public.xxfp_audit_log
for select to authenticated
using (
  public.is_product_owner()
  or public.is_group_member(public.transaction_group_id(trx_id))
  or trx_id is null
);
create policy xxfp_audit_insert_tenant on public.xxfp_audit_log
for insert to authenticated
with check (
  public.is_product_owner()
  or public.is_group_member(public.transaction_group_id(trx_id))
  or trx_id is null
);

create policy xxfp_subscription_plans_public_read on public.xxfp_subscription_plans
for select to anon, authenticated using (true);
create policy xxfp_subscription_plans_owner_manage on public.xxfp_subscription_plans
for all to authenticated using (public.is_product_owner()) with check (public.is_product_owner());

create policy xxfp_group_subscriptions_read_tenant on public.xxfp_group_subscriptions
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_group_subscriptions_manage_admin on public.xxfp_group_subscriptions
for all to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy xxfp_withdrawal_requests_read_tenant on public.xxfp_withdrawal_requests
for select to authenticated
using (
  public.is_product_owner()
  or public.is_group_member(group_id)
  or member_id in (select public.current_member_ids())
);
create policy xxfp_withdrawal_requests_insert_self on public.xxfp_withdrawal_requests
for insert to authenticated
with check (
  public.is_group_member(group_id)
  and member_id in (select public.current_member_ids())
);
create policy xxfp_withdrawal_requests_update_admin_or_approver on public.xxfp_withdrawal_requests
for update to authenticated
using (public.is_group_approver(group_id)) with check (public.is_group_approver(group_id));

create policy xxfp_support_disputes_read_tenant on public.xxfp_support_disputes
for select to authenticated
using (
  public.is_product_owner()
  or public.is_group_member(group_id)
  or member_id in (select public.current_member_ids())
  or created_by = public.current_auth_user_id()
);
create policy xxfp_support_disputes_insert_self on public.xxfp_support_disputes
for insert to authenticated
with check (
  public.is_product_owner()
  or public.is_group_member(group_id)
  or member_id in (select public.current_member_ids())
);
create policy xxfp_support_disputes_update_owner_or_creator on public.xxfp_support_disputes
for update to authenticated
using (
  public.is_product_owner()
  or created_by = public.current_auth_user_id()
)
with check (
  public.is_product_owner()
  or created_by = public.current_auth_user_id()
);

create policy xxfp_legacy_group_opening_read_tenant on public.xxfp_legacy_group_opening
for select to authenticated
using (public.is_group_member(group_id));
create policy xxfp_legacy_group_opening_manage_admin on public.xxfp_legacy_group_opening
for all to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy xxfp_pending_setup_changes_read_tenant on public.xxfp_pending_setup_changes
for select to authenticated
using (public.is_product_owner() or public.is_group_member(group_id));
create policy xxfp_pending_setup_changes_insert_admin on public.xxfp_pending_setup_changes
for insert to authenticated
with check (public.is_group_admin(group_id));
create policy xxfp_pending_setup_changes_update_admin_or_approver on public.xxfp_pending_setup_changes
for update to authenticated
using (public.is_group_approver(group_id)) with check (public.is_group_approver(group_id));

-- Internal machinery: only the product owner or the defining application role
create policy xxfp_doc_sequences_manage on public.xxfp_doc_sequences
for all to authenticated
using (public.is_product_owner()) with check (public.is_product_owner());

create policy xxfp_staging_all_authenticated on public.xxfp_int_import_batch
for all to authenticated using (true) with check (true);
create policy xxfp_stg_member_all_authenticated on public.xxfp_stg_member_imp
for all to authenticated using (true) with check (true);
create policy xxfp_stg_trx_all_authenticated on public.xxfp_stg_trx_imp
for all to authenticated using (true) with check (true);

-- =============================================================================
-- 8. DEFAULT PRIVILEGES FOR FUTURE OBJECTS
-- =============================================================================
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant usage, select on sequences to anon;
alter default privileges in schema public grant execute on functions to authenticated;
alter default privileges in schema public grant execute on functions to anon;

commit;
