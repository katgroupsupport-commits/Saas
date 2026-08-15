import React from "react";
import { Page, Section } from "../components";

export default function ProductOwnerSupport() {
  return (
    <Page title="Product Owner" subtitle="Manage product owner support and group-level actions">
      <Section title="Overview">
        <p className="section-note">
          This page is reserved for the product owner and administrators to manage high-level group settings, approve data migrations, and review system notifications.
        </p>
      </Section>
    </Page>
  );
}
