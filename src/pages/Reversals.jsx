import React from "react";
import { Page, Section } from "../components";

export default function Reversals() {
  return (
    <Page title="Reversals" subtitle="Reverse invalid transactions with audit trails">
      <Section title="Transaction Reversals">
        <p className="section-note">
          Reversals are used to cancel incorrect transactions and keep the ledger accurate. Please verify the original entry before reversing it.
        </p>
      </Section>
    </Page>
  );
}
