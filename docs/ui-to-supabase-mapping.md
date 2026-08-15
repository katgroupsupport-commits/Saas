# UI → Supabase Field Mapping

Every page reads from the Zustand `state` populated by `src/services/repository.js`. The bootstrap fetch is `rpc_get_tenant_payload` (one JSONB with 22 arrays of rows from the `xxfp_*` tables / compat views), plus on-demand RPCs. All DB columns are snake_case; the mappers (`mapProfile`, `mapGroup`, `mapMember`, `mapTransaction`, `mapLoan`, `mapApproval`, `mapExpense`, etc.) rename them to camelCase JS keys.

## Data pipeline

```
UI page → state.* → repository.js fetch → Supabase
  1. rpc_get_tenant_payload (bootstrap, 22 key arrays)
  2. on-demand RPCs (rpc_pending_dues, rpc_get_report_summary, rpc_share_distribution_*,
     rpc_get_approval_summary, rpc_member_collection_report_rows, decide_approval, ...)
  3. direct client.from("xxfp_*") reads (fallback path + reportPdf.js)
```

## Master rename map (JS key ← DB column)

### Profile (`mapProfile`)
| JS key | Supabase column |
|---|---|
| `profile.id` | `xxfp_auth_users.user_id` |
| `profile.authId` | `xxfp_auth_users.supabase_user_id` |
| `profile.memberId` | `xxfp_auth_users.member_id` |
| `profile.name` | `xxfp_auth_users.member_name` / `username` / `email` |
| `profile.email` | `xxfp_auth_users.email` |
| `profile.mobile` | `xxfp_auth_users.mobile_number` |
| `profile.username` | `xxfp_auth_users.username` |
| `profile.profilePhoto` | `xxfp_auth_users.profile_photo_data` (fallback `xxfp_group_members.profile_photo_data`) |
| `profile.role` | `xxfp_group_members.role_id` → `xxfp_roles.role_name` |
| `profile.groupIds` | `xxfp_group_members.group_id` |

### Member (`mapMember`)
| JS key | Supabase column |
|---|---|
| `member.id` | `xxfp_group_members.member_id` |
| `member.groupId` | `xxfp_group_members.group_id` |
| `member.roleId` / `memberRole` | `xxfp_group_members.role_id` / `xxfp_roles.role_name` |
| `member.fullName` | `xxfp_group_members.member_name` |
| `member.username` | `xxfp_group_members.username` |
| `member.mobile` | `xxfp_group_members.mobile_number` |
| `member.email` | `xxfp_group_members.email` |
| `member.profilePhoto` | `xxfp_group_members.profile_photo_data` |
| `member.dateJoined` | `xxfp_group_members.join_date` |
| `member.exitDate` / `inactiveDate` | `xxfp_group_members.exit_date` |
| `member.status` | `xxfp_group_members.status` |
| `member.createdAt` | `xxfp_group_members.creation_date` |
| `member.customSavingAmount` | `xxfp_member_setup.custom_saving_amount` |
| `member.loanLimit` / `maximumLoanLimit` | `xxfp_member_setup.loan_limit` |
| `member.loanTenureMonths` | `xxfp_member_setup.loan_tenure_months` |
| `member.interestRate` | `xxfp_member_setup.interest_rate` |
| `member.interestType` | `xxfp_member_setup.interest_type` |
| `member.savings` | `member_dashboard_balances.savings` |
| `member.loanOutstanding` | `member_dashboard_balances.outstanding_loan` |
| `member.interestOutstanding` | (not exposed by view — always 0) |
| `member.penaltyOutstanding` | `member_dashboard_balances.pending_charges` |
| `member.shares` / `earnedFromGroup` | `member_dashboard_balances.earned_from_group` |

