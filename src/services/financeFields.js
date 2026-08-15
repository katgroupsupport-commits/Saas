import {
  calculateLoanInterest,
  calculateTotalSavings
} from "./calculationEngine.js";
import { getCurrentMonthPeriod, getOpenPeriod } from "./periodControl.js";

export const financeFieldDictionary = {
  group: {
    totalSavings: {
      label: "Total savings",
      formula: "Completed savings + excess movements, including migrated savings/opening member savings, less withdrawals where represented in transactions."
    },
    monthlyCollections: {
      label: "Collected in period",
      formula: "Period savings + principal collected + interest collected + penalty collected - withdrawals."
    },
    totalActiveLoan: {
      label: "Active loan amount",
      formula: "Sum of derived principal outstanding for active loans. Migrated principal is opening outstanding, not collected."
    },
    remainingBalance: {
      label: "Remaining balance",
      formula: "Total savings + collected/legacy group gain - active loan outstanding - group expenses."
    },
    groupGain: {
      label: "Group gain",
      formula: "Non-migrated collected interest + non-migrated collected penalty + legacy group gain."
    },
    totalExpenses: {
      label: "Group expenses",
      formula: "Completed group expenses + migrated opening group expense."
    }
  },
  member: {
    savings: {
      label: "Savings",
      formula: "Member completed savings + excess, including migrated saving; falls back to stored member savings if no transaction ledger exists."
    },
    monthlyCollections: {
      label: "Collected this month",
      formula: "Member period savings + principal + interest + penalty - withdrawals."
    },
    shareAmount: {
      label: "Share amount",
      formula: "Savings + member group gain share - member group expense share."
    },
    outstanding: {
      label: "Loan balance",
      formula: "Derived principal outstanding + opening interest outstanding + opening penalty outstanding for active member loans."
    },
    nextDueAmount: {
      label: "Next minimum due",
      formula: "Saving due + interest due + penalty due."
    },
    sharePercent: {
      label: "Share percentage",
      formula: "Member positive share amount / all members positive share amount."
    }
  },
  allocation: {
    savings: "Regular/member saving collected.",
    interest: "Interest actually collected; migrated interest remains opening due.",
    penalty: "Penalty actually collected; migrated penalty remains opening due.",
    principal: "Principal actually repaid; migrated principal remains opening loan outstanding.",
    excess: "Extra amount beyond current dues, treated with member savings/share."
  }
};

