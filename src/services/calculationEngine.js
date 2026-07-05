const SAVINGS_TYPES = ["Savings Collection", "Extra Deposit", "Migrated"];
const COLLECTION_TYPES = ["Savings Collection", "Extra Deposit", "Migrated", "Loan Repayment", "Interest Collection", "Penalty Collection", "Other Charge", "Waiver"];
const EXPENSE_TYPES = ["Expense", "Withdrawal"];

export function calculateLoanInterest({ principalOutstanding, originalPrincipal, annualRate, monthlyRate, days, interestType = 'Reducing' }) {
  if (!principalOutstanding || principalOutstanding <= 0) {
    return 0;
  }

  const rate = Number(monthlyRate ?? annualRate ?? 0);
  const monthDays = 30;

  if (interestType === 'Flat') {
    const base = Number(originalPrincipal ?? principalOutstanding);
    return Math.round((base * rate * Number(days || monthDays)) / (monthDays * 100));
  }

  return Math.round((Number(principalOutstanding || 0) * rate * Number(days || monthDays)) / (monthDays * 100));
}

export const interestTypeDescriptions = {
  'Reducing': 'Interest is calculated using the monthly rate on the remaining balance. As you pay back the loan, interest charges decrease.',
  'Flat': 'Interest is calculated using the monthly rate on the original loan amount throughout the loan term.'
};

export function isSavingsTransactionType(transactionType) {
  return SAVINGS_TYPES.includes(transactionType);
}

export function isCollectedTransactionType(transactionType) {
  return COLLECTION_TYPES.includes(transactionType);
}

export function isExpenseTransactionType(transactionType) {
  return EXPENSE_TYPES.includes(transactionType);
}

export function calculateTotalSavings(transactions, members = []) {
  const hasSavingsLedger = transactions.some((transaction) => {
    const savingsMovement = Number(transaction.allocation?.savings ?? 0) + Number(transaction.allocation?.excess ?? 0);
    return savingsMovement !== 0
      || isSavingsTransactionType(transaction.transactionType)
      || transaction.transactionType === "Withdrawal";
  });
  const savingsTotal = transactions
    .reduce((sum, transaction) => {
      const savingsMovement = Number(transaction.allocation?.savings ?? 0) + Number(transaction.allocation?.excess ?? 0);
      if (savingsMovement !== 0) return sum + savingsMovement;
      if (isSavingsTransactionType(transaction.transactionType)) return sum + Number(transaction.amount ?? 0);
      if (transaction.transactionType === "Withdrawal") {
        return sum - Math.abs(Number(transaction.amount || transaction.allocation?.savings || 0));
      }
      return sum;
    }, 0);
  const memberSavingsTotal = members.reduce((sum, member) => sum + Number(member.savings || 0), 0);

  return hasSavingsLedger ? savingsTotal : memberSavingsTotal;
}

export function calculateTotalCollected(transactions) {
  return transactions.reduce((sum, transaction) => {
    const allocation = transaction.allocation ?? {};
    if (transaction.transactionType === "Migrated") {
      return sum + Number(allocation.savings || 0) + Number(allocation.excess || 0);
    }
    const allocationTotal = Number(allocation.savings || 0)
      + Number(allocation.excess || 0)
      + Number(allocation.principal || 0)
      + Number(allocation.interest || 0)
      + Number(allocation.penalty || 0)
      + Number(allocation.charges || 0);
    if (allocationTotal !== 0) {
      return sum + allocationTotal;
    }
    const amount = Number(transaction.amount || 0);
    if (transaction.transactionType === 'Withdrawal' || transaction.transactionType === 'Expense') return sum - amount;
    if (isCollectedTransactionType(transaction.transactionType)) return sum + amount;
    return sum + amount;
  }, 0);
}

export function calculateActiveLoanOutstanding(loans) {
  return loans.reduce((sum, loan) => sum + Number(loan.principalOutstanding || 0), 0);
}

export function calculateTotalInterestCollected(transactions) {
  return transactions.reduce((sum, transaction) =>
    transaction.transactionType === "Migrated" ? sum : sum + Number(transaction.allocation?.interest || 0), 0);
}

export function calculateTotalPenaltyCollected(transactions) {
  return transactions.reduce((sum, transaction) =>
    transaction.transactionType === "Migrated" ? sum : sum + Number(transaction.allocation?.penalty || 0), 0);
}

