-- Hotfix for transaction_ledger_lines RLS failures when the transaction row
-- is allowed but the ledger line insert is blocked. This keeps tenant safety:
-- the line member must belong to the same group and be either the signed-in
-- member or posted by a collector/admin for that group.

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
