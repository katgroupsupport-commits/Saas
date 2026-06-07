-- Group reconciliation queries for future audits and reporting
-- Replace :group_id with the target group UUID.

-- 1. Total savings collected for the group
-- This includes member savings and any migrated outstanding saving amounts stored in the group_members table.
SELECT
  g.id AS group_id,
  g.group_name,
  COALESCE(SUM(gm.savings), 0) AS total_savings_collected,
  COALESCE(SUM(gm.other_amount), 0) AS total_extra_amount,
  COALESCE(SUM(gm.savings), 0) + COALESCE(SUM(gm.other_amount), 0) AS total_savings_plus_extras
FROM public.group_members gm
JOIN public.groups g ON g.id = gm.group_id
WHERE gm.group_id = :group_id
GROUP BY g.id, g.group_name;

-- 2. Active loan outstanding (distributed to members, yet to collect)
SELECT
  COUNT(*) AS active_loan_count,
  COALESCE(SUM(lm.principal_outstanding), 0) AS total_active_loan_outstanding,
  COALESCE(SUM(lm.interest_outstanding), 0) AS total_interest_outstanding,
  COALESCE(SUM(lm.penalty_outstanding), 0) AS total_penalty_outstanding
FROM public.loan_master lm
WHERE lm.group_id = :group_id
  AND lm.status = 'Active';

-- 3. Remaining balance after outstanding loans
-- This shows how much of the collected savings remains after member loans that are still outstanding.
WITH loans AS (
  SELECT COALESCE(SUM(principal_outstanding), 0) AS total_active_loan
  FROM public.loan_master
  WHERE group_id = :group_id
    AND status = 'Active'
),
 savings AS (
  SELECT COALESCE(SUM(savings), 0) AS total_savings
  FROM public.group_members
  WHERE group_id = :group_id
)
SELECT
  savings.total_savings,
  loans.total_active_loan,
  savings.total_savings - loans.total_active_loan AS remaining_balance_after_loans
FROM savings, loans;

-- 4. Group gain from interest and penalty amounts
-- Use loan balances to estimate gain beyond core savings. If your gain should include other collected fees, add those columns.
SELECT
  COALESCE(SUM(interest_outstanding), 0) AS total_interest_gain,
  COALESCE(SUM(penalty_outstanding), 0) AS total_penalty_gain,
  COALESCE(SUM(interest_outstanding), 0) + COALESCE(SUM(penalty_outstanding), 0) AS total_group_gain
FROM public.loan_master
WHERE group_id = :group_id
  AND status = 'Active';

-- 5. Individual share allocation based on saving duration and active period
-- This weights each member by their savings amount and active membership duration.
-- Extra amounts collected within the active period can be included via other_amount.
WITH member_weights AS (
  SELECT
    gm.id AS member_id,
    gm.full_name,
    gm.savings,
    gm.other_amount,
    gm.date_joined,
    GREATEST(1, DATE_PART('day', NOW()::date - gm.date_joined)) AS days_active,
    (COALESCE(gm.savings, 0) * GREATEST(1, DATE_PART('day', NOW()::date - gm.date_joined))) + COALESCE(gm.other_amount, 0) AS weight
  FROM public.group_members gm
  WHERE gm.group_id = :group_id
    AND gm.active = TRUE
)
SELECT
  mw.member_id,
  mw.full_name,
  mw.savings AS total_savings,
  mw.other_amount AS extra_active_period_amount,
  mw.days_active,
  mw.weight,
  COALESCE(mw.weight / NULLIF(SUM(mw.weight) OVER (), 0), 0) AS share_ratio
FROM member_weights mw
ORDER BY mw.weight DESC;

-- 5a. Share payout value per member
-- Converts each member's share ratio into a payout amount from the selected pool.
-- Replace :payout_pool with the total amount to distribute, for example the sum of collected savings + extras,
-- or the remaining balance after loan distribution.
WITH member_weights AS (
  SELECT
    gm.id AS member_id,
    gm.full_name,
    gm.savings,
    gm.other_amount,
    GREATEST(1, DATE_PART('day', NOW()::date - gm.date_joined)) AS days_active,
    (COALESCE(gm.savings, 0) * GREATEST(1, DATE_PART('day', NOW()::date - gm.date_joined))) + COALESCE(gm.other_amount, 0) AS weight
  FROM public.group_members gm
  WHERE gm.group_id = :group_id
    AND gm.active = TRUE
),
weights AS (
  SELECT
    mw.*,
    COALESCE(SUM(mw.weight) OVER (), 0) AS total_weight
  FROM member_weights mw
)
SELECT
  w.member_id,
  w.full_name,
  w.savings AS total_savings,
  w.other_amount AS extra_active_period_amount,
  w.days_active,
  w.weight,
  CASE
    WHEN w.total_weight = 0 THEN 0
    ELSE w.weight / w.total_weight
  END AS share_ratio,
  CASE
    WHEN w.total_weight = 0 THEN 0
    ELSE (w.weight / w.total_weight) * :payout_pool
  END AS share_payout_value
