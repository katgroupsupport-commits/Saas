-- Oracle-style accounting backbone for Bachat Gat SaaS.
-- Members and groups stay as master data. Money movement lives in numbered,
-- auditable line tables so mistakes can be reversed or adjusted without editing history.

create table if not exists public.document_sequences (
  group_id uuid not null references public.groups(id) on delete cascade,
  document_type text not null check (document_type in ('TRX', 'LOAN', 'ADJ')),
  next_value bigint not null default 1,
  primary key (group_id, document_type)
);

create or replace function public.next_document_number(target_group_id uuid, target_document_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  insert into public.document_sequences (group_id, document_type, next_value)
  values (target_group_id, target_document_type, 2)
  on conflict (group_id, document_type)
  do update set next_value = public.document_sequences.next_value + 1
  returning next_value - 1 into v_next;

  return target_document_type || '-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_next::text, 6, '0');
end;
$$;

alter table public.savings_transactions
  add column if not exists transaction_number text,
  add column if not exists source_type text not null default 'Manual',
  add column if not exists entry_status text not null default 'Posted',
  add column if not exists reversed_by uuid references public.savings_transactions(id),
  add column if not exists reversal_of uuid references public.savings_transactions(id),
  add column if not exists reversal_reason text;

do $$
begin
  alter table public.savings_transactions drop constraint if exists savings_transactions_transaction_type_check;
  alter table public.savings_transactions
    add constraint savings_transactions_transaction_type_check
    check (transaction_type in ('Savings Collection', 'Extra Deposit', 'Withdrawal', 'Legacy Migration', 'Adjustment', 'Reversal'));
exception when duplicate_object then
  null;
end;
$$;

create unique index if not exists savings_transactions_group_trx_number_uq
  on public.savings_transactions (group_id, transaction_number)
  where transaction_number is not null;

alter table public.loan_master
  add column if not exists loan_number text,
  add column if not exists source_type text not null default 'Manual',
  add column if not exists reversed_by uuid references public.loan_master(id),
  add column if not exists reversal_of uuid references public.loan_master(id),
  add column if not exists reversal_reason text,
  add column if not exists updated_at timestamptz;

do $$
begin
  alter table public.loan_master drop constraint if exists loan_master_duration_months_check;
  alter table public.loan_master
    add constraint loan_master_duration_months_check check (duration_months >= 0);
exception when duplicate_object then
  null;
end;
$$;

create unique index if not exists loan_master_group_loan_number_uq
  on public.loan_master (group_id, loan_number)
  where loan_number is not null;

alter table public.repayment_transactions
  add column if not exists transaction_number text,
  add column if not exists entry_status text not null default 'Posted',
  add column if not exists reversed_by uuid references public.repayment_transactions(id),
  add column if not exists reversal_of uuid references public.repayment_transactions(id),
  add column if not exists reversal_reason text;

create unique index if not exists repayment_transactions_group_trx_number_uq
  on public.repayment_transactions (group_id, transaction_number)
  where transaction_number is not null;

create table if not exists public.transaction_ledger_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.savings_transactions(id) on delete cascade,
  transaction_number text not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id),
  period_id uuid references public.periods(id),
  line_number int not null check (line_number > 0),
  line_type text not null check (line_type in ('SAVINGS', 'LOAN_PRINCIPAL', 'LOAN_INTEREST', 'LOAN_PENALTY', 'EXCESS')),
  line_amount numeric(14, 2) not null check (line_amount <> 0),
  accounting_date date not null,
  entry_status text not null default 'Posted' check (entry_status in ('Posted', 'Reversed')),
  reversal_of uuid references public.transaction_ledger_lines(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (transaction_id, line_number)
);

create index if not exists transaction_ledger_lines_member_idx
  on public.transaction_ledger_lines (group_id, member_id, accounting_date);

