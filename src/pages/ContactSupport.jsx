import React from "react";
import { Page } from "../components";

export default function ContactSupport({ state, setState, actor, setNotification }) {
  return (
    <Page title="Contact" subtitle="Reach support" action={null}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
        <a
          className="primary-button"
          href="https://wa.me/7218192017"
          target="_blank"
          rel="noreferrer"
          style={{ minWidth: '220px', textAlign: 'center' }}
        >
          Contact via WhatsApp
        </a>
      </div>
    </Page>
  );
}