FROM weights w
ORDER BY w.weight DESC;

-- 5b. Share payout value using remaining balance after loans as the payout pool
WITH savings AS (
  SELECT COALESCE(SUM(savings), 0) AS total_savings
  FROM public.group_members
  WHERE group_id = :group_id
),
loans AS (
  SELECT COALESCE(SUM(principal_outstanding), 0) AS total_active_loan
  FROM public.loan_master
  WHERE group_id = :group_id
    AND status = 'Active'
),
member_weights AS (
  SELECT
    gm.id AS member_id,
    gm.full_name,
    gm.savings,
    gm.other_amount,
    GREATEST(1, DATE_PART('day', NOW()::date - gm.date_joined)) AS days_active,
    (COALESCE(gm.savings, 0) * GREATEST(1, DATE_PART('day', NOW()::date - gm.date_joined))) + COALESCE(gm.other_amount, 0) AS weight
  FROM public.group_members gm
  WHERE gm.group_id = :group_id
    AND gm.active = TRUE
),
weights AS (
  SELECT
    mw.*,
    COALESCE(SUM(mw.weight) OVER (), 0) AS total_weight
  FROM member_weights mw
),
payout AS (
  SELECT
    savings.total_savings - loans.total_active_loan AS payout_pool
  FROM savings, loans
)
SELECT
  w.member_id,
  w.full_name,
  w.savings AS total_savings,
  w.other_amount AS extra_active_period_amount,
  w.days_active,
  w.weight,
  CASE
    WHEN w.total_weight = 0 THEN 0
    ELSE w.weight / w.total_weight
  END AS share_ratio,
  CASE
    WHEN w.total_weight = 0 THEN 0
    ELSE (w.weight / w.total_weight) * payout.payout_pool
  END AS share_payout_value_from_remaining_balance
FROM weights w, payout
ORDER BY w.weight DESC;

-- 5c. Share payout value using total group gain (interest + penalties) as the payout pool
WITH gain AS (
  SELECT COALESCE(SUM(interest_outstanding), 0) + COALESCE(SUM(penalty_outstanding), 0) AS payout_pool
  FROM public.loan_master
  WHERE group_id = :group_id
    AND status = 'Active'
),
member_weights AS (
  SELECT
    gm.id AS member_id,
    gm.full_name,
    gm.savings,
    gm.other_amount,
    GREATEST(1, DATE_PART('day', NOW()::date - gm.date_joined)) AS days_active,
    (COALESCE(gm.savings, 0) * GREATEST(1, DATE_PART('day', NOW()::date - gm.date_joined))) + COALESCE(gm.other_amount, 0) AS weight
  FROM public.group_members gm
  WHERE gm.group_id = :group_id
    AND gm.active = TRUE
),
weights AS (
  SELECT
    mw.*,
    COALESCE(SUM(mw.weight) OVER (), 0) AS total_weight
  FROM member_weights mw
)
SELECT
  w.member_id,
  w.full_name,
  w.savings AS total_savings,
  w.other_amount AS extra_active_period_amount,
  w.days_active,
  w.weight,
  CASE
    WHEN w.total_weight = 0 THEN 0
    ELSE w.weight / w.total_weight
  END AS share_ratio,
  CASE
    WHEN w.total_weight = 0 THEN 0
    ELSE (w.weight / w.total_weight) * gain.payout_pool
  END AS share_payout_value_from_total_group_gain
FROM weights w, gain
ORDER BY w.weight DESC;

-- 6. Optional report: compare reported savings vs collected transactions
-- If you also persist raw savings transactions, reconcile member savings with transaction totals.
SELECT
  gm.id AS member_id,
  gm.full_name,
  gm.savings AS recorded_member_savings,
  COALESCE(SUM(st.amount), 0) AS transaction_savings_total,
  gm.savings - COALESCE(SUM(st.amount), 0) AS savings_reconciliation_difference