create table if not exists public.loan_account_lines (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loan_master(id) on delete cascade,
  loan_number text not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id),
  line_number int not null check (line_number > 0),
  line_type text not null check (line_type in (
    'PRINCIPAL_DISBURSEMENT',
    'INTEREST_OPENING',
    'PENALTY_OPENING',
    'PRINCIPAL_ADJUSTMENT',
    'INTEREST_ADJUSTMENT',
    'PENALTY_ADJUSTMENT',
    'REVERSAL'
  )),
  line_amount numeric(14, 2) not null check (line_amount <> 0),
  accounting_date date not null,
  entry_status text not null default 'Posted' check (entry_status in ('Posted', 'Reversed')),
  reversal_of uuid references public.loan_account_lines(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (loan_id, line_number)
);

create index if not exists loan_account_lines_member_idx
  on public.loan_account_lines (group_id, member_id, accounting_date);

create or replace function public.assign_transaction_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transaction_number is null then
    new.transaction_number := public.next_document_number(new.group_id, 'TRX');
  end if;

  return new;
end;
$$;

create or replace function public.assign_loan_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.loan_number is null then
    new.loan_number := public.next_document_number(new.group_id, 'LOAN');
  end if;

  return new;
end;
$$;

drop trigger if exists assign_savings_transaction_number on public.savings_transactions;
create trigger assign_savings_transaction_number
before insert on public.savings_transactions
for each row execute function public.assign_transaction_number();

drop trigger if exists assign_repayment_transaction_number on public.repayment_transactions;
create trigger assign_repayment_transaction_number
before insert on public.repayment_transactions
for each row execute function public.assign_transaction_number();

drop trigger if exists assign_loan_number on public.loan_master;
create trigger assign_loan_number
before insert on public.loan_master
for each row execute function public.assign_loan_number();

create or replace view public.member_account_balances as
with transaction_balances as (
  select
    member_id,
    group_id,
    coalesce(sum(line_amount) filter (where line_type in ('SAVINGS', 'EXCESS') and entry_status = 'Posted'), 0) as savings,
    coalesce(sum(line_amount) filter (where line_type = 'LOAN_PRINCIPAL' and entry_status = 'Posted'), 0) as principal_delta,
    coalesce(sum(line_amount) filter (where line_type = 'LOAN_INTEREST' and entry_status = 'Posted'), 0) as interest_delta,
    coalesce(sum(line_amount) filter (where line_type = 'LOAN_PENALTY' and entry_status = 'Posted'), 0) as penalty_delta
  from public.transaction_ledger_lines
  group by member_id, group_id
),
loan_balances as (
  select
    member_id,
    group_id,
    coalesce(sum(line_amount) filter (where line_type like '%PRINCIPAL%' and entry_status = 'Posted'), 0) as principal_opening,
    coalesce(sum(line_amount) filter (where line_type like '%INTEREST%' and entry_status = 'Posted'), 0) as interest_opening,
    coalesce(sum(line_amount) filter (where line_type like '%PENALTY%' and entry_status = 'Posted'), 0) as penalty_opening
  from public.loan_account_lines
  group by member_id, group_id
)
select
  gm.id as member_id,
  gm.group_id,
  coalesce(tb.savings, 0) as savings,
  greatest(0, coalesce(lb.principal_opening, 0) + coalesce(tb.principal_delta, 0)) as loan_outstanding,
  greatest(0, coalesce(lb.interest_opening, 0) + coalesce(tb.interest_delta, 0)) as interest_outstanding,
  greatest(0, coalesce(lb.penalty_opening, 0) + coalesce(tb.penalty_delta, 0)) as penalty_outstanding
from public.group_members gm
left join transaction_balances tb on tb.member_id = gm.id
left join loan_balances lb on lb.member_id = gm.id;

create or replace view public.loan_account_balances as
select
  lm.id as loan_id,
  lm.group_id,
  lm.member_id,
  greatest(0, coalesce(sum(lal.line_amount) filter (where lal.line_type like '%PRINCIPAL%' and lal.entry_status = 'Posted'), 0)) as principal_outstanding,
  greatest(0, coalesce(sum(lal.line_amount) filter (where lal.line_type like '%INTEREST%' and lal.entry_status = 'Posted'), 0)) as interest_outstanding,
  greatest(0, coalesce(sum(lal.line_amount) filter (where lal.line_type like '%PENALTY%' and lal.entry_status = 'Posted'), 0)) as penalty_outstanding