export function toIsoDateValue(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCompletedFinancialStatus(status) {
  return ["COMPLETED", "APPROVED"].includes(String(status ?? "").toUpperCase());
}

function isCorrectionTransaction(transaction) {
  const isReversal = String(transaction?.reversedFlag || "").toUpperCase() === "Y"
    || String(transaction?.transactionNumber || "").startsWith("REV");
  const isAdjustment = String(transaction?.adjustmentFlag || "").toUpperCase() === "Y"
    || String(transaction?.transactionNumber || "").startsWith("ADJ");
  return isReversal || isAdjustment;
}

export function getCompletedTransactions(transactions = []) {
  const completed = transactions.filter((transaction) => isCompletedFinancialStatus(transaction.approvalStatus ?? transaction.approval_status)
    || isCorrectionTransaction(transaction));
  
  return completed;
}

function transactionReversalSignature(transaction) {
  return [
    String(transaction.memberId ?? ""),
    String(transaction.transactionType ?? ""),
    String(transaction.transactionDate ?? ""),
    Math.abs(Number(transaction.amount || 0)),
    Math.abs(Number(transaction.allocation?.savings || 0)),
    Math.abs(Number(transaction.allocation?.excess || 0)),
    Math.abs(Number(transaction.allocation?.principal || 0)),
    Math.abs(Number(transaction.allocation?.interest || 0)),
    Math.abs(Number(transaction.allocation?.penalty || 0))
  ].join("|");
}

export function getEffectiveCompletedTransactions(transactions = [], untilDate = null) {
  const filteredTransactions = (transactions || []).filter((transaction) => {
    if (!untilDate) return true;
    return String(transaction.transactionDate || "") <= String(untilDate);
  });
  
  const reversalCandidates = filteredTransactions.filter((transaction) => {
    const isReversal = String(transaction.reversedFlag || "").toUpperCase() === "Y"
      || String(transaction.transactionNumber || "").startsWith("REV");
    return isReversal;
  });
  
  const ajinkyaReversals = reversalCandidates.filter(t => t.memberId === 57);
  
  const childParentIds = new Set(reversalCandidates
    .filter((transaction) => String(transaction.parentTransactionId || "").trim())
    .map((transaction) => String(transaction.parentTransactionId)));
  
  if (childParentIds.size > 0) {
    const ajinkyaInParents = reversalCandidates.filter(t => t.memberId === 57 && String(t.parentTransactionId || "").trim());
    if (ajinkyaInParents.length > 0) {
    }
  }
  
  const orphanedReversalCounts = reversalCandidates
    .filter((transaction) => !String(transaction.parentTransactionId || "").trim())
    .reduce((counts, transaction) => {
      const signature = transactionReversalSignature(transaction);
      counts[signature] = (counts[signature] || 0) + 1;
      return counts;
    }, {});

  const effectiveResult = filteredTransactions.filter((transaction) => {
    const isReversal = String(transaction.reversedFlag || "").toUpperCase() === "Y"
      || String(transaction.transactionNumber || "").startsWith("REV");
    if (isReversal) return false;
    if (childParentIds.has(String(transaction.id))) return false;
    const signature = transactionReversalSignature(transaction);
    if (orphanedReversalCounts[signature] > 0) {
      orphanedReversalCounts[signature] -= 1;
      return false;
    }
    return true;
  });
  
  const ajinkyaEffective = effectiveResult.filter(t => t.memberId === 57);
  
  return effectiveResult;
}

export function loanBelongsToMember(loan, member) {
  if (!loan || !member) return false;
  return loan.memberId === member.id || loan.memberName === member.fullName;
}

export function isOutstandingLoan(loan) {
  return loan
    && (loan.principalOutstanding || 0) > 0
    && (
      isCompletedFinancialStatus(loan.approvalStatus)
      || ["ACTIVE", "COMPLETED", "APPROVED"].includes(String(loan.status ?? loan.loanStatus ?? "").toUpperCase())
    );
}

export function isMigratedOpeningTransaction(transaction) {
  return transaction?.transactionType === "Migrated";
}

function getOpeningNumber(row, snakeKey, camelKey) {
  return Number(row?.[snakeKey] ?? row?.[camelKey] ?? 0);
}

function getCompletedLegacyGroupOpenings(state) {
  return (state.legacyGroupOpenings || []).filter((row) =>
    isCompletedFinancialStatus(row.approval_status ?? row.approvalStatus)
  );
}

export function sumCollectedAllocation(transactions = [], bucket) {
  return transactions.reduce((sum, transaction) => {
    if (isMigratedOpeningTransaction(transaction) && !["savings", "excess"].includes(bucket)) {
      return sum;
    }
    return sum + Number(transaction.allocation?.[bucket] || 0);
  }, 0);
}

export function sumCollectedSavings(transactions = []) {
  return transactions.reduce((sum, transaction) => {
    if (isMigratedOpeningTransaction(transaction) || transaction.transactionType === "Withdrawal") return sum;
    return sum + Number(transaction.allocation?.savings || 0) + Number(transaction.allocation?.excess || 0);
  }, 0);
}

export function calculateLegacyGroupOpeningSummary(state, { totalSavings = 0, activeLoanOutstanding = 0 } = {}) {
  const rows = getCompletedLegacyGroupOpenings(state);
  const openingBankBalance = rows.reduce((sum, row) => sum + getOpeningNumber(row, "opening_bank_balance", "openingBankBalance"), 0);
  const openingGroupExpense = rows.reduce((sum, row) => sum + getOpeningNumber(row, "opening_group_expense", "openingGroupExpense"), 0);
  const explicitGroupGain = rows.reduce((sum, row) => sum + getOpeningNumber(row, "opening_group_gain", "openingGroupGain"), 0);
  const derivedGroupGain = Math.max(0, openingBankBalance + Number(activeLoanOutstanding || 0) + openingGroupExpense - Number(totalSavings || 0));

  return {
    openingBankBalance,
    openingGroupExpense,
    explicitGroupGain,
    derivedGroupGain,
    groupGain: explicitGroupGain + derivedGroupGain
  };
}

function getGroupRpcSummary(state, groupId = state.groups?.[0]?.id) {
  const summaries = state?.rpcGroupFinanceSummaries ?? {};
  const entry = summaries[String(groupId)] ?? summaries[groupId] ?? null;
  if (!entry) return null;
  return {
    totalSavings: Number(entry.total_savings ?? entry.totalSavings ?? 0),
    totalActiveLoan: Number(entry.total_active_loan ?? entry.totalActiveLoan ?? 0),
    totalExpenses: Number(entry.total_expenses ?? entry.totalExpenses ?? 0),
    groupGain: Number(entry.group_gain ?? entry.groupGain ?? 0),
    remainingBalance: Number(entry.remaining_balance ?? entry.remainingBalance ?? 0),
    monthlySavings: Number(entry.monthly_savings ?? entry.monthlySavings ?? 0),
    monthlyPrincipal: Number(entry.monthly_principal ?? entry.monthlyPrincipal ?? 0),
    monthlyInterest: Number(entry.monthly_interest ?? entry.monthlyInterest ?? 0),
    monthlyPenalty: Number(entry.monthly_penalty ?? entry.monthlyPenalty ?? 0),
    monthlyWithdrawn: Number(entry.monthly_withdrawn ?? entry.monthlyWithdrawn ?? 0),
    monthlyCollections: Number(entry.monthly_collections ?? entry.monthlyCollections ?? 0),
    monthlyLoanDisbursed: Number(entry.monthly_loan_disbursed ?? entry.monthlyLoanDisbursed ?? 0)
  };
}

function getDashboardRpcSummary(state, groupId = state.groups?.[0]?.id) {
  const directSummary = state?.rpcDashboardCardSummary ?? null;
  if (directSummary) {
    return {
      totalSavings: Number(directSummary.total_savings ?? directSummary.totalSavings ?? 0),
      activeLoanBalance: Number(directSummary.active_loan_balance ?? directSummary.activeLoanBalance ?? 0),
      currentMonthCollections: Number(directSummary.current_month_collections ?? directSummary.currentMonthCollections ?? directSummary.collected_in_period ?? directSummary.collectedInPeriod ?? 0),
      expenses: Number(directSummary.expenses ?? 0),
      pendingDues: Number(directSummary.pending_dues ?? directSummary.pendingDues ?? 0),
      remainingBalance: Number(directSummary.remaining_balance ?? directSummary.remainingBalance ?? 0),
      groupGain: Number(directSummary.group_gain ?? directSummary.groupGain ?? 0),
      activeLoansCount: Number(directSummary.active_loans_count ?? directSummary.activeLoansCount ?? 0)
    };
  }

  const summaries = state?.rpcDashboardSummaries ?? {};
  const entry = summaries[String(groupId)] ?? summaries[groupId] ?? null;
  if (!entry) return null;
  return {
    totalSavings: Number(entry.total_savings ?? entry.totalSavings ?? 0),
    activeLoanBalance: Number(entry.active_loan_balance ?? entry.activeLoanBalance ?? 0),
    currentMonthCollections: Number(entry.current_month_collections ?? entry.currentMonthCollections ?? 0),
    expenses: Number(entry.expenses ?? 0),
    pendingDues: Number(entry.pending_dues ?? entry.pendingDues ?? 0),
    remainingBalance: Number(entry.remaining_balance ?? entry.remainingBalance ?? 0),
    groupGain: Number(entry.group_gain ?? entry.groupGain ?? 0),
    activeLoansCount: Number(entry.active_loans_count ?? entry.activeLoansCount ?? 0)
  };
}

function getMemberRpcSummary(state, memberId) {
  const summaries = state?.rpcMemberFinanceSummaries ?? {};
  const entry = summaries[String(memberId)] ?? summaries[memberId] ?? null;
  if (!entry) return null;
  return {
    savings: Number(entry.savings ?? 0),
    outstanding: Number(entry.outstanding ?? 0),
    gain: Number(entry.gain ?? 0),
    expense: Number(entry.expense ?? 0),
    shareAmount: Number(entry.share_amount ?? entry.shareAmount ?? 0),
    sharePercent: Number(entry.share_percent ?? entry.sharePercent ?? 0),
    monthlySavings: Number(entry.monthly_savings ?? entry.monthlySavings ?? 0),
    monthlyPrincipal: Number(entry.monthly_principal ?? entry.monthlyPrincipal ?? 0),
    monthlyInterest: Number(entry.monthly_interest ?? entry.monthlyInterest ?? 0),
    monthlyPenalty: Number(entry.monthly_penalty ?? entry.monthlyPenalty ?? 0),
    monthlyWithdrawn: Number(entry.monthly_withdrawn ?? entry.monthlyWithdrawn ?? 0),
    monthlyCollections: Number(entry.monthly_collections ?? entry.monthlyCollections ?? 0)
  };
}

function getMemberStatementRpcSummary(state, memberId) {
  const summaries = state?.rpcMemberStatements ?? {};
  const entry = summaries[String(memberId)] ?? summaries[memberId] ?? null;
  if (!entry) return null;
  return {
    openingBalance: Number(entry.opening_balance ?? entry.openingBalance ?? 0),
    savings: Number(entry.savings_collected ?? entry.savingsCollected ?? entry.savings ?? 0),
    principalCollected: Number(entry.principal_collected ?? entry.principalCollected ?? 0),
    interestCollected: Number(entry.interest_collected ?? entry.interestCollected ?? 0),
    penaltyCollected: Number(entry.penalty_collected ?? entry.penaltyCollected ?? 0),
    withdrawn: Number(entry.withdrawals ?? entry.withdrawn ?? 0),
    expense: Number(entry.expense_allocation ?? entry.expenseAllocation ?? entry.expense ?? 0),
    gain: Number(entry.share_allocation ?? entry.gain ?? 0),
    shareAmount: Number(entry.share_allocation ?? entry.shareAmount ?? 0),
    outstanding: Number(entry.closing_balance ?? entry.closingBalance ?? entry.outstanding ?? 0)
  };
}

function getMemberLoanAgingRpcSummary(state, memberId) {
  const summaries = state?.rpcLoanAgingSummaries ?? {};
  const entry = summaries[String(memberId)] ?? summaries[memberId] ?? null;
  if (!entry) return null;
  return {
    outstanding: Number(entry.outstanding_principal ?? entry.outstandingPrincipal ?? 0),
    overdueDays: Number(entry.overdue_days ?? entry.overdueDays ?? 0),
    nextDueAmount: Number(entry.next_due_amount ?? entry.nextDueAmount ?? 0),
    dueDate: entry.due_date ?? entry.dueDate ?? null,
    repaymentStatus: entry.repayment_status ?? entry.repaymentStatus ?? null
  };
}

function getMemberLoanInterestDueRpcSummary(state, memberId) {
  const summaries = state?.rpcMemberLoanInterestDues ?? {};
  const entry = summaries[String(memberId)] ?? summaries[memberId] ?? null;
  if (entry == null) return null;
  return Number(entry);
}

function getMemberLoanInterestDueRpcDetailRows(state, memberId) {
  const rowsByMember = state?.rpcMemberLoanInterestDueDetails ?? {};
  const entry = rowsByMember[String(memberId)] ?? rowsByMember[memberId] ?? [];
  return Array.isArray(entry) ? entry : [];
}

export function getMemberLoanInterestDueDetails(member, state, dueDate, paymentUntilDate = dueDate, interestFromDate = null, includeOpeningInterest = true) {
  const rpcRows = getMemberLoanInterestDueRpcDetailRows(state, member?.id);
  if (rpcRows.length > 0) {
    return rpcRows.map((row) => ({
      loan: {
        id: row.loan_id,
        loanNumber: row.loan_number ?? row.loanNumber,
        principalOutstanding: Number(row.outstanding_principal ?? row.outstandingPrincipal ?? 0),
        interestOutstanding: Number(row.outstanding_interest ?? row.outstandingInterest ?? 0),
        penaltyOutstanding: Number(row.outstanding_penalty ?? row.outstandingPenalty ?? 0)
      },
      calculated: Number(row.interest_due ?? row.interestDue ?? row.outstanding_interest ?? row.outstandingInterest ?? 0),
      migratedInterest: 0,
      dueBeforePayments: Number(row.interest_due ?? row.interestDue ?? row.outstanding_interest ?? row.outstandingInterest ?? 0),
      due: Number(row.interest_due ?? row.interestDue ?? row.outstanding_interest ?? row.outstandingInterest ?? 0)
    }));
  }

  return calculateMemberLoanInterestDueDetails(member, state, dueDate, paymentUntilDate, interestFromDate, includeOpeningInterest);
}

export function calculateGroupFinanceSummary(state, period = getDashboardPeriod(state)) {
  const completedTransactions = getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || []));
  const completedExpenses = getCompletedTransactions(state.expenses || []);
  const activeLoans = (state.loans || []).filter(isOutstandingLoan);
  const completedLoans = (state.loans || []).filter((loan) =>
    isCompletedFinancialStatus(loan.approvalStatus)
    || ["ACTIVE", "COMPLETED", "APPROVED", "CLOSED"].includes(String(loan.status ?? loan.loanStatus ?? "").toUpperCase())
  );
  const totalSavings = calculateTotalSavings(completedTransactions, state.members || []);
  const totalActiveLoan = calculateDerivedLoanOutstanding(activeLoans, state);
  const legacyOpening = calculateLegacyGroupOpeningSummary(state, { totalSavings, activeLoanOutstanding: totalActiveLoan });
  const totalExpenses = completedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0) + legacyOpening.openingGroupExpense;
  const collectedGain = completedTransactions.reduce((sum, trx) =>
    isMigratedOpeningTransaction(trx) ? sum : sum + Number(trx.allocation?.interest || 0) + Number(trx.allocation?.penalty || 0), 0);
  const groupGain = collectedGain + legacyOpening.groupGain;
  const remainingBalance = Number(totalSavings || 0) + Number(groupGain || 0) - Number(totalActiveLoan || 0) - Number(totalExpenses || 0);
  const periodTransactions = completedTransactions.filter((item) => isDateInPeriod(item.transactionDate, period));
  const monthlyWithdrawn = periodTransactions
    .filter((trx) => trx.transactionType === "Withdrawal")
    .reduce((sum, trx) => sum + Math.abs(Number(trx.amount || trx.allocation?.savings || 0)), 0);
  const totalWithdrawn = completedTransactions
    .filter((trx) => trx.transactionType === "Withdrawal")
    .reduce((sum, trx) => sum + Math.abs(Number(trx.amount || trx.allocation?.savings || 0)), 0);
  const monthlySavings = sumCollectedSavings(periodTransactions);
  const monthlyPrincipal = sumCollectedAllocation(periodTransactions, "principal");
  const monthlyInterest = sumCollectedAllocation(periodTransactions, "interest");
  const monthlyPenalty = sumCollectedAllocation(periodTransactions, "penalty");
  const monthlyCollections = monthlySavings + monthlyPrincipal + monthlyInterest + monthlyPenalty - monthlyWithdrawn;
  const monthlyLoanDisbursed = completedLoans
    .filter((loan) => isDateInPeriod(loan.startDate, period))
    .reduce((sum, loan) => sum + Number(loan.amount || 0), 0);

  const fallback = {
    completedTransactions,
    completedExpenses,
    activeLoans,
    completedLoans,
    totalSavings,
    totalActiveLoan,
    totalExpenses,
    totalWithdrawn,
    groupGain,
    collectedGain,
    legacyOpening,
    remainingBalance,
    monthlySavings,
    monthlyPrincipal,
    monthlyInterest,
    monthlyPenalty,
    monthlyWithdrawn,
    monthlyCollections,
    monthlyLoanDisbursed,
    overallPrincipalCollected: sumCollectedAllocation(completedTransactions, "principal"),
    totalLoanDisbursedAmount: completedLoans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0),
    totalLoanDisbursedCount: completedLoans.length,
    closedLoanCount: completedLoans.filter((loan) => !isOutstandingLoan(loan)).length,
    activatedThisMonth: completedLoans.filter((loan) => isDateInPeriod(loan.startDate, period)).length
  };

  const rpcSummary = getGroupRpcSummary(state, state.groups?.[0]?.id);
  if (rpcSummary) {
    return {
      ...fallback,
      ...rpcSummary,
      totalSavings: rpcSummary.totalSavings ?? fallback.totalSavings,
      totalActiveLoan: rpcSummary.totalActiveLoan ?? fallback.totalActiveLoan,
      totalExpenses: rpcSummary.totalExpenses ?? fallback.totalExpenses,
      groupGain: rpcSummary.groupGain ?? fallback.groupGain,
      remainingBalance: rpcSummary.remainingBalance ?? fallback.remainingBalance,
      monthlySavings: rpcSummary.monthlySavings ?? fallback.monthlySavings,
      monthlyPrincipal: rpcSummary.monthlyPrincipal ?? fallback.monthlyPrincipal,
      monthlyInterest: rpcSummary.monthlyInterest ?? fallback.monthlyInterest,
      monthlyPenalty: rpcSummary.monthlyPenalty ?? fallback.monthlyPenalty,
      monthlyWithdrawn: rpcSummary.monthlyWithdrawn ?? fallback.monthlyWithdrawn,
      monthlyCollections: rpcSummary.monthlyCollections ?? fallback.monthlyCollections,
      monthlyLoanDisbursed: rpcSummary.monthlyLoanDisbursed ?? fallback.monthlyLoanDisbursed
    };
  }

  return fallback;
}

