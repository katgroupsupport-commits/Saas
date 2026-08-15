import React from "react";
import { Page, Section } from "../components";

export default function Adjustments() {
  return (
    <Page title="Adjustments" subtitle="Manage adjustment entries for member balances">
      <Section title="Adjustment Notes">
        <p className="section-note">
          Adjustment entries are useful for correcting allocation values, sharing balances, or capturing bonus transfers.
          These entries are handled by the accounting team and should be reviewed before posting.
        </p>
      </Section>
    </Page>
  );
}
