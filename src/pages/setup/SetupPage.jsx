import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  CalendarCheck,
  Calculator,
  CheckCircle2,
  IndianRupee,
  Settings,
  SlidersHorizontal,
  Users,
  WalletCards
} from "lucide-react";
import { Page, Section, FormCard, Field, SelectField, MetricGrid, Table } from "../../components";
import { canPostTransaction, getCurrentMonthPeriod, getOpenPeriod, openPeriod, periodStatuses } from "../../services/periodControl";
import { roles, visibleMenu } from "../../services/permissions";
import { repository } from "../../services/repository";
import { audit, makeId } from "../../services/storage";
import {
  groupSchema,
  legacyMigrationSchema,
  memberSchema,
  validate
} from "../../services/validation";
import {
  buildOpeningShareRatioRows,
  calculateDerivedOpeningSurplus,
  isOutstandingLoan,
  loanBelongsToMember,
  toIsoDateValue
} from "../../services/financeFields";
import { isPendingFinancialStatus, isWithinPastDays } from "../../services/historyUtils";
import { interestTypeDescriptions } from "../../services/calculationEngine";
import { addGroupNotification } from "../../services/stateHelpers";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function serializeError(err) {
  try {
    if (!err) return "";
    if (typeof err === "string") return err;
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
  } catch (e) {
    return String(err);
  }
}

function getMonthPeriodDraft(year, month) {
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0);
  return {
    id: `per_${year}_${String(month).padStart(2, "0")}`,
    name: start.toLocaleString("default", { month: "long", year: "numeric" }),
    startDate: toIsoDateValue(start),
    endDate: toIsoDateValue(end),
    status: periodStatuses.FUTURE
  };
}