function isInactiveMember(member) {
  return String(member?.status ?? "").toUpperCase() === "INACTIVE"
    || Boolean(member?.inactiveDate || member?.exitDate);
}

function isPendingStatus(status) {
  return String(status ?? "").toUpperCase() === "PENDING";
}

function memberSavingsBeforeWithdrawals(member, transactions = [], rawTransactions = []) {
  const memberTransactions = transactions.filter((transaction) => String(transaction.memberId) === String(member?.id));
  const rawMemberTransactions = rawTransactions.filter((transaction) => String(transaction.memberId) === String(member?.id));
  const ledgerSavings = memberTransactions
    .filter((transaction) => transaction.transactionType !== "Withdrawal")
    .filter((transaction) => transaction.transactionType !== "Group Expense Share")
    .reduce((sum, transaction) =>
      sum + Number(transaction.allocation?.savings ?? 0) + Number(transaction.allocation?.excess ?? 0), 0);
  const hasSavingsLedger = rawMemberTransactions.some((transaction) =>
    transaction.transactionType !== "Withdrawal"
    && transaction.transactionType !== "Group Expense Share"
  );
  return hasSavingsLedger ? ledgerSavings : Number(member?.savings || 0);
}

function withdrawalTotal(transactions = []) {
  return transactions
    .filter((transaction) => transaction.transactionType === "Withdrawal")
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || transaction.allocation?.savings || 0)), 0);
}

function otherIncomeTotal(transactions = []) {
  return transactions.reduce((sum, transaction) => {
    if (isMigratedOpeningTransaction(transaction) || transaction.transactionType === "Withdrawal") return sum;
    if (transaction.transactionType === "Other Charge") {
      return sum + Number(transaction.amount || transaction.allocation?.charges || 0);
    }
    return sum + Number(transaction.allocation?.charges || 0);
  }, 0);
}

function validateCardValue(name, header, calculated, serverValid = null) {
  const hasServerValidation = serverValid !== null && serverValid !== undefined;
  return {
    name,
    valid: hasServerValidation ? Boolean(serverValid) : Math.abs(Number(header || 0) - Number(calculated || 0)) < 0.01,
    header,
    calculated,
    serverValid
  };
}

export function validateDashboardCards(cards, serverSummary = null) {
  return {
    totalSavings: validateCardValue(
      "totalSavings",
      cards.totalSavings.header,
      cards.totalSavings.calculatedHeader,
      serverSummary?.validation_total_savings ?? serverSummary?.validationTotalSavings ?? true
    ),
    collectedInPeriod: validateCardValue(
      "collectedInPeriod",
      cards.collectedInPeriod.header,
      cards.collectedInPeriod.calculatedHeader,
      serverSummary?.validation_collected_in_period ?? serverSummary?.validationCollectedInPeriod ?? true
    ),
    activeLoan: validateCardValue(
      "activeLoan",
      cards.activeLoan.header,
      cards.activeLoan.calculatedHeader,
      serverSummary?.validation_active_loan ?? serverSummary?.validationActiveLoan ?? true
    ),
    remainingBalance: validateCardValue(
      "remainingBalance",
      cards.remainingBalance.header,
      cards.remainingBalance.calculatedHeader,
      serverSummary?.validation_remaining_balance ?? serverSummary?.validationRemainingBalance ?? true
    ),
    activeLoans: validateCardValue(
      "activeLoans",
      cards.activeLoans.header,
      cards.activeLoans.calculatedHeader,
      serverSummary?.validation_active_loans ?? serverSummary?.validationActiveLoans ?? true
    )
  };
}