### Group (`mapGroup`)
| JS key | Supabase column |
|---|---|
| `group.id` | `xxfp_groups.group_id` |
| `group.name` | `xxfp_groups.group_name` |
| `group.code` | `xxfp_groups.code` |
| `group.primaryContactName` | `xxfp_groups.primary_contact_name` |
| `group.mobile` | `xxfp_groups.mobile_number` |
| `group.email` | `xxfp_groups.email` |
| `group.status` | `xxfp_groups.status` |
| `group.createdDate` | `xxfp_groups.creation_date` |
| `group.createdBy` | `xxfp_groups.created_by` |
| `group.monthlySaving` | `xxfp_group_setup.monthly_saving_amount` |
| `group.interestRate` | `xxfp_group_setup.interest_rate` |
| `group.interestType` | `xxfp_group_setup.interest_type` |
| `group.penaltyAmount` / `penaltyAfterDueDateAmount` | `xxfp_group_setup.penalty_amount` |
| `group.maximumLoanLimit` | `xxfp_group_setup.loan_limit` |
| `group.loanTenureMonths` | `xxfp_group_setup.loan_tenure_months` |
| `group.loanDueDay` | `xxfp_group_setup.loan_due_day` |
| `group.approvers` / `admins` | `xxfp_group_setup.approver_names` / `admin_names` (jsonb) |

### Period (`mapPeriod`)
| JS key | Supabase column |
|---|---|
| `period.id` | `xxfp_periods.period_id` |
| `period.groupId` | `xxfp_periods.group_id` |
| `period.name` | `xxfp_periods.period_name` |
| `period.startDate` | `xxfp_periods.start_date` |
| `period.endDate` | `xxfp_periods.end_date` |
| `period.status` | `xxfp_periods.status` (normalized Open/Closed/Permanently Closed/Future) |

### Transaction (`mapTransaction`)
| JS key | Supabase column |
|---|---|
| `trx.id` | `xxfp_trx_header.member_trx_id` |
| `trx.groupId` | `xxfp_trx_header.group_id` |
| `trx.memberId` | `xxfp_trx_header.member_id` |
| `trx.periodId` | `xxfp_trx_header.period_id` |
| `trx.transactionNumber` | `xxfp_trx_header.trx_number` |
| `trx.transactionDate` | `xxfp_trx_header.trx_date` |
| `trx.transactionType` | `xxfp_trx_header.trx_type` |
| `trx.amount` | `xxfp_trx_header.total_amount` |
| `trx.approvalStatus` | `xxfp_trx_header.approval_status` |
| `trx.parentTransactionId` | `xxfp_trx_header.parent_trx_id` |
| `trx.adjustmentFlag` | `xxfp_trx_header.adjustment_flag` |
| `trx.reversedFlag` | `xxfp_trx_header.reversed_flag` |
| `trx.remarks` | `xxfp_trx_header.remarks` |
| `trx.allocation.savings` | `xxfp_trx_lines.amount` where `line_type = 'SAVING'` |
| `trx.allocation.principal` | `xxfp_trx_lines.amount` where `line_type = 'LOAN_PRINCIPAL'` |
| `trx.allocation.interest` | `xxfp_trx_lines.amount` where `line_type = 'LOAN_INTEREST'` |
| `trx.allocation.penalty` | `xxfp_trx_lines.amount` where `line_type = 'PENALTY'` |
| `trx.allocation.excess` | `xxfp_trx_lines.amount` where `line_type = 'OTHER'` |
| `trx.allocation.charges` | `xxfp_trx_lines.amount` where `line_type = 'CHARGES'` |

### Loan (`mapLoan`)
| JS key | Supabase column |
|---|---|
| `loan.id` | `xxfp_loan_header.loan_id` |
| `loan.memberId` | `xxfp_loan_header.member_id` |
| `loan.memberName` | `xxfp_group_members.member_name` (join) |
| `loan.amount` | `xxfp_loan_header.distributed_amount` |
| `loan.principalOutstanding` | `xxfp_loan_header.outstanding_principal` |
| `loan.interestOutstanding` | `xxfp_loan_header.outstanding_interest` |
| `loan.rate` | `xxfp_loan_header.interest_rate` |
| `loan.status` | `xxfp_loan_header.loan_status` |
| `loan.loanNumber` | `xxfp_loan_header.loan_number` |
| `loan.reason` / `purpose` | `xxfp_loan_requests.purpose` (NOT on header) |
| `loan.durationMonths` / `requestedMonths` | `xxfp_loan_requests.requested_months` (NOT on header) |
| `loan.startDate` | `xxfp_loan_header.distribution_date` |
| `loan.penaltyOutstanding` | calculated client-side (no header column) |

