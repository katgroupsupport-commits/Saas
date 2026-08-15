import React from "react";
import { Page, Section } from "../components";

export default function Corrections() {
  return (
    <Page title="Corrections" subtitle="Record transaction corrections and bookkeeping adjustments">
      <Section title="Correction Guidance">
        <p className="section-note">
          Corrections and manual adjustments should be entered as transaction reversals, adjustments, or waivers.
          Use the related menu options to access the correct workflow for each case.
        </p>
      </Section>
    </Page>
  );
}