export function calculateDashboardCards(state, period = getDashboardPeriod(state)) {
  const dashboardRpcSummary = getDashboardRpcSummary(state, state.groups?.[0]?.id);
  const groupSummary = calculateGroupFinanceSummary(state, period);
  const completedTransactions = groupSummary.completedTransactions || getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || []));
  const completedExpenses = getCompletedTransactions(state.expenses || []);
  const activeLoans = (state.loans || []).filter(isOutstandingLoan);
  const completedLoans = (state.loans || []).filter((loan) =>
    isCompletedFinancialStatus(loan.approvalStatus)
    || ["ACTIVE", "COMPLETED", "APPROVED", "CLOSED"].includes(String(loan.status ?? loan.loanStatus ?? "").toUpperCase())
  );
  const periodTransactions = completedTransactions.filter((transaction) => isDateInPeriod(transaction.transactionDate, period));
  const activeMembers = (state.members || []).filter((member) => !isInactiveMember(member));
  const closedMembers = (state.members || []).filter(isInactiveMember);
  const rawCompletedTransactions = getCompletedTransactions(state.transactions || []);
  const activeMemberSavings = activeMembers.reduce((sum, member) => sum + memberSavingsBeforeWithdrawals(member, completedTransactions, rawCompletedTransactions), 0);
  const closedMemberSavings = closedMembers.reduce((sum, member) => sum + memberSavingsBeforeWithdrawals(member, completedTransactions, rawCompletedTransactions), 0);
  const withdrawnSavings = withdrawalTotal(completedTransactions);
  const totalSavingsHeader = dashboardRpcSummary?.totalSavings ?? groupSummary.totalSavings ?? (activeMemberSavings + closedMemberSavings - withdrawnSavings);

  const savingsCollected = sumCollectedSavings(periodTransactions);
  const principalCollected = sumCollectedAllocation(periodTransactions, "principal");
  const interestCollected = sumCollectedAllocation(periodTransactions, "interest");
  const penaltyCollected = sumCollectedAllocation(periodTransactions, "penalty");
  const withdrawnInPeriod = withdrawalTotal(periodTransactions);
  const collectedInPeriodHeader = dashboardRpcSummary?.currentMonthCollections ?? groupSummary.monthlyCollections ?? (savingsCollected + principalCollected + interestCollected + penaltyCollected - withdrawnInPeriod);

  const disbursedThisMonth = completedLoans
    .filter((loan) => isDateInPeriod(loan.startDate, period))
    .reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
  const loanDisbursedTillNow = completedLoans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
  const principalRepaidTillNow = sumCollectedAllocation(completedTransactions, "principal");
  const principalOutstanding = Math.max(0, loanDisbursedTillNow - principalRepaidTillNow);
  const interestPending = activeLoans.reduce((sum, loan) => sum + Number(loan.interestOutstanding || 0), 0);
  const penaltyPending = activeLoans.reduce((sum, loan) => sum + Number(loan.penaltyOutstanding || 0), 0);

  const legacyOpening = calculateLegacyGroupOpeningSummary(state, {
    totalSavings: totalSavingsHeader,
    activeLoanOutstanding: principalOutstanding
  });
  const openingBalance = legacyOpening.openingBankBalance;
  const totalPrincipalCollected = principalRepaidTillNow;
  const totalInterestCollected = sumCollectedAllocation(completedTransactions, "interest");
  const totalPenaltyCollected = sumCollectedAllocation(completedTransactions, "penalty");
  const otherIncomeGain = otherIncomeTotal(completedTransactions) + legacyOpening.groupGain;
  const expenses = completedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0) + legacyOpening.openingGroupExpense;
  const savingsBeforeWithdrawals = activeMemberSavings + closedMemberSavings;
  const remainingBalanceHeader = dashboardRpcSummary?.remainingBalance ?? (
    openingBalance
    + savingsBeforeWithdrawals
    + totalPrincipalCollected
    + totalInterestCollected
    + totalPenaltyCollected
    + otherIncomeGain
    - expenses
    - withdrawnSavings
    - principalOutstanding
  );

  const closedLoanCount = completedLoans.filter((loan) => !isOutstandingLoan(loan)).length;
  const disbursedLoanCount = completedLoans.length;
  const activatedThisMonth = completedLoans.filter((loan) => isDateInPeriod(loan.startDate, period)).length;
  const pendingApprovalLoans = (state.loans || []).filter((loan) => isPendingStatus(loan.approvalStatus || loan.status || loan.loanStatus)).length;
  const todayIso = toIsoDateValue();
  const overdueLoans = new Set(calculatePendingDues(state, null, false)
    .filter((row) => String(row.dueDate || "") < todayIso && Number(row.totalDue || 0) > 0)
    .map((row) => String(row.memberId))).size;
  const activeLoanCountHeader = dashboardRpcSummary?.activeLoansCount ?? (disbursedLoanCount - closedLoanCount);
  const openPeriod = getOpenPeriod(state.periods || []);
  const selectedPeriod = openPeriod ?? period;

  const cards = {
    totalSavings: {
      key: "totalSavings",
      label: "Total savings",
      header: totalSavingsHeader,
      calculatedHeader: activeMemberSavings + closedMemberSavings - withdrawnSavings,
      subfields: {
        members: (state.members || []).length,
        activeMembers: activeMembers.length,
        activeMemberSavings,
        closedExitedMemberSavings: closedMemberSavings,
        withdrawnSavings
      }
    },
    collectedInPeriod: {
      key: "collectedInPeriod",
      label: `Collected in period ${selectedPeriod?.name ?? ""}`.trim(),
      header: collectedInPeriodHeader,
      calculatedHeader: savingsCollected + principalCollected + interestCollected + penaltyCollected - withdrawnInPeriod,
      subfields: {
        savingsCollected,
        principalCollected,
        interestCollected,
        penaltyCollected,
        withdrawnInPeriod
      }
    },
    activeLoan: {
      key: "activeLoan",
      label: "Active Loan",
      header: dashboardRpcSummary?.activeLoanBalance ?? groupSummary.totalActiveLoan ?? principalOutstanding,
      calculatedHeader: Math.max(0, loanDisbursedTillNow - principalRepaidTillNow),
      subfields: {
        disbursedThisMonth,
        loanDisbursedTillNow,
        principalRepaidTillNow,
        interestPending,
        penaltyPending
      }
    },
    remainingBalance: {
      key: "remainingBalance",
      label: "Remaining Balance",
      header: dashboardRpcSummary?.remainingBalance ?? groupSummary.remainingBalance ?? remainingBalanceHeader,
      calculatedHeader: remainingBalanceHeader,
      subfields: {
        openingBalance,
        savings: savingsBeforeWithdrawals,
        principalCollected: totalPrincipalCollected,
        interestCollected: totalInterestCollected,
        penaltyCollected: totalPenaltyCollected,
        otherIncomeGain,
        expense: expenses,
        withdrawals: withdrawnSavings,
        loanOutstanding: principalOutstanding
      }
    },
    activeLoans: {
      key: "activeLoans",
      label: "Active Loans",
      header: activeLoanCountHeader,
      calculatedHeader: disbursedLoanCount - closedLoanCount,
      subfields: {
        disbursedTillNow: disbursedLoanCount,
        closedTillNow: closedLoanCount,
        activatedThisMonth,
        overdueLoans,
        pendingApprovalLoans
      }
    },
    openPeriod: {
      key: "openPeriod",
      label: "Open Period",
      header: selectedPeriod?.name ?? "None",
      subfields: {
        currentOpenMonth: selectedPeriod?.name ?? "None",
        periodStatus: selectedPeriod?.status ?? "Not open",
        startDate: selectedPeriod?.startDate ?? "-",
        endDate: selectedPeriod?.endDate ?? "-"
      }
    }
  };

  return {
    cards,
    validations: validateDashboardCards(cards, dashboardRpcSummary)
  };
}

export function calculateMemberFinanceSummary(member, state, period = getDashboardPeriod(state), actor = null) {
  const groupSummary = calculateGroupFinanceSummary(state, period);
  const ledger = calculateMemberLedgerSummary(member, state);
  const memberLoans = groupSummary.completedLoans.filter((loan) => loanBelongsToMember(loan, member));
  const memberActiveLoans = memberLoans.filter(isOutstandingLoan);
  const dueRows = calculatePendingDues(state, actor, false).filter((row) => String(row.memberId) === String(member?.id));
  const defaultDueDate = getLoanDueDate(state.groups?.[0]);
  const defaultDueDateIso = toIsoDateValue(defaultDueDate);
  const dueInterestDue = dueRows.reduce((sum, row) => sum + Number(row.interestDue || 0), 0);
  const rpcInterestDue = getMemberLoanInterestDueRpcSummary(state, member?.id);
  const interestDue = dueInterestDue > 0
    ? dueInterestDue
    : (rpcInterestDue != null ? rpcInterestDue : calculateMemberLoanInterestDue(member, state, defaultDueDate));
  const nextDueAmount = dueRows.reduce((sum, row) => sum + Number(row.totalDue || 0), 0);
  const completedTransactions = groupSummary.completedTransactions;
  const memberTransactions = completedTransactions.filter((trx) => String(trx.memberId) === String(member?.id));
  const memberPeriodTransactions = memberTransactions.filter((trx) => isDateInPeriod(trx.transactionDate, period));
  const monthlyWithdrawn = memberPeriodTransactions
    .filter((trx) => trx.transactionType === "Withdrawal")
    .reduce((sum, trx) => sum + Math.abs(Number(trx.amount || trx.allocation?.savings || 0)), 0);
  const monthlySavings = sumCollectedSavings(memberPeriodTransactions);
  const monthlyPrincipal = sumCollectedAllocation(memberPeriodTransactions, "principal");
  const monthlyInterest = sumCollectedAllocation(memberPeriodTransactions, "interest");
  const monthlyPenalty = sumCollectedAllocation(memberPeriodTransactions, "penalty");
  const totalGroupShare = (state.members || []).reduce((sum, item) => sum + Math.max(0, calculateMemberLedgerSummary(item, state).shareAmount), 0);
  const sharePercent = totalGroupShare > 0 ? Number(((Math.max(0, ledger.shareAmount) / totalGroupShare) * 100).toFixed(2)) : 0;

  const fallback = {
    ...ledger,
    memberLoans,
    memberActiveLoans,
    dueRows,
    dueDate: defaultDueDateIso,
    interestDue,
    nextDueAmount,
    monthlySavings,
    monthlyPrincipal,
    monthlyInterest,
    monthlyPenalty,
    monthlyWithdrawn,
    monthlyCollections: monthlySavings + monthlyPrincipal + monthlyInterest + monthlyPenalty - monthlyWithdrawn,
    sharePercent,
    overdueDays: 0,
    repaymentStatus: null
  };

  const loanAgingSummary = getMemberLoanAgingRpcSummary(state, member?.id);
  if (loanAgingSummary) {
    return {
      ...fallback,
      dueDate: loanAgingSummary.dueDate ?? fallback.dueDate,
      nextDueAmount: loanAgingSummary.nextDueAmount ?? fallback.nextDueAmount,
      interestDue: fallback.interestDue,
      overdueDays: loanAgingSummary.overdueDays ?? fallback.overdueDays,
      repaymentStatus: loanAgingSummary.repaymentStatus ?? fallback.repaymentStatus,
      outstanding: loanAgingSummary.outstanding ?? fallback.outstanding,
      dueRows,
      memberLoans,
      memberActiveLoans
    };
  }

  const rpcSummary = getMemberRpcSummary(state, member?.id);
  if (rpcSummary) {
    return {
      ...fallback,
      ...rpcSummary,
      savings: rpcSummary.savings ?? fallback.savings,
      outstanding: rpcSummary.outstanding ?? fallback.outstanding,
      gain: rpcSummary.gain ?? fallback.gain,
      expense: rpcSummary.expense ?? fallback.expense,
      shareAmount: rpcSummary.shareAmount ?? fallback.shareAmount,
      sharePercent: rpcSummary.sharePercent ?? fallback.sharePercent,
      monthlySavings: rpcSummary.monthlySavings ?? fallback.monthlySavings,
      monthlyPrincipal: rpcSummary.monthlyPrincipal ?? fallback.monthlyPrincipal,
      monthlyInterest: rpcSummary.monthlyInterest ?? fallback.monthlyInterest,
      monthlyPenalty: rpcSummary.monthlyPenalty ?? fallback.monthlyPenalty,
      monthlyWithdrawn: rpcSummary.monthlyWithdrawn ?? fallback.monthlyWithdrawn,
      monthlyCollections: rpcSummary.monthlyCollections ?? fallback.monthlyCollections,
      dueRows,
      memberLoans,
      memberActiveLoans
    };
  }

  return fallback;
}

