/**
 * State utility functions extracted from App.jsx
 * These help with complex state transformations
 */

import { roles } from './permissions.js';
import {
  calculateMemberLedgerSummary,
  getCompletedTransactions,
  getCurrentMember,
  getDashboardPeriod,
  getEffectiveCompletedTransactions,
  isCompletedFinancialStatus,
  isOutstandingLoan,
  loanBelongsToMember,
  toIsoDateValue
} from './financeFields.js';
import { calculateEventBasedShareDistribution } from './calculationEngine.js';
import { makeId } from './storage.js';
import { repository } from './repository.js';

export function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out. Please check your internet connection and try again.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

/**
 * Recalculates member savings based on effective ledger
 */
export function recalculateMemberSavingsFromEffectiveLedger(tenantData) {
  if (!tenantData || !tenantData.members || !tenantData.transactions) {
    return tenantData;
  }

  const correctedMembers = tenantData.members.map((member) => {
    const ledgerSummary = calculateMemberLedgerSummary(member, tenantData);
    return {
      ...member,
      savings: ledgerSummary.savings
    };
  });

  return {
    ...tenantData,
    members: correctedMembers
  };
}

/**
 * Get selected group from state
 */
export function getSelectedGroup(state, selectedGroupId) {
  return state.groups.find((g) => String(g.id) === String(selectedGroupId)) ?? state.groups[0];
}

/**
 * Get current member from state
 */
export function getSelectedGroupMember(state, selectedGroup, actor) {
  if (!selectedGroup) return null;
  return (state.members || []).find((member) =>
    String(member.groupId) === String(selectedGroup?.id)
    && (
      String(member.id) === String(actor?.memberId)
      || (member.email && actor?.email && member.email.toLowerCase() === actor.email.toLowerCase())
    )
  );
}

/**
 * Apply share distribution to members
 */
export function applyShareDistributionToMembers(members, shareRows) {
  const shareMap = Object.fromEntries((shareRows || []).map((row) => [String(row.member_id ?? row.memberId ?? ""), row]));
  return members.map((member) => {
    const share = shareMap[String(member.id)];
    const shareAmount = Number(share?.share_amount ?? share?.shareAmount ?? 0);
    const sharePercent = Number(share?.share_percent ?? share?.sharePercent ?? 0);
    const earnedFromGroup = Number(member.earnedFromGroup ?? member.groupGain ?? member.shares ?? 0) + shareAmount;
    const savingsHeld = Number(member.savings || 0);
    return {
      ...member,
      earnedFromGroup,
      shares: savingsHeld + earnedFromGroup,
      shareAmount,
      sharePercent,
      shareActiveDays: share?.daysActive ?? 0
    };
  });
}

/**
 * Get share periods for state
 */
export function getSharePeriodsForState(state, { startDate = null, endDate = null } = {}) {
  const periods = (state.periods || []).filter((period) => period?.startDate && period?.endDate);
  const transactionPeriods = getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || []))
    .map((transaction) => transaction.transactionDate)
    .filter(Boolean)
    .map((transactionDate) => ({
      startDate: toIsoDateValue(new Date(transactionDate)),
      endDate: toIsoDateValue(new Date(transactionDate))
    }));

  if (!startDate && !endDate) {
    if (periods.length > 0) {
      return periods;
    }

    const uniquePeriods = transactionPeriods.filter((period, index, all) => all.findIndex((candidate) =>
      String(candidate.startDate) === String(period.startDate)
      && String(candidate.endDate) === String(period.endDate)
    ) === index);
    const fallbackPeriod = getDashboardPeriod(state);
    return uniquePeriods.length > 0 ? uniquePeriods : (fallbackPeriod ? [fallbackPeriod] : []);
  }

  const candidatePeriods = periods.filter((period) => {
    const periodStart = new Date(period.startDate);
    const periodEnd = new Date(period.endDate);
    const rangeStart = startDate ? new Date(startDate) : null;
    const rangeEnd = endDate ? new Date(endDate) : null;
    const overlapsStart = !rangeStart || periodEnd >= rangeStart;
    const overlapsEnd = !rangeEnd || periodStart <= rangeEnd;
    return overlapsStart && overlapsEnd;
  });

  if (candidatePeriods.length > 0) return candidatePeriods;
  return [{
    startDate: startDate,
    endDate: endDate
  }].filter(Boolean);
}

/**
 * Get accumulated share by member
 */
