-- Hotfix for existing Supabase databases that already ran the first
-- Oracle-style ledger migration. The previous shared trigger function touched
-- transaction_number and loan_number from the same NEW record, which fails on
-- savings_transactions because that row has no loan_number field.

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

drop function if exists public.assign_document_numbers();

grant execute on function public.assign_transaction_number() to authenticated;
grant execute on function public.assign_loan_number() to authenticated;