### Approval (`mapApproval`)
| JS key | Supabase column |
|---|---|
| `approval.id` | `xxfp_approval_header.approval_id` |
| `approval.groupId` | `xxfp_approval_header.group_id` |
| `approval.batchId` | `xxfp_approval_header.approval_batch_id` |
| `approval.referenceId` | `xxfp_approval_header.reference_id` |
| `approval.referenceType` | `xxfp_approval_header.reference_type` |
| `approval.action` | `xxfp_approval_header.transaction_type` |
| `approval.requester` | `xxfp_approval_header.requester_name` / `created_by` |
| `approval.approverId` | `xxfp_approval_header.approver_member_id` |
| `approval.approverName` / `level` | `xxfp_approval_header.approver_name` |
| `approval.status` | `xxfp_approval_header.approval_status` |
| `approval.amount` | `xxfp_approval_header.amount` |
| `approval.remarks` / `details` | `xxfp_approval_header.remarks` |

### Pending setup change (`mapPendingSetupChange`)
| JS key | Supabase column |
|---|---|
| `change.id` | `xxfp_pending_setup_changes.setup_change_id` |
| `change.batchId` | `xxfp_pending_setup_changes.approval_batch_id` |
| `change.groupId` | `xxfp_pending_setup_changes.group_id` |
| `change.setupType` | `xxfp_pending_setup_changes.setup_type` |
| `change.targetId` | `xxfp_pending_setup_changes.target_id` |
| `change.targetName` | `xxfp_pending_setup_changes.target_name` |
| `change.payload` / `oldValue` | `xxfp_pending_setup_changes.payload` / `old_value` (jsonb) |
| `change.changeSummary` | `xxfp_pending_setup_changes.change_summary` |
| `change.status` | `xxfp_pending_setup_changes.status` |
| `change.createdAt` | `xxfp_pending_setup_changes.creation_date` |

### Withdrawal request (`mapWithdrawalRequest`)
| JS key | Supabase column |
|---|---|
| `req.id` | `xxfp_withdrawal_requests.withdrawal_request_id` |
| `req.requestNumber` | `xxfp_withdrawal_requests.request_number` |
| `req.groupId` | `xxfp_withdrawal_requests.group_id` |
| `req.memberId` | `xxfp_withdrawal_requests.member_id` |
| `req.memberName` | `xxfp_group_members.member_name` (join) |
| `req.amount` | `xxfp_withdrawal_requests.requested_amount` |
| `req.requestDate` | `xxfp_withdrawal_requests.request_date` |
| `req.reason` | `xxfp_withdrawal_requests.reason` |
| `req.status` / `approvalStatus` | `xxfp_withdrawal_requests.status` / `approval_status` |
| `req.createdAt` | `xxfp_withdrawal_requests.creation_date` |

### Subscription (`mapSubscription`)
| JS key | Supabase column |
|---|---|
| `sub.id` | `xxfp_group_subscriptions.group_subscription_id` |
| `sub.groupId` / `groupName` | `xxfp_group_subscriptions.group_id` / `xxfp_groups.group_name` (nested) |
| `sub.plan` / `duration` / `amount` / `maxMembers` / `features` | `xxfp_subscription_plans.plan_name` / `duration` / `amount` / `max_members` / `features` (lookup by `subscription_plan_id`) |
| `sub.status` / `paymentStatus` | `xxfp_group_subscriptions.payment_status` |
| `sub.startDate` / `endDate` | `xxfp_group_subscriptions.start_date` / `end_date` |
| `sub.transactionReference` | `xxfp_group_subscriptions.transaction_reference` |

### Audit log (`mapAudit`)
| JS key | Supabase column |
|---|---|
| `log.id` | `xxfp_audit_log.audit_id` |
| `log.actor` | `xxfp_audit_log.changed_by` |
| `log.action` | `xxfp_audit_log.action_type` |
| `log.recordId` | `xxfp_audit_log.trx_id` |
| `log.oldValue` / `newValue` | `xxfp_audit_log.old_value` / `new_value` |
| `log.timestamp` | `xxfp_audit_log.changed_date` |

