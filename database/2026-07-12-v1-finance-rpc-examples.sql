-- Example Supabase SQL calls after applying the migration files.
-- Run these from Supabase SQL Editor to verify the functions work.

-- 1) Group summary payload
select public.rpc_group_finance_summary(
  1::bigint,
  null,
  current_date
);

-- 2) Member summary payload
select public.rpc_member_finance_summary(
  1::bigint,
  1::bigint,
  null,
  current_date
);

-- 3) Current due rows
select * from public.rpc_pending_dues(
  1::bigint,
  null,
  current_date
);

-- 4) Share distribution
select * from public.rpc_member_share_distribution(
  1::bigint,
  10000,
  current_date
);
