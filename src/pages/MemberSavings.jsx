import React from "react";
import { Page } from "../components";
import { getCurrentMember, getDashboardPeriod } from "../services/financeFields";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function MemberSavings({ state, actor, setConfirmDialog, setNotification }) {
  const member = getCurrentMember(state, actor) ?? { fullName: "Member", savings: 0, shares: 0 };
  const period = getDashboardPeriod(state);
  const summary = state.rpcMemberFinanceSummaries?.[String(member.id)] || null;
  const savings = Number(summary?.savings ?? member.savings ?? 0);
  const shareAmount = Number(summary?.share_amount ?? summary?.shareAmount ?? 0);
  const sharePercent = Number(summary?.share_percent ?? summary?.sharePercent ?? 0);

  return (
    <Page title="My Savings" subtitle="Your savings and share information" action={null}>
      <div className="data-grid">
        <article className="entity-card">
          <h3>Total Savings</h3>
          <p className="metric-value">{currency.format(savings)}</p>
        </article>
        <article className="entity-card">
          <h3>Share Amount</h3>
          <p className="metric-value">{currency.format(shareAmount)}</p>
          <p className="section-note">{sharePercent ?? 0}% of active-period distribution</p>
        </article>
      </div>
    </Page>
  );
}

export default MemberSavings;
