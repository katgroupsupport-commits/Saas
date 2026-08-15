import React, { useMemo } from "react";
import { Page, Section, MetricGrid, Table } from "../components";

const currencyFormat = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));

export default function Reports({ state }) {
  const group = state.groups?.[0] ?? {};
  const memberSummary = useMemo(() => {
    const members = (state.members || []).filter((member) => String(member.groupId) === String(group.id));
    const totalSavings = members.reduce((sum, member) => sum + Number(member.savings || 0), 0);
    const totalMembers = members.length;
    const activeMembers = members.filter((member) => member.status?.toLowerCase() === "active").length;
    const totalLoanOutstanding = (state.loans || []).reduce((sum, loan) => sum + Number(loan.outstanding_principal || loan.principalOutstanding || 0) + Number(loan.outstanding_interest || loan.interestOutstanding || 0), 0);
    const pendingApprovals = (state.approvals || []).filter((approval) => approval.status?.toLowerCase() === "pending" || approval.approvalStatus?.toLowerCase() === "pending").length;
    const totalTransactions = (state.transactions || []).filter((transaction) => String(transaction.groupId) === String(group.id)).length;

    return {
      totalSavings,
      totalMembers,
      activeMembers,
      totalLoanOutstanding,
      pendingApprovals,
      totalTransactions
    };
  }, [state, group.id]);

  const topMembers = (state.members || [])
    .filter((member) => String(member.groupId) === String(group.id))
    .sort((a, b) => Number(b.savings || 0) - Number(a.savings || 0))
    .slice(0, 5);

  return (
    <Page title="Reports" subtitle="Performance metrics and group summary">
      <Section title="Key Metrics">
        <MetricGrid
          items={[
            { label: "Total Savings", value: currencyFormat(memberSummary.totalSavings) },
            { label: "Active Members", value: memberSummary.activeMembers },
            { label: "Total Members", value: memberSummary.totalMembers },
            { label: "Loan Outstanding", value: currencyFormat(memberSummary.totalLoanOutstanding) },
            { label: "Pending Approvals", value: memberSummary.pendingApprovals },
            { label: "Transactions", value: memberSummary.totalTransactions }
          ]}
        />
      </Section>
      <Section title="Top Savers">
        {topMembers.length === 0 ? (
          <p className="section-note">No savings data is available yet.</p>
        ) : (
          <Table
            headers={["Member", "Savings", "Status"]}
            rows={topMembers.map((member) => [
              member.fullName || member.name || member.username || "Member",
              currencyFormat(member.savings || 0),
              member.status || "-"
            ])}
          />
        )}
      </Section>
      <Section title="Recent Transactions">
        {(state.transactions || []).filter((transaction) => String(transaction.groupId) === String(group.id)).slice(0, 10).length === 0 ? (
          <p className="section-note">There are no recent transactions yet.</p>
        ) : (
          <Table
            headers={["Member", "Type", "Amount", "Date", "Status"]}
            rows={(state.transactions || [])
              .filter((transaction) => String(transaction.groupId) === String(group.id))
              .slice(0, 10)
              .map((transaction) => [
                (state.members || []).find((member) => member.id === transaction.memberId)?.fullName || "Member",
                transaction.transactionType,
                currencyFormat(transaction.amount || 0),
                transaction.transactionDate || "-",
                transaction.approvalStatus || transaction.status || "Pending"
              ])}
          />
        )}
      </Section>
    </Page>
  );
}