FROM public.group_members gm
LEFT JOIN public.savings_transactions st
  ON st.member_id = gm.id
  AND st.transaction_type IN ('Savings Collection', 'Extra Deposit')
  AND st.group_id = gm.group_id
WHERE gm.group_id = :group_id
GROUP BY gm.id, gm.full_name, gm.savings;

-- 7. Group dashboard reconciliation
-- Validates the summary totals shown on the group dashboard against source tables.
SELECT
  g.id AS group_id,
  g.group_name,
  COALESCE((SELECT SUM(gm.savings) FROM public.group_members gm WHERE gm.group_id = g.id), 0) AS dashboard_total_savings,
  COALESCE((SELECT SUM(gm.other_amount) FROM public.group_members gm WHERE gm.group_id = g.id), 0) AS dashboard_total_extra_amount,
  COALESCE((SELECT SUM(gm.savings) FROM public.group_members gm WHERE gm.group_id = g.id), 0)
    + COALESCE((SELECT SUM(gm.other_amount) FROM public.group_members gm WHERE gm.group_id = g.id), 0) AS dashboard_total_savings_plus_extras,
  COALESCE((SELECT SUM(lm.principal_outstanding) FROM public.loan_master lm WHERE lm.group_id = g.id AND lm.status = 'Active'), 0) AS dashboard_active_loan_amount,
  COALESCE((SELECT SUM(st.amount) FROM public.savings_transactions st WHERE st.group_id = g.id AND st.transaction_type IN ('Savings Collection', 'Extra Deposit')), 0) AS transaction_total_savings,
  COALESCE((SELECT SUM(lm.interest_outstanding) FROM public.loan_master lm WHERE lm.group_id = g.id AND lm.status = 'Active'), 0)
    + COALESCE((SELECT SUM(lm.penalty_outstanding) FROM public.loan_master lm WHERE lm.group_id = g.id AND lm.status = 'Active'), 0) AS dashboard_group_gain,
  COALESCE((SELECT SUM(gm.savings) FROM public.group_members gm WHERE gm.group_id = g.id), 0)
    + COALESCE((SELECT SUM(gm.other_amount) FROM public.group_members gm WHERE gm.group_id = g.id), 0)
    - COALESCE((SELECT SUM(lm.principal_outstanding) FROM public.loan_master lm WHERE lm.group_id = g.id AND lm.status = 'Active'), 0) AS dashboard_remaining_balance
FROM public.groups g
WHERE g.id = :group_id;

-- 8. Member dashboard reconciliation
-- Reconcile each member's dashboard data with source transactions and loan balances.
SELECT
  gm.id AS member_id,
  gm.full_name,
  gm.savings AS dashboard_savings,
  COALESCE((SELECT SUM(st.amount) FROM public.savings_transactions st WHERE st.member_id = gm.id AND st.transaction_type IN ('Savings Collection', 'Extra Deposit')), 0) AS transaction_savings_total,
  gm.savings - COALESCE((SELECT SUM(st.amount) FROM public.savings_transactions st WHERE st.member_id = gm.id AND st.transaction_type IN ('Savings Collection', 'Extra Deposit')), 0) AS savings_reconciliation_difference,
  COALESCE((SELECT SUM(lm.principal_outstanding) FROM public.loan_master lm WHERE lm.member_id = gm.id AND lm.group_id = gm.group_id AND lm.status = 'Active'), 0) AS dashboard_loan_balance,
  COALESCE((SELECT SUM(lm.interest_outstanding) FROM public.loan_master lm WHERE lm.member_id = gm.id AND lm.group_id = gm.group_id AND lm.status = 'Active'), 0) AS dashboard_interest_balance,
  COALESCE((SELECT SUM(lm.penalty_outstanding) FROM public.loan_master lm WHERE lm.member_id = gm.id AND lm.group_id = gm.group_id AND lm.status = 'Active'), 0) AS dashboard_penalty_balance,
  COALESCE(gm.other_amount, 0) AS dashboard_other_amount,
  COALESCE(gm.shares, 0) AS dashboard_share_percentage,
  COALESCE(gm.date_joined, NULL) AS date_joined,
  COALESCE((SELECT SUM(lm.principal_outstanding + lm.interest_outstanding + lm.penalty_outstanding)
    FROM public.loan_master lm
    WHERE lm.member_id = gm.id
      AND lm.group_id = gm.group_id
      AND lm.status = 'Active'), 0) AS dashboard_next_due_amount
FROM public.group_members gm
WHERE gm.group_id = :group_id
  AND gm.active = TRUE;