export function calculateOtherChargesCollected(transactions) {
  return transactions.reduce((sum, transaction) => sum + Number(transaction.allocation?.excess || 0), 0);
}

export function calculateGroupGain(transactions, expenses = 0) {
  const interest = calculateTotalInterestCollected(transactions);
  const penalty = calculateTotalPenaltyCollected(transactions);
  return interest + penalty;
}

export function calculateRemainingBalance(totalCollected, activeLoanOutstanding, expenses = 0) {
  return Number(totalCollected || 0) - Number(activeLoanOutstanding || 0) - Number(expenses || 0);
}

export function calculateMemberShareDistribution(members, payoutPool, referenceDate = new Date()) {
  const activeMembers = (members || []).filter((member) => member.active !== false && member.dateJoined);
  const weights = activeMembers.map((member) => {
    const joined = new Date(member.dateJoined);
    const daysActive = Math.max(1, Math.round((referenceDate - joined) / (1000 * 60 * 60 * 24)));
    const savingAmount = Number(member.savings || 0);
    const weight = savingAmount * Math.max(1, daysActive / 30);
    return {
      memberId: member.id,
      memberName: member.fullName,
      savingAmount,
      daysActive,
      weight
    };
  });
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0) || 1;
  return weights.map((item) => ({
    ...item,
    shareWeight: item.weight,
    shareAmount: Math.round((item.weight / totalWeight) * Number(payoutPool || 0))
  }));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function maxDate(...dates) {
  return dates.filter(Boolean).reduce((latest, date) => (!latest || date > latest ? date : latest), null);
}

function minDate(...dates) {
  return dates.filter(Boolean).reduce((oldest, date) => (!oldest || date < oldest ? date : oldest), null);
}

export function calculatePeriodShareDistribution({ members = [], transactions = [], period, legacyImports = [], referenceDate = new Date() }) {
  if (!period) return [];

  const periodStart = dateOnly(parseDate(period.startDate) ?? referenceDate);
  const periodEnd = dateOnly(parseDate(period.endDate) ?? referenceDate);
  const today = dateOnly(referenceDate);
  const effectivePeriodEnd = periodEnd < today ? periodEnd : today;

  const payoutPool = transactions
    .filter((transaction) => {
      const date = parseDate(transaction.transactionDate);
      return date && date >= periodStart && date <= periodEnd;
    })
    .reduce((sum, transaction) => {
      const allocation = transaction.allocation ?? {};
      return sum + Number(allocation.interest || 0);
    }, 0);

  const legacyExitByMember = legacyImports.reduce((memo, row) => {
    const memberId = row.member_id ?? row.memberId;
    const exitDate = parseDate(row.exit_date ?? row.exitDate);
    if (!memberId || !exitDate) return memo;
    memo[memberId] = maxDate(memo[memberId], exitDate);
    return memo;
  }, {});

  const weights = members.map((member) => {
    const joined = parseDate(member.dateJoined);
    const created = parseDate(member.createdAt);
    const activeFrom = minDate(joined, created) ?? joined ?? created ?? periodStart;
    const inactive = parseDate(member.inactiveDate ?? member.exitDate);
    const legacyExit = legacyExitByMember[member.id];
    const activeUntil = maxDate(inactive, legacyExit) ?? periodEnd;
    const statusInactive = member.status === "Inactive" || Boolean(member.inactiveDate || member.exitDate || legacyExit);
    const finalActiveUntil = statusInactive ? activeUntil : periodEnd;

    const overlapStart = activeFrom > periodStart ? activeFrom : periodStart;
    const overlapEnd = finalActiveUntil < effectivePeriodEnd ? finalActiveUntil : effectivePeriodEnd;
    const activeDays = overlapEnd >= overlapStart
      ? Math.max(1, Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1)
      : 0;
    const savingAmount = Number(member.savings || 0);
    const weight = activeDays > 0 ? savingAmount * activeDays : 0;

    return {
      memberId: member.id,
      memberName: member.fullName,
      savingAmount,
      activeFrom: activeFrom.toISOString().slice(0, 10),
      activeUntil: finalActiveUntil.toISOString().slice(0, 10),
      daysActive: activeDays,
      shareWeight: weight
    };
  });

  const totalWeight = weights.reduce((sum, item) => sum + item.shareWeight, 0);
  return weights.map((item) => ({
    ...item,
    shareAmount: totalWeight > 0 ? Math.round((item.shareWeight / totalWeight) * payoutPool) : 0,
    sharePercent: totalWeight > 0 ? Number(((item.shareWeight / totalWeight) * 100).toFixed(2)) : 0,
    payoutPool
  }));
}