export function getAccumulatedShareByMember(state, { startDate = null, endDate = null } = {}) {
  const accumulatedShareByMember = Object.fromEntries((state.members || []).map((member) => [String(member.id), 0]));

  if (!startDate && !endDate) {
    const snapshotRows = state?.rpcShareDistributionSnapshots && Object.keys(state.rpcShareDistributionSnapshots).length > 0
      ? Object.values(state.rpcShareDistributionSnapshots)
      : (Array.isArray(state.rpcShareDistribution) ? state.rpcShareDistribution : []);

    if (snapshotRows.length > 0) {
      snapshotRows.forEach((row) => {
        const memberId = String(row.member_id ?? row.memberId ?? "");
        accumulatedShareByMember[memberId] = Number(accumulatedShareByMember[memberId] || 0) + Number(row.share_amount ?? row.shareAmount ?? 0);
      });
      return accumulatedShareByMember;
    }
  }

  const rangeRows = Array.isArray(state?.rpcShareDistributionRange) ? state.rpcShareDistributionRange : [];
  if (startDate && endDate && rangeRows.length > 0) {
    rangeRows.forEach((row) => {
      const memberId = String(row.member_id ?? row.memberId ?? "");
      accumulatedShareByMember[memberId] = Number(accumulatedShareByMember[memberId] || 0) + Number(row.share_amount ?? row.shareAmount ?? 0);
    });
    return accumulatedShareByMember;
  }

  const completedTrx = getEffectiveCompletedTransactions(getCompletedTransactions(state.transactions || []));
  const rangeStart = startDate || toIsoDateValue();
  const rangeEnd = endDate || toIsoDateValue();
  const rangeTransactions = completedTrx.filter((transaction) => {
    const transactionDate = toIsoDateValue(new Date(transaction.transactionDate));
    return transactionDate >= rangeStart && transactionDate <= rangeEnd;
  });

  if (rangeTransactions.length === 0) {
    return accumulatedShareByMember;
  }

  const shareRows = calculateEventBasedShareDistribution({
    members: state.members || [],
    transactions: rangeTransactions,
    loans: (state.loans || []).filter((loan) =>
      isCompletedFinancialStatus(loan.approvalStatus)
      || ["ACTIVE", "COMPLETED", "APPROVED", "CLOSED"].includes(String(loan.status ?? loan.loanStatus ?? "").toUpperCase())
    ),
    period: {
      name: `${rangeStart} to ${rangeEnd}`,
      startDate: rangeStart,
      endDate: rangeEnd
    }
  });

  shareRows.forEach((row) => {
    const memberId = String(row.memberId);
    accumulatedShareByMember[memberId] = Number(accumulatedShareByMember[memberId] || 0) + Number(row.shareAmount || 0);
  });

  return accumulatedShareByMember;
}

/**
 * Get state with computed shares
 */
export function getStateWithComputedShares(state) {
  const hasRpcShareDistributionSnapshot = !!state?.rpcShareDistributionSnapshots && Object.keys(state.rpcShareDistributionSnapshots).length > 0;
  const hasRpcShareDistribution = Array.isArray(state.rpcShareDistribution) && state.rpcShareDistribution.length > 0;
  const shareRowsByMemberId = hasRpcShareDistributionSnapshot
    ? Object.fromEntries(Object.values(state.rpcShareDistributionSnapshots).map((row) => [String(row.member_id ?? row.memberId ?? ""), row]))
    : (hasRpcShareDistribution
      ? Object.fromEntries(state.rpcShareDistribution.map((row) => [String(row.member_id ?? row.memberId ?? ""), row]))
      : {});

  const stateWithGain = {
    ...state,
    members: (state.members || []).map((member) => {
      const memberId = String(member.id);
      const rpcShare = shareRowsByMemberId[memberId];
      const shareAmount = rpcShare
        ? Number(rpcShare.share_amount ?? rpcShare.shareAmount ?? 0)
        : Number(getAccumulatedShareByMember(state)[memberId] || 0);
      return {
        ...member,
        earnedFromGroup: shareAmount,
        groupGain: shareAmount
      };
    })
  };

  if (hasRpcShareDistributionSnapshot || hasRpcShareDistribution) {
    return {
      ...stateWithGain,
      members: (stateWithGain.members || []).map((member) => {
        const memberId = String(member.id);
        const rpcShare = shareRowsByMemberId[memberId];
        const shareAmount = Number(rpcShare?.share_amount ?? rpcShare?.shareAmount ?? 0);
        const sharePercent = Number(rpcShare?.share_percent ?? rpcShare?.sharePercent ?? 0);
        return {
          ...member,
          shareAmount,
          sharePercent,
          earnedFromGroup: shareAmount,
          groupGain: shareAmount
        };
      })
    };
  }

  const summaries = (stateWithGain.members || []).map((member) => [member.id, calculateMemberLedgerSummary(member, stateWithGain)]);
  const totalShareAmount = summaries.reduce((sum, [, summary]) => sum + Math.max(0, summary.shareAmount), 0);
  const summaryByMember = Object.fromEntries(summaries);
  return {
    ...stateWithGain,
    members: (stateWithGain.members || []).map((member) => ({
      ...member,
      shareAmount: summaryByMember[member.id]?.shareAmount ?? 0,
      sharePercent: totalShareAmount > 0
        ? Number(((Math.max(0, summaryByMember[member.id]?.shareAmount ?? 0) / totalShareAmount) * 100).toFixed(2))
        : 0
    }))
  };
}

/**
 * Get visible notifications based on role
 */