export function validateMemberDashboardCards(cards, serverSummary = null) {
  return {
    savings: validateCardValue(
      "memberSavings",
      cards.savings.header,
      cards.savings.calculatedHeader,
      serverSummary?.validation_savings ?? serverSummary?.validationSavings ?? null
    ),
    collectedInPeriod: validateCardValue(
      "memberCollectedInPeriod",
      cards.collectedInPeriod.header,
      cards.collectedInPeriod.calculatedHeader,
      serverSummary?.validation_collected_in_period ?? serverSummary?.validationCollectedInPeriod ?? null
    ),
    shareAmount: validateCardValue(
      "memberShareAmount",
      cards.shareAmount.header,
      cards.shareAmount.calculatedHeader,
      serverSummary?.validation_share_amount ?? serverSummary?.validationShareAmount ?? null
    ),
    loanBalance: validateCardValue(
      "memberLoanBalance",
      cards.loanBalance.header,
      cards.loanBalance.calculatedHeader,
      serverSummary?.validation_loan_balance ?? serverSummary?.validationLoanBalance ?? null
    ),
    nextMinimumDue: validateCardValue(
      "memberNextMinimumDue",
      cards.nextMinimumDue.header,
      cards.nextMinimumDue.calculatedHeader,
      serverSummary?.validation_next_minimum_due ?? serverSummary?.validationNextMinimumDue ?? null
    ),
    sharePercent: validateCardValue(
      "memberSharePercent",
      cards.sharePercent.header,
      cards.sharePercent.calculatedHeader,
      serverSummary?.validation_share_percent ?? serverSummary?.validationSharePercent ?? null
    )
  };
}

export function calculateMemberDashboardCards(member, state, period = getDashboardPeriod(state), actor = null) {
  const summary = calculateMemberFinanceSummary(member, state, period, actor);
  const serverSummary = state?.rpcMemberDashboardCardSummaries?.[String(member?.id)] ?? null;
  const completedTransactions = getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || []));
  const memberTransactions = completedTransactions.filter((transaction) => String(transaction.memberId) === String(member?.id));
  const grossSavings = memberTransactions
    .filter((transaction) => transaction.transactionType !== "Withdrawal")
    .filter((transaction) => transaction.transactionType !== "Group Expense Share")
    .reduce((sum, transaction) =>
      sum + Number(transaction.allocation?.savings ?? 0) + Number(transaction.allocation?.excess ?? 0), 0);
  const hasSavingsLedger = memberTransactions.some((transaction) =>
    transaction.transactionType !== "Withdrawal"
    && transaction.transactionType !== "Group Expense Share"
    && (Number(transaction.allocation?.savings ?? 0) !== 0 || Number(transaction.allocation?.excess ?? 0) !== 0)
  );
  const savingsBeforeWithdrawals = hasSavingsLedger ? grossSavings : Number(member?.savings || 0);
  const withdrawnSavings = withdrawalTotal(memberTransactions);
  const periodTransactions = memberTransactions.filter((transaction) => isDateInPeriod(transaction.transactionDate, period));
  const savingsCollected = sumCollectedSavings(periodTransactions);
  const principalCollected = sumCollectedAllocation(periodTransactions, "principal");
  const interestCollected = sumCollectedAllocation(periodTransactions, "interest");
  const penaltyCollected = sumCollectedAllocation(periodTransactions, "penalty");
  const withdrawnInPeriod = withdrawalTotal(periodTransactions);
  const activeLoans = summary.memberActiveLoans || [];
  const principalOutstanding = activeLoans.reduce((sum, loan) => sum + calculateDerivedLoanPrincipalOutstanding(loan, state), 0);
  const interestPending = activeLoans.reduce((sum, loan) => sum + Number(loan.interestOutstanding || 0), 0);
  const penaltyPending = activeLoans.reduce((sum, loan) => sum + Number(loan.penaltyOutstanding || 0), 0);
  const savingDue = summary.dueRows.reduce((sum, row) => sum + Number(row.savingDue || 0), 0);
  const principalDue = summary.dueRows.reduce((sum, row) => sum + Number(row.principalDue ?? row.outstandingPrincipal ?? 0), 0);
  const interestDue = summary.interestDue;
  const penaltyDue = summary.dueRows.reduce((sum, row) => sum + Number(row.penaltyDue || 0), 0);
  const shareAmount = summary.shareAmount ?? (summary.savings + summary.gain - summary.expense);
  const sharePercent = summary.sharePercent ?? 0;

  const cards = {
    savings: {
      key: "memberSavings",
      label: financeFieldDictionary.member.savings.label,
      header: Number(serverSummary?.savings ?? summary.savings ?? (savingsBeforeWithdrawals - withdrawnSavings)),
      calculatedHeader: Number(summary.savings ?? (savingsBeforeWithdrawals - withdrawnSavings)),
      subfields: {
        savingsBeforeWithdrawals,
        withdrawnSavings,
        thisPeriodSavings: summary.monthlySavings ?? savingsCollected
      }
    },
    collectedInPeriod: {
      key: "memberCollectedInPeriod",
      label: `${financeFieldDictionary.member.monthlyCollections.label} ${period?.name ?? ""}`.trim(),
      header: Number(serverSummary?.collected_in_period ?? summary.monthlyCollections ?? (savingsCollected + principalCollected + interestCollected + penaltyCollected - withdrawnInPeriod)),
      calculatedHeader: Number(summary.monthlyCollections ?? (savingsCollected + principalCollected + interestCollected + penaltyCollected - withdrawnInPeriod)),
      subfields: {
        savingsCollected: summary.monthlySavings ?? savingsCollected,
        principalCollected: summary.monthlyPrincipal ?? principalCollected,
        interestCollected: summary.monthlyInterest ?? interestCollected,
        penaltyCollected: summary.monthlyPenalty ?? penaltyCollected,
        withdrawnInPeriod: summary.monthlyWithdrawn ?? withdrawnInPeriod
      }
    },
    shareAmount: {
      key: "memberShareAmount",
      label: financeFieldDictionary.member.shareAmount.label,
      header: Number(serverSummary?.share_amount ?? shareAmount),
      calculatedHeader: Number(summary.shareAmount ?? (summary.savings + summary.gain - summary.expense)),
      subfields: {
        savings: summary.savings,
        incomeGainShare: summary.gain,
        expenseShare: summary.expense
      }
    },
    loanBalance: {
      key: "memberLoanBalance",
      label: financeFieldDictionary.member.outstanding.label,
      header: Number(serverSummary?.loan_balance ?? summary.outstanding ?? (principalOutstanding + interestPending + penaltyPending)),
      calculatedHeader: Number(summary.outstanding ?? (principalOutstanding + interestPending + penaltyPending)),
      subfields: {
        activeLoans: activeLoans.length,
        principalOutstanding,
        interestPending,
        penaltyPending,
        disbursedTillNow: summary.memberLoans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0)
      }
    },
    nextMinimumDue: {
      key: "memberNextMinimumDue",
      label: financeFieldDictionary.member.nextDueAmount.label,
      header: Number(serverSummary?.next_minimum_due ?? summary.nextDueAmount ?? (savingDue + principalDue + interestDue + penaltyDue)),
      calculatedHeader: Number(summary.nextDueAmount ?? (savingDue + principalDue + interestDue + penaltyDue)),
      subfields: {
        savingDue,
        principalDue,
        interestDue,
        penaltyDue,
        dueDate: summary.dueDate
      }
    },
    sharePercent: {
      key: "memberSharePercent",
      label: financeFieldDictionary.member.sharePercent.label,
      header: Number(serverSummary?.share_percent ?? sharePercent),
      calculatedHeader: Number(sharePercent),
      subfields: {
        memberShareAmount: Math.max(0, shareAmount),
        totalGroupShare: summary.sharePercent != null ? undefined : (state.members || []).reduce((sum, item) => sum + Math.max(0, calculateMemberLedgerSummary(item, state).shareAmount), 0)
      }
    }
  };

  return {
    cards,
    summary,
    validations: validateMemberDashboardCards(cards, state?.rpcMemberDashboardCardSummaries?.[String(member?.id)] ?? null)
  };
}