function isActiveMemberOnDate(member, date) {
  const exit = parseDate(member.exitDate ?? member.inactiveDate);
  if (member.active === false) return false;
  if (member.status === "Inactive" && exit && exit < date) return false;
  return !exit || exit >= date;
}

function isEligibleForShareOnDate(member, date) {
  return isActiveMemberOnDate(member, date);
}

function shareMovementAmount(transaction) {
  const allocation = transaction.allocation ?? {};
  if (transaction.transactionType === "Group Expense Share") {
    return Number(allocation.savings ?? transaction.amount ?? 0);
  }
  if (transaction.transactionType === "Withdrawal") {
    return -Math.abs(Number(transaction.amount || 0));
  }
  return Number(allocation.savings || 0) + Number(allocation.excess || 0);
}

function memberShareAtDate(member, transactions, targetDate, { periodStart = null, periodEnd = null } = {}) {
  const target = dateOnly(targetDate);
  const amount = transactions
    .filter((transaction) => String(transaction.memberId) === String(member.id))
    .filter((transaction) => {
      const date = parseDate(transaction.transactionDate);
      if (!date) return false;
      const trxDate = dateOnly(date);
      if (periodStart || periodEnd) {
        const rangeStart = dateOnly(parseDate(periodStart) ?? target);
        const rangeEnd = dateOnly(parseDate(periodEnd) ?? target);
        return trxDate >= rangeStart && trxDate <= rangeEnd;
      }
      return trxDate <= target;
    })
    .reduce((sum, transaction) => sum + shareMovementAmount(transaction), 0);
  return amount !== 0 ? Math.max(0, amount) : Math.max(0, Number(member.savings || 0));
}

function weightedLoanShare({ member, loanDate, interestDate, eligibleBase, transactions }) {
  const start = dateOnly(loanDate);
  const end = dateOnly(interestDate);
  if (end <= start || eligibleBase <= 0) return 0;

  const events = transactions
    .filter((transaction) => String(transaction.memberId) === String(member.id))
    .map((transaction) => ({ date: parseDate(transaction.transactionDate), amount: shareMovementAmount(transaction) }))
    .filter((event) => event.date && dateOnly(event.date) > start && dateOnly(event.date) < end && event.amount < 0)
    .sort((a, b) => a.date - b.date);

  const exit = parseDate(member.exitDate ?? member.inactiveDate);
  if (exit && exit > start && exit < end) {
    events.push({ date: exit, amount: -eligibleBase });
    events.sort((a, b) => a.date - b.date);
  }

  let currentShare = eligibleBase;
  let previous = start;
  let weight = 0;

  events.forEach((event) => {
    const eventDate = dateOnly(event.date);
    const days = Math.max(0, Math.round((eventDate - previous) / (1000 * 60 * 60 * 24)));
    weight += currentShare * days;
    currentShare = Math.max(0, currentShare + event.amount);
    previous = eventDate;
  });

  const finalDays = Math.max(1, Math.round((end - previous) / (1000 * 60 * 60 * 24)));
  weight += currentShare * finalDays;
  return weight;
}

function allocatePoolByWeights(rows, amount) {
  const normalizedAmount = Math.round(Number(amount || 0));

  if (!rows.length) return [];

  const baseShare = Math.floor(normalizedAmount / rows.length);
  const remainder = normalizedAmount % rows.length;

  return rows.map((row, index) => ({
    ...row,
    shareAmount: baseShare + (index < remainder ? 1 : 0),
    sharePercent: Number((100 / rows.length).toFixed(2))
  }));
}

function activeMembersOn(members, date) {
  return members.filter((member) => isEligibleForShareOnDate(member, date));
}

function transactionsForShareDistribution(transactions = []) {
  const allTransactions = Array.isArray(transactions) ? transactions : [];
  const reversedParentIds = new Set(
    allTransactions
      .filter((transaction) => String(transaction.parentTransactionId || "").trim())
      .filter((transaction) => String(transaction.reversedFlag || "").toUpperCase() === "Y" || String(transaction.transactionNumber || "").startsWith("REV"))
      .map((transaction) => String(transaction.parentTransactionId))
  );

  return allTransactions.filter((transaction) => {
    if (String(transaction.reversedFlag || "").toUpperCase() === "Y") return false;
    if (reversedParentIds.has(String(transaction.id))) return false;
    return true;
  });
}

