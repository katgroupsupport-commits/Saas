import React, { useMemo, useState } from "react";
import { Page, Section, FormCard, Field, SelectField, Table } from "../components";
import { repository } from "../services/repository";
import { transactionSchema, validate } from "../services/validation";
import { getCurrentMember } from "../services/financeFields";

const transactionTypes = [
  "Savings Collection",
  "Loan Repayment",
  "Penalty Collection",
  "Other Charge"
];

function serializeError(error) {
  return error?.message || String(error);
}

export default function Transactions({ state, setState, actor, setNotification }) {
  const group = state.groups?.[0] ?? {};
  const members = (state.members || []).filter((member) => String(member.groupId) === String(group.id));
  const currentMember = getCurrentMember(state, actor);
  const defaultMember = currentMember || members[0] || {};
  const [form, setForm] = useState({
    memberId: String(defaultMember.id || ""),
    amount: "",
    transactionDate: new Date().toISOString().slice(0, 10),
    transactionType: transactionTypes[0],
    remarks: ""
  });
  const [errors, setErrors] = useState({});

  const recentTransactions = useMemo(
    () => (state.transactions || []).filter((transaction) => String(transaction.groupId) === String(group.id)).slice(0, 20),
    [state.transactions, group.id]
  );

  const onSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      memberId: form.memberId,
      amount: form.amount,
      transactionDate: form.transactionDate,
      transactionType: form.transactionType
    };
    const result = validate(transactionSchema, payload);
    if (Object.keys(result.errors).length) {
      setErrors(result.errors);
      return;
    }

    try {
      const created = await repository.createTransaction({
        groupId: group.id,
        memberId: Number(result.data.memberId),
        amount: Number(result.data.amount),
        transactionDate: result.data.transactionDate,
        transactionType: result.data.transactionType,
        remarks: form.remarks
      });
      setState((current) => ({
        ...current,
        transactions: [created, ...(current.transactions || [])]
      }));
      setNotification({ type: "success", message: "Transaction saved successfully" });
      setForm({
        memberId: form.memberId,
        amount: "",
        transactionDate: new Date().toISOString().slice(0, 10),
        transactionType: transactionTypes[0],
        remarks: ""
      });
      setErrors({});
    } catch (error) {
      setNotification({ type: "error", message: "Unable to save transaction", details: serializeError(error) });
    }
  };

  return (
    <Page title="Transactions" subtitle="Create savings, repayment and charge entries for your group">
      <Section title="New Transaction">
        <FormCard onSubmit={onSubmit}>
          <SelectField
            label="Member"
            name="memberId"
            value={String(form.memberId)}
            onChange={(value) => setForm((current) => ({ ...current, memberId: value }))}
            options={members.map((member) => ({ label: member.fullName || member.name || member.username || "Unnamed", value: String(member.id) }))}
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
            label="Date"
            name="transactionDate"
            type="date"
            value={form.transactionDate}
            onChange={(value) => setForm((current) => ({ ...current, transactionDate: value }))}
            required
            error={errors.transactionDate}
          />
          <SelectField
            label="Transaction Type"
            name="transactionType"
            value={form.transactionType}
            onChange={(value) => setForm((current) => ({ ...current, transactionType: value }))}
            options={transactionTypes.map((type) => ({ label: type, value: type }))}
            required
            error={errors.transactionType}
          />
          <Field
            label="Remarks"
            name="remarks"
            type="text"
            value={form.remarks}
            onChange={(value) => setForm((current) => ({ ...current, remarks: value }))}
          />
          <button type="submit" className="button button-primary">
            Save Transaction
          </button>
        </FormCard>
      </Section>
      <Section title="Recent Transactions">
        {recentTransactions.length === 0 ? (
          <p className="section-note">There are no transactions yet for this group.</p>
        ) : (
          <Table
            headers={["Member", "Type", "Amount", "Date", "Status"]}
            rows={recentTransactions.map((transaction) => [
              members.find((member) => member.id === transaction.memberId)?.fullName || "Member",
              transaction.transactionType,
              transaction.amount,
              transaction.transactionDate,
              transaction.approvalStatus || transaction.status || "Pending"
            ])}
          />
        )}
      </Section>
    </Page>
  );
}