### Expense (`mapExpense`)
| JS key | Supabase column |
|---|---|
| `expense.id` | `xxfp_group_expense_header.group_expense_id` |
| `expense.groupId` / `periodId` | `xxfp_group_expense_header.group_id` / `period_id` |
| `expense.expenseNumber` | `xxfp_group_expense_header.expense_number` |
| `expense.expenseDate` | `xxfp_group_expense_header.expense_date` |
| `expense.expenseType` | `xxfp_group_expense_header.expense_type` |
| `expense.amount` | `xxfp_group_expense_header.total_amount` |
| `expense.paymentMode` | `xxfp_group_expense_header.payment_mode` |
| `expense.approvalStatus` | `xxfp_group_expense_header.approval_status` |
| `expense.remarks` | `xxfp_group_expense_header.remarks` |
| `expense.lines[].expenseCategory` | `xxfp_group_expense_lines.expense_category` |
| `expense.lines[].amount` | `xxfp_group_expense_lines.amount` |

### Legacy import (`mapLegacy`)
| JS key | Supabase column |
|---|---|
| `legacy.total_saving` | `xxfp_legacy_data.legacy_saving_balance` |
| `legacy.pending_loan` | `xxfp_legacy_data.legacy_loan_outstanding` |
| `legacy.interest_amount` | `xxfp_legacy_data.legacy_interest_balance` |
| `legacy.penalty_amount` | `xxfp_legacy_data.legacy_penalty_balance` |
| `legacy.excess_amount` | `xxfp_legacy_data.legacy_share_earned` |
| `legacy.legacy_bank_balance` | `xxfp_legacy_data.legacy_bank_balance` |
| `legacy.migration_date` | `xxfp_legacy_data.migration_date` |
| `legacy.approval_status` | `xxfp_legacy_data.approval_status` |
| `legacy.remarks` | `xxfp_legacy_data.remarks` |

### Misc
| JS key | Supabase column |
|---|---|
| `opening.openingBankBalance` | `xxfp_legacy_group_opening.opening_bank_balance` |
| `opening.openingGroupExpense` | `xxfp_legacy_group_opening.opening_group_expense` |
| `opening.groupGain` | `xxfp_legacy_group_opening.opening_group_gain` |
| `dispute.issue` / `ownerReply` | `xxfp_support_disputes.issue` / `owner_reply` |
| `shareDistribution.distributionAmount` | `xxfp_share_distribution.distribution_amount` |
| `shareAdjustment.amount` | `xxfp_share_adjustments.amount` |

## Dashboard view formulas (server-side, source of truth)

### `xxfp_v_group_dashboard_balances` (compat view `group_dashboard_balances`)
| Column | Formula |
|---|---|
| `group_id` | — |
| `total_savings` | Σ `SAVING` lines (excl. `Group Expense Share`) + Σ `xxfp_share_distribution.distribution_amount` + Σ `xxfp_share_adjustments.amount` |
| `active_loans` | count `xxfp_loan_header` where `loan_status = 'ACTIVE'` |
| `outstanding_loan_amount` | Σ `outstanding_principal` of ACTIVE loans |
| `group_gain_amount` | `collected_gain` + `opening_group_gain` + `greatest(0, opening_bank_balance + outstanding_loan_amount + opening_group_expense - total_savings)`; `collected_gain` = Σ `LOAN_INTEREST` + `PENALTY` lines on non-`Migrated` trx |
| `remaining_balance` | `collected_saving` + `collected_non_saving` + `opening_bank_balance` + `opening_group_gain` − `cash_out` − `group_expenses` − `opening_group_expense`; `cash_out` = Σ `LOAN_DISTRIBUTION` + `WITHDRAWAL` lines; `group_expenses` = Σ `total_amount` of COMPLETED/APPROVED expense headers |