from public.loan_master lm
left join public.loan_account_lines lal on lal.loan_id = lm.id
group by lm.id, lm.group_id, lm.member_id;

create or replace function public.process_legacy_member_import(target_import_id uuid)
returns table(import_id uuid, processed boolean, error_text text)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.legacy_member_imports%rowtype;
  v_period_id uuid;
  v_transaction_id uuid;
  v_transaction_number text;
  v_loan_id uuid;
  v_loan_number text;
  v_line_number int;
  v_savings_amount numeric(14, 2);
  v_loan_total numeric(14, 2);
begin
  select * into rec
  from public.legacy_member_imports
  where id = target_import_id
  for update;

  if not found then
    import_id := target_import_id;
    processed := false;
    error_text := 'Legacy import not found';
    return next;
    return;
  end if;

  if rec.processed then
    import_id := rec.id;
    processed := true;
    error_text := null;
    return next;
    return;
  end if;

  begin
    update public.group_members gm
    set date_joined = coalesce(rec.joined_date, gm.date_joined)
    where gm.id = rec.member_id;

    select id into v_period_id
    from public.periods
    where group_id = rec.group_id and status = 'Open'
    order by start_date desc
    limit 1;

    v_savings_amount := coalesce(rec.total_saving, 0) + coalesce(rec.excess_amount, 0);
    if v_savings_amount > 0 then
      insert into public.savings_transactions (
        group_id, member_id, period_id, transaction_date, amount, transaction_type,
        approval_status, source_type, created_by
      ) values (
        rec.group_id, rec.member_id, v_period_id, coalesce(rec.joined_date, now()::date),
        v_savings_amount, 'Legacy Migration', 'Approved', 'Legacy Migration', rec.created_by
      )
      returning id, transaction_number into v_transaction_id, v_transaction_number;

      insert into public.transaction_ledger_lines (
        transaction_id, transaction_number, group_id, member_id, period_id,
        line_number, line_type, line_amount, accounting_date, created_by
      ) values (
        v_transaction_id, v_transaction_number, rec.group_id, rec.member_id, v_period_id,
        1, 'SAVINGS', v_savings_amount, coalesce(rec.joined_date, now()::date), rec.created_by
      );
    end if;

    v_loan_total := coalesce(rec.pending_loan, 0) + coalesce(rec.interest_amount, 0) + coalesce(rec.penalty_amount, 0);
    if v_loan_total > 0 then
      insert into public.loan_master (
        group_id, member_id, loan_amount, loan_reason, interest_rate, duration_months,
        start_date, status, principal_outstanding, interest_outstanding, penalty_outstanding,
        source_type, created_by, created_at
      ) values (
        rec.group_id, rec.member_id, v_loan_total, 'Legacy migration balance', 0, 0,
        coalesce(rec.joined_date, now()::date), 'Active', coalesce(rec.pending_loan, 0),
        coalesce(rec.interest_amount, 0), coalesce(rec.penalty_amount, 0),
        'Legacy Migration', rec.created_by, now()
      )
      returning id, loan_number into v_loan_id, v_loan_number;

      v_line_number := 1;
      if coalesce(rec.pending_loan, 0) <> 0 then
        insert into public.loan_account_lines (loan_id, loan_number, group_id, member_id, line_number, line_type, line_amount, accounting_date, created_by)
        values (v_loan_id, v_loan_number, rec.group_id, rec.member_id, v_line_number, 'PRINCIPAL_DISBURSEMENT', rec.pending_loan, coalesce(rec.joined_date, now()::date), rec.created_by);
        v_line_number := v_line_number + 1;
      end if;
      if coalesce(rec.interest_amount, 0) <> 0 then
        insert into public.loan_account_lines (loan_id, loan_number, group_id, member_id, line_number, line_type, line_amount, accounting_date, created_by)
        values (v_loan_id, v_loan_number, rec.group_id, rec.member_id, v_line_number, 'INTEREST_OPENING', rec.interest_amount, coalesce(rec.joined_date, now()::date), rec.created_by);
        v_line_number := v_line_number + 1;
      end if;
      if coalesce(rec.penalty_amount, 0) <> 0 then
        insert into public.loan_account_lines (loan_id, loan_number, group_id, member_id, line_number, line_type, line_amount, accounting_date, created_by)
        values (v_loan_id, v_loan_number, rec.group_id, rec.member_id, v_line_number, 'PENALTY_OPENING', rec.penalty_amount, coalesce(rec.joined_date, now()::date), rec.created_by);
      end if;
    end if;

    update public.legacy_member_imports
    set processed = true, processed_at = now()
    where id = rec.id;

    import_id := rec.id;
    processed := true;
    error_text := null;
    return next;
  exception when others then
    import_id := rec.id;
    processed := false;
    error_text := sqlstate || ': ' || coalesce(sqlerrm, 'unknown error');
    return next;
  end;