export function calculateEventBasedShareDistribution({ members = [], transactions = [], loans = [], period, referenceDate = new Date() }) {
  if (!period) return [];

  const periodStart = dateOnly(parseDate(period.startDate) ?? referenceDate);
  const periodEnd = dateOnly(parseDate(period.endDate) ?? referenceDate);
  const completedTransactions = transactions.filter((transaction) => {
    const status = String(transaction.approvalStatus ?? transaction.approval_status ?? "").toUpperCase();
    return ["COMPLETED", "APPROVED"].includes(status);
  });
  const effectiveTransactions = transactionsForShareDistribution(completedTransactions);

  console.log(`[ShareDistribution] Period: ${period.name} (${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`);
  console.log(`[ShareDistribution] Input transactions: ${transactions.length}, Completed: ${completedTransactions.length}, Effective: ${effectiveTransactions.length}`);
  
  const relevantTransactions = effectiveTransactions.filter((transaction) => {
    const date = parseDate(transaction.transactionDate);
    return date && dateOnly(date) >= periodStart && dateOnly(date) <= periodEnd;
  });
  console.log(`[ShareDistribution] Transactions in period: ${relevantTransactions.length}`);
  relevantTransactions.forEach(t => {
    console.log(`  - ${t.transactionType}: ${t.amount}, allocation.interest: ${t.allocation?.interest}, date: ${t.transactionDate}`);
  });

  const resultByMember = Object.fromEntries(members.map((member) => [member.id, {
    memberId: member.id,
    memberName: member.fullName,
    savingAmount: Number(member.savings || 0),
    daysActive: 0,
    shareWeight: 0,
    shareAmount: 0,
    sharePercent: 0,
    payoutPool: 0,
    interestShare: 0,
    equalShare: 0
  }]));

  effectiveTransactions
    .filter((transaction) => {
      const date = parseDate(transaction.transactionDate);
      return date && dateOnly(date) >= periodStart && dateOnly(date) <= periodEnd;
    })
    .forEach((transaction) => {
      const trxDate = dateOnly(parseDate(transaction.transactionDate));
      const isMigratedOpening = transaction.transactionType === "Migrated";
      // For Interest Collection type, if allocation.interest is 0, use the full amount
      let interestAmount = isMigratedOpening ? 0 : Number(transaction.allocation?.interest || 0);
      if (!isMigratedOpening && transaction.transactionType === "Interest Collection" && interestAmount === 0) {
        interestAmount = Number(transaction.amount || 0);
      }
      let equalPool = isMigratedOpening ? 0 : Number(transaction.allocation?.penalty || 0) + Number(transaction.allocation?.excess || 0);
      // For Penalty Collection type, if allocation.penalty is 0, use the full amount
      if (!isMigratedOpening && transaction.transactionType === "Penalty Collection" && equalPool === 0) {
        equalPool = Number(transaction.amount || 0);
      }

      if (interestAmount > 0) {
        console.log(`[ShareDistribution] Processing interest ${interestAmount} from borrower ${transaction.memberId}`);
        const borrowerLoans = loans
          .filter((loan) => String(loan.memberId) === String(transaction.memberId))
          .filter((loan) => parseDate(loan.startDate ?? loan.distributionDate) && dateOnly(parseDate(loan.startDate ?? loan.distributionDate)) <= trxDate)
          .sort((a, b) => parseDate(a.startDate ?? a.distributionDate) - parseDate(b.startDate ?? b.distributionDate));
        console.log(`[ShareDistribution]   Total loans for borrower ${transaction.memberId}: ${loans.filter((loan) => String(loan.memberId) === String(transaction.memberId)).length}, Filtered: ${borrowerLoans.length}`);
        const loan = borrowerLoans[0];
        console.log(`[ShareDistribution]   Transaction date: ${trxDate.toISOString().split('T')[0]}, Has loan: ${!!loan}`);
        const eligibleMembers = members.filter((member) => isEligibleForShareOnDate(member, trxDate));
        console.log(`[ShareDistribution]   All members: ${members.length}, Eligible for share on date: ${eligibleMembers.length}`);
        if (eligibleMembers.length === 0) {
          console.log(`[ShareDistribution]   WARNING: No eligible members found. All members on ${loanDate.toISOString().split('T')[0]}:`);
          members.forEach(m => {
            const joined = parseDate(m.dateJoined ?? m.joinDate ?? m.createdAt);
            const exit = parseDate(m.exitDate ?? m.inactiveDate);
            console.log(`     - ${m.fullName}: status=${m.status}, joined=${joined?.toISOString().split('T')[0]}, exit=${exit?.toISOString().split('T')[0]}`);
          });
        }
        const weightedRows = eligibleMembers.map((member) => {
          console.log(`[ShareDistribution]     Member ${member.fullName}: sharing equally`);
          return {
            member,
            memberId: member.id,
            memberName: member.fullName,
            savingAmount: Number(member.savings || 0),
            daysActive: 1,
            shareWeight: 1
          };
        });

        console.log(`[ShareDistribution]   Members with weight > 0: ${weightedRows.length}`);

        allocatePoolByWeights(weightedRows, interestAmount).forEach((row) => {
          if (!resultByMember[row.memberId]) return;
          console.log(`[ShareDistribution]   Allocated ${row.shareAmount} to ${row.memberName}`);
          resultByMember[row.memberId].shareAmount += row.shareAmount;
          resultByMember[row.memberId].interestShare += row.shareAmount;
          resultByMember[row.memberId].shareWeight += row.shareWeight;
          resultByMember[row.memberId].daysActive = Math.max(resultByMember[row.memberId].daysActive, row.daysActive);
          resultByMember[row.memberId].payoutPool += interestAmount;
        });
      }

      if (equalPool > 0) {
        const weightedRows = activeMembersOn(members, trxDate)
          .map((member) => ({
            member,
            memberId: member.id,
            memberName: member.fullName,
            savingAmount: memberShareAtDate(member, completedTransactions, trxDate),
            daysActive: 1,
            shareWeight: 1
          }))
          .filter((row) => row.shareWeight > 0);
        allocatePoolByWeights(weightedRows, equalPool).forEach((row) => {
          const member = row.member;
          if (!resultByMember[member.id]) return;
          resultByMember[member.id].shareAmount += row.shareAmount;
          resultByMember[member.id].equalShare += row.shareAmount;
          resultByMember[member.id].shareWeight += row.shareWeight;
          resultByMember[member.id].payoutPool += equalPool;
        });
      }
    });

  const totalShare = Object.values(resultByMember).reduce((sum, row) => sum + row.shareAmount, 0);
  return Object.values(resultByMember).map((row) => ({
    ...row,
    sharePercent: totalShare > 0 ? Number(((row.shareAmount / totalShare) * 100).toFixed(2)) : 0
  }));
}

