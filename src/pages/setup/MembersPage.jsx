import React, { useState } from "react";
import { Page, FormCard, Field, Table } from "../../components";
import { getDashboardPeriod } from "../../services/financeFields";
import { repository } from "../../services/repository";
import { roles } from "../../services/permissions";
import { memberSchema, validate } from "../../services/validation";
import { audit, makeId } from "../../services/storage";
import { addGroupNotification, getHiddenGroupIds, isUuid, saveHiddenGroupIds } from "../../services/stateHelpers";

function statusWithPendingApprover(item, approvals = [], explicitReferenceType = null) {
  const matchingApprovals = (approvals || []).filter((approval) => {
    if (approval.referenceId !== undefined && item?.id !== undefined && String(approval.referenceId) !== String(item.id)) {
      return false;
    }
    const referenceType = approval.referenceType ?? "default";
    if (explicitReferenceType && referenceType !== explicitReferenceType) return false;
    if (item?.approvalStatus && String(item.approvalStatus).toUpperCase() === "PENDING") return true;
    return approval.status === "Pending";
  });
  if (matchingApprovals.some((approval) => approval.status === "Pending")) return "Pending";
  if (item?.approvalStatus && String(item.approvalStatus).toUpperCase() === "PENDING") return "Pending";
  return item?.approvalStatus ?? "Completed";
}

function hasMemberGroupActivity(member, state) {
  if (!member) return false;
  const memberId = String(member.id ?? member.memberId ?? "");
  const matchesMemberId = (candidate) => String(candidate ?? "") === memberId;

  const hasTransactionActivity = (state.transactions || []).some((transaction) =>
    [transaction.memberId, transaction.member_id, transaction.member?.id, transaction.member?.memberId, transaction.member?.member_id]
      .some(matchesMemberId)
  );
  const hasLoanActivity = (state.loans || []).some((loan) =>
    [loan.memberId, loan.member_id, loan.member?.id, loan.member?.memberId, loan.member?.member_id]
      .some(matchesMemberId)
  );
  const hasWithdrawalActivity = (state.withdrawals || []).some((withdrawal) =>
    [withdrawal.memberId, withdrawal.member_id, withdrawal.member?.id, withdrawal.member?.memberId, withdrawal.member?.member_id]
      .some(matchesMemberId)
  );

  return hasTransactionActivity || hasLoanActivity || hasWithdrawalActivity;
}

function getConfiguredApprovalRecipients(state) {
  const group = state.groups?.[0] ?? {};
  const names = new Set([...(group.approvers || [])].filter(Boolean));
  return [...names].map((name) => {
    const member = (state.members || []).find((item) => String(item.fullName || "").toLowerCase() === String(name).toLowerCase());
    return {
      id: member?.id ?? name,
      name,
      role: member?.memberRole ?? member?.role ?? "Approver"
    };
  });
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

function activeMembersForTransactions(members = []) {
  return (members || []).filter((member) => {
    if (!member) return false;
    if (String(member.status ?? "").toLowerCase() === "inactive") return false;
    if (member.inactiveDate && String(member.inactiveDate) <= new Date().toISOString().slice(0, 10)) return false;
    if (member.exitDate && String(member.exitDate) <= new Date().toISOString().slice(0, 10)) return false;
    return true;
  });
}

function getGroupPlan(state, groupId) {
  const subscription = (state.subscriptions || []).find((item) =>
    String(item.groupId) === String(groupId)
    && ["ACTIVE", "PAID"].includes(String(item.status || item.paymentStatus || "").toUpperCase())
  );
  return [
    { id: "free", name: "Free", duration: "Free", amount: 0, maxGroups: 1, maxMembers: 5 },
    { id: "starter-monthly", name: "Starter", duration: "Monthly", amount: 99, maxGroups: 1, maxMembers: Infinity },
    { id: "starter-yearly", name: "Starter", duration: "Yearly", amount: 999, maxGroups: 1, maxMembers: Infinity },
    { id: "growth-monthly", name: "Growth", duration: "Monthly", amount: 299, maxGroups: 1, maxMembers: Infinity },
    { id: "growth-yearly", name: "Growth", duration: "Yearly", amount: 2999, maxGroups: 1, maxMembers: Infinity },
    { id: "premium-monthly", name: "Premium", duration: "Monthly", amount: 999, maxGroups: 1, maxMembers: Infinity },
    { id: "premium-yearly", name: "Premium", duration: "Yearly", amount: 9999, maxGroups: 1, maxMembers: Infinity }
  ].find((plan) => plan.name === subscription?.plan && plan.duration === subscription?.duration)
    ?? { id: "free", name: "Free", duration: "Free", amount: 0, maxGroups: 1, maxMembers: 5 };
}

function getCurrencyFormatter() {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  });
}

