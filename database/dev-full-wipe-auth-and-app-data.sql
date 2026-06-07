-- DEV ONLY: destructive reset for scratch testing.
-- This deletes Supabase Auth accounts and all public app data.
-- Do not run this on production or any project with real users.

do $$
declare
  obj record;
begin
  for obj in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('truncate table %I.%I restart identity cascade', obj.schemaname, obj.tablename);
  end loop;
end $$;

delete from auth.identities;
delete from auth.sessions;
delete from auth.refresh_tokens;
delete from auth.mfa_factors;
delete from auth.mfa_challenges;
delete from auth.one_time_tokens;
delete from auth.users;

insert into public.roles (role_name, description)
values
  ('Super Admin', 'Platform administrator'),
  ('Group Admin', 'Group owner or administrator'),
  ('Collector', 'Collection operator'),
  ('Approver', 'Approval authority'),
  ('Member', 'Group member')
on conflict (role_name) do nothing;

insert into public.subscription_plans (plan_name, duration, amount, max_members, features)
values
  ('Free', 'Free', 0, 5, '1 group,5 members,Basic savings and loan tracking,Member app access'),
  ('Starter', 'Monthly', 99, 999999, '1 group,Unlimited members,Approvals,Audit control,Role control,Free member app access,Contact support to setup your group,Technical issue support'),
  ('Starter', 'Yearly', 999, 999999, '1 group,Unlimited members,Approvals,Audit control,Role control,Free member app access,Contact support to setup your group,Technical issue support'),
  ('Growth', 'Monthly', 299, 999999, 'Everything in Starter,Group management query support,Assisted transaction entry support,Daily/monthly adjustment support'),
  ('Growth', 'Yearly', 2999, 999999, 'Everything in Starter,Group management query support,Assisted transaction entry support,Daily/monthly adjustment support'),
  ('Premium', 'Monthly', 999, 999999, 'Everything in Growth,Priority support,Advanced reconciliation support,Dedicated setup guidance'),
  ('Premium', 'Yearly', 9999, 999999, 'Everything in Growth,Priority support,Advanced reconciliation support,Dedicated setup guidance');