export function calculateOpeningShareRows(state, amount) {
  const activeMembers = (state.members || []).filter((member) => member.status !== "Inactive");
  const totalSavings = activeMembers.reduce((sum, member) => sum + Math.max(0, Number(member.savings || 0)), 0);
  let remaining = Number(amount || 0);

  return activeMembers.map((member, index) => {
    const shareAmount = totalSavings > 0
      ? (index === activeMembers.length - 1 ? Number(remaining.toFixed(2)) : Number(((Number(amount || 0) * Math.max(0, Number(member.savings || 0))) / totalSavings).toFixed(2)))
      : (index === activeMembers.length - 1 ? Number(remaining.toFixed(2)) : Number((Number(amount || 0) / Math.max(1, activeMembers.length)).toFixed(2)));
    remaining -= shareAmount;
    return { memberId: member.id, shareAmount };
  });
}

export function calculateLegacyGroupOpeningMemberImpact(member, state) {
  const openingSummary = calculateLegacyGroupOpeningSummary(state, {
    totalSavings: calculateTotalSavings(getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || [])), state.members || []),
    activeLoanOutstanding: calculateDerivedLoanOutstanding(state.loans || [], state)
  });
  const gainRows = calculateOpeningShareRows(state, openingSummary.groupGain);
  const expenseRows = calculateOpeningShareRows(state, openingSummary.openingGroupExpense);
  const gain = gainRows.find((row) => String(row.memberId) === String(member?.id))?.shareAmount ?? 0;
  const expense = expenseRows.find((row) => String(row.memberId) === String(member?.id))?.shareAmount ?? 0;
  return { gain, expense };
}

export function calculateMemberLedgerSummary(member, state) {
  const rawTransactions = getCompletedTransactions(state.transactions || []);
  const completedTransactions = getEffectiveCompletedTransactions(rawTransactions);
  const memberTransactions = completedTransactions.filter((transaction) => String(transaction.memberId) === String(member?.id));
  const rawMemberTransactions = rawTransactions.filter((transaction) => String(transaction.memberId) === String(member?.id));
  
  let savings = memberTransactions
    .filter((transaction) => transaction.transactionType !== "Group Expense Share")
    .reduce((sum, transaction) =>
      sum + Number(transaction.allocation?.savings ?? 0) + Number(transaction.allocation?.excess ?? 0), 0);
  const hasSavingsLedger = rawMemberTransactions.some((transaction) =>
    transaction.transactionType !== "Withdrawal"
    && transaction.transactionType !== "Group Expense Share"
  );
  if (!hasSavingsLedger && Number(member?.savings || 0) > 0) {
    savings = Number(member.savings || 0);
  }
  
  const expense = Math.abs(memberTransactions
    .filter((transaction) => transaction.transactionType === "Group Expense Share")
    .reduce((sum, transaction) => sum + Number(transaction.allocation?.savings ?? transaction.amount ?? 0), 0));
  const withdrawn = Math.abs(memberTransactions
    .filter((transaction) => transaction.transactionType === "Withdrawal")
    .reduce((sum, transaction) => sum + Number(transaction.allocation?.savings ?? -Math.abs(transaction.amount ?? 0)), 0));
  const gain = Number(member?.earnedFromGroup ?? member?.groupGain ?? member?.shares ?? 0);
  const totalExpense = expense;
  const loanOutstanding = (state.loans || [])
    .filter((loan) => loanBelongsToMember(loan, member) && isOutstandingLoan(loan))
    .reduce((sum, loan) => sum
      + calculateDerivedLoanPrincipalOutstanding(loan, state)
      + Number(loan.interestOutstanding || 0)
      + Number(loan.penaltyOutstanding || 0), 0);
  const outstanding = loanOutstanding || Number(member?.loanOutstanding || 0)
    + Number(member?.interestOutstanding || 0)
    + Number(member?.penaltyOutstanding || 0);
  const fallback = {
    savings,
    expense: totalExpense,
    withdrawn,
    gain,
    shareAmount: savings + gain - totalExpense,
    outstanding
  };

  const rpcStatementSummary = getMemberStatementRpcSummary(state, member?.id);
  if (rpcStatementSummary) {
    return {
      ...fallback,
      ...rpcStatementSummary,
      savings: rpcStatementSummary.savings ?? fallback.savings,
      expense: rpcStatementSummary.expense ?? fallback.expense,
      withdrawn: rpcStatementSummary.withdrawn ?? fallback.withdrawn,
      gain: rpcStatementSummary.gain ?? fallback.gain,
      shareAmount: rpcStatementSummary.shareAmount ?? fallback.shareAmount,
      outstanding: rpcStatementSummary.outstanding ?? fallback.outstanding,
      openingBalance: rpcStatementSummary.openingBalance,
      principalCollected: rpcStatementSummary.principalCollected,
      interestCollected: rpcStatementSummary.interestCollected,
      penaltyCollected: rpcStatementSummary.penaltyCollected
    };
  }

  const rpcSummary = getMemberRpcSummary(state, member?.id);
  if (rpcSummary) {
    return {
      ...fallback,
      ...rpcSummary,
      savings: rpcSummary.savings ?? fallback.savings,
      expense: rpcSummary.expense ?? fallback.expense,
      withdrawn: fallback.withdrawn,
      gain: rpcSummary.gain ?? fallback.gain,
      shareAmount: rpcSummary.shareAmount ?? fallback.shareAmount,
      outstanding: rpcSummary.outstanding ?? fallback.outstanding
    };
  }

  return fallback;
}

export function calculateDerivedLoanPrincipalOutstanding(loan, state) {
  if (!isOutstandingLoan(loan)) return 0;
  const completedTransactions = getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || []));
  const loanStartDate = loan.startDate || loan.distributionDate || "";
  const principalPaid = completedTransactions
    .filter((transaction) => loanBelongsToMember(loan, { id: transaction.memberId, fullName: transaction.memberName }))
    .filter((transaction) => !loanStartDate || String(transaction.transactionDate || "") >= String(loanStartDate))
    .filter((transaction) => !isMigratedOpeningTransaction(transaction))
    .reduce((sum, transaction) => sum + Number(transaction.allocation?.principal || 0), 0);
  const originalAmount = Number(loan.amount ?? loan.principalOutstanding ?? 0);
  if (principalPaid === 0) {
    const principal = loan.principalOutstanding != null ? Number(loan.principalOutstanding) : originalAmount;
    return Math.max(0, principal);
  }
  return Math.max(0, originalAmount - principalPaid);
}

export function calculateDerivedLoanOutstanding(loans, state) {
  return (loans || []).filter(isOutstandingLoan).reduce((sum, loan) => sum + calculateDerivedLoanPrincipalOutstanding(loan, state), 0);
}

export function calculateLoanOutstandingWithDues(loan, state) {
  return calculateDerivedLoanPrincipalOutstanding(loan, state)
    + Number(loan?.interestOutstanding || 0)
    + Number(loan?.penaltyOutstanding || 0);
}

export function buildOpeningShareRatioRows({ members = [], state, currentMemberId, currentSaving = 0, amount = 0 }) {
  const activeMembers = members.filter((member) => member.status !== "Inactive");
  const weightedRows = activeMembers.map((member) => {
    const summary = calculateMemberLedgerSummary(member, state);
    const openingShare = Math.max(0, Number(summary.savings || 0) + (String(member.id) === String(currentMemberId) ? Number(currentSaving || 0) : 0));
    return { member, openingShare };
  });
  const totalShare = weightedRows.reduce((sum, row) => sum + row.openingShare, 0);
  let remaining = Number(amount || 0);
  return weightedRows.map((row, index) => {
    const shareAmount = totalShare > 0
      ? (index === weightedRows.length - 1 ? Number(remaining.toFixed(2)) : Number(((Number(amount || 0) * row.openingShare) / totalShare).toFixed(2)))
      : (index === weightedRows.length - 1 ? Number(remaining.toFixed(2)) : Number((Number(amount || 0) / Math.max(1, weightedRows.length)).toFixed(2)));
    remaining -= shareAmount;
    return { member: row.member, openingShare: row.openingShare, amount: shareAmount };
  }).filter((row) => Math.abs(row.amount) > 0.009);
}