export function allocateIncomingPayment({ amount, dueSavings, principalOutstanding, interestOutstanding, penaltyOutstanding }) {
  let remaining = amount;
  const allocation = {
    savings: 0,
    interest: 0,
    penalty: 0,
    principal: 0,
    excess: 0
  };

  // Priority order: savings -> interest -> penalty -> principal -> excess
  const buckets = [
    ["savings", dueSavings],
    ["interest", interestOutstanding],
    ["penalty", penaltyOutstanding],
    ["principal", principalOutstanding]
  ];

  for (const [bucket, due] of buckets) {
    const value = Math.min(Math.max(due, 0), remaining);
    allocation[bucket] = value;
    remaining -= value;
  }

  allocation.excess = remaining;
  return allocation;
}

export function calculateLoanEligibility({ totalSavings, multiplier, activeLoanCount, maxActiveLoans, repaymentScore }) {
  if (activeLoanCount >= maxActiveLoans) {
    return { eligible: false, limit: 0, reason: "Active loan limit reached." };
  }

  if (repaymentScore < 60) {
    return { eligible: false, limit: 0, reason: "Repayment score is below group policy." };
  }

  return {
    eligible: true,
    limit: totalSavings * multiplier,
    reason: "Eligible under current savings and repayment rules."
  };
}

export function calculateMemberShare({ memberContribution, totalContribution, distributableInterest }) {
  if (!totalContribution || totalContribution <= 0) {
    return 0;
  }

  return Math.round((memberContribution / totalContribution) * distributableInterest);
}
