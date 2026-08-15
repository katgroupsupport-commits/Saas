import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PublicPage, CardGrid, PublicSection } from './PublicPage.jsx';

/**
 * Landing page
 */
export function LandingPage() {
  return (
    <PublicPage title="Bachat Gat SaaS" subtitle="" showFooter={false}>
      <section className="public-hero simple-login-hero">
        <div>
          <p className="eyebrow">Bachat Gat finance platform</p>
          <h1>Bachat Gat</h1>
          <div className="button-row">
            <NavLink className="primary-button public-button" to="/login">
              Login
            </NavLink>
            <NavLink className="secondary-button" to="/guide">
              User Guide
            </NavLink>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}

/**
 * About page
 */
export function AboutPage() {
  return (
    <PublicPage title="About" subtitle="A finance workflow platform built for Indian saving groups.">
      <CardGrid
        items={[
          {
            title: 'Vision',
            body: 'Bring professional-grade financial management to every community saving group.'
          },
          {
            title: 'Mission',
            body: 'Make savings, loans, approvals, and reports simple for village and women self-help groups.'
          },
          {
            title: 'Why',
            body: 'Manual registers are hard to audit, easy to lose, and difficult for members to verify.'
          }
        ]}
      />
    </PublicPage>
  );
}

/**
 * Pricing page
 */
export function PricingPage() {
  const plans = [
    ['Free Trial', 'Limited members, basic reports, limited storage'],
    ['Monthly', 'Member tracking, collections, reports, one collector'],
    ['Quarterly', 'Loan module, approvals, exports, more storage'],
    ['Half-Yearly', 'Advanced reports, renewal reminders, more collectors'],
    ['Yearly', 'Best value with future AI features and priority support']
  ];

  return (
    <PublicPage
      title="Pricing"
      subtitle="Plans control members, reports, storage, collectors, approvals, and future AI features."
    >
      <CardGrid items={plans.map(([title, body]) => ({ title, body }))} />
      <PublicSection
        title="Subscription rules"
        items={[
          'Razorpay subscription integration ready',
          'Upgrade and downgrade flow planned',
          'Expired groups become read-only',
          'Reports remain visible after expiry'
        ]}
      />
    </PublicPage>
  );
}

/**
 * Contact page
 */
export function ContactPage() {
  const [sent, setSent] = React.useState(false);
  const [values, setValues] = React.useState({
    name: '',
    email: '',
    mobile: '',
    subject: '',
    message: ''
  });

  return (
    <PublicPage
      title="Contact"
      subtitle="Talk to us about your saving group, SHG, or community finance workflow."
    >
      <section className="section">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setSent(true);
          }}
        >
          <Field
            label="Name"
            value={values.name}
            onChange={(value) => setValues({ ...values, name: value })}
          />
          <Field
            label="Email"
            value={values.email}
            onChange={(value) => setValues({ ...values, email: value })}
          />
          <Field
            label="Mobile number"
            value={values.mobile}
            onChange={(value) => setValues({ ...values, mobile: value })}
          />
          <Field
            label="Subject"
            value={values.subject}
            onChange={(value) => setValues({ ...values, subject: value })}
          />
          <Field
            label="Message"
            value={values.message}
            onChange={(value) => setValues({ ...values, message: value })}
          />
          <button className="primary-button" type="submit">
            Send message
          </button>
        </form>
        {sent && (
          <p className="section-note">
            Message captured. Email sending can be connected through the secure server.
          </p>
        )}
      </section>
      <PublicSection
        title="Support"
        items={[
          'support@bachatgat.example',
          '+91 90000 00000',
          'Business hours: 10 AM to 6 PM IST'
        ]}
      />
    </PublicPage>
  );
}

/**
 * Privacy & Terms page
 */
export function PolicyPage({ type }) {
  const privacy = [
    'Data collection',
    'User privacy',
    'Authentication security',
    'Payment security',
    'Data storage',
    'Cookies usage',
    'Third-party integrations',
    'User rights',
    'Data deletion request',
    'Account deletion',
    'Legal compliance'
  ];
  const terms = [
    'Subscription policies',
    'Refund policy',
    'User responsibilities',
    'Data usage rules',
    'Platform limitations',
    'Account suspension rules',
    'Group ownership rules',
    'Payment terms',
    'Legal disclaimer'
  ];

  return (
    <PublicPage
      title={type === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
      subtitle="Production legal sections are structured and ready for counsel review."
    >
      <PublicSection title="Sections" items={type === 'privacy' ? privacy : terms} />
    </PublicPage>
  );
}

/**
 * Simple Field component for form inputs
 */
function Field({ label, value, onChange, type = 'text', error, required = false, disabled = false, autoComplete }) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? ' *' : ' (Optional)'}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
