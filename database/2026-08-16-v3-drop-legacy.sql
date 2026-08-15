-- =============================================================================
-- Bachat Gat SaaS - XXFP_ cleanup: drop legacy RPCs and any leftover old tables
-- Date: 2026-08-16
--
-- Run AFTER the xxfp migration is applied (schema -> migrate-data -> v4 ->
-- functions-and-triggers). This file removes:
--   1. Old RPC functions that the app no longer calls and that are NOT
--      redefined by the new functions-and-triggers file (their bodies still
--      reference the dropped v2 tables).
--   2. Any leftover v2 tables/views that were not dropped by migrate-data.
--
-- Safe to run multiple times.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DROP OLD RPC FUNCTIONS (by name, any signature)
-- ---------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        '_sum_completed_ledger_lines',
        'rpc_dashboard_card_summary',
        'rpc_get_dashboard_summary',
        'rpc_group_finance_summary',
        'rpc_loan_aging_summary',
        'rpc_member_dashboard_card_summary',
        'rpc_member_finance_summary',
        'rpc_member_loan_interest_due',
        'rpc_member_loan_interest_due_details',
        'rpc_member_statement_summary'
      )
  loop
    execute format('drop function if exists %I.%I cascade', fn.nspname, fn.proname);
    raise notice 'dropped function %', fn.proname;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. DROP LEFTOVER OLD TABLES / VIEWS (handles table, view, matview)
-- ---------------------------------------------------------------------------
do $$
declare
  obj record;
  relkind char;
begin
  for obj in select unnest(array[
    'group_subscriptions', 'subscription_plans', 'trx_audit_history',
    'share_adjustments', 'share_distribution', 'group_expense_lines',
    'group_expense_header', 'legacy_data', 'approvals',
    'loan_repayment_schedule', 'loan_distribution', 'loan_requests',
    'member_transaction_lines', 'member_transaction_header', 'periods',
    'member_setup', 'group_setup', 'member_status_history', 'auth_users',
    'members', 'groups', 'roles', 'pending_setup_changes',
    'withdrawal_requests', 'support_disputes', 'legacy_group_opening',
    'document_sequences', 'member_dashboard_balances',
    'group_dashboard_balances'
  ]) as name
  loop
    select c.relkind into relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = obj.name
    limit 1;

    if relkind in ('r', 'p') then
      execute format('drop table if exists public.%I cascade', obj.name);
      raise notice 'dropped table %', obj.name;
    elsif relkind = 'v' then
      execute format('drop view if exists public.%I cascade', obj.name);
      raise notice 'dropped view %', obj.name;
    elsif relkind = 'm' then
      execute format('drop materialized view if exists public.%I cascade', obj.name);
      raise notice 'dropped materialized view %', obj.name;
    end if;
  end loop;
end $$;
