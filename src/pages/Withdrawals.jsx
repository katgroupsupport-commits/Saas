import React, { useMemo, useState } from "react";
import { Page, Section, FormCard, Field, SelectField, Table } from "../components";
import { repository } from "../services/repository";
import { getCurrentMember } from "../services/financeFields";

function serializeError(error) {
  return error?.message || String(error);
}

export default function Withdrawals({ state, setState, actor, setNotification }) {
  const group = state.groups?.[0] ?? {};
  const members = (state.members || []).filter((member) => String(member.groupId) === String(group.id));
  const currentMember = getCurrentMember(state, actor);
  const defaultMember = currentMember || members[0] || {};

  const [form, setForm] = useState({
    memberId: String(defaultMember.id || ""),
    amount: "",
    requestDate: new Date().toISOString().slice(0, 10),
    reason: ""
  });
  const [errors, setErrors] = useState({});

  const withdrawalRequests = useMemo(
    () => (state.withdrawalRequests || []).filter((request) => String(request.groupId) === String(group.id)),
    [state.withdrawalRequests, group.id]
  );

  const onSubmit = async (event) => {
    event.preventDefault();

    const validationErrors = {};
    if (!form.memberId) validationErrors.memberId = "Member is required";
    if (!form.amount || Number(form.amount) <= 0) validationErrors.amount = "Enter a withdrawal amount";
    if (!form.requestDate) validationErrors.requestDate = "Request date is required";
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    try {
      const created = await repository.createWithdrawalRequest({
        groupId: group.id,
        memberId: Number(form.memberId),
        requestedAmount: Number(form.amount),
        requestDate: form.requestDate,
        reason: form.reason
      });
      setState((current) => ({
        ...current,
        withdrawalRequests: [created, ...(current.withdrawalRequests || [])]
      }));
      setNotification({ type: "success", message: "Withdrawal request submitted" });
      setForm({
        memberId: form.memberId,
        amount: "",
        requestDate: new Date().toISOString().slice(0, 10),
        reason: ""
      });
      setErrors({});
    } catch (error) {
      setNotification({ type: "error", message: "Failed to submit withdrawal request", details: serializeError(error) });
    }
  };

  return (
    <Page title="Withdrawals" subtitle="Request cash withdrawals for group members">
      <Section title="New Withdrawal Request">
        <FormCard onSubmit={onSubmit}>
          <SelectField
            label="Member"
            name="memberId"
            value={form.memberId}
            onChange={(value) => setForm((current) => ({ ...current, memberId: value }))}
            options={members.map((member) => ({ label: member.fullName || member.name || member.username || "Member", value: String(member.id) }))}
            required
            error={errors.memberId}
          />
          <Field
            label="Amount"
            name="amount"
            type="number"
            value={form.amount}
            onChange={(value) => setForm((current) => ({ ...current, amount: value }))}
            required
            error={errors.amount}
          />
          <Field
            label="Request Date"
            name="requestDate"
            type="date"
            value={form.requestDate}
            onChange={(value) => setForm((current) => ({ ...current, requestDate: value }))}
            required
            error={errors.requestDate}
          />
          <Field
            label="Reason"
            name="reason"
            type="text"
            value={form.reason}
            onChange={(value) => setForm((current) => ({ ...current, reason: value }))}
          />
          <button type="submit" className="button button-primary">
            Submit Request
          </button>
        </FormCard>
      </Section>
      <Section title="Withdrawal Requests">
        {withdrawalRequests.length === 0 ? (
          <p className="section-note">No withdrawal requests have been created for this group yet.</p>
        ) : (
          <Table
            headers={["Member", "Amount", "Date", "Status", "Reason"]}
            rows={withdrawalRequests.map((request) => [
              members.find((member) => member.id === request.memberId)?.fullName || "Member",
              request.requestedAmount || request.amount || request.amountRequested || 0,
              request.requestDate || request.createdAt || request.creationDate || "-",
              request.status || request.approvalStatus || "Pending",
              request.reason || "-"
            ])}
          />
        )}
      </Section>
    </Page>
  );
}
