-- Function to process legacy_member_imports rows transactionally.
-- For each unprocessed import it updates the corresponding group_members row,
-- updates or creates a synthetic loan in loan_master, and marks the import processed.

create or replace function public.process_legacy_member_imports(batch_size int default 100)
returns table(import_id uuid, processed boolean, error_text text)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_loan_id uuid;
begin
  for rec in
    select * from public.legacy_member_imports
    where processed = false
    order by created_at
    for update skip locked
    limit batch_size
  loop
    begin
      -- update group_members with aggregated values
      update public.group_members gm
      set
        date_joined = coalesce(rec.joined_date, gm.date_joined),
        savings = coalesce(gm.savings,0) + coalesce(rec.total_saving,0),
        loan_outstanding = coalesce(gm.loan_outstanding,0) + coalesce(rec.pending_loan,0),
        interest_outstanding = coalesce(gm.interest_outstanding,0) + coalesce(rec.interest_amount,0),
        penalty_outstanding = coalesce(gm.penalty_outstanding,0) + coalesce(rec.penalty_amount,0)
      where gm.id = rec.member_id;

      -- try to find an existing active loan with principal outstanding
      select id into v_loan_id
      from public.loan_master lm
      where lm.member_id = rec.member_id and lm.group_id = rec.group_id and coalesce(lm.principal_outstanding,0) > 0
      order by created_at asc
      limit 1
      for update;

      if v_loan_id is not null then
        update public.loan_master
        set
          principal_outstanding = coalesce(principal_outstanding,0) + coalesce(rec.pending_loan,0),
          interest_outstanding = coalesce(interest_outstanding,0) + coalesce(rec.interest_amount,0),
          penalty_outstanding = coalesce(penalty_outstanding,0) + coalesce(rec.penalty_amount,0),
          updated_at = now()
        where id = v_loan_id;
      else
        -- insert synthetic loan record for migrated balance
        insert into public.loan_master (
          id, group_id, member_id, loan_amount, loan_reason, interest_rate, duration_months,
          start_date, status, principal_outstanding, interest_outstanding, penalty_outstanding, created_by, created_at
        ) values (
          gen_random_uuid(), rec.group_id, rec.member_id,
          coalesce(rec.pending_loan,0) + coalesce(rec.interest_amount,0) + coalesce(rec.penalty_amount,0),
          'Legacy migration balance', 0, 0,
          coalesce(rec.joined_date, now()::date), 'Active', coalesce(rec.pending_loan,0), coalesce(rec.interest_amount,0), coalesce(rec.penalty_amount,0), rec.created_by, now()
        );
      end if;

      update public.legacy_member_imports
      set processed = true, processed_at = now()
      where id = rec.id;

      import_id := rec.id;
      processed := true;
      error_text := null;
      return next;
    exception when others then
      -- record error and continue with next
      update public.legacy_member_imports
      set processed = false, processed_at = now()
      where id = rec.id;
      import_id := rec.id;
      processed := false;
      error_text := sqlstate || ': ' || coalesce(quote_literal(sqlerrm), 'unknown error');
      return next;
    end;
  end loop;

  return;
end;
$$;

grant execute on function public.process_legacy_member_imports(int) to authenticated;
grant execute on function public.process_legacy_member_imports(int) to anon;
