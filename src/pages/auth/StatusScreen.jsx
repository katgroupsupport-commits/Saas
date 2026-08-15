import React from 'react';

/**
 * Simple status screen for loading/error states
 */
export function StatusScreen({ title, message }) {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Bachat Gat SaaS</p>
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