export function calculateDerivedOpeningSurplus({ state, currentSaving = 0, currentLoan = 0, groupBankBalance = 0, groupExpense = 0 }) {
  const completedTransactions = getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || []));
  const existingSavings = calculateTotalSavings(completedTransactions, state.members);
  const existingLoanOutstanding = calculateDerivedLoanOutstanding(state.loans || [], state);
  return Number(groupBankBalance || 0)
    + existingLoanOutstanding
    + Number(currentLoan || 0)
    - existingSavings
    - Number(currentSaving || 0)
    + Number(groupExpense || 0);
}

export function configuredNumber(primary, fallback, defaultValue = 0) {
  const hasPrimary = primary !== null && primary !== undefined && primary !== "";
  const primaryNumber = Number(primary);
  if (hasPrimary && Number.isFinite(primaryNumber)) return primaryNumber;
  const hasFallback = fallback !== null && fallback !== undefined && fallback !== "";
  const fallbackNumber = Number(fallback);
  if (hasFallback && Number.isFinite(fallbackNumber)) return fallbackNumber;
  return defaultValue;
}

export function getEffectiveMemberSetup(member, group = {}) {
  return {
    monthlySaving: configuredNumber(member?.customSavingAmount ?? member?.monthlySaving, group.monthlySaving, 0),
    interestRate: configuredNumber(member?.interestRate, group.interestRate, 0),
    loanTenureMonths: configuredNumber(member?.loanTenureMonths, group.loanTenureMonths, 0),
    loanLimit: configuredNumber(member?.loanLimit, group.maximumLoanLimit, 0),
    penaltyAfterDueDateAmount: configuredNumber(member?.penaltyAfterDueDateAmount, group.penaltyAfterDueDateAmount ?? group.penaltyAmount, 0),
    loanDueDay: configuredNumber(member?.loanDueDay, group.loanDueDay, 1),
    interestType: member?.interestType || group.interestType || "Reducing"
  };
}

export function completedTransactionsForMember(state, memberId, untilDate = null) {
  return getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || []), untilDate)
    .filter((transaction) => String(transaction.memberId) === String(memberId));
}

export function allocationPaidForMember(state, memberId, bucket, { fromDate = null, untilDate = null } = {}) {
  return completedTransactionsForMember(state, memberId, untilDate)
    .filter((transaction) => !fromDate || String(transaction.transactionDate || "") >= String(fromDate))
    .filter((transaction) => transaction.transactionType !== "Waiver")
    .filter((transaction) => !isMigratedOpeningTransaction(transaction))
    .reduce((sum, transaction) => sum + Math.max(0, Number(transaction.allocation?.[bucket] || 0)), 0);
}

export function allocationWaivedForMember(state, memberId, bucket, { untilDate = null } = {}) {
  return completedTransactionsForMember(state, memberId, untilDate)
    .filter((transaction) => transaction.transactionType === "Waiver")
    .reduce((sum, transaction) => sum + Math.abs(Math.min(0, Number(transaction.allocation?.[bucket] || 0))), 0);
}

function toDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getLoanInterestPeriodEndDates(group, loanStartDate, asOfDate) {
  const dueDay = Math.min(28, Math.max(1, Number(group?.loanDueDay || 1)));
  const start = toDateOnly(loanStartDate);
  const end = toDateOnly(asOfDate);
  const dueDates = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), dueDay);
  if (cursor < start) {
    cursor.setMonth(cursor.getMonth() + 1);
  }
  while (cursor <= end) {
    dueDates.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (dueDates.length === 0 && start <= end) {
    dueDates.push(end);
  }
  return dueDates;
}

function calculateLoanInterestAccruedToDate({ loan, setup, group, asOfDate }) {
  const loanStartDate = toDateOnly(loan.startDate || loan.distributionDate || asOfDate);
  const targetDate = toDateOnly(asOfDate);
  if (loanStartDate > targetDate || Number(loan.principalOutstanding || 0) <= 0) return 0;

  let totalInterest = 0;
  let periodStartDate = loanStartDate;
  const dueDates = getLoanInterestPeriodEndDates(group, loanStartDate, targetDate);
  dueDates.forEach((periodEndDate) => {
    totalInterest += calculateLoanInterestForPeriod({
      loan,
      setup,
      group,
      periodStartDate,
      periodEndDate
    });
    periodStartDate = new Date(periodEndDate.getFullYear(), periodEndDate.getMonth(), periodEndDate.getDate() + 1);
  });
  return totalInterest;
}

export function getLoanInterestForDate(loan, member, state, dateValue) {
  const group = state.groups?.[0] ?? {};
  const setup = getEffectiveMemberSetup(member, group);
  const targetDate = toDateOnly(dateValue || new Date());
  const interestAmount = calculateLoanInterestAccruedToDate({
    loan,
    setup,
    group,
    asOfDate: targetDate
  });
  return interestAmount;
}

function calculateLoanInterestForPeriod({ loan, setup, group, periodStartDate, periodEndDate }) {
  const loanStartDate = toDateOnly(loan.startDate || loan.distributionDate || periodEndDate);
  const periodEnd = toDateOnly(periodEndDate);
  if (loanStartDate > periodEnd || Number(loan.principalOutstanding || 0) <= 0) return 0;

  const effectivePeriodStart = periodStartDate ? toDateOnly(periodStartDate) : loanStartDate;
  const initialPeriodStart = loanStartDate;
  const interestStartDate = effectivePeriodStart > initialPeriodStart ? effectivePeriodStart : initialPeriodStart;
  const isFirstPeriod = !periodStartDate || effectivePeriodStart.getTime() === initialPeriodStart.getTime();
  const isBeforeCurrentPeriod = loanStartDate < effectivePeriodStart;
  const days = isFirstPeriod && !isBeforeCurrentPeriod
    ? Math.max(0, Math.ceil((periodEnd - interestStartDate) / (1000 * 60 * 60 * 24)))
    : 30;
  if (days <= 0) return 0;

  return calculateLoanInterest({
    principalOutstanding: Number(loan.principalOutstanding || 0),
    originalPrincipal: Number(loan.amount || loan.principalOutstanding || 0),
    monthlyRate: configuredNumber(setup.interestRate, loan.rate, 0),
    days,
    interestType: setup.interestType
  });
}

export function calculateMemberLoanInterestDueDetails(member, state, dueDate, paymentUntilDate = dueDate, interestFromDate = null, includeOpeningInterest = true) {
  const group = state.groups?.[0] ?? {};
  const setup = getEffectiveMemberSetup(member, group);
  const paymentUntilIso = toIsoDateValue(paymentUntilDate);
  const periodStartDate = interestFromDate ? new Date(interestFromDate) : null;
  const activeLoans = (state.loans || [])
    .filter((loan) => loanBelongsToMember(loan, member) && isOutstandingLoan(loan))
    .sort((a, b) => String(a.startDate || a.distributionDate || "").localeCompare(String(b.startDate || b.distributionDate || "")));
  const rawRows = activeLoans.map((loan) => {
    const calculated = calculateLoanInterestAccruedToDate({
      loan,
      setup,
      group,
      asOfDate: dueDate
    });
    const migratedInterest = includeOpeningInterest ? Number(loan.interestOutstanding || 0) : 0;
    return {
      loan,
      calculated,
      migratedInterest,
      dueBeforePayments: calculated + migratedInterest,
      due: calculated + migratedInterest
    };
  });
  let paid = allocationPaidForMember(state, member?.id, "interest", { untilDate: paymentUntilIso });
  let waived = allocationWaivedForMember(state, member?.id, "interest", { untilDate: paymentUntilIso });
  return rawRows.map((row) => {
    const paidHere = Math.min(row.due, paid);
    row.due -= paidHere;
    paid -= paidHere;
    const waivedHere = Math.min(row.due, waived);
    row.due -= waivedHere;
    waived -= waivedHere;
    return { ...row, paidApplied: paidHere, waivedApplied: waivedHere, due: Math.max(0, row.due) };
  });
}

export function getCurrentMember(state, actor) {
  return (state.members || []).find((member) =>
    String(member.id) === String(actor?.memberId)
    || (member.email && actor?.email && member.email.toLowerCase() === actor.email.toLowerCase())
    || (member.username && actor?.username && member.username.toLowerCase() === actor.username.toLowerCase())
  ) ?? state.members?.[0];
}

export function isDateInPeriod(dateValue, period) {
  if (!dateValue || !period) return false;
  return dateValue >= period.startDate && dateValue <= period.endDate;
}