### `xxfp_v_member_dashboard_balances` (compat view `member_dashboard_balances`)
| Column | Formula |
|---|---|
| `member_id`, `group_id` | — |
| `savings` | Σ `SAVING` lines + Σ `xxfp_share_distribution` + Σ `xxfp_share_adjustments` (per member) |
| `outstanding_loan` | Σ `outstanding_principal` + `outstanding_interest` of ACTIVE loans |
| `earned_from_group` | Σ `share_distribution` + `share_adjustments` |
| `pending_charges` | Σ `CHARGES` lines + `PENALTY` lines on `Migrated` trx |

### `v_completed_member_transaction_history`
Columns: `member_trx_id, trx_number, group_id, member_id, period_id, trx_date, trx_type, approval_status, parent_trx_id, adjustment_flag, reversed_flag, remarks` + derived `saving_amount, loan_principal_amount, loan_interest_amount, penalty_amount, charges_amount, other_amount` (SUM of `xxfp_trx_lines.amount` by `line_type`). Filtered to `approval_status IN ('COMPLETED','APPROVED')`.

### `v_completed_legacy_member_history`
Columns: `legacy_id, group_id, member_id, migration_date, approval_status, legacy_saving_balance, legacy_loan_outstanding, legacy_interest_balance, legacy_penalty_balance, legacy_share_earned, remarks`. Filtered COMPLETED/APPROVED.

## Page-by-page field mapping

### Dashboard — Member view (`Dashboard.jsx`)
| UI field | JS key | Source / formula |
|---|---|---|
| Share amount | `summary.shareAmount` | `savings + gain - expense` (or RPC) |
| Savings | `summary.savings` | Σ member `SAVING`+`excess` lines / `member_dashboard_balances.savings` |
| Income/Gain share | `summary.gain` | `member_dashboard_balances.earned_from_group` |
| Expense share | `summary.expense` | \|Σ `Group Expense Share` allocations\| |
| Share % | `summary.sharePercent` | `memberShare / ΣmemberShares × 100` |
| Loan balance | `summary.outstanding` | Σ(principal+interest+penalty outstanding) of active loans |
| Active loans | `memberActiveLoans.length` | count active `xxfp_loan_header` |
| Principal outstanding | Σ `calculateDerivedLoanPrincipalOutstanding` | `xxfp_loan_header.outstanding_principal` (or `distributed_amount − Σ principal paid`) |
| Interest pending | Σ `loan.interestOutstanding` | `xxfp_loan_header.outstanding_interest` |
| Penalty pending | Σ `loan.penaltyOutstanding` | calculated client-side |
| Disbursed till now | Σ `loan.amount` | `xxfp_loan_header.distributed_amount` |
| Next EMI amount / date | `nextEmiRow.totalDue` / `.dueDate` | pending-dues row (formula below) |
| Interest due / Principal due / Penalty due | `memberSummary.*` | due rows per pending-dues formula |
| Rate | `loan.rate ?? effectiveSetup.interestRate` | `xxfp_loan_header.interest_rate` → fallback `xxfp_group_setup.interest_rate` / `xxfp_member_setup.interest_rate` |
| Monthly saving / Loan limit | `effectiveSetup.*` | `xxfp_member_setup.custom_saving_amount`/`loan_limit` override else `xxfp_group_setup.*` |
| Closed loan rows | `recentClosedLoan.*` | first non-outstanding loan, `xxfp_loan_header.*` |

### Dashboard — Group view (`calculateDashboardCards`)
| UI field | Source / formula |
|---|---|
| Collected in period | Σ(savings+principal+interest+penalty collected in open period) − withdrawn in period |
| Savings/Principal/Interest/Penalty collected | `sumCollectedAllocation(periodTransactions, bucket)` = Σ `xxfp_trx_lines.amount` of that `line_type` within `period.start_date..end_date` |
| Withdrawn in period | Σ \|amount\| of `trx_type='Withdrawal'` in period |
| Remaining balance | `openingBalance + savings + principal+interest+penalty collected + otherIncomeGain − expenses − withdrawals − loanOutstanding` |
| Opening balance | `xxfp_legacy_group_opening.opening_bank_balance` |
| Other income/Gain | Σ `charges` lines (non-migrated, non-withdrawal) + `opening_group_gain` |
| Expense | Σ COMPLETED `expense.amount` + `opening_group_expense` |
| Loan outstanding | `max(0, Σ distributed_amount − Σ principal repaid)` |
| Active Loans | `disbursedCount − closedCount` |
| Activated this month | count loans `startDate` in period |
| Overdue loans | distinct members with pending-due `due_date < today` and `total_due > 0` |
| Pending approval loans | count loans `approval_status/status = PENDING` |
| Repayment day | `group.loanDueDay` clamped 1–28 (`xxfp_group_setup.loan_due_day`) |
| Financial period / Cycle | month range around `getLoanDueDate(group)` (next monthly due day) |
| Open period | open `xxfp_periods` row (`status='OPEN'`) |