export function getVisibleNotifications(notifications = [], role, member) {
  if (role !== roles.MEMBER) return notifications;
  return notifications.filter((notification) => {
    const isRecipientListMatch = Array.isArray(notification.recipientMemberIds) && notification.recipientMemberIds.length > 0
      ? notification.recipientMemberIds.map(String).includes(String(member?.id))
      : true;
    const isMemberIdMatch = !notification.memberId || String(notification.memberId) === String(member?.id);
    return isRecipientListMatch && isMemberIdMatch;
  });
}

/**
 * Check if actor is group admin
 */
export function isGroupAdminActor(state, actor) {
  if ([roles.SUPER_ADMIN, roles.PRODUCT_OWNER, roles.GROUP_ADMIN].includes(actor?.role)) return true;
  const member = getCurrentMember(state, actor);
  return member?.memberRole === roles.GROUP_ADMIN;
}

/**
 * Add group notification
 */
export function addGroupNotification(state, { title, body, type = "info" }) {
  const recipientMemberIds = (state.members || [])
    .filter((member) => String(member.groupId) === String(state.groups?.[0]?.id) || !member.groupId)
    .map((member) => member.id);
  return {
    ...state,
    notifications: [
      {
        id: makeId("ntf"),
        groupId: state.groups?.[0]?.id,
        title,
        body,
        type,
        recipientMemberIds,
        createdAt: new Date().toISOString()
      },
      ...(state.notifications || [])
    ]
  };
}

/**
 * Make withdrawal transaction
 */
export function makeWithdrawalTransaction(request) {
  return {
    id: makeId("trx"),
    groupId: request.groupId,
    memberId: request.memberId,
    transactionNumber: request.requestNumber ?? makeId("WDR"),
    transactionDate: request.requestDate ?? toIsoDateValue(),
    transactionType: "Withdrawal",
    amount: Math.abs(Number(request.amount || 0)),
    approvalStatus: "Completed",
    remarks: request.reason || "Withdrawal",
    allocation: { savings: -Math.abs(Number(request.amount || 0)), excess: 0 },
    withdrawalRequestId: request.id
  };
}

/**
 * Sync member savings corrections to Supabase
 * Recalculates member savings from ledger and updates if there are discrepancies
 */
export async function syncMemberSavingsCorrectionsToSupabase(tenantData) {
  if (!tenantData || !tenantData.members || !tenantData.transactions || !repository.isConfigured()) {
    return;
  }

  try {
    const membersToUpdate = [];
    
    const reversals = tenantData.transactions.filter((t) => t.reversedFlag === "Y" || String(t.transactionNumber || "").startsWith("REV"));
    
    const ajinkya = tenantData.members.find(m => m.fullName === "Ajinkya More");
    if (ajinkya) {
      const ajinkyaTransactions = tenantData.transactions.filter(t => String(t.memberId) === String(ajinkya.id));
      const ajinkyaReversals = ajinkyaTransactions.filter((t) => t.reversedFlag === "Y" || String(t.transactionNumber || "").startsWith("REV"));
      const ajinkyaParentIds = new Set(ajinkyaReversals.map((r) => r.parentTransactionId).filter((id) => id));
      const ajinkyaParents = ajinkyaTransactions.filter((t) => ajinkyaParentIds.has(t.id));
      const ledgerSummary = calculateMemberLedgerSummary(ajinkya, tenantData);
    }

    for (const member of tenantData.members) {
      const memberTransactions = tenantData.transactions.filter((t) => String(t.memberId) === String(member.id));
      const memberReversals = memberTransactions.filter((t) => t.reversedFlag === "Y" || String(t.transactionNumber || "").startsWith("REV"));
      
      const ledgerSummary = calculateMemberLedgerSummary(member, tenantData);
      const calculatedSavings = ledgerSummary.savings;
      const storedSavings = Number(member.savings || 0);
      
      const diff = calculatedSavings - storedSavings;
      if (Math.abs(diff) > 0.01) {
        membersToUpdate.push({
          memberId: member.id,
          correctedSavings: calculatedSavings,
          memberName: member.fullName
        });
      }
    }

    if (membersToUpdate.length > 0) {
      for (const update of membersToUpdate) {
        try {
          await repository.updateMember(update.memberId, {
            savings: update.correctedSavings
          });
        } catch (err) {
          console.error(`Failed to sync savings for member ${update.memberId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("Failed to sync member savings corrections:", err);
  }
}

export function isUuid(value) {
  return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function getHiddenGroupIds(actor) {
  const storageKey = `bachat-hidden-groups-${actor?.id || actor?.email || "local"}`;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.from(new Set([...(actor?.hiddenGroupIds || []), ...(Array.isArray(saved) ? saved : [])].map(String)));
  } catch {
    return (actor?.hiddenGroupIds || []).map(String);
  }
}

export function saveHiddenGroupIds(actor, ids) {
  const storageKey = `bachat-hidden-groups-${actor?.id || actor?.email || "local"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Hiding groups is a convenience preference; the app can continue without storage.
  }
}

