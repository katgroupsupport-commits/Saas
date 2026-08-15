import React, { useMemo } from "react";
import { Page, Section, Table } from "../components";

export default function Approvals({ state }) {
  const approvals = useMemo(
    () => (state.approvals || []).filter((approval) => approval.groupId === state.groups?.[0]?.id),
    [state.approvals, state.groups]
  );

  return (
    <Page title="Approvals" subtitle="Review and manage pending group approvals">
      <Section title="Approval Queue">
        {approvals.length === 0 ? (
          <p className="section-note">No approval requests are pending at the moment.</p>
        ) : (
          <Table
            headers={["Reference", "Type", "Member", "Amount", "Status"]}
            rows={approvals.map((approval) => [
              approval.referenceId || approval.approvalBatchId || "-",
              approval.referenceType || approval.transactionType || "Approval",
              approval.requesterName || approval.approverName || "-",
              approval.amount || approval.approvalAmount || "-",
              approval.approvalStatus || approval.status || "Pending"
            ])}
          />
        )}
      </Section>
    </Page>
  );
}