### Loans (group) / MemberLoans
| UI field | Source |
|---|---|
| Member | `xxfp_loan_header.member_id` → member `fullName` |
| Amount | `distributed_amount` |
| Outstanding | `outstanding_principal` |
| Start date | `distribution_date` (fallback `request_date`) |
| Status | `loan_status` (fallback `approval_status`) |
| Total outstanding (member card) | `principal + interest + penalty outstanding` |
| Rate / Reason | `interest_rate` / `xxfp_loan_requests.purpose` |

### Transactions
| UI field | Source |
|---|---|
| Member | `xxfp_trx_header.member_id` → member `fullName` |
| Type | `trx_type` |
| Amount | `total_amount` |
| Date | `trx_date` |
| Status | `approval_status` (fallback `status`) |
| (implicit pagination) | `.slice(0, 20)` |

### Periods
Name / Start / End / Status → `xxfp_periods.period_name, start_date, end_date, status` (Open/Closed/Permanently Closed/Future).

### Withdrawals
Member / Amount / Date / Status / Reason → `xxfp_withdrawal_requests.requested_amount, request_date, status, approval_status, reason` (+ member join).

### PendingDues (`rpc_pending_dues`; client fallback in `calculatePendingDues`)
| UI field | RPC column | Client fallback formula |
|---|---|---|
| Member | `member_name` | — |
| Amount | `total_due` | `saving_due + principal_due + interest_due + penalty_due` |
| Due Date | `due_date` | next `loan_due_day` in month |
| Saving due | `saving_due` | `max(0, monthly_saving − Σ(savings+excess paid in cycle))` |
| Principal due | `principal_due` | `min(outstanding, max(0, Σ(original_principal/tenure) − principal_paid))` |
| Interest due | `interest_due` | accrued interest to due date |
| Penalty due | `penalty_due` | `max(0, opening_penalty + late_penalty − paid − waived)`; `late_penalty = penalty_amount` if past due |
| Minimum/Maximum due | `minimum_due` / `maximum_due` | RPC-only |

### MemberSavings
- Total Savings → `rpc_member_finance_summary.savings` / `member.savings` (`member_dashboard_balances.savings`)
- Share Amount → `share_amount` (`earned_from_group`)
- Share % → `share_percent`

### SetupPage
| UI field | Source |
|---|---|
| Periods list (Status / Active pill) | `xxfp_periods` (open period = `status='OPEN'`) |
| Pending approvals: Setup / Change / Status / Pending with / Requested | `xxfp_pending_setup_changes.setup_type, target_name, change_summary, status, creation_date`; "Pending with" = matching `xxfp_approval_header` rows (`approval_batch_id = change.batch_id`, status Pending → `approver_name`) |
| Share calculator | pure client-side: `savings = members × saving × months`; `total = remaining + loanOutstanding`; `share = savings/member + gain/member`; `gain = total − expectedSavings` |

### MembersPage (setup)
| UI field | Source |
|---|---|
| Member / Email / Mobile / Username | `xxfp_group_members.member_name, email, mobile_number, username` |
| Savings | `rpc_member_finance_summary.savings` / `member_dashboard_balances.savings` |
| Loan | `rpc_member_finance_summary.outstanding` / `member_dashboard_balances.outstanding_loan` |
| Status | `xxfp_group_members.status` + pending-approval check vs `xxfp_approval_header` (`reference_type='member_addition'`, status Pending) |
| "In use" | any `xxfp_trx_header`/`xxfp_loan_header`/`xxfp_withdrawal_requests` references member |

