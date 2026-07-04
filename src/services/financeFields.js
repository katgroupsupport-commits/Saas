import {
  calculateLoanInterest,
  calculateTotalSavings
} from "./calculationEngine";
import { getCurrentMonthPeriod, getOpenPeriod } from "./periodControl";

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

export function getCompletedTransactions(transactions = []) {
  return transactions.filter((transaction) => isCompletedFinancialStatus(transaction.approvalStatus));
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

export function calculateGroupFinanceSummary(state, period = getDashboardPeriod(state)) {
  const completedTransactions = getCompletedTransactions(state.transactions || []);
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

  return {
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
}

function isInactiveMember(member) {
  return String(member?.status ?? "").toUpperCase() === "INACTIVE"
    || Boolean(member?.inactiveDate || member?.exitDate);
}

function isPendingStatus(status) {
  return String(status ?? "").toUpperCase() === "PENDING";
}

function memberSavingsBeforeWithdrawals(member, transactions = []) {
  const memberTransactions = transactions.filter((transaction) => String(transaction.memberId) === String(member?.id));
  const ledgerSavings = memberTransactions
    .filter((transaction) => transaction.transactionType !== "Withdrawal")
    .filter((transaction) => transaction.transactionType !== "Group Expense Share")
    .reduce((sum, transaction) =>
      sum + Number(transaction.allocation?.savings ?? 0) + Number(transaction.allocation?.excess ?? 0), 0);
  const hasSavingsLedger = memberTransactions.some((transaction) =>
    transaction.transactionType !== "Withdrawal"
    && transaction.transactionType !== "Group Expense Share"
    && (Number(transaction.allocation?.savings ?? 0) !== 0 || Number(transaction.allocation?.excess ?? 0) !== 0)
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

function validateCardValue(name, header, calculated) {
  return {
    name,
    valid: Math.abs(Number(header || 0) - Number(calculated || 0)) < 0.01,
    header,
    calculated
  };
}

export function validateDashboardCards(cards) {
  return {
    totalSavings: validateCardValue("totalSavings", cards.totalSavings.header, cards.totalSavings.calculatedHeader),
    collectedInPeriod: validateCardValue("collectedInPeriod", cards.collectedInPeriod.header, cards.collectedInPeriod.calculatedHeader),
    activeLoan: validateCardValue("activeLoan", cards.activeLoan.header, cards.activeLoan.calculatedHeader),
    remainingBalance: validateCardValue("remainingBalance", cards.remainingBalance.header, cards.remainingBalance.calculatedHeader),
    activeLoans: validateCardValue("activeLoans", cards.activeLoans.header, cards.activeLoans.calculatedHeader)
  };
}

export function calculateDashboardCards(state, period = getDashboardPeriod(state)) {
  const completedTransactions = getCompletedTransactions(state.transactions || []);
  const completedExpenses = getCompletedTransactions(state.expenses || []);
  const activeLoans = (state.loans || []).filter(isOutstandingLoan);
  const completedLoans = (state.loans || []).filter((loan) =>
    isCompletedFinancialStatus(loan.approvalStatus)
    || ["ACTIVE", "COMPLETED", "APPROVED", "CLOSED"].includes(String(loan.status ?? loan.loanStatus ?? "").toUpperCase())
  );
  const periodTransactions = completedTransactions.filter((transaction) => isDateInPeriod(transaction.transactionDate, period));
  const activeMembers = (state.members || []).filter((member) => !isInactiveMember(member));
  const closedMembers = (state.members || []).filter(isInactiveMember);
  const activeMemberSavings = activeMembers.reduce((sum, member) => sum + memberSavingsBeforeWithdrawals(member, completedTransactions), 0);
  const closedMemberSavings = closedMembers.reduce((sum, member) => sum + memberSavingsBeforeWithdrawals(member, completedTransactions), 0);
  const withdrawnSavings = withdrawalTotal(completedTransactions);
  const totalSavingsHeader = activeMemberSavings + closedMemberSavings - withdrawnSavings;

  const savingsCollected = sumCollectedSavings(periodTransactions);
  const principalCollected = sumCollectedAllocation(periodTransactions, "principal");
  const interestCollected = sumCollectedAllocation(periodTransactions, "interest");
  const penaltyCollected = sumCollectedAllocation(periodTransactions, "penalty");
  const withdrawnInPeriod = withdrawalTotal(periodTransactions);
  const collectedInPeriodHeader = savingsCollected + principalCollected + interestCollected + penaltyCollected - withdrawnInPeriod;

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
  const remainingBalanceHeader = openingBalance
    + savingsBeforeWithdrawals
    + totalPrincipalCollected
    + totalInterestCollected
    + totalPenaltyCollected
    + otherIncomeGain
    - expenses
    - withdrawnSavings
    - principalOutstanding;

  const closedLoanCount = completedLoans.filter((loan) => !isOutstandingLoan(loan)).length;
  const disbursedLoanCount = completedLoans.length;
  const activatedThisMonth = completedLoans.filter((loan) => isDateInPeriod(loan.startDate, period)).length;
  const pendingApprovalLoans = (state.loans || []).filter((loan) => isPendingStatus(loan.approvalStatus || loan.status || loan.loanStatus)).length;
  const todayIso = toIsoDateValue();
  const overdueLoans = new Set(calculatePendingDues(state, null, false)
    .filter((row) => String(row.dueDate || "") < todayIso && Number(row.totalDue || 0) > 0)
    .map((row) => String(row.memberId))).size;
  const activeLoanCountHeader = disbursedLoanCount - closedLoanCount;
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
      header: principalOutstanding,
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
      header: remainingBalanceHeader,
      calculatedHeader: openingBalance + savingsBeforeWithdrawals + totalPrincipalCollected + totalInterestCollected + totalPenaltyCollected + otherIncomeGain - expenses - withdrawnSavings - principalOutstanding,
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
    validations: validateDashboardCards(cards)
  };
}

export function calculateMemberFinanceSummary(member, state, period = getDashboardPeriod(state), actor = null) {
  const groupSummary = calculateGroupFinanceSummary(state, period);
  const ledger = calculateMemberLedgerSummary(member, state);
  const memberLoans = groupSummary.completedLoans.filter((loan) => loanBelongsToMember(loan, member));
  const memberActiveLoans = memberLoans.filter(isOutstandingLoan);
  const dueRows = calculatePendingDues(state, actor, false).filter((row) => String(row.memberId) === String(member?.id));
  const dueDate = getLoanDueDate(state.groups?.[0]);
  const interestDue = dueRows.reduce((sum, row) => sum + Number(row.interestDue || 0), 0) || calculateMemberLoanInterestDue(member, state, dueDate);
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

  return {
    ...ledger,
    memberLoans,
    memberActiveLoans,
    dueRows,
    dueDate,
    interestDue,
    nextDueAmount,
    monthlySavings,
    monthlyPrincipal,
    monthlyInterest,
    monthlyPenalty,
    monthlyWithdrawn,
    monthlyCollections: monthlySavings + monthlyPrincipal + monthlyInterest + monthlyPenalty - monthlyWithdrawn,
    sharePercent
  };
}

export function validateMemberDashboardCards(cards) {
  return {
    savings: validateCardValue("memberSavings", cards.savings.header, cards.savings.calculatedHeader),
    collectedInPeriod: validateCardValue("memberCollectedInPeriod", cards.collectedInPeriod.header, cards.collectedInPeriod.calculatedHeader),
    shareAmount: validateCardValue("memberShareAmount", cards.shareAmount.header, cards.shareAmount.calculatedHeader),
    loanBalance: validateCardValue("memberLoanBalance", cards.loanBalance.header, cards.loanBalance.calculatedHeader),
    nextMinimumDue: validateCardValue("memberNextMinimumDue", cards.nextMinimumDue.header, cards.nextMinimumDue.calculatedHeader),
    sharePercent: validateCardValue("memberSharePercent", cards.sharePercent.header, cards.sharePercent.calculatedHeader)
  };
}

export function calculateMemberDashboardCards(member, state, period = getDashboardPeriod(state), actor = null) {
  const summary = calculateMemberFinanceSummary(member, state, period, actor);
  const completedTransactions = getCompletedTransactions(state.transactions || []);
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
  const shareAmount = summary.savings + summary.gain - summary.expense;
  const totalGroupShare = (state.members || []).reduce((sum, item) => sum + Math.max(0, calculateMemberLedgerSummary(item, state).shareAmount), 0);
  const sharePercent = totalGroupShare > 0 ? Number(((Math.max(0, shareAmount) / totalGroupShare) * 100).toFixed(2)) : 0;

  const cards = {
    savings: {
      key: "memberSavings",
      label: financeFieldDictionary.member.savings.label,
      header: savingsBeforeWithdrawals - withdrawnSavings,
      calculatedHeader: savingsBeforeWithdrawals - withdrawnSavings,
      subfields: {
        savingsBeforeWithdrawals,
        withdrawnSavings,
        thisPeriodSavings: savingsCollected
      }
    },
    collectedInPeriod: {
      key: "memberCollectedInPeriod",
      label: `${financeFieldDictionary.member.monthlyCollections.label} ${period?.name ?? ""}`.trim(),
      header: savingsCollected + principalCollected + interestCollected + penaltyCollected - withdrawnInPeriod,
      calculatedHeader: savingsCollected + principalCollected + interestCollected + penaltyCollected - withdrawnInPeriod,
      subfields: {
        savingsCollected,
        principalCollected,
        interestCollected,
        penaltyCollected,
        withdrawnInPeriod
      }
    },
    shareAmount: {
      key: "memberShareAmount",
      label: financeFieldDictionary.member.shareAmount.label,
      header: shareAmount,
      calculatedHeader: summary.savings + summary.gain - summary.expense,
      subfields: {
        savings: summary.savings,
        incomeGainShare: summary.gain,
        expenseShare: summary.expense
      }
    },
    loanBalance: {
      key: "memberLoanBalance",
      label: financeFieldDictionary.member.outstanding.label,
      header: principalOutstanding + interestPending + penaltyPending,
      calculatedHeader: principalOutstanding + interestPending + penaltyPending,
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
      header: savingDue + principalDue + interestDue + penaltyDue,
      calculatedHeader: savingDue + principalDue + interestDue + penaltyDue,
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
      header: sharePercent,
      calculatedHeader: sharePercent,
      subfields: {
        memberShareAmount: Math.max(0, shareAmount),
        totalGroupShare
      }
    }
  };

  return {
    cards,
    summary,
    validations: validateMemberDashboardCards(cards)
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
    totalSavings: calculateTotalSavings(getCompletedTransactions(state.transactions || []), state.members || []),
    activeLoanOutstanding: calculateDerivedLoanOutstanding(state.loans || [], state)
  });
  const gainRows = calculateOpeningShareRows(state, openingSummary.groupGain);
  const expenseRows = calculateOpeningShareRows(state, openingSummary.openingGroupExpense);
  const gain = gainRows.find((row) => String(row.memberId) === String(member?.id))?.shareAmount ?? 0;
  const expense = expenseRows.find((row) => String(row.memberId) === String(member?.id))?.shareAmount ?? 0;
  return { gain, expense };
}

export function calculateMemberLedgerSummary(member, state) {
  const completedTransactions = getCompletedTransactions(state.transactions || []);
  const memberTransactions = completedTransactions.filter((transaction) => String(transaction.memberId) === String(member?.id));
  let savings = memberTransactions
    .filter((transaction) => transaction.transactionType !== "Group Expense Share")
    .reduce((sum, transaction) =>
      sum + Number(transaction.allocation?.savings ?? 0) + Number(transaction.allocation?.excess ?? 0), 0);
  if (savings === 0 && Number(member?.savings || 0) > 0) {
    savings = Number(member.savings || 0);
  }
  const expense = Math.abs(memberTransactions
    .filter((transaction) => transaction.transactionType === "Group Expense Share")
    .reduce((sum, transaction) => sum + Number(transaction.allocation?.savings ?? transaction.amount ?? 0), 0));
  const withdrawn = Math.abs(memberTransactions
    .filter((transaction) => transaction.transactionType === "Withdrawal")
    .reduce((sum, transaction) => sum + Number(transaction.allocation?.savings ?? -Math.abs(transaction.amount ?? 0)), 0));
  const openingImpact = calculateLegacyGroupOpeningMemberImpact(member, state);
  const gain = Number(member?.earnedFromGroup ?? member?.groupGain ?? 0) + Number(openingImpact.gain || 0);
  const totalExpense = expense + Number(openingImpact.expense || 0);
  const loanOutstanding = (state.loans || [])
    .filter((loan) => loanBelongsToMember(loan, member) && isOutstandingLoan(loan))
    .reduce((sum, loan) => sum
      + calculateDerivedLoanPrincipalOutstanding(loan, state)
      + Number(loan.interestOutstanding || 0)
      + Number(loan.penaltyOutstanding || 0), 0);
  const outstanding = loanOutstanding || Number(member?.loanOutstanding || 0)
    + Number(member?.interestOutstanding || 0)
    + Number(member?.penaltyOutstanding || 0);
  return {
    savings,
    expense: totalExpense,
    withdrawn,
    gain,
    shareAmount: savings + gain - totalExpense,
    outstanding
  };
}

export function calculateDerivedLoanPrincipalOutstanding(loan, state) {
  if (!isOutstandingLoan(loan)) return 0;
  const completedTransactions = getCompletedTransactions(state.transactions || []);
  const loanStartDate = loan.startDate || loan.distributionDate || "";
  const principalPaid = completedTransactions
    .filter((transaction) => loanBelongsToMember(loan, { id: transaction.memberId, fullName: transaction.memberName }))
    .filter((transaction) => !loanStartDate || String(transaction.transactionDate || "") >= String(loanStartDate))
    .filter((transaction) => !isMigratedOpeningTransaction(transaction))
    .reduce((sum, transaction) => sum + Number(transaction.allocation?.principal || 0), 0);
  const originalAmount = Number(loan.amount || loan.principalOutstanding || 0);
  if (principalPaid === 0) return Math.max(0, Number(loan.principalOutstanding || originalAmount || 0));
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
  const completedTransactions = getCompletedTransactions(state.transactions || []);
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
  return getCompletedTransactions(state.transactions || [])
    .filter((transaction) => String(transaction.memberId) === String(memberId))
    .filter((transaction) => !untilDate || String(transaction.transactionDate || "") <= String(untilDate));
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

  const interestStartDate = periodStartDate && toDateOnly(periodStartDate) > loanStartDate
    ? toDateOnly(periodStartDate)
    : loanStartDate;
  const days = group.loanInterestStartMode === "fullMonth" && periodStartDate
    ? 30
    : Math.max(0, Math.ceil((periodEnd - interestStartDate) / (1000 * 60 * 60 * 24)));
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
  return calculateMemberLoanInterestDueDetails(member, state, dueDate, paymentUntilDate, interestFromDate, includeOpeningInterest)
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
  const group = state.groups?.[0] ?? {};
  const completedTransactions = getCompletedTransactions(state.transactions || []);
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
    const paymentCutoff = dueDate < today ? dueDate : today;
    const paymentCutoffIso = toIsoDateValue(paymentCutoff);
    return members.map((member) => {
      const setup = getEffectiveMemberSetup(member, group);
      const transactions = completedTransactions.filter((transaction) =>
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
