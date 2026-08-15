# Finance RPC migration guide

This guide preserves the existing React finance architecture while moving the heavy calculations into Supabase PostgreSQL functions.

## Goal

Keep the same business logic and the same group-level integrity/security model, while replacing React-side calculations with RPCs that run close to the data.

## What is moved server-side

- Group finance summary
- Member finance summary
- Loan interest and pending due calculations
- Share distribution calculations

## Files created

- [database/2026-07-12-v1-finance-rpc-helpers.sql](database/2026-07-12-v1-finance-rpc-helpers.sql)
- [database/2026-07-12-v1-finance-rpc-summary.sql](database/2026-07-12-v1-finance-rpc-summary.sql)
- [database/2026-07-12-v1-finance-rpc-loans.sql](database/2026-07-12-v1-finance-rpc-loans.sql)
- [database/2026-07-12-v1-finance-rpc-shares.sql](database/2026-07-12-v1-finance-rpc-shares.sql)
- [database/2026-07-12-v1-finance-rpc-examples.sql](database/2026-07-12-v1-finance-rpc-examples.sql)
- [database/2026-08-02-rpc-dashboard-summary.sql](database/2026-08-02-rpc-dashboard-summary.sql)
- [database/2026-08-02-rpc-dashboard-card-summary.sql](database/2026-08-02-rpc-dashboard-card-summary.sql)
- [database/2026-08-02-rpc-loan-aging-summary.sql](database/2026-08-02-rpc-loan-aging-summary.sql)
- [database/2026-08-02-rpc-member-statement.sql](database/2026-08-02-rpc-member-statement.sql)
- [database/2026-08-02-rpc-share-distribution-range.sql](database/2026-08-02-rpc-share-distribution-range.sql)
- [database/2026-08-02-rpc-share-distribution-snapshot.sql](database/2026-08-02-rpc-share-distribution-snapshot.sql)
- [database/2026-08-03-rpc-member-dashboard-card-summary.sql](database/2026-08-03-rpc-member-dashboard-card-summary.sql)
- [database/2026-08-03-rpc-pending-dues-aggregate.sql](database/2026-08-03-rpc-pending-dues-aggregate.sql)
- [database/2026-08-04-rpc-loan-interest-due-details.sql](database/2026-08-04-rpc-loan-interest-due-details.sql)

## Apply order in Supabase SQL editor

1. Apply [database/2026-07-12-v1-finance-rpc-helpers.sql](database/2026-07-12-v1-finance-rpc-helpers.sql)
2. Apply [database/2026-07-12-v1-finance-rpc-summary.sql](database/2026-07-12-v1-finance-rpc-summary.sql)
3. Apply [database/2026-07-12-v1-finance-rpc-loans.sql](database/2026-07-12-v1-finance-rpc-loans.sql)
4. Apply [database/2026-07-12-v1-finance-rpc-shares.sql](database/2026-07-12-v1-finance-rpc-shares.sql)
5. Run example statements from [database/2026-07-12-v1-finance-rpc-examples.sql](database/2026-07-12-v1-finance-rpc-examples.sql)
6. Apply [database/2026-08-02-rpc-dashboard-summary.sql](database/2026-08-02-rpc-dashboard-summary.sql)
7. Apply [database/2026-08-02-rpc-dashboard-card-summary.sql](database/2026-08-02-rpc-dashboard-card-summary.sql)
8. Apply [database/2026-08-02-rpc-loan-aging-summary.sql](database/2026-08-02-rpc-loan-aging-summary.sql)
9. Apply [database/2026-08-02-rpc-member-statement.sql](database/2026-08-02-rpc-member-statement.sql)
10. Apply [database/2026-08-02-rpc-share-distribution-range.sql](database/2026-08-02-rpc-share-distribution-range.sql)
11. Apply [database/2026-08-02-rpc-share-distribution-snapshot.sql](database/2026-08-02-rpc-share-distribution-snapshot.sql)
12. Apply [database/2026-08-03-rpc-member-dashboard-card-summary.sql](database/2026-08-03-rpc-member-dashboard-card-summary.sql)
13. Apply [database/2026-08-03-rpc-pending-dues-aggregate.sql](database/2026-08-03-rpc-pending-dues-aggregate.sql)
14. Apply [database/2026-08-04-rpc-loan-interest-due-details.sql](database/2026-08-04-rpc-loan-interest-due-details.sql)

## Recommended React replacement pattern

Instead of calling local functions such as calculateGroupFinanceSummary or calculatePendingDues directly from React, invoke the RPCs and map the response into the current shape expected by the UI.

### Example

```js
const { data, error } = await supabase.rpc('rpc_group_finance_summary', {
  p_group_id: groupId,
  p_period_id: periodId,
  p_as_of_date: asOfDate
});
```

```js
const { data, error } = await supabase.rpc('rpc_member_finance_summary', {
  p_group_id: groupId,
  p_member_id: memberId,
  p_period_id: periodId,
  p_as_of_date: asOfDate
});
```

## Design principles used

- Keep the existing schema and group tenancy model unchanged.
- Use security definer functions so the database can enforce the same group/member access boundaries.
- Keep the React layer responsible only for state rendering and user actions.
- Keep business rules in SQL, but preserve the current DTO shape expected by the UI.
