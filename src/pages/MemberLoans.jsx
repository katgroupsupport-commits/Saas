import React from "react";
import { Page, Section } from "../components";
import { getCurrentMember, loanBelongsToMember } from "../services/financeFields";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function MemberLoans({ state, actor, setConfirmDialog, setNotification }) {
  const member = getCurrentMember(state, actor);
  const memberLoans = state.loans.filter((loan) => loanBelongsToMember(loan, member));
  return (
    <Page title="My Loans" subtitle="Your active and past loans" action={null}>
      {memberLoans.length === 0 ? (
        <Section title="No loans">
          <p className="section-note">You don't have any active loans. Once approved, your loans will appear here.</p>
        </Section>
      ) : (
        <Section title="Your Loans">
          <div className="data-grid">
            {memberLoans.map((loan) => (
              <article className="entity-card" key={loan.id}>
                <h3>{loan.reason}</h3>
                <p>Amount: {currency.format(loan.amount)}</p>
                <p>Outstanding: {currency.format(
                  Number(loan.principalOutstanding || 0)
                  + Number(loan.interestOutstanding || 0)
                  + Number(loan.penaltyOutstanding || 0)
                )}</p>
                <p>Status: {loan.status}</p>
              </article>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}

export default MemberLoans;
