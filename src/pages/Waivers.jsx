import React from "react";
import { Page, Section } from "../components";

export default function Waivers() {
  return (
    <Page title="Waivers" subtitle="Record waived dues or charges for members">
      <Section title="Waivers">
        <p className="section-note">
          Waivers are used when penalties or charges are waived for members. Such entries should be approved by group leadership.
        </p>
      </Section>
    </Page>
  );
}