export default function MembersPage({ state, setState, actor, setConfirmDialog, setNotification }) {
  const currency = getCurrencyFormatter();
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    mobile: "",
    username: ""
  });
  const [errors, setErrors] = useState({});

  async function submit(event) {
    event.preventDefault();
    const normalizedFullName = values.fullName.trim();
    const normalizedEmail = values.email.trim().toLowerCase();
    const normalizedMobile = values.mobile.replace(/\D/g, "");
    const username = values.username.trim();
    const validatedValues = { ...values, fullName: normalizedFullName, email: normalizedEmail, mobile: normalizedMobile, username };
    const result = validate(memberSchema, validatedValues);

    const duplicateMember = state.members.find((member) =>
      (normalizedFullName && member.fullName?.trim().toLowerCase() === normalizedFullName.toLowerCase())
      || (normalizedEmail && member.email === normalizedEmail)
      || (normalizedMobile && member.mobile === normalizedMobile)
      || member.username?.toLowerCase() === username.toLowerCase()
    );

    const nextErrors = {
      ...result.errors,
      ...(duplicateMember ? {
        ...(normalizedFullName && duplicateMember.fullName?.trim().toLowerCase() === normalizedFullName.toLowerCase() ? { fullName: "Member full name already exists in this group" } : {}),
        ...(normalizedEmail && duplicateMember.email === normalizedEmail ? { email: "Email already exists" } : {}),
        ...(normalizedMobile && duplicateMember.mobile === normalizedMobile ? { mobile: "Mobile already exists" } : {}),
        ...(duplicateMember.username?.toLowerCase() === username.toLowerCase() ? { username: "Username must be unique in this group" } : {})
      } : {})
    };

    setErrors(nextErrors);
    if (!result.data || duplicateMember) return;

    const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
    const localMember = {
      id: makeId("mem"),
      ...result.data,
      username,
      address: "",
      dateJoined: new Date().toISOString().slice(0, 10),
      nominee: "",
      aadhaar: "",
      pan: "",
      status: hasGroupApprovers ? "Inactive" : "Active",
      approvalStatus: hasGroupApprovers ? "Pending" : "Completed",
      savings: 0,
      loanOutstanding: 0,
      shares: 0
    };

    if (!repository.isConfigured()) {
      setNotification({ type: "error", message: "Cloud sync is not configured. Enable secure storage to save members." });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    const primaryGroupId = state.groups[0]?.id;
    const activePlan = getGroupPlan(state, primaryGroupId);
    const activeMemberCount = activeMembersForTransactions(state.members || []).length;
    if (Number.isFinite(activePlan.maxMembers) && activeMemberCount >= activePlan.maxMembers) {
      setNotification({ type: "error", message: `Free plan allows ${activePlan.maxMembers} active members only. Make a member inactive or subscribe to add more active members.` });
      return;
    }
    if (!isUuid(primaryGroupId)) {
      setNotification({ type: "error", message: "Selected group is not yet persisted. Save a group first." });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setConfirmDialog({
      title: "Save member",
      message: "Save member online? Confirm to commit.",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const createdMember = await repository.createMember(localMember, primaryGroupId);
          const approvalRecords = hasGroupApprovers
            ? createConfiguredApprovalRecords({
                state,
                action: "Approve member addition",
                requester: actor.name,
                amount: 0,
                referenceId: createdMember.id,
                referenceType: "member_addition",
                details: `Add member ${createdMember.fullName} (${createdMember.username || createdMember.email || "-"})`
              })
            : [];
          const persistedApprovals = approvalRecords.length && repository.isConfigured()
            ? await repository.createApprovalRequests({ groupId: primaryGroupId, approvals: approvalRecords })
            : approvalRecords;
          const memberForState = hasGroupApprovers
            ? { ...createdMember, status: "Inactive", approvalStatus: "Pending" }
            : createdMember;
          setState((current) => audit({
            state: addGroupNotification({
              ...current,
              members: [memberForState, ...current.members],
              approvals: [...persistedApprovals, ...current.approvals]
            }, hasGroupApprovers ? {
              title: "Member addition approval requested",
              body: `${actor.name} requested approval to add ${createdMember.fullName}. Pending with ${approvalRecords.map((approval) => approval.approverName || approval.level).join(", ")}.`,
              type: "info"
            } : {
              title: "Member added",
              body: `${createdMember.fullName} was added to the group.`,
              type: "success"
            }),
            actor,
            action: hasGroupApprovers ? "request" : "create",
            tableName: "group_members",
            recordId: createdMember.id,
            newValue: memberForState
          }));
          setNotification({ type: "success", message: hasGroupApprovers ? "Member addition sent for approval." : "Member saved online." });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          console.error("Create member failed", error);
          setNotification({ type: "error", message: `Unable to save member online: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
        setNotification({ type: "info", message: "Member not saved online." });
        setTimeout(() => setNotification(null), 3000);
      }
    });
  }

  async function handleDeleteMember(member) {
    if (!member) return;
    if (hasMemberGroupActivity(member, state)) {
      setNotification({ type: "error", message: `${member.fullName} already has group activity, so it cannot be deleted.` });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setConfirmDialog({
      title: "Delete member",
      message: `Delete ${member.fullName} from this group? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        if (!repository.isConfigured()) {
          setNotification({ type: "error", message: "Cloud sync is not configured. Enable secure storage before deleting a member." });
          setTimeout(() => setNotification(null), 4000);
          return;
        }

        try {
          await repository.deleteMember(member.id);
          setState((current) => audit({
            state: {
              ...current,
              members: current.members.filter((item) => String(item.id) !== String(member.id))
            },
            actor,
            action: "delete",
            tableName: "group_members",
            recordId: member.id,
            oldValue: member,
            newValue: null
          }));
          setNotification({ type: "success", message: `${member.fullName} was deleted from the group.` });
          setTimeout(() => setNotification(null), 4000);
        } catch (error) {
          console.error("Delete member failed", error);
          setNotification({ type: "error", message: `Unable to delete member: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
      }
    });
  }

  return (
    <Page title="Members" subtitle="Member master with unique mobile, email, username, nominee and bank readiness" action={null}>
      <FormCard title="Add member" onSubmit={submit}>
        <Field label="Full name" value={values.fullName} onChange={(value) => setValues({ ...values, fullName: value })} error={errors.fullName} required />
        <Field label="Email" type="email" value={values.email} onChange={(value) => setValues({ ...values, email: value })} error={errors.email} />
        <Field label="Mobile" type="tel" value={values.mobile} onChange={(value) => setValues({ ...values, mobile: value })} error={errors.mobile} />
        <Field label="Username" value={values.username} onChange={(value) => setValues({ ...values, username: value })} error={errors.username} required />
        <div className="section-note">Email and mobile are optional. If you want the member to login later, add their email and ask them to register with the same email.</div>
      </FormCard>
      <Table
        headers={["Member", "Email", "Mobile", "Username", "Savings", "Loan", "Status", "Actions"]}
        rows={state.members.map((member) => {
          const summary = state.rpcMemberFinanceSummaries?.[String(member.id)] || null;
          const canDelete = !hasMemberGroupActivity(member, state);
          return [
            member.fullName,
            member.email,
            member.mobile,
            member.username,
            currency.format(Number(summary?.savings ?? member.savings ?? 0)),
            currency.format(Number(summary?.outstanding ?? member.loanOutstanding ?? 0)),
            statusWithPendingApprover({ id: member.id, approvalStatus: member.approvalStatus ?? member.status }, state.approvals, "member_addition"),
            canDelete ? (
              <button type="button" className="secondary-button" onClick={() => handleDeleteMember(member)}>
                Delete
              </button>
            ) : (
              <span className="section-note">In use</span>
            )
          ];
        })}
      />
    </Page>
  );
}
