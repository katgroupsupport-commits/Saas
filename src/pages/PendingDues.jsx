import React, { useMemo } from "react";
import { Page, Section, Table } from "../components";
import { calculatePendingDues, getCurrentMember } from "../services/financeFields";

export default function PendingDues({ state, actor }) {
  const dues = useMemo(() => calculatePendingDues(state, actor, false), [state, actor]);
  const member = getCurrentMember(state, actor);
  const filtered = dues.filter((due) => member ? due.memberId === member.id : true);

  return (
    <Page title="Pending Dues" subtitle="See member dues and next amounts to collect">
      <Section title="Pending Dues">
        {filtered.length === 0 ? (
          <p className="section-note">There are no pending dues to display right now.</p>
        ) : (
          <Table
            headers={["Member", "Due Type", "Amount", "Due Date"]}
            rows={filtered.map((due) => [
              due.memberName || due.memberId || "Member",
              due.dueType || due.type || "Due",
              due.amount || due.totalDue || "-",
              due.dueDate || due.nextDueDate || "-"
            ])}
          />
        )}
      </Section>
    </Page>
  );
}