end;
$$;

create or replace function public.process_legacy_member_imports(batch_size int default 100)
returns table(import_id uuid, processed boolean, error_text text)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    select id
    from public.legacy_member_imports
    where processed = false
    order by created_at
    for update skip locked
    limit batch_size
  loop
    return query select * from public.process_legacy_member_import(rec.id);
  end loop;
end;
$$;

alter table public.document_sequences enable row level security;
alter table public.transaction_ledger_lines enable row level security;
alter table public.loan_account_lines enable row level security;

create policy "document sequences visible within tenant"
on public.document_sequences for select
using (group_id in (select public.user_group_ids()));

create policy "transaction ledger visible within tenant"
on public.transaction_ledger_lines for select
using (group_id in (select public.user_group_ids()));

create policy "collectors can create transaction ledger lines"
on public.transaction_ledger_lines for insert
with check (public.is_group_collector_or_admin(group_id));

drop policy if exists "members can create own transaction ledger lines" on public.transaction_ledger_lines;
create policy "members can create own transaction ledger lines"
on public.transaction_ledger_lines for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.group_members gm
    where gm.id = transaction_ledger_lines.member_id
      and gm.group_id = transaction_ledger_lines.group_id
      and gm.active = true
      and (
        gm.user_id = auth.uid()
        or public.is_group_collector_or_admin(transaction_ledger_lines.group_id)
      )
  )
);

create policy "loan lines visible within tenant"
on public.loan_account_lines for select
using (group_id in (select public.user_group_ids()));

create policy "collectors and admins can create loan lines"
on public.loan_account_lines for insert
with check (public.is_group_collector_or_admin(group_id));

drop policy if exists "members can create own loan lines" on public.loan_account_lines;
create policy "members can create own loan lines"
on public.loan_account_lines for insert
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.group_members gm
    where gm.id = loan_account_lines.member_id
      and gm.group_id = loan_account_lines.group_id
      and gm.active = true
      and (
        gm.user_id = auth.uid()
        or public.is_group_collector_or_admin(loan_account_lines.group_id)
      )
  )
);

grant select, insert, update on public.document_sequences to authenticated;
grant select, insert on public.transaction_ledger_lines to authenticated;
grant select, insert on public.loan_account_lines to authenticated;
grant select on public.member_account_balances to authenticated;
grant select on public.loan_account_balances to authenticated;
grant execute on function public.next_document_number(uuid, text) to authenticated;
grant execute on function public.process_legacy_member_import(uuid) to authenticated;
grant execute on function public.process_legacy_member_imports(int) to authenticated;

comment on column public.group_members.savings is 'Deprecated cache. Canonical savings now come from transaction_ledger_lines/member_account_balances.';
comment on column public.group_members.loan_outstanding is 'Deprecated cache. Canonical loan balances now come from loan_account_lines/member_account_balances.';
comment on column public.group_members.interest_outstanding is 'Deprecated cache. Canonical interest balances now come from loan_account_lines/member_account_balances.';
comment on column public.group_members.penalty_outstanding is 'Deprecated cache. Canonical penalty balances now come from loan_account_lines/member_account_balances.';