function formatPeriodName(dateValue) {
  if (!dateValue) return "";
  const [year, month] = String(dateValue).slice(0, 10).split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

function normalizeLookup(value) {
  return String(value ?? "").trim().toLowerCase();
}

function memberMatchesLookup(member, value) {
  const needle = normalizeLookup(value);
  if (!needle) return false;
  return [member?.id, member?.fullName, member?.username, member?.email]
    .some((candidate) => normalizeLookup(candidate) === needle);
}

function normalizeMemberNames(names = [], members = []) {
  return [...new Set((names || []).map((name) => {
    const matched = (members || []).find((member) => memberMatchesLookup(member, name));
    return matched?.fullName ?? name;
  }))].filter(Boolean);
}

function isMemberActive(member) {
  if (!member) return false;
  if (String(member.status ?? "").toLowerCase() === "inactive") return false;
  if (member.inactiveDate && String(member.inactiveDate) <= toIsoDateValue()) return false;
  if (member.exitDate && String(member.exitDate) <= toIsoDateValue()) return false;
  return true;
}

function activeMembersForTransactions(members = []) {
  return (members || []).filter(isMemberActive);
}

function isMemberNamedAdmin(member, adminNames = []) {
  const names = new Set((adminNames || []).map(normalizeLookup));
  return member?.memberRole === roles.GROUP_ADMIN
    || member?.role === roles.GROUP_ADMIN
    || names.has(normalizeLookup(member?.fullName))
    || names.has(normalizeLookup(member?.username))
    || names.has(normalizeLookup(member?.email));
}

function isMemberConfigured(member, configuredNames = []) {
  return (configuredNames || []).some((name) => memberMatchesLookup(member, name));
}

function hasActiveAdminMember(members = [], adminNames = []) {
  return members.some((member) => isMemberActive(member) && isMemberNamedAdmin(member, adminNames));
}

function getGroupAdminMembers(state) {
  const group = state.groups?.[0] ?? {};
  const adminNames = [...(group.admins || [])].filter(Boolean);
  return (state.members || []).filter((member) => isMemberActive(member) && isMemberNamedAdmin(member, adminNames));
}

function loanApprovalRequired(state, requester) {
  const configuredApprovers = getConfiguredApprovalRecipients(state);
  if (configuredApprovers.length > 0) return true;

  const adminMembers = getGroupAdminMembers(state);
  const requesterIsAdmin = isMemberNamedAdmin(requester, [...(state.groups?.[0]?.admins || [])].filter(Boolean));
  if (requesterIsAdmin) {
    return adminMembers.some((member) => String(member.id) !== String(requester?.id));
  }
  return adminMembers.length > 0;
}

function getApprovalRecipients(state) {
  const group = state.groups?.[0] ?? {};
  const names = new Set([...(group.admins || []), ...(group.approvers || [])].filter(Boolean));
  (state.members || []).forEach((member) => {
    if (member.memberRole === roles.GROUP_ADMIN || member.role === roles.GROUP_ADMIN) {
      names.add(member.fullName);
    }
  });
  return [...names].map((name) => {
    const member = (state.members || []).find((item) => memberMatchesLookup(item, name));
    return {
      id: member?.id ?? name,
      name,
      role: member?.memberRole ?? member?.role ?? "Approver"
    };
  });
}

function getConfiguredApprovalRecipients(state) {
  const group = state.groups?.[0] ?? {};
  const names = new Set([...(group.approvers || [])].filter(Boolean));
  return [...names].map((name) => {
    const member = (state.members || []).find((item) => memberMatchesLookup(item, name));
    return {
      id: member?.id ?? name,
      name,
      role: member?.memberRole ?? member?.role ?? "Approver"
    };
  });
}

function getLatestPendingGroupChange(state, groupId) {
  return (state.pendingSetupChanges || [])
    .filter((change) => String(change.groupId) === String(groupId) && change.setupType === "group" && String(change.status).toLowerCase() === "pending")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

function createApprovalRecords({ state, action, requester, amount, referenceId, referenceType, details = "" }) {
  const recipients = getApprovalRecipients(state);
  const batchId = makeId("aprb");
  return recipients.map((recipient, index) => ({
    id: makeId("apr"),
    batchId,
    groupId: state.groups?.[0]?.id,
    referenceId,
    referenceType,
    action,
    requester,
    approverId: recipient.id,
    approverName: recipient.name,
    level: `Level ${index + 1}`,
    status: "Pending",
    amount,
    details
  }));
}

function createConfiguredApprovalRecords({ state, action, requester, amount, referenceId, referenceType, details = "" }) {
  const recipients = getConfiguredApprovalRecipients(state);
  const batchId = makeId("aprb");
  return recipients.map((recipient, index) => ({
    id: makeId("apr"),
    batchId,
    groupId: state.groups?.[0]?.id,
    referenceId,
    referenceType,
    action,
    requester,
    approverId: recipient.id,
    approverName: recipient.name,
    level: `Level ${index + 1}`,
    status: "Pending",
    amount,
    details
  }));
}

function getSetupChangeTypeLabel(type) {
  if (type === "group") return "Group";
  if (type === "member") return "Member";
  return "Setup";
}

function metric(label, value, Icon, details = []) {
  return { label, value, Icon, details };
}

function statusWithPendingApprover(item, approvals = [], explicitReferenceType = null) {
  const pendingApprovals = (approvals || []).filter((approval) => {
    if (approval.referenceId !== undefined && item?.id !== undefined && String(approval.referenceId) !== String(item.id)) {
      return false;
    }
    const referenceType = approval.referenceType ?? "default";
    if (explicitReferenceType && referenceType !== explicitReferenceType) return false;
    if (item?.approvalStatus && String(item.approvalStatus).toUpperCase() === "PENDING") return true;
    return approval.status === "Pending";
  });
  if (pendingApprovals.some((approval) => approval.status === "Pending")) return "Pending";
  if (item?.approvalStatus && String(item.approvalStatus).toUpperCase() === "PENDING") return "Pending";
  return item?.approvalStatus ?? item?.status ?? "Completed";
}

function describeChanges(before = {}, after = {}, labels = {}) {
  const changes = [];
  Object.entries(after || {}).forEach(([key, value]) => {
    const beforeValue = before?.[key];
    if (JSON.stringify(beforeValue) === JSON.stringify(value)) return;
    const label = labels[key] || key;
    changes.push(`${label}: ${JSON.stringify(beforeValue)} → ${JSON.stringify(value)}`);
  });
  return changes.join("; ");
}

export default function SetupPage({ state, setState, actor, selectedGroup, initialSetupTab = "group", initialFinancialTab = "roles", setConfirmDialog, setNotification, migrationLoading, setMigrationLoading, ensureLatestTenantData }) {
  useEffect(() => { ensureLatestTenantData(); }, [ensureLatestTenantData]);
  const cloudConfigured = repository.isConfigured();
  const setupLocation = useLocation();
  const group = selectedGroup ?? state.groups[0];
  const blankIfUnset = (value) => value === null || value === undefined ? "" : value;
  const optionalNumber = (value) => value === "" || value === null || value === undefined ? null : Number(value);
  const [activeSetupTab, setActiveSetupTab] = useState(initialSetupTab);
  const [financialTab, setFinancialTab] = useState(initialFinancialTab);
  const now = new Date();
  const [periodPicker, setPeriodPicker] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  function buildGroupValues(group, members) {
    return {
      interestType: group?.interestType ?? "Reducing",
      interestRate: blankIfUnset(group?.interestRate),
      monthlySaving: blankIfUnset(group?.monthlySaving),
      maximumLoanLimit: blankIfUnset(group?.maximumLoanLimit),
      penaltyAmount: blankIfUnset(group?.penaltyAfterDueDateAmount ?? group?.penaltyAmount),
      loanInterestStartMode: group?.loanInterestStartMode ?? "disbursement",
      loanTenureMonths: blankIfUnset(group?.loanTenureMonths),
      loanDueDay: group?.loanDueDay ?? 1,
      approvers: normalizeMemberNames(group?.approvers ?? [], members),
      admins: normalizeMemberNames(group?.admins ?? (group?.admins ? group.admins : members.filter((member) => member.memberRole === roles.GROUP_ADMIN || member.role === roles.GROUP_ADMIN).map((member) => member.fullName)), members)
    };
  }

  const [groupValues, setGroupValues] = useState(buildGroupValues(group, state.members));
  const [selectedMemberId, setSelectedMemberId] = useState(state.members[0]?.id ?? "");
  const selectedMember = state.members.find((member) => String(member.id) === String(selectedMemberId));
  const [memberSetupValues, setMemberSetupValues] = useState({
    fullName: selectedMember?.fullName ?? "",
    email: selectedMember?.email ?? "",
    mobile: selectedMember?.mobile ?? "",
    username: selectedMember?.username ?? "",
    aadhaar: selectedMember?.aadhaar ?? "",
    pan: selectedMember?.pan ?? "",
    address: selectedMember?.address ?? "",
    interestRate: blankIfUnset(selectedMember?.interestRate),
    interestType: selectedMember?.interestType || group?.interestType || "Reducing",
    maximumLoanLimit: blankIfUnset(selectedMember?.maximumLoanLimit ?? selectedMember?.loanLimit),
    monthlySaving: blankIfUnset(selectedMember?.monthlySaving ?? selectedMember?.customSavingAmount),
    loanTenureMonths: blankIfUnset(selectedMember?.loanTenureMonths),
    status: selectedMember?.inactiveDate && selectedMember.inactiveDate <= toIsoDateValue() ? "Inactive" : selectedMember?.status ?? "Active",
    inactiveDate: selectedMember?.inactiveDate ?? ""
  });
  const [legacyErrors, setLegacyErrors] = useState({});
  const [legacyGroupMigration, setLegacyGroupMigration] = useState({ migrationDate: toIsoDateValue(), openingBankBalance: "", openingGroupGain: "", remarks: "" });
  const [legacyExpenseLines, setLegacyExpenseLines] = useState([{ category: "Opening expense", amount: "", remarks: "" }]);
  const [savingSetup, setSavingSetup] = useState(false);
  const legacyExpenseTotal = legacyExpenseLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const isLegacyGroupExpense = false;
  const [shareCalculator, setShareCalculator] = useState({
    remainingMoney: "",
    outstandingLoan: "",
    perMemberSaving: "",
    numberOfMembers: state.members?.length ? String(state.members.length) : "",
    totalMonths: "",
    groupStartDate: "",
    groupLastDate: ""
  });
  const [shareCalculatorCalculated, setShareCalculatorCalculated] = useState(false);
  const numberOrZero = (value) => Number(value || 0);
  const calculateInclusiveMonths = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    return Math.max(0, ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1);
  };
  const memberCountForShare = Math.max(0, Math.floor(Number(shareCalculator.numberOfMembers || 0)));
  const shareTotalGroupValue = numberOrZero(shareCalculator.remainingMoney) + numberOrZero(shareCalculator.outstandingLoan);
  const calculatorMonths = Math.max(0, Number(shareCalculator.totalMonths || 0) || calculateInclusiveMonths(shareCalculator.groupStartDate, shareCalculator.groupLastDate));
  const expectedMemberSaving = numberOrZero(shareCalculator.perMemberSaving) * calculatorMonths;
  const expectedTotalSavings = memberCountForShare * numberOrZero(shareCalculator.perMemberSaving) * calculatorMonths;
  const estimatedGroupGain = shareTotalGroupValue - expectedTotalSavings;
  const estimatedPerMemberGain = memberCountForShare > 0 ? estimatedGroupGain / memberCountForShare : 0;
  const estimatedPerMemberShare = expectedMemberSaving + estimatedPerMemberGain;

  function updateLegacyExpenseLine(index, key, value) {
    setLegacyExpenseLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  }

  function addLegacyExpenseLine() {
    setLegacyExpenseLines((current) => [...current, { category: "Opening expense", amount: "", remarks: "" }]);
  }

  function removeLegacyExpenseLine(index) {
    setLegacyExpenseLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index));
  }

  useEffect(() => {
    setActiveSetupTab(initialSetupTab);
    setFinancialTab(initialFinancialTab);
  }, [initialSetupTab, initialFinancialTab]);

  useEffect(() => {
    if (!state.members.find((member) => String(member.id) === String(selectedMemberId))) {
      setSelectedMemberId(state.members[0]?.id ?? "");
    }
  }, [state.members, selectedMemberId]);

  useEffect(() => {
    if (!state.legacyMigration?.memberId && state.members[0]?.id) {
      setState((current) => ({ ...current, legacyMigration: { ...current.legacyMigration, memberId: state.members[0].id } }));
    }
  }, [state.members, state.legacyMigration?.memberId, setState]);

  useEffect(() => {
    setMemberSetupValues({
      fullName: selectedMember?.fullName ?? "",
      email: selectedMember?.email ?? "",
      mobile: selectedMember?.mobile ?? "",
      username: selectedMember?.username ?? "",
      aadhaar: selectedMember?.aadhaar ?? "",
      pan: selectedMember?.pan ?? "",
      address: selectedMember?.address ?? "",
      interestRate: blankIfUnset(selectedMember?.interestRate),
      interestType: selectedMember?.interestType || group?.interestType || "Reducing",
      maximumLoanLimit: blankIfUnset(selectedMember?.maximumLoanLimit ?? selectedMember?.loanLimit),
      monthlySaving: blankIfUnset(selectedMember?.monthlySaving ?? selectedMember?.customSavingAmount),
      loanTenureMonths: blankIfUnset(selectedMember?.loanTenureMonths),
      status: selectedMember?.inactiveDate && selectedMember.inactiveDate <= toIsoDateValue() ? "Inactive" : selectedMember?.status ?? "Active",
      inactiveDate: selectedMember?.inactiveDate ?? ""
    });
  }, [selectedMember, group]);

  const lastGroupIdRef = React.useRef(group?.id);

  useEffect(() => {
    if (lastGroupIdRef.current !== group?.id) {
      setGroupValues(buildGroupValues(group, state.members));
      lastGroupIdRef.current = group?.id;
    }
  }, [group?.id, state.members]);

  const periodData = Array.isArray(state.periods) ? state.periods : [];
  const recentLegacyMigrations = (state.transactions || [])
    .filter((transaction) => transaction.transactionType === "Migrated")
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.transactionDate,
      memberId: transaction.memberId,
      joinedDate: transaction.transactionDate,
      exitDate: "",
      saving: Number(transaction.allocation?.savings ?? transaction.amount ?? 0),
      loan: Math.abs(Number(transaction.allocation?.principal ?? 0)),
      interest: Math.abs(Number(transaction.allocation?.interest ?? 0)),
      penalty: Math.abs(Number(transaction.allocation?.penalty ?? 0)),
      status: transaction.approvalStatus,
      remarks: transaction.remarks ?? ""
    }))
    .filter((row) => isWithinPastDays(row.date, 60) || isPendingFinancialStatus(row.status))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 20);
  const recentLegacyGroupOpenings = (state.legacyGroupOpenings || [])
    .filter((row) => isWithinPastDays(row.migration_date ?? row.migrationDate, 60) || isPendingFinancialStatus(row.approval_status ?? row.approvalStatus))
    .sort((a, b) => String(b.migration_date ?? b.migrationDate).localeCompare(String(a.migration_date ?? a.migrationDate)))
    .slice(0, 10);
  const pendingSetupRows = (state.pendingSetupChanges || [])
    .filter((change) => String(change.groupId ?? change.group_id) === String(group?.id))
    .filter((change) => String(change.status || "").toLowerCase() === "pending")
    .map((change) => {
      const pendingApprovers = (state.approvals || [])
        .filter((approval) => approval.batchId === change.batchId && approval.status === "Pending")
        .map((approval) => approval.approverName || approval.level)
        .filter(Boolean);
      return { ...change, pendingWith: pendingApprovers.length ? pendingApprovers.join(", ") : "No pending approver" };
    });

  useEffect(() => {}, [periodData]);

  function showDebugToast(error, message = "Operation failed") {
    console.error(message, error);
    try {
      const details = serializeError(error);
      setNotification({ type: "error", message: `${message}: ${error?.message ?? ""}`, details });
      setTimeout(() => setNotification(null), 10000);
    } catch (err) {
      setNotification({ type: "error", message: message });
      setTimeout(() => setNotification(null), 5000);
    }
  }

  function saveGroupSetup(event) {
    event.preventDefault();
    if (!group) return;
    if (!hasActiveAdminMember(state.members || [], groupValues.admins)) {
      setNotification({ type: "error", message: "At least one active member must be selected as group admin." });
      return;
    }
    setConfirmDialog({
      title: "Confirm changes",
      message: "Are you sure you want to save these changes?",
      onConfirm: async () => {
        let originalGroup = null;
        let shouldOptimisticallyCommit = false;
        setConfirmDialog(null);
        setSavingSetup(true);
        setNotification({ type: "info", message: "Saving changes..." });
        if (!repository.isConfigured()) {
          setNotification({ type: "error", message: "Cloud sync is not configured. Enable secure storage to save group setup." });
          setSavingSetup(false);
          setTimeout(() => setNotification(null), 4000);
          return;
        }

        try {
          const payload = {
            interestType: groupValues.interestType,
            interestRate: optionalNumber(groupValues.interestRate),
            monthlySaving: optionalNumber(groupValues.monthlySaving),
            loanTenureMonths: optionalNumber(groupValues.loanTenureMonths),
            loanDueDay: Number(groupValues.loanDueDay || 1),
            maximumLoanLimit: optionalNumber(groupValues.maximumLoanLimit),
            penaltyAmount: optionalNumber(groupValues.penaltyAmount),
            penaltyAfterDueDateAmount: optionalNumber(groupValues.penaltyAmount),
            loanEligibilityRules: { monthlySaving: optionalNumber(groupValues.monthlySaving) },
            financialYear: groupValues.financialYear,
            approvers: normalizeMemberNames(groupValues.approvers, state.members),
            admins: normalizeMemberNames(groupValues.admins, state.members)
          };
          const optimisticGroup = {
            ...group,
            ...payload,
            approvers: payload.approvers,
            admins: payload.admins
          };
          originalGroup = group;
          shouldOptimisticallyCommit = !payload.approvers?.length;
          if (shouldOptimisticallyCommit) {
            setState((current) => ({
              ...current,
              groups: (current.groups || []).map((item) => item.id === group.id ? optimisticGroup : item)
            }));
            setGroupValues(buildGroupValues(optimisticGroup, state.members));
          }
          const notificationPayload = {
            interestType: payload.interestType,
            interestRate: payload.interestRate,
            monthlySaving: payload.monthlySaving,
            loanTenureMonths: payload.loanTenureMonths,
            loanDueDay: payload.loanDueDay,
            maximumLoanLimit: payload.maximumLoanLimit,
            penaltyAmount: payload.penaltyAmount,
            approvers: payload.approvers,
            admins: payload.admins
          };
          const changeSummary = describeChanges(group, notificationPayload, {
            interestType: "Interest type",
            interestRate: "Interest rate monthly",
            monthlySaving: "Monthly saving",
            loanTenureMonths: "Loan tenure",
            loanDueDay: "Repayment due date",
            maximumLoanLimit: "Loan limit",
            penaltyAmount: "Penalty amount after due date",
            approvers: "Approvers",
            admins: "Admins"
          });
          const hasApprovers = Array.isArray(payload.approvers) && payload.approvers.some(Boolean);
          const tempStateForApprovals = {
            ...state,
            groups: (state.groups || []).map((g) => g.id === group.id ? { ...g, approvers: payload.approvers, admins: payload.admins } : g)
          };
          const approvalRecords = createConfiguredApprovalRecords({
            state: tempStateForApprovals,
            action: "Approve group setup change",
            requester: actor?.name ?? "Admin",
            amount: 0,
            referenceId: group.id,
            referenceType: "group_setup",
            details: changeSummary
          });

          if (hasApprovers) {
            console.debug("Creating approval requests", { approvalRecords });
            const persistedApprovals = await repository.createApprovalRequests({ groupId: group.id, approvals: approvalRecords });
            console.debug("Persisted approvals result", { persistedApprovals });
            const approvalsToStore = persistedApprovals.length ? persistedApprovals : approvalRecords;
            const pendingChange = {
              id: makeId("setupchg"),
              batchId: approvalRecords[0].batchId,
              groupId: group.id,
              setupType: "group",
              targetId: group.id,
              targetName: group.name,
              payload,
              oldValue: group,
              changeSummary,
              status: "Pending",
              createdAt: new Date().toISOString()
            };
            console.debug("Creating pending setup change", { pendingChange });
            const persistedPendingChange = await repository.createPendingSetupChange(pendingChange);
            console.debug("Persisted pending setup change", { persistedPendingChange });
            setGroupValues((current) => ({
              ...current,
              approvers: payload.approvers,
              admins: payload.admins
            }));
            setState((current) => audit({
              state: addGroupNotification({
                ...current,
                approvals: [...approvalsToStore, ...(current.approvals || [])],
                pendingSetupChanges: [persistedPendingChange, ...(current.pendingSetupChanges || [])]
              }, {
                title: "Group setup approval requested",
                body: `${actor?.name ?? "Admin"} requested group setup changes. ${changeSummary}`,
                type: "info"
              }),
              actor,
              action: "request",
              tableName: "setup_changes",
              recordId: persistedPendingChange.id,
              oldValue: group,
              newValue: payload
            }));
            setSavingSetup(false);
            setNotification({ type: "success", message: "Setup change sent for approval." });
            setTimeout(() => setNotification(null), 3000);
            return;
          }

          console.debug("Updating group with payload", { groupId: group.id, payload });
          const updated = await repository.updateGroup(group.id, payload);
          console.debug("Updated group result", { updated });
          setState((current) => audit({
            state: addGroupNotification({
              ...current,
              groups: current.groups.map((item) => item.id === group.id ? { ...item, ...updated, ...payload, approvers: payload.approvers, admins: payload.admins } : item)
            }, {
              title: "Group setup changed",
              body: `${actor?.name ?? "Admin"} updated group setup. ${changeSummary}`,
              type: "info"
            }),
            actor,
            action: "update",
            tableName: "groups",
            recordId: group.id,
            oldValue: group,
            newValue: payload
          }));

          setGroupValues(buildGroupValues({ ...group, ...updated, ...payload, approvers: payload.approvers, admins: payload.admins }, state.members));
          setSavingSetup(false);
          setNotification({ type: "success", message: "Changes saved successfully!" });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          if (shouldOptimisticallyCommit) {
            setState((current) => ({
              ...current,
              groups: (current.groups || []).map((item) => item.id === group.id ? originalGroup : item)
            }));
            setGroupValues(buildGroupValues(originalGroup, state.members));
          }
          showDebugToast(error, "Unable to persist group changes");
          setSavingSetup(false);
        }
      },
      onCancel: () => { setConfirmDialog(null); }
    });
  }

  function saveMemberSetup(event) {
    event.preventDefault();
    if (!selectedMember) return;
    const nextMembersForAdminCheck = (state.members || []).map((member) => String(member.id) === String(selectedMember.id) ? { ...member, status: memberSetupValues.status, inactiveDate: memberSetupValues.status === "Inactive" ? (memberSetupValues.inactiveDate || toIsoDateValue()) : "" } : member);
    if (!hasActiveAdminMember(nextMembersForAdminCheck, groupValues.admins)) {
      setNotification({ type: "error", message: "At least one active member must remain group admin." });
      return;
    }
    setConfirmDialog({
      title: "Confirm changes",
      message: "Are you sure you want to save these changes?",
      onConfirm: async () => {
        let originalMember = null;
        let shouldOptimisticallyCommit = false;
        setConfirmDialog(null);
        if (!repository.isConfigured()) {
          setNotification({ type: "error", message: "Cloud sync is not configured. Enable secure storage to save member setup." });
          setTimeout(() => setNotification(null), 4000);
          return;
        }

        try {
          const payload = {
            fullName: memberSetupValues.fullName,
            email: memberSetupValues.email,
            mobile: memberSetupValues.mobile,
            ...(selectedMember?.username ? {} : { username: memberSetupValues.username }),
            address: memberSetupValues.address,
            aadhaar: memberSetupValues.aadhaar,
            pan: memberSetupValues.pan,
            interestType: memberSetupValues.interestType,
            interestRate: optionalNumber(memberSetupValues.interestRate),
            monthlySaving: optionalNumber(memberSetupValues.monthlySaving),
            maximumLoanLimit: optionalNumber(memberSetupValues.maximumLoanLimit),
            loanTenureMonths: optionalNumber(memberSetupValues.loanTenureMonths),
            active: memberSetupValues.status !== "Inactive",
            inactive_date: memberSetupValues.status === "Inactive" ? (memberSetupValues.inactiveDate || toIsoDateValue()) : null
          };
          originalMember = selectedMember;
          const optimisticMember = { ...selectedMember, ...payload };
          const notificationPayload = {
            fullName: payload.fullName,
            email: payload.email,
            mobile: payload.mobile,
            username: selectedMember?.username,
            interestType: payload.interestType,
            interestRate: payload.interestRate,
            monthlySaving: payload.monthlySaving,
            maximumLoanLimit: payload.maximumLoanLimit,
            loanTenureMonths: payload.loanTenureMonths
          };
          const changeSummary = describeChanges(selectedMember, notificationPayload, {
            fullName: "Name",
            email: "Email",
            mobile: "Mobile",
            interestType: "Interest type",
            interestRate: "Interest rate monthly",
            monthlySaving: "Monthly saving",
            maximumLoanLimit: "Loan limit",
            loanTenureMonths: "Loan tenure"
          });
          const approvalRecords = createConfiguredApprovalRecords({
            state,
            action: "Approve member setup change",
            requester: actor?.name ?? "Admin",
            amount: 0,
            referenceId: selectedMember.id,
            referenceType: "member_setup",
            details: changeSummary
          });
          const approvesRequired = approvalRecords.length > 0;
          if (!approvesRequired) {
            setState((current) => ({
              ...current,
              members: (current.members || []).map((item) => item.id === selectedMember.id ? optimisticMember : item)
            }));
            shouldOptimisticallyCommit = true;
          }

          if (approvesRequired) {
            const persistedApprovals = await repository.createApprovalRequests({ groupId: selectedMember.groupId ?? group?.id, approvals: approvalRecords });
            const approvalsToStore = persistedApprovals.length ? persistedApprovals : approvalRecords;
            const pendingChange = {
              id: makeId("setupchg"),
              batchId: approvalRecords[0].batchId,
              groupId: selectedMember.groupId ?? group?.id,
              setupType: "member",
              targetId: selectedMember.id,
              targetName: selectedMember.fullName,
              payload,
              oldValue: selectedMember,
              changeSummary,
              status: "Pending",
              createdAt: new Date().toISOString()
            };
            const persistedPendingChange = await repository.createPendingSetupChange(pendingChange);
            setState((current) => audit({
              state: addGroupNotification({
                ...current,
                approvals: [...approvalsToStore, ...(current.approvals || [])],
                pendingSetupChanges: [persistedPendingChange, ...(current.pendingSetupChanges || [])]
              }, {
                title: "Member setup approval requested",
                body: `${actor?.name ?? "Admin"} requested setup changes for ${selectedMember.fullName}. ${changeSummary}`,
                type: "info"
              }),
              actor,
              action: "request",
              tableName: "setup_changes",
              recordId: persistedPendingChange.id,
              oldValue: selectedMember,
              newValue: payload
            }));
            setNotification({ type: "success", message: "Member setup change sent for approval." });
            setTimeout(() => setNotification(null), 3000);
            return;
          }

          const updated = await repository.updateMember(selectedMember.id, payload);
          setState((current) => audit({
            state: addGroupNotification({
              ...current,
              members: current.members.map((member) => member.id === selectedMember.id ? { ...member, ...updated, interestType: payload.interestType } : member)
            }, {
              title: "Member setup changed",
              body: `${actor?.name ?? "Admin"} updated setup for ${selectedMember.fullName}. ${changeSummary}`,
              type: "info"
            }),
            actor,
            action: "update",
            tableName: "group_members",
            recordId: selectedMember.id,
            oldValue: selectedMember,
            newValue: memberSetupValues
          }));

          setNotification({ type: "success", message: "Changes saved successfully!" });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          if (shouldOptimisticallyCommit && originalMember) {
            setState((current) => ({
              ...current,
              members: (current.members || []).map((item) => item.id === originalMember.id ? originalMember : item)
            }));
          }
          showDebugToast(error, "Unable to persist member changes");
        }
      },
      onCancel: () => { setConfirmDialog(null); }
    });
  }

  function toggleField(id, keyName) {
    setState((current) => audit({
      state: {
        ...current,
        configurableFields: current.configurableFields.map((field) => field.id === id || `${field.screen}-${field.field}` === id ? { ...field, [keyName]: !field[keyName] } : field)
      },
      actor,
      action: "update",
      tableName: "configurable_fields",
      recordId: id
    }));
  }

  function toggleApprover(member) {
    setGroupValues((current) => {
      const exists = isMemberConfigured(member, current.approvers);
      return {
        ...current,
        approvers: exists
          ? current.approvers.filter((name) => !memberMatchesLookup(member, name))
          : [...current.approvers, member.fullName]
      };
    });
  }

  function toggleAdmin(member) {
    setGroupValues((current) => {
      const exists = isMemberConfigured(member, current.admins);
      const nextAdmins = exists
        ? current.admins.filter((name) => !memberMatchesLookup(member, name))
        : [...current.admins, member.fullName];
      if (!hasActiveAdminMember(state.members || [], nextAdmins)) {
        setNotification({ type: "error", message: "At least one active member must be admin." });
        return current;
      }
      return { ...current, admins: nextAdmins };
    });
  }

  function openFinancialPeriod(periodOrId) {
    const targetPeriod = typeof periodOrId === "string" ? periodData.find((period) => period.id === periodOrId) : periodOrId;
    if (!targetPeriod) return;
    const reopening = targetPeriod.status === periodStatuses.CLOSED;
    setConfirmDialog({
      title: reopening ? "Reopen period" : "Confirm period change",
      message: reopening ? `Reopen ${targetPeriod.name}? This will close any other open period and allow entries in this month.` : "Are you sure you want to activate this period?",
      onConfirm: async () => {
        let openedPeriod = targetPeriod;
        if (repository.isConfigured() && isUuid(group?.id)) {
          try {
            openedPeriod = await repository.openAccountingPeriod(group.id, targetPeriod);
          } catch (error) {
            setConfirmDialog(null);
            showDebugToast(error, "Unable to open period");
            return;
          }
        }
        setState((current) => audit({
          state: { ...current, periods: openPeriod(current.periods.some((period) => period.id === openedPeriod.id) ? current.periods.map((period) => period.id === openedPeriod.id ? { ...period, ...openedPeriod } : period) : [...current.periods, openedPeriod], openedPeriod.id) },
          actor,
          action: "open_period",
          tableName: "periods",
          recordId: openedPeriod.id
        }));
        setConfirmDialog(null);
        setNotification({ type: "success", message: "Period activated successfully!" });
        setTimeout(() => setNotification(null), 3000);
      },
      onCancel: () => { setConfirmDialog(null); }
    });
  }

  function closeFinancialPeriod(periodId) {
    setConfirmDialog({
      title: "Confirm period close",
      message: "Are you sure you want to close this period? This will make it read-only.",
      onConfirm: async () => {
        let closedPeriod = null;
        if (repository.isConfigured() && isUuid(periodId)) {
          try {
            closedPeriod = await repository.closeAccountingPeriod(periodId);
          } catch (error) {
            setConfirmDialog(null);
            showDebugToast(error, "Unable to close period");
            return;
          }
        }
        setState((current) => audit({
          state: { ...current, periods: current.periods.map((period) => period.id === periodId ? { ...period, ...(closedPeriod ?? {}), status: periodStatuses.CLOSED } : period) },
          actor,
          action: "close_period",
          tableName: "periods",
          recordId: periodId
        }));
        setConfirmDialog(null);
        setNotification({ type: "success", message: "Period closed successfully!" });
        setTimeout(() => setNotification(null), 3000);
      },
      onCancel: () => { setConfirmDialog(null); }
    });
  }

  function openSelectedMonthPeriod() {
    const draft = getMonthPeriodDraft(periodPicker.year, periodPicker.month);
    const existing = periodData.find((period) => String(period.name) === draft.name || (period.startDate === draft.startDate && period.endDate === draft.endDate));
    openFinancialPeriod(existing ?? draft);
  }

  async function saveLegacyGroupOpening() {
    if (!group?.id) {
      setNotification({ type: "error", message: "Create/select a group before saving group legacy opening." });
      return;
    }
    if (!legacyGroupMigration.migrationDate) {
      setLegacyErrors((current) => ({ ...current, groupMigrationDate: "Migration date is required." }));
      return;
    }
    const validLegacyExpenseLines = legacyExpenseLines.map((line) => ({ ...line, amount: Number(line.amount || 0), category: line.category.trim() || "Opening expense", remarks: line.remarks.trim() })).filter((line) => line.amount > 0);
    const openingGroupExpense = validLegacyExpenseLines.reduce((sum, line) => sum + line.amount, 0);
    setConfirmDialog({
      title: "Save group legacy opening",
      message: "Save group-level opening balance/gain/expense once for this group?",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
          const approvalStatus = hasGroupApprovers ? "Pending" : "Completed";
          let saved = { id: makeId("lgo"), group_id: group.id, migration_date: legacyGroupMigration.migrationDate, opening_bank_balance: Number(legacyGroupMigration.openingBankBalance || 0), opening_group_expense: openingGroupExpense, opening_group_gain: Number(legacyGroupMigration.openingGroupGain || 0), approval_status: approvalStatus, remarks: legacyGroupMigration.remarks || "" };
          if (repository.isConfigured()) {
            saved = await repository.saveLegacyGroupOpening({ groupId: group.id, migrationDate: legacyGroupMigration.migrationDate, openingBankBalance: legacyGroupMigration.openingBankBalance, openingGroupExpense, openingGroupGain: legacyGroupMigration.openingGroupGain, approvalStatus, remarks: legacyGroupMigration.remarks });
          }
          const approvalRecord = hasGroupApprovers ? createConfiguredApprovalRecords({ state, action: "Legacy group opening", requester: actor?.name ?? "Admin", amount: Number(legacyGroupMigration.openingBankBalance || 0) + Number(legacyGroupMigration.openingGroupGain || 0) + openingGroupExpense, referenceId: saved.legacy_group_opening_id ?? saved.id, referenceType: "legacy_group_opening", details: `Opening balance ${currency.format(Number(legacyGroupMigration.openingBankBalance || 0))}; gain ${currency.format(Number(legacyGroupMigration.openingGroupGain || 0))}; expense ${currency.format(openingGroupExpense)}` }) : [];
          const persistedApprovals = approvalRecord.length && repository.isConfigured() ? await repository.createApprovalRequests({ groupId: group.id, approvals: approvalRecord }) : approvalRecord;
          setState((current) => audit({ state: { ...current, legacyGroupOpenings: [saved, ...(current.legacyGroupOpenings || []).filter((row) => String(row.group_id ?? row.groupId) !== String(group.id))], approvals: [...persistedApprovals, ...(current.approvals || [])], notifications: hasGroupApprovers ? [{ id: makeId("ntf"), groupId: group.id, title: "Legacy group opening approval requested", body: "Group opening values are waiting for approval.", type: "info", createdAt: new Date().toISOString() }, ...(current.notifications || [])] : current.notifications }, actor, action: "save_group_legacy_opening", tableName: "legacy_group_opening", recordId: saved.legacy_group_opening_id ?? saved.id, newValue: saved }));
          setNotification({ type: "success", message: hasGroupApprovers ? "Group-level legacy opening sent for approval." : "Group-level legacy opening saved." });
        } catch (error) {
          setNotification({ type: "error", message: `Unable to save group legacy opening: ${error.message}`, details: serializeError(error) });
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  const activePeriod = getOpenPeriod(periodData);
  const focusedSetupRoute = setupLocation.pathname.startsWith("/setup/") && setupLocation.pathname !== "/setup/financial";
  const setupTabs = [
    { key: "group", label: "Group", description: "Defaults", icon: Settings },
    { key: "member", label: "Member", description: "Profiles", icon: Users },
    { key: "financial", label: "Finance", description: "Controls", icon: SlidersHorizontal }
  ];
  const financialTabs = [
    { key: "roles", label: "Role Setup", description: "Approvers + admins", icon: Settings },
    { key: "loan", label: "Loans", description: "Interest", icon: IndianRupee },
    { key: "period", label: "Periods", description: "Month close", icon: CalendarCheck },
    { key: "calculator", label: "Calculator", description: "Shares", icon: Calculator }
  ];

  return (
    <>
      <Page title="Setup" subtitle="Configure group, member, financial and approval settings from one screen" action={null}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: cloudConfigured ? "#065f46" : "#b91c1c" }}>
            {cloudConfigured ? "Cloud sync: configured" : "Cloud sync: NOT configured (API key missing)"}
          </span>
        </div>
        {!group && (
          <Section title="Create group first">
            <p className="section-note">Use Groups to create the basic group name and primary contact, then return here for detailed setup.</p>
          </Section>
        )}
        <div className={focusedSetupRoute ? "setup-shell setup-shell-focused" : "setup-shell"}>
          {!focusedSetupRoute && (
            <div className="setup-rail" aria-label="Setup sections">
              {setupTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button type="button" key={tab.key} className={tab.key === activeSetupTab ? "setup-nav-button active" : "setup-nav-button"} onClick={() => setActiveSetupTab(tab.key)}>
                    <Icon size={18} />
                    <span><strong>{tab.label}</strong><small>{tab.description}</small></span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="setup-content">
            {activeSetupTab === "group" && (
              <FormCard title="Group setup" onSubmit={saveGroupSetup}>
                <SelectField label="Interest type" value={groupValues.interestType} onChange={(value) => setGroupValues({ ...groupValues, interestType: value })} options={["Reducing", "Flat"]} />
                <div className="section-note" style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f0f9ff", borderRadius: "6px", borderLeft: "4px solid #3b82f6" }}><strong>Interest Type Explanation:</strong><div style={{ marginTop: "8px", fontSize: "0.9rem" }}><div style={{ marginBottom: "8px" }}><strong>Reducing:</strong> {interestTypeDescriptions["Reducing"]}</div><div><strong>Flat:</strong> {interestTypeDescriptions["Flat"]}</div></div></div>
                <Field label="Interest rate (% monthly)" type="number" value={groupValues.interestRate} onChange={(value) => setGroupValues({ ...groupValues, interestRate: value })} />
                <Field label="Savings amount" type="number" value={groupValues.monthlySaving} onChange={(value) => setGroupValues({ ...groupValues, monthlySaving: value })} />
                <Field label="Loan limit" type="number" value={groupValues.maximumLoanLimit} onChange={(value) => setGroupValues({ ...groupValues, maximumLoanLimit: value })} />
                <Field label="Penalty amount after due date" type="number" value={groupValues.penaltyAmount} onChange={(value) => setGroupValues({ ...groupValues, penaltyAmount: value })} />
                <Field label="Loan tenure (months)" type="number" value={groupValues.loanTenureMonths} onChange={(value) => setGroupValues({ ...groupValues, loanTenureMonths: value })} />
                <Field label="Repayment due date" type="number" value={groupValues.loanDueDay} onChange={(value) => setGroupValues({ ...groupValues, loanDueDay: value })} />
                <p className="section-note">Set the group financial defaults used for loan and savings calculations.</p>
                <p className="section-note">Penalty amount is optional. Blank value is treated as ₹0. Minimum principal due is derived from loan tenure: original loan principal divided by tenure months. Member tenure overrides group tenure. Blank or 0 tenure means no minimum principal restriction.</p>
                <p className="section-note">Loan tenure 0 or blank means there is no fixed payback time limit.</p>
                <p className="section-note">Repayment due date defaults to 1, meaning the first date of each month. Use day 1 to 28.</p>
              </FormCard>
            )}
            {activeSetupTab === "member" && (
              <FormCard title="Member setup" onSubmit={saveMemberSetup}>
                <SelectField label="Select member" value={selectedMemberId} onChange={(value) => setSelectedMemberId(value)} options={state.members.map((member) => ({ label: member.fullName, value: member.id }))} />
                <label className="checkbox-item" style={{ marginBottom: "16px" }}><input type="checkbox" checked={memberSetupValues.status === "Active"} onChange={(e) => setMemberSetupValues({ ...memberSetupValues, status: e.target.checked ? "Active" : "Inactive", inactiveDate: e.target.checked ? "" : (memberSetupValues.inactiveDate || toIsoDateValue()) })} />Active member</label>
                {memberSetupValues.status === "Inactive" && <Field label="Inactive / exit date" type="date" value={memberSetupValues.inactiveDate} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, inactiveDate: value, status: value && value <= toIsoDateValue() ? "Inactive" : memberSetupValues.status })} />}
                <Field label="Full name" value={memberSetupValues.fullName} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, fullName: value })} />
                <Field label="Aadhaar" value={memberSetupValues.aadhaar} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, aadhaar: value })} />
                <Field label="PAN" value={memberSetupValues.pan} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, pan: value })} />
                <Field label="Address" value={memberSetupValues.address} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, address: value })} />
                <Field label="Email" type="email" value={memberSetupValues.email} onChange={(value) => setMemberSetupValues((current) => ({ ...current, email: value }))} />
                <Field label="Mobile" type="tel" value={memberSetupValues.mobile} onChange={(value) => setMemberSetupValues((current) => ({ ...current, mobile: value }))} />
                <Field label="Username" value={selectedMember?.username ?? ""} onChange={(value) => { if (!selectedMember?.username) setMemberSetupValues({ ...memberSetupValues, username: value }); }} disabled={Boolean(selectedMember?.username)} />
                <SelectField label="Interest type" value={memberSetupValues.interestType} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, interestType: value })} options={["Reducing", "Flat"]} />
                <div className="section-note" style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f0f9ff", borderRadius: "6px", borderLeft: "4px solid #3b82f6" }}><strong>Interest Type Explanation:</strong><div style={{ marginTop: "8px", fontSize: "0.9rem" }}><div style={{ marginBottom: "8px" }}><strong>Reducing:</strong> {interestTypeDescriptions["Reducing"]}</div><div><strong>Flat:</strong> {interestTypeDescriptions["Flat"]}</div></div></div>
                <Field label="Interest rate (% monthly)" type="number" value={memberSetupValues.interestRate} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, interestRate: value })} />
                <Field label="Monthly savings amount" type="number" value={memberSetupValues.monthlySaving} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, monthlySaving: value })} />
                <Field label="Maximum loan limit" type="number" value={memberSetupValues.maximumLoanLimit} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, maximumLoanLimit: value })} />
                <Field label="Loan tenure (months)" type="number" value={memberSetupValues.loanTenureMonths} onChange={(value) => setMemberSetupValues({ ...memberSetupValues, loanTenureMonths: value })} />
                <p className="section-note">Leave blank to use group defaults. Enter 0 only when this member should intentionally override the group value with zero.</p>
                <p className="section-note">Loan tenure blank uses group setup. Loan tenure 0 means there is no fixed payback time limit for this member.</p>
              </FormCard>
            )}
            {activeSetupTab === "financial" && (
              <>
                {!focusedSetupRoute && (
                  <div className="setup-submenu" aria-label="Financial setup sections">
                    {financialTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button type="button" key={tab.key} className={tab.key === financialTab ? "setup-submenu-button active" : "setup-submenu-button"} onClick={() => setFinancialTab(tab.key)}>
                          <Icon size={17} />
                          <span><strong>{tab.label}</strong><small>{tab.description}</small></span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {financialTab === "roles" && (
                  <FormCard title="Role setup" onSubmit={saveGroupSetup} hideSubmit>
                    <p className="section-note">Assign approver and admin access to members from the same screen.</p>
                    <div style={{ display: "grid", gap: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: "12px", fontWeight: 600, padding: "10px 0", borderBottom: "2px solid rgba(0,0,0,0.12)", alignItems: "center" }}><span>Member</span><span style={{ textAlign: "center" }}>Approver</span><span style={{ textAlign: "center" }}>Admin</span></div>
                      {state.members.map((member) => <div key={member.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: "12px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.08)" }}><span>{member.fullName}</span><div style={{ display: "flex", justifyContent: "center" }}><input type="checkbox" disabled={savingSetup} checked={isMemberConfigured(member, groupValues.approvers)} onChange={() => toggleApprover(member)} /></div><div style={{ display: "flex", justifyContent: "center" }}><input type="checkbox" disabled={savingSetup} checked={isMemberConfigured(member, groupValues.admins)} onChange={() => toggleAdmin(member)} /></div></div>)}
                    </div>
                    <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" className="primary-button" disabled={savingSetup} onClick={(e) => { e.preventDefault(); if (!savingSetup) saveGroupSetup(e); }}>
                        {savingSetup ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </FormCard>
                )}
                {financialTab === "loan" && (
                  <FormCard title="Loan setup" onSubmit={saveGroupSetup}>
                    <p className="section-note">Choose how loan interest should start being calculated.</p>
                    <label className="checkbox-item" style={{ display: "block", marginBottom: "12px" }}><input type="radio" name="loanInterestStartMode" value="disbursement" checked={groupValues.loanInterestStartMode === "disbursement"} onChange={() => setGroupValues({ ...groupValues, loanInterestStartMode: "disbursement" })} />Start calculating interest from loan disbursement date.</label>
                    <label className="checkbox-item" style={{ display: "block" }}><input type="radio" name="loanInterestStartMode" value="fullMonth" checked={groupValues.loanInterestStartMode === "fullMonth"} onChange={() => setGroupValues({ ...groupValues, loanInterestStartMode: "fullMonth" })} />Calculate loan interest for the full month.</label>
                    <p className="section-note">This setting affects how loan interest is computed when a loan is disbursed in the middle of a month.</p>
                  </FormCard>
                )}
                {financialTab === "period" && (
                  <Section title="Period setup">
                    <p className="section-note">Select which month's records are currently open for transactions. Only the selected month will accept payments.</p>
                    <div className="period-control-panel">
                      <SelectField label="Month to open" value={String(periodPicker.month)} onChange={(value) => setPeriodPicker((current) => ({ ...current, month: Number(value) }))} options={Array.from({ length: 12 }, (_, index) => ({ label: new Date(2026, index, 1).toLocaleString("default", { month: "long" }), value: String(index + 1) }))} />
                      <Field label="Year" type="number" value={periodPicker.year} onChange={(value) => setPeriodPicker((current) => ({ ...current, year: Number(value) }))} />
                      <button type="button" className="primary-button" onClick={openSelectedMonthPeriod}>Open selected period</button>
                      <button type="button" className="secondary-button" disabled={!activePeriod} onClick={() => activePeriod && closeFinancialPeriod(activePeriod.id)}>Close current open period</button>
                    </div>
                    <div style={{ backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "6px", padding: "12px", marginBottom: "18px", color: "var(--muted)", fontSize: "0.9rem" }}><strong>ℹ️ Auto-transition:</strong> On the first day of each month, the system will automatically close the previous month and open the current month. You can reopen any past month if needed for corrections.</div>
                    <div className="period-list">{periodData && periodData.length > 0 ? [...periodData].sort((a, b) => new Date(b.startDate) - new Date(a.startDate)).map((period) => { const monthYear = formatPeriodName(period.startDate) || period.name; const isActive = activePeriod?.id === period.id; const isClosed = period.status === periodStatuses.CLOSED; return <article key={period.id} className={`entity-card compact-card ${isActive ? "active-period" : ""}`}><span className="pill">{period.status}</span><h3>{monthYear}</h3>{isActive && <p style={{ color: "var(--success)", fontWeight: "700" }}>✓ Currently Active</p>}<div className="button-row">{isActive ? <><button type="button" className="primary-button" disabled>Active Period</button><button type="button" className="secondary-button" onClick={() => closeFinancialPeriod(period.id)}>Close period</button></> : <><button type="button" className="secondary-button" onClick={() => openFinancialPeriod(period.id)}>Set as Active</button>{!isClosed && <button type="button" className="secondary-button" onClick={() => closeFinancialPeriod(period.id)}>Close period</button>}</>}{isClosed && <button type="button" className="secondary-button" onClick={() => openFinancialPeriod(period.id)}>Reopen</button>}</div></article>; }) : <p className="section-note" style={{ backgroundColor: "#fef2f2", padding: "12px", borderRadius: "6px", color: "#991b1b" }}>Periods not loaded. Reload the page.</p>}</div>
                  </Section>
                )}
                {financialTab === "calculator" && (
                  <div className="calculator-grid">
                    <Section title="Member share calculator">
                      <p className="section-note">Use this for quick estimation only. Fields can be left blank and will be treated as 0. It does not save anything.</p>
                      <div className="form-grid">
                        <Field label="Remaining money in account" type="number" value={shareCalculator.remainingMoney} onChange={(value) => { setShareCalculatorCalculated(false); setShareCalculator((current) => ({ ...current, remainingMoney: value })); }} />
                        <Field label="Outstanding loan" type="number" value={shareCalculator.outstandingLoan} onChange={(value) => { setShareCalculatorCalculated(false); setShareCalculator((current) => ({ ...current, outstandingLoan: value })); }} />
                        <Field label="Per member monthly saving" type="number" value={shareCalculator.perMemberSaving} onChange={(value) => { setShareCalculatorCalculated(false); setShareCalculator((current) => ({ ...current, perMemberSaving: value })); }} />
                        <Field label="Number of members" type="number" value={shareCalculator.numberOfMembers} onChange={(value) => { setShareCalculatorCalculated(false); setShareCalculator((current) => ({ ...current, numberOfMembers: value })); }} />
                        <Field label="Total months" type="number" value={shareCalculator.totalMonths} onChange={(value) => { setShareCalculatorCalculated(false); setShareCalculator((current) => ({ ...current, totalMonths: value })); }} />
                        <Field label="Group start date" type="date" value={shareCalculator.groupStartDate} onChange={(value) => { setShareCalculatorCalculated(false); setShareCalculator((current) => ({ ...current, groupStartDate: value })); }} />
                        <Field label="Group last date" type="date" value={shareCalculator.groupLastDate} onChange={(value) => { setShareCalculatorCalculated(false); setShareCalculator((current) => ({ ...current, groupLastDate: value })); }} />
                      </div>
                      <div className="button-row" style={{ marginTop: 18 }}>
                        <button type="button" className="primary-button" onClick={() => setShareCalculatorCalculated(true)}>Calculate</button>
                        <button type="button" className="secondary-button" onClick={() => { setShareCalculatorCalculated(false); setShareCalculator({ remainingMoney: "", outstandingLoan: "", perMemberSaving: "", numberOfMembers: state.members?.length ? String(state.members.length) : "", totalMonths: "", groupStartDate: "", groupLastDate: "" }); }}>Reset</button>
                      </div>
                      {shareCalculatorCalculated && <><p className="section-note" style={{ marginTop: 18 }}>Total savings used: {currency.format(expectedTotalSavings)} ({memberCountForShare || 0} members x {currency.format(numberOrZero(shareCalculator.perMemberSaving))} x {calculatorMonths} months)</p><MetricGrid metrics={[metric("Total amount", currency.format(shareTotalGroupValue), WalletCards, ["Remaining account money + outstanding loan"]), metric("Per member share", currency.format(estimatedPerMemberShare), Users, ["(Group gain / members) + per member saved amount"]), metric("Group gain", currency.format(estimatedGroupGain), WalletCards, ["Total amount - total savings of all members"]), metric("Per member gain", currency.format(estimatedPerMemberGain), IndianRupee, ["Group gain divided by members"]), metric("Check total", currency.format(estimatedPerMemberShare * memberCountForShare), CheckCircle2, ["Per member share x members"])]} /></>}
                    </Section>
                  </div>
                )}
                {/* legacy migration panel disabled during extraction cleanup */}
                {financialTab !== "calculator" && (
                  <Section title="Pending setup approvals">
                    <Table headers={["Setup", "Change", "Status", "Pending with", "Requested"]} rows={pendingSetupRows.map((change) => [ `${getSetupChangeTypeLabel(change.setupType)} / ${change.targetName || ""}`, change.changeSummary || "", change.status || "Pending", change.pendingWith, change.createdAt ? new Date(change.createdAt).toLocaleString("en-IN") : "" ])} />
                    {pendingSetupRows.length === 0 && <p className="section-note">No setup changes are pending approval.</p>}
                  </Section>
                )}
              </>
            )}
          </div>
        </div>
      </Page>
    </>
  );
}