-- 9. Combined group + member dashboard reconciliation
-- Returns group summary dashboard totals alongside member-level reconciliation rows.
WITH group_summary AS (
  SELECT
    g.id AS group_id,
    g.group_name,
    COALESCE(SUM(gm.savings), 0) AS total_savings,
    COALESCE(SUM(gm.other_amount), 0) AS total_extra_amount,
    COALESCE(SUM(gm.savings), 0) + COALESCE(SUM(gm.other_amount), 0) AS total_savings_plus_extras,
    COALESCE((SELECT SUM(lm.principal_outstanding) FROM public.loan_master lm WHERE lm.group_id = g.id AND lm.status = 'Active'), 0) AS total_active_loan,
    COALESCE((SELECT SUM(lm.interest_outstanding) FROM public.loan_master lm WHERE lm.group_id = g.id AND lm.status = 'Active'), 0) AS total_interest_outstanding,
    COALESCE((SELECT SUM(lm.penalty_outstanding) FROM public.loan_master lm WHERE lm.group_id = g.id AND lm.status = 'Active'), 0) AS total_penalty_outstanding,
    COALESCE((SELECT SUM(st.amount) FROM public.savings_transactions st WHERE st.group_id = g.id AND st.transaction_type IN ('Savings Collection', 'Extra Deposit')), 0) AS transaction_total_savings,
    COALESCE((SELECT SUM(gm_inner.savings) FROM public.group_members gm_inner WHERE gm_inner.group_id = g.id), 0)
      + COALESCE((SELECT SUM(gm_inner.other_amount) FROM public.group_members gm_inner WHERE gm_inner.group_id = g.id), 0)
      - COALESCE((SELECT SUM(lm_inner.principal_outstanding) FROM public.loan_master lm_inner WHERE lm_inner.group_id = g.id AND lm_inner.status = 'Active'), 0) AS remaining_balance_after_loans,
    COALESCE((SELECT SUM(lm_inner.interest_outstanding) FROM public.loan_master lm_inner WHERE lm_inner.group_id = g.id AND lm_inner.status = 'Active'), 0)
      + COALESCE((SELECT SUM(lm_inner.penalty_outstanding) FROM public.loan_master lm_inner WHERE lm_inner.group_id = g.id AND lm_inner.status = 'Active'), 0) AS total_group_gain
  FROM public.groups g
  LEFT JOIN public.group_members gm ON gm.group_id = g.id
  WHERE g.id = :group_id
  GROUP BY g.id, g.group_name
),
member_reconciliation AS (
  SELECT
    gm.id AS member_id,
    gm.full_name,
    gm.savings AS dashboard_savings,
    COALESCE((SELECT SUM(st.amount) FROM public.savings_transactions st WHERE st.member_id = gm.id AND st.transaction_type IN ('Savings Collection', 'Extra Deposit')), 0) AS transaction_savings_total,
    gm.savings - COALESCE((SELECT SUM(st.amount) FROM public.savings_transactions st WHERE st.member_id = gm.id AND st.transaction_type IN ('Savings Collection', 'Extra Deposit')), 0) AS savings_reconciliation_difference,
    COALESCE((SELECT SUM(lm.principal_outstanding) FROM public.loan_master lm WHERE lm.member_id = gm.id AND lm.group_id = gm.group_id AND lm.status = 'Active'), 0) AS dashboard_loan_balance,
    COALESCE((SELECT SUM(lm.interest_outstanding) FROM public.loan_master lm WHERE lm.member_id = gm.id AND lm.group_id = gm.group_id AND lm.status = 'Active'), 0) AS dashboard_interest_balance,
    COALESCE((SELECT SUM(lm.penalty_outstanding) FROM public.loan_master lm WHERE lm.member_id = gm.id AND lm.group_id = gm.group_id AND lm.status = 'Active'), 0) AS dashboard_penalty_balance,
    COALESCE(gm.other_amount, 0) AS dashboard_other_amount,
    COALESCE(gm.shares, 0) AS dashboard_share_percentage,
    COALESCE((SELECT SUM(lm.principal_outstanding + lm.interest_outstanding + lm.penalty_outstanding)
      FROM public.loan_master lm
      WHERE lm.member_id = gm.id
        AND lm.group_id = gm.group_id
        AND lm.status = 'Active'), 0) AS dashboard_next_due_amount
  FROM public.group_members gm
  WHERE gm.group_id = :group_id
    AND gm.active = TRUE
)
SELECT
  gs.*,
  mr.*
FROM group_summary gs
CROSS JOIN member_reconciliation mr
ORDER BY mr.full_name;