export function getDashboardPeriod(state) {
  const openPeriodValue = getOpenPeriod(state.periods || []);
  const fallbackPeriod = getCurrentMonthPeriod(state.periods || []);
  const today = new Date();
  return openPeriodValue ?? fallbackPeriod ?? {
    name: today.toLocaleString("default", { month: "long", year: "numeric" }),
    startDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
    endDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, "0")}`
  };
}

export function getLoanDueDate(group) {
  const today = new Date();
  const dueDay = Math.min(28, Math.max(1, Number(group?.loanDueDay || 1)));
  const candidate = new Date(today.getFullYear(), today.getMonth(), dueDay);
  if (candidate < today) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return candidate;
}

export function calculateMemberLoanInterestDue(member, state, dueDate, paymentUntilDate = dueDate, interestFromDate = null, includeOpeningInterest = true) {
  return getMemberLoanInterestDueDetails(member, state, dueDate, paymentUntilDate, interestFromDate, includeOpeningInterest)
    .reduce((sum, row) => sum + Number(row.due || 0), 0);
}

export function getPeriodDueDate(group, period) {
  const base = new Date(period?.startDate || new Date());
  const dueDay = Math.min(28, Math.max(1, Number(group?.loanDueDay || 1)));
  return new Date(base.getFullYear(), base.getMonth(), dueDay);
}

function getPreviousDueDate(group, dueDate) {
  const dueDay = Math.min(28, Math.max(1, Number(group?.loanDueDay || 1)));
  return new Date(dueDate.getFullYear(), dueDate.getMonth() - 1, dueDay);
}

export function getDuePeriods(state) {
  const today = new Date();
  const group = state.groups?.[0] ?? {};
  const nextDue = getLoanDueDate(group);
  const periods = (state.periods || [])
    .filter((period) => period?.startDate)
    .filter((period) => new Date(period.startDate) <= nextDue)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  if (periods.length > 0) return periods;
  return [getDashboardPeriod(state)].filter(Boolean).map((period) => ({
    ...period,
    id: period.id ?? `due_${today.getFullYear()}_${today.getMonth() + 1}`
  }));
}

export function calculatePendingDues(state, actor = null, memberOnly = false) {
  const rpcRows = Array.isArray(state?.rpcPendingDues) ? state.rpcPendingDues : [];
  if (rpcRows.length > 0) {
    const dismissedDueIds = new Set((state.dismissedPendingDues || []).map(String));
    const targetMember = memberOnly ? getCurrentMember(state, actor) : null;
    return rpcRows
      .filter((row) => {
        const rowMemberId = String(row.member_id ?? row.memberId ?? "");
        const rowGroupId = String(row.group_id ?? row.groupId ?? "");
        const selectedGroupId = String(state.groups?.[0]?.id ?? "");
        const matchesGroup = !selectedGroupId || !rowGroupId || rowGroupId === selectedGroupId;
        const matchesMember = !targetMember || rowMemberId === String(targetMember.id);
        const hasPositiveDue = Number(row.total_due ?? row.totalDue ?? 0) > 0;
        const notDismissed = !dismissedDueIds.has(String(row.id ?? `${row.member_id ?? row.memberId ?? "member"}_${row.due_date ?? row.dueDate ?? "due"}`));
        return matchesGroup && matchesMember && hasPositiveDue && notDismissed;
      })
      .map((row) => ({
        id: row.id ?? `${row.member_id ?? row.memberId ?? "member"}_${row.due_date ?? row.dueDate ?? "due"}`,
        periodName: row.period_name ?? row.periodName ?? "Current",
        memberId: row.member_id ?? row.memberId,
        memberName: row.member_name ?? row.memberName,
        dueDate: row.due_date ?? row.dueDate,
        cycleStartDate: row.cycle_start_date ?? row.cycleStartDate ?? null,
        savingDue: Number(row.saving_due ?? row.savingDue ?? 0),
        principalDue: Number(row.principal_due ?? row.principalDue ?? row.outstanding_principal ?? row.outstandingPrincipal ?? 0),
        outstandingPrincipal: Number(row.outstanding_principal ?? row.outstandingPrincipal ?? row.principal_due ?? row.principalDue ?? 0),
        interestDue: Number(row.interest_due ?? row.interestDue ?? 0),
        penaltyDue: Number(row.penalty_due ?? row.penaltyDue ?? 0),
        totalDue: Number(row.total_due ?? row.totalDue ?? 0)
      }));
  }

  const group = state.groups?.[0] ?? {};
  const allCompletedTransactions = getCompletedTransactions(state.transactions || []);
  const dismissedDueIds = new Set((state.dismissedPendingDues || []).map(String));
  const groupStartDate = new Date(group.createdDate || group.startDate || group.creationDate || "1900-01-01");
  groupStartDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const targetMember = memberOnly ? getCurrentMember(state, actor) : null;
  const members = (state.members || [])
    .filter((member) => member.status !== "Inactive")
    .filter((member) => !targetMember || String(member.id) === String(targetMember.id));
  const periods = getDuePeriods(state);
  const firstDuePeriodByMember = new Map();
  periods.forEach((period) => {
    const dueDate = getPeriodDueDate(group, period);
    if (dueDate < groupStartDate) return;
    members.forEach((member) => {
      if (firstDuePeriodByMember.has(String(member.id))) return;
      const hasOutstandingLoan = (state.loans || []).some((loan) =>
        loanBelongsToMember(loan, member)
        && isOutstandingLoan(loan)
        && new Date(loan.startDate || period.startDate) <= dueDate
      );
      if (hasOutstandingLoan) {
        firstDuePeriodByMember.set(String(member.id), period.id);
      }
    });
  });

  return periods.flatMap((period) => {
    const dueDate = getPeriodDueDate(group, period);
    if (dueDate < groupStartDate) return [];
    const dueDateIso = toIsoDateValue(dueDate);
    const periodEnd = new Date(period.endDate || dueDate);
    const cycleStart = getPreviousDueDate(group, dueDate);
    cycleStart.setDate(cycleStart.getDate() + 1);
    const cycleStartIso = toIsoDateValue(cycleStart);
    // Use the period due date as the cutoff so that future remaining days
    // within the current financial period are considered (including future-dated
    // completed transactions) when checking if dues are paid.
    const paymentCutoff = dueDate;
    const paymentCutoffIso = toIsoDateValue(paymentCutoff);
    return members.map((member) => {
      const setup = getEffectiveMemberSetup(member, group);
      const effectiveTransactionsTillCutoff = getEffectiveCompletedTransactions(allCompletedTransactions, paymentCutoffIso);
      const transactions = effectiveTransactionsTillCutoff.filter((transaction) =>
        String(transaction.memberId) === String(member.id)
        && String(transaction.transactionDate || "") >= cycleStartIso
        && String(transaction.transactionDate || "") <= paymentCutoffIso
      );
      const savingSetup = setup.monthlySaving;
      const savingPaid = transactions.reduce((sum, transaction) =>
        sum + Number(transaction.allocation?.savings || 0) + Number(transaction.allocation?.excess || 0), 0);
      const savingDue = Math.max(0, savingSetup - savingPaid);
      const memberLoans = (state.loans || []).filter((loan) =>
        loanBelongsToMember(loan, member)
        && isOutstandingLoan(loan)
        && new Date(loan.startDate || period.startDate) <= dueDate
      );
      const outstandingPrincipal = memberLoans.reduce((sum, loan) => sum + calculateDerivedLoanPrincipalOutstanding(loan, state), 0);
      const principalPaidInCycle = transactions.reduce((sum, transaction) =>
        sum + Math.max(0, Number(transaction.allocation?.principal || 0)), 0);
      const principalDueBeforePayment = setup.loanTenureMonths > 0
        ? Math.min(
            outstandingPrincipal + principalPaidInCycle,
            memberLoans.reduce((sum, loan) => {
              const loanOutstanding = calculateDerivedLoanPrincipalOutstanding(loan, state);
              const originalPrincipal = Number(loan.amount || loan.principal || loan.originalPrincipal || loanOutstanding || 0);
              return sum + (originalPrincipal / setup.loanTenureMonths);
            }, 0)
          )
        : 0;
      const principalDue = Math.min(outstandingPrincipal, Math.max(0, principalDueBeforePayment - principalPaidInCycle));
      const includeOpeningInterest = firstDuePeriodByMember.get(String(member.id)) === period.id;
      const interestDue = calculateMemberLoanInterestDue(member, state, dueDate, paymentCutoff, cycleStart, includeOpeningInterest);
      const allPenaltyPaidTillCutoff = allocationPaidForMember(state, member.id, "penalty", { untilDate: paymentCutoffIso });
      const allPenaltyWaivedTillCutoff = allocationWaivedForMember(state, member.id, "penalty", { untilDate: paymentCutoffIso });
      const openingPenaltyDue = Number(member.penaltyOutstanding || 0)
        + memberLoans.reduce((sum, loan) => sum + Number(loan.penaltyOutstanding || 0), 0);
      const latePenalty = dueDate < today && (savingDue + principalDue + interestDue) > 0
        ? Number(setup.penaltyAfterDueDateAmount || 0)
        : 0;
      const penaltyDue = Math.max(0, openingPenaltyDue + latePenalty - allPenaltyPaidTillCutoff - allPenaltyWaivedTillCutoff);
      const totalDue = savingDue + principalDue + interestDue + penaltyDue;
      return {
        id: `${period.id}_${member.id}`,
        periodName: period.name,
        memberId: member.id,
        memberName: member.fullName,
        dueDate: dueDateIso,
        cycleStartDate: cycleStartIso,
        savingDue,
        principalDue,
        outstandingPrincipal,
        interestDue,
        penaltyDue,
        totalDue
      };
    }).filter((row) => row.totalDue > 0 && !dismissedDueIds.has(String(row.id)));
  });
}
