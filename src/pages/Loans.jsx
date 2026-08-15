import React, { useMemo, useState } from "react";
import { Page, Section, FormCard, Field, SelectField, Table } from "../components";
import { repository } from "../services/repository";
import { loanSchema, validate } from "../services/validation";
import { getCurrentMember } from "../services/financeFields";

function serializeError(error) {
  return error?.message || String(error);
}

export default function Loans({ state, setState, actor, setNotification }) {
  const group = state.groups?.[0] ?? {};
  const members = (state.members || []).filter((member) => String(member.groupId) === String(group.id));
  const currentMember = getCurrentMember(state, actor);
  const defaultMember = currentMember || members[0] || {};

  const [form, setForm] = useState({
    memberId: String(defaultMember.id || ""),
    amount: "",
    durationMonths: "6",
    rate: "",
    startDate: new Date().toISOString().slice(0, 10),
    reason: ""
  });
  const [errors, setErrors] = useState({});

  const loanRequests = useMemo(
    () => (state.loans || []).filter((loan) => String(loan.groupId) === String(group.id)),
    [state.loans, group.id]
  );

  const onSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      memberId: form.memberId,
      amount: form.amount,
      reason: form.reason,
      rate: form.rate,
      durationMonths: form.durationMonths,
      startDate: form.startDate
    };
    const result = validate(loanSchema, payload);
    if (Object.keys(result.errors).length) {
      setErrors(result.errors);
      return;
    }

    try {
      const created = await repository.createLoan({
        groupId: group.id,
        memberId: Number(result.data.memberId),
        amount: Number(result.data.amount),
        reason: result.data.reason,
        rate: Number(result.data.rate || 0),
        durationMonths: Number(result.data.durationMonths || 0),
        startDate: result.data.startDate
      });
      setState((current) => ({
        ...current,
        loans: [created, ...(current.loans || [])]
      }));
      setNotification({ type: "success", message: "Loan request created" });
      setForm({
        memberId: form.memberId,
        amount: "",
        durationMonths: "6",
        rate: "",
        startDate: new Date().toISOString().slice(0, 10),
        reason: ""
      });
      setErrors({});
    } catch (error) {
      setNotification({ type: "error", message: "Unable to submit loan request", details: serializeError(error) });
    }
  };

  return (
    <Page title="Loans" subtitle="Request and track member loan applications">
      <Section title="New Loan Request">
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
            label="Loan Amount"
            name="amount"
            type="number"
            value={form.amount}
            onChange={(value) => setForm((current) => ({ ...current, amount: value }))}
            required
            error={errors.amount}
          />
          <Field
            label="Rate (%)"
            name="rate"
            type="number"
            value={form.rate}
            onChange={(value) => setForm((current) => ({ ...current, rate: value }))}
          />
          <Field
            label="Duration (months)"
            name="durationMonths"
            type="number"
            value={form.durationMonths}
            onChange={(value) => setForm((current) => ({ ...current, durationMonths: value }))}
          />
          <Field
            label="Start Date"
            name="startDate"
            type="date"
            value={form.startDate}
            onChange={(value) => setForm((current) => ({ ...current, startDate: value }))}
            required
            error={errors.startDate}
          />
          <Field
            label="Reason"
            name="reason"
            type="text"
            value={form.reason}
            onChange={(value) => setForm((current) => ({ ...current, reason: value }))}
          />
          <button type="submit" className="button button-primary">
            Request Loan
          </button>
        </FormCard>
      </Section>
      <Section title="Loan Requests and Balances">
        {loanRequests.length === 0 ? (
          <p className="section-note">No loans or requests are available for this group.</p>
        ) : (
          <Table
            headers={["Member", "Amount", "Outstanding", "Start Date", "Status"]}
            rows={loanRequests.map((loan) => [
              members.find((member) => member.id === loan.memberId)?.fullName || "Member",
              loan.amount || loan.requestedAmount || 0,
              loan.outstanding_principal || loan.principalOutstanding || 0,
              loan.startDate || loan.distributionDate || loan.requestDate || "-",
              loan.status || loan.approvalStatus || "Pending"
            ])}
          />
        )}
      </Section>
    </Page>
  );
}
