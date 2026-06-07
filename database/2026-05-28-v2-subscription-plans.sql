delete from public.subscription_plans
where plan_name in ('Free', 'Starter', 'Growth', 'Premium', 'Scale');

insert into public.subscription_plans (plan_name, duration, amount, max_members, features)
values
  ('Free', 'Free', 0, 5, '1 group,5 members,Basic savings and loan tracking,Member app access'),
  ('Starter', 'Monthly', 99, 999999, '1 group,Unlimited members,Approvals,Audit control,Role control,Free member app access,Contact support to setup your group,Technical issue support'),
  ('Starter', 'Yearly', 999, 999999, '1 group,Unlimited members,Approvals,Audit control,Role control,Free member app access,Contact support to setup your group,Technical issue support'),
  ('Growth', 'Monthly', 299, 999999, 'Everything in Starter,Group management query support,Assisted transaction entry support,Daily/monthly adjustment support'),
  ('Growth', 'Yearly', 2999, 999999, 'Everything in Starter,Group management query support,Assisted transaction entry support,Daily/monthly adjustment support'),
  ('Premium', 'Monthly', 999, 999999, 'Everything in Growth,Priority support,Advanced reconciliation support,Dedicated setup guidance'),
  ('Premium', 'Yearly', 9999, 999999, 'Everything in Growth,Priority support,Advanced reconciliation support,Dedicated setup guidance');