### SubscriptionsPage
| UI field | Source |
|---|---|
| Active plan name / members | `xxfp_group_subscriptions` → `xxfp_subscription_plans.plan_name, max_members` (matching status ACTIVE/PAID) |
| Plan / duration / renewal | `currentSubscription.plan`/`duration`; renewal = `end_date` (else +1y/+1mo) |
| Payment provider / reference | `transaction_reference` (static provider label) |
| Plan cards (duration, name, members, price, features) | `rpc_get_tenant_payload.subscription_plans` / static `subscriptionPlans` |

### Approvals
| UI field | Source |
|---|---|
| Reference / Type / Member / Amount / Status | `xxfp_approval_header.reference_id, reference_type, requester_name, amount, approval_status` (group-filtered) |
| Full queue | `rpc_get_approval_summary` → `pending_rows.{id, group_id, batch_id, reference_id, reference_type, action, requester, approver_member_id, approver_name, status, amount, remarks, details, created_at, pending_with}` + `counts.{pending,approved,rejected,returned}_count` |

### Reports (`rpc_get_report_summary` + client aggregates)
| UI metric | RPC field / formula |
|---|---|
| Total savings | `group_summary.savings` |
| Active / Total members | `group_summary.member_count` / count active |
| Loan outstanding | Σ `outstanding_principal + outstanding_interest` |
| Pending approvals | count `approval_status=PENDING` |
| Transactions | count group transactions |
| Top savers (top 5) | `member_summary.savings` sorted desc |
| Recent transactions (top 10) | client aggregate over `state.transactions` |
| Member report rows | `member_summary.{member_id, member_name, username, status, collected, savings, gain, expense, share_amount, loan_count, principal_outstanding, interest_due, penalty_due, next_emi_amount, next_due_date, total_loan_balance, withdrawn}` |
| Group summary row | `group_summary.{group_name, member_count, collected, savings, gain, expenses, remaining, loan_count, loan_balance, interest_due, penalty_due, share_amount, withdrawn}` |

### ShareDistribution
| UI field | Source |
|---|---|
| Snapshot rows | `rpc_share_distribution_snapshot` → `{member_id, member_name, share_amount, share_percent, payout_status, reference_date}` |
| Range rows | `rpc_share_distribution_range` → same + `range_start, range_end` |
| Totals | Σ `share_amount` |
| Filters | `p_reference_date` / `p_start_date` / `p_end_date` (client date pickers) |

### SettingsPage
- Config fields = static client array (not DB).
- Audit log → `xxfp_audit_log` via `mapAudit` (last 60 days): When=`changed_date`, Actor=`changed_by`, Action=`action_type`, Record=`trx_id`, Old/New value=`old_value`/`new_value`.

### MemberNotifications
Static demo data — no DB table.

### MemberProfile
`xxfp_group_members.member_name, mobile_number, email, status, profile_photo_data` (member lookup by actor) with fallbacks to `actor.*`.

### Report PDF (`reportPdf.js` — direct `supabase.from` reads)
- `members.{member_name, mobile_number, group_id, join_date, status}` (group-filtered)
- `member_transaction_header.{trx_date, total_amount, approval_status, member_id, trx_type}`
- `loan_distribution.{member_id, distributed_amount, interest_rate, distribution_date, outstanding_principal, loan_status}`

### Placeholder pages (no DB fields)
Reversals, ProductOwnerSupport, Corrections, Adjustments, Waivers, ContactSupport, FinanceAgent (chat only — context payload built from state).

## Known gaps
1. Server RPCs `rpc_dashboard_summary`, `rpc_member_dashboard_card_summary`, `rpc_member_statement`, `rpc_loan_aging_summary`, `rpc_member_loan_interest_due` exist in SQL but are **not called** by `repository.js` — those UI values currently come from client-side `calculate*` functions in `src/services/financeFields.js` (which replicate the `xxfp_v_*` view logic).
2. `rpc_member_collection_report_rows` (monthly collection report) is implemented server-side but has **no caller** in `src/` yet.
3. `mapLoan` reads `purpose`/`requested_months` which live on `xxfp_loan_requests`, not `xxfp_loan_header` — header-only rows default them to empty/0.
