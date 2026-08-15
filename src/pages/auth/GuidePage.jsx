import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PublicPage } from './PublicPage.jsx';

/**
 * User guide page with process guide and Q&A
 * Can be embedded in the app (insideApp=true) or shown as a public page
 */
export function GuidePage({ insideApp = false }) {
  const [showQa, setShowQa] = useState(false);

  function downloadGuidePdf() {
    const url = `${window.location.origin}/user-guide.pdf`;
    const isMobileDownload = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (isMobileDownload) {
      const opened = window.open(url, '_blank', 'noopener');
      if (!opened) window.location.href = url;
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bachat-gat-user-guide.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  const content = showQa ? <QaGuide /> : <GuideContent />;
  const guideActions = (
    <div className="button-row">
      <button
        type="button"
        className="secondary-button"
        onClick={() => setShowQa((value) => !value)}
      >
        {showQa ? 'Show Process Guide' : 'Show Q&A'}
      </button>
      <button type="button" className="secondary-button" onClick={downloadGuidePdf}>
        Download PDF
      </button>
    </div>
  );

  if (insideApp) {
    // Use Page component for in-app guide
    return (
      <div>
        <h1>User Guide</h1>
        <p>Simple visual steps, common questions and operating rules</p>
        {guideActions}
        {content}
      </div>
    );
  }

  return (
    <PublicPage title="User Guide" subtitle="Simple visual steps for admins, approvers and members.">
      <div className="button-row">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowQa((value) => !value)}
        >
          {showQa ? 'Show Process Guide' : 'Show Q&A'}
        </button>
        <button
          type="button"
          className="primary-button public-button"
          onClick={downloadGuidePdf}
        >
          Download PDF
        </button>
        <NavLink className="secondary-button" to="/login">
          Login
        </NavLink>
      </div>
      {content}
    </PublicPage>
  );
}

/**
 * Q&A guide section
 */
function QaGuide() {
  const questions = [
    [
      'Where should I start after login?',
      'First create or select a group, add members, set group setup, set approvers/admins, open the current period, then start entering transactions.'
    ],
    [
      'What is group setup?',
      'Group setup stores common rules like monthly saving, interest rate, penalty after due date, loan limit, loan tenure and repayment due date.'
    ],
    [
      'What is member setup?',
      'Member setup is used only when one member has different saving amount, loan limit, interest rate or loan tenure from the group default. Email, mobile and profile details are optional.'
    ],
    [
      'What is role setup?',
      'Role setup decides who must approve setup changes, transactions, loans, withdrawals and corrections and who can manage setup and operations before they affect dashboards.'
    ],
    [
      'Why should I set at least one admin?',
      'An active admin is needed to manage setup, members, operations and approvals. The app blocks setup changes if no active admin remains.'
    ],
    [
      'How do members login?',
      'Members can login only when their email is added. Email is optional, but for member app access add the member email and ask them to register with the same email.'
    ],
    [
      'Can I add old notebook data?',
      'Yes. Use the calculator for old data. Enter migration date and old balances, calculate per-member share, then post that share as Saving from Transactions.'
    ],
    [
      'Should I use legacy data setup for a new group?',
      'No. If the group is new and has no previous balances, skip this and start with period setup and transactions.'
    ],
    [
      'What does old saving/share mean?',
      'It is the member\'s old saved amount or calculated share from old records. Post it as a completed Saving transaction so dashboards include it.'
    ],
    [
      'What does old pending loan mean?',
      'It means old loan principal still to be paid by the member. Use it while calculating the legacy share and future dues.'
    ],
    ['When should I open a period?', 'Open the month where entries are allowed. Transactions are expected to be posted only in the open period.'],
    [
      'Why is my transaction blocked?',
      'Usually because no period is open, the date is outside the open period, required setup is missing, or the record is not yet saved online.'
    ],
    [
      'How does transaction split work?',
      'When you enter collected amount, the app splits it into savings, interest, penalty, principal and excess based on dues. You can edit splits, but total cannot exceed collected amount.'
    ],
    [
      'What is excess amount?',
      'Excess is the remaining amount after other split fields. It cannot be negative and it should not make total split greater than collected amount.'
    ],
    [
      'Why are pending approvals not shown in dashboard totals?',
      'Pending entries are not final. Dashboard values update only after approval is Completed.'
    ],
    [
      'Who can approve requests?',
      'Configured approvers can approve assigned requests. Group admins can also view group approval requests and see with whom they are pending.'
    ],
    [
      'What happens when a member is added with approvers configured?',
      'The member is shown as pending/inactive until all required approvals are completed. After approval, the member becomes active.'
    ],
    [
      'How does loan request work?',
      'A member or admin creates a loan request. If approvals are configured, the loan becomes active only after approval.'
    ],
    [
      'How is minimum EMI principal decided?',
      'Minimum principal due is based on loan tenure. Original loan principal is divided by tenure months, capped by remaining outstanding principal.'
    ],
    [
      'What if loan tenure is blank or zero?',
      'Then there is no minimum principal restriction. The member can still pay principal, but the app will not force a minimum principal due.'
    ],
    [
      'Does member loan tenure override group tenure?',
      'Yes. If member tenure is set, it overrides group tenure for that member.'
    ],
    [
      'How is EMI cycle decided?',
      'The repayment due date creates the EMI cycle. For example, due date 5 July means the cycle runs from 6 June to 5 July.'
    ],
    [
      'If a member pays before due date, will due become zero?',
      'Yes, if the full saving, principal, interest and penalty due for that EMI cycle are paid before the due date, next due shows zero for that cycle.'
    ],
    [
      'When is penalty added?',
      'Penalty is added only after the due date passes and the EMI cycle still has unpaid due.'
    ],
    [
      'Can penalty be waived?',
      'Yes. Go to Waivers, select Penalty, enter the waiver amount and reason. If approvers are set, waiver affects dues only after approval.'
    ],
    [
      'Can interest be waived?',
      'Yes. Use Waivers and select Interest. Waived interest reduces receivable interest and is not treated as group gain.'
    ],
    ['What is withdrawal?', 'Withdrawal is money taken out from a member\'s savings/share. Members can request it; admins can also create requests depending on role.'],
    [
      'What if I entered a wrong transaction?',
      'Use Adjustment for a partial correction. Use Reversal when the full transaction is wrong or duplicated.'
    ],
    [
      'Why not edit old approved transactions directly?',
      'Approved records are audit records. Corrections are posted separately so the history remains clear.'
    ],
    [
      'What is group gain?',
      'Group gain is income such as interest, penalty and other income after completion. It can be distributed to members based on group rules.'
    ],
    [
      'What is member share?',
      'Member share is the member\'s savings plus distributed gain minus expenses, withdrawals and outstanding loan-related dues.'
    ],
    [
      'Why does a dashboard value change after approval?',
      'Because the app counts only Completed financial entries. Approval completion moves the entry into final dashboard totals.'
    ],
    [
      'How do I generate report?',
      'Open Reports, choose start date and end date, click Generate Report, then use Copy / Share report to send the readable summary.'
    ],
    [
      'Why is my report empty for a member?',
      'If the member had no transactions or loans in the selected date range, that member may not appear in the range report.'
    ],
    [
      'What should I do before deploying or refreshing?',
      'Save setup changes, confirm approvals if required, and make sure the latest database updates are applied when new fields are added.'
    ],
    [
      'Why did approver disappear after refresh earlier?',
      'That happened when approvers were not persisted to the database. After the persistence fix and migration, saved approvers should load after refresh.'
    ],
    [
      'What should I check if a payment value looks wrong?',
      'Check whether the period is correct, approval is completed, transaction split total matches collected amount, and any correction or waiver has been approved.'
    ],
    [
      'Can I use the app without approvers?',
      'Yes. If no approvers are configured, entries can complete immediately. For safer workflow, configure approvers.'
    ],
    [
      'What is the safest daily process?',
      'Open period, collect money, verify split, save transaction, approve if required, check dashboard, and review pending dues.'
    ],
    [
      'Where can members see their own dues?',
      'Members can use their dashboard, pending dues, loans and notifications to see savings due, EMI due, due date and loan details.'
    ]
  ];

  return (
    <div className="guide-content">
      <section className="section">
        <h3>Questions & Answers</h3>
        <div className="guide-screen-grid">
          {questions.map(([question, answer]) => (
            <article className="guide-screen" key={question}>
              <div className="guide-screen-top">
                <span />
                <span />
                <span />
              </div>
              <strong>{question}</strong>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Process guide with step-by-step setup and common flows
 */
function GuideContent() {
  const setupJourney = [
    {
      title: '1. Create or select group',
      text: 'Start with one group. Confirm group name, monthly saving, interest rate, loan limit, loan tenure and EMI due date. If approvers are added, check the status at the bottom and wait until setup is Completed.',
      path: '/setup/group',
      action: 'Open group setup'
    },
    {
      title: '2. Add members',
      text: 'Add every member with correct name and username. Email and mobile are optional. Add email only when the member needs login access. If approval is enabled, member is usable only after status becomes Completed/Active.',
      path: '/members',
      action: 'Add members'
    },
    {
      title: '3. Set approvers and admins',
      text: 'Choose approvers for loans, transactions and corrections. Choose admins who can manage setup and operations. Save and confirm that setup is completed before depending on the workflow.',
      path: '/setup/roles',
      action: 'Set roles'
    },
    {
      title: '4. Open the period',
      text: 'Open the month where entries are allowed. Transactions should be posted only in the open period. If period changes need approval, check status and continue only after Completed.',
      path: '/setup/periods',
      action: 'Open period'
    },
    {
      title: '5. Calculate old legacy share',
      text: 'If old notebook data exists, use the calculator with migration date, remaining account money, outstanding loan, savings and member count. Check how much amount should be shared per member. Then go to Transactions, select each member, enter that calculated share as Saving, save it, and use only Completed transactions in dashboards.',
      path: '/setup/calculator',
      action: 'Calculate legacy share'
    },
    {
      title: '6. Start collections',
      text: 'Go to Transactions, select member, enter collected amount, check the split, then save. If approvers are configured, check the transaction status at the bottom/list. It affects dashboard only after Completed.',
      path: '/operations/transactions',
      action: 'Create transaction'
    },
    {
      title: '7. Correct mistakes if any',
      text: 'If any saved entry is wrong, use Corrections. Use Adjustment for a small split/amount difference and Reversal for a fully wrong or duplicate transaction. Correction also counts only after Completed approval status.',
      path: '/corrections',
      action: 'Open corrections'
    },
    {
      title: '8. Handle loans and withdrawals',
      text: 'Members can request loans or withdrawals. Admins and approvers can review, approve and track EMI dues. Loan and withdrawal requests should be checked until status becomes Completed/Active.',
      path: '/operations/loans',
      action: 'Open loans'
    },
    {
      title: '9. Review reports',
      text: 'Generate reports by date range, copy/share the readable summary, and use audit/corrections for mistakes. Reports and dashboards should be verified from Completed entries only.',
      path: '/reports',
      action: 'Generate report'
    }
  ];

  const flows = [
    ['Register', 'Create group', 'Add members', 'Open period'],
    ['Group setup', 'Member setup', 'Loan setup', 'Role setup'],
    ['Enter legacy values', 'Calculate per member share', 'Post as saving transaction', 'Approve to Completed'],
    ['Enter savings', 'System splits amount', 'Approver checks', 'Completed updates dashboard'],
    ['Member asks loan', 'Admin/approver approves', 'Loan active', 'Repay monthly'],
    ['Wrong entry', 'Use correction', 'Adjustment / Reverse', 'Completed audit saved']
  ];

  const fullFlow = [
    'Register',
    'Login',
    'Create group',
    'Add members',
    'Group setup',
    'Member setup',
    'Financial setup',
    'Calculate legacy share if old data',
    'Transactions',
    'Correction if any',
    'Approval flow',
    'Loan request',
    'Loan approval',
    'Withdrawal request',
    'Withdrawal approval',
    'Adjustment or reversal',
    'Correction approval',
    'Dashboards and reports'
  ];

  const screens = [
    ['Login', 'Enter email / username and password. Press Login.'],
    ['Group Dashboard', 'See this month collection, savings, loans and balance.'],
    ['Transactions', 'Select member, amount and date. Check split before save.'],
    ['Loans', 'Member requests loan. Approval is required before loan is active.'],
    ['Approvals', 'Approver presses Approve or Reject after checking details.'],
    ['Reports & Audit', 'Download reports and check full history.']
  ];

  return (
    <div className="guide-content">
      <section className="section">
        <h3>Step-by-step setup guide</h3>
        <p className="section-note">
          Follow these steps from top to bottom. Each button opens the exact screen needed for that step.
        </p>
        <div className="guide-screen-grid">
          {setupJourney.map((step) => (
            <article className="guide-screen" key={step.title}>
              <div className="guide-screen-top">
                <span />
                <span />
                <span />
              </div>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
              <NavLink className="secondary-button" to={step.path}>
                {step.action}
              </NavLink>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Complete Flow</h3>
        <div className="guide-flow guide-flow-long">
          {fullFlow.map((step, index) => (
            <GuideStep key={step} number={index + 1} label={step} />
          ))}
        </div>
        <p className="section-note">
          Final balances are shown only after entries are completed. Pending approvals do not change dashboard totals.
        </p>
      </section>

      <section className="section">
        <h3>Start Here</h3>
        <div className="guide-flow">
          {flows[0].map((step, index) => (
            <GuideStep key={step} number={index + 1} label={step} />
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Daily Money Flow</h3>
        <div className="guide-flow">
          {flows[3].map((step, index) => (
            <GuideStep key={step} number={index + 1} label={step} />
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Setup Flow</h3>
        <div className="guide-flow">
          {flows[1].map((step, index) => (
            <GuideStep key={step} number={index + 1} label={step} />
          ))}
        </div>
        <div className="guide-symbol-row guide-setup-notes">
          <span>Group setup: default monthly saving, interest rate, penalty, loan limit</span>
          <span>Member setup: use only when one member has different saving or loan limit</span>
          <span>Financial setup: repayment due date means monthly payment date</span>
          <span>Role setup: assign approvers and admins from the same screen</span>
        </div>
        <div className="guide-screen-grid">
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Interest rate</strong>
            <p>Enter monthly percent. Example: 2 means 2% per month.</p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Penalty</strong>
            <p>Use when payment is late. Keep blank or 0 if no penalty.</p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Open period</strong>
            <p>Open only the month where entries are allowed.</p>
          </article>
        </div>
      </section>

      <section className="section">
        <h3>Main Features</h3>
        <div className="guide-screen-grid">
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Member login</strong>
            <p>
              Members register with the same email used while adding them. Then they can see their groups and
              dashboards.
            </p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Create groups</strong>
            <p>Any logged-in user can create a new group and becomes that group admin.</p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Active / inactive</strong>
            <p>Deactivate members who leave. They do not get future gains after exit.</p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Role restriction</strong>
            <p>Members get view access. Admins manage setup, members, transactions and loans.</p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Wrong entries</strong>
            <p>Use adjustment for partial correction. Use reversal for a fully wrong entry.</p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Approvals</strong>
            <p>
              If approvers are defined, setup, transactions, loans, withdrawals and corrections wait for approval. Count
              them only after status is Completed.
            </p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Withdrawal</strong>
            <p>Members request for themselves. Admin can request for any member. Approval is required if approvers exist.</p>
          </article>
        </div>
      </section>

      <section className="section">
        <h3>Group Gain Sharing</h3>
        <div className="guide-screen-grid">
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Loan interest</strong>
            <p>Interest is shared by old share amount and time. New saving after loan date is not counted for that loan.</p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Penalty</strong>
            <p>Penalty gain is shared by member share weight, not by plain equal count.</p>
          </article>
          <article className="guide-screen">
            <div className="guide-screen-top">
              <span />
              <span />
              <span />
            </div>
            <strong>Other income</strong>
            <p>Other income is shared by member share weight unless group policy changes later.</p>
          </article>
        </div>
        <div className="guide-symbol-row guide-setup-notes">
          <span>Loan given on 10 Jun: only members active on 10 Jun are counted for that loan interest</span>
          <span>If B had 10000 then withdrew money, only the remaining old share is counted</span>
          <span>A new member added after loan date will not get share from that loan interest</span>
          <span>This rule continues until that loan is fully repaid</span>
        </div>
      </section>

      <section className="section">
        <h3>Legacy Data Setup</h3>
        <div className="guide-flow">
          {flows[2].map((step, index) => (
            <GuideStep key={step} number={index + 1} label={step} />
          ))}
        </div>
        <div className="guide-symbol-row guide-setup-notes">
          <span>Use the calculator when shifting old notebook/register balance to this app</span>
          <span>Select the migration date and enter old account balance, loans, savings and member count</span>
          <span>Use the calculated per-member share as Saving in the Transactions screen</span>
          <span>
            If approvers are configured, dashboard should be checked only after those legacy saving transactions are
            Completed
          </span>
        </div>
      </section>

      <section className="section">
        <h3>Loan Flow</h3>
        <div className="guide-flow">
          {flows[4].map((step, index) => (
            <GuideStep key={step} number={index + 1} label={step} />
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Wrong Entry Flow</h3>
        <div className="guide-flow">
          {flows[5].map((step, index) => (
            <GuideStep key={step} number={index + 1} label={step} />
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Screen Guide</h3>
        <div className="guide-screen-grid">
          {screens.map(([title, text]) => (
            <article className="guide-screen" key={title}>
              <div className="guide-screen-top">
                <span />
                <span />
                <span />
              </div>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <GuideQaSection />

      <section className="section">
        <h3>Remember</h3>
        <div className="guide-symbol-row">
          <span>Save money</span>
          <span>Check loan</span>
          <span>Approve safely</span>
          <span>Use only Completed records for dashboards and reports</span>
        </div>
      </section>
    </div>
  );
}

/**
 * Q&A section for guide content
 */
function GuideQaSection() {
  const questions = [
    ['How do I know which screen to open first?', 'Use the step-by-step setup guide at the top of this page. Start with group setup, then members, approvals, period, optional legacy calculator and transactions.'],
    ['Why are there many setup screens?', 'Each setup screen controls one area: group rules, member overrides, approvers, admins, loan settings, periods and share calculator.'],
    ['Can I skip legacy data setup?', 'Yes. Skip it if your group is new or you do not want to bring old balances into the app.'],
    ['How should I add old legacy savings?', 'Use the calculator first. Enter migration date and old balances, calculate the per-member share, then post that amount as Saving from the Transactions screen for each member.'],
    ['When will old legacy savings affect dashboards?', 'Only after the saving transaction is Completed. If approvers are configured, wait for approval before checking dashboard or reports.'],
    ['Can I change setup later?', 'Yes. Setup changes can be saved later. If approvers are configured, changes may wait for approval before becoming final.'],
    ['How do I know a request is pending?', 'Pending screens show status and pending approver. The approval page also shows who needs to approve.'],
    ['Why does the app show both Marathi and English labels?', 'It helps local users understand field names while keeping finance terms clear for reports and support.'],
    ['What should I do when a member leaves?', 'Mark the member inactive or set exit details. They should not receive future gains after exit.'],
    ['Can a member have different saving amount?', 'Yes. Use Member Setup to set a custom monthly saving for that member.'],
    ['Can a member have different loan tenure?', 'Yes. Member loan tenure overrides group loan tenure.'],
    ['What does loan limit mean?', 'Loan limit controls the maximum loan a member can request or receive, depending on group and member setup.'],
    ['What is repayment due date?', 'It is the monthly EMI due date. The app uses it to decide EMI cycle, due date and late penalty.'],
    ['Why is penalty not added immediately?', 'Penalty is added only after the due date passes and that EMI cycle is still unpaid.'],
    ['Can a member pay before due date?', 'Yes. Early payment is counted for that EMI cycle.'],
    ['What if only part payment is made?', 'The paid split reduces that cycle\'s due. Remaining due continues to show, and penalty can apply after due date.'],
    ['Can I enter only interest payment?', 'Yes, if the split is valid and total split does not exceed amount collected.'],
    ['Can I enter only principal payment?', 'Yes. You can edit split, but total split cannot be more than collected amount and principal cannot exceed outstanding principal.'],
    ['What is pending dues page for?', 'It shows members who still have saving, principal, interest or penalty due for current or previous EMI cycles.'],
    ['What should collectors check before saving?', 'Check member, date, amount, allocation split and approval status.'],
    ['What happens if split total is greater than collected amount?', 'The app blocks it. Excess is recalculated from the remaining amount and cannot be negative.'],
    ['Why is dashboard not changing after I saved?', 'If approvals are enabled, dashboard changes after approval completion, not at pending stage.'],
    ['Where do admins approve?', 'Open Approvals. Admins can see group approval requests, and assigned approvers can approve their own requests.'],
    ['What if approver cannot see request?', 'Check that approver is saved in setup, migration for approver persistence is applied, and the user is logged in with the approver\'s member email.'],
    ['Can I reject a request?', 'Yes. Approvers can approve, reject or return depending on the workflow action.'],
    ['How do reports work?', 'Reports use selected start and end dates. They show only activity available in that range.'],
    ['Can I share a report on WhatsApp?', 'Yes. Use Copy / Share report. The text is formatted in readable lines.'],
    ['How do I fix a duplicate transaction?', 'Use Reversal to cancel the full wrong entry.'],
    ['How do I fix only one wrong split amount?', 'Use Adjustment to post only the difference.'],
    ['Can corrections also require approval?', 'Yes. If approvers are configured, adjustments, reversals and waivers can stay pending until approved.'],
    ['What is waiver?', 'Waiver reduces payable interest or penalty without treating it as cash collected.'],
    ['Should waived interest become group gain?', 'No. Waived interest is not collected money, so it is not group gain.'],
    ['What is active loan?', 'Active loan is loan principal still outstanding, with related interest or penalty if applicable.'],
    ['When is loan closed?', 'A loan is effectively closed when outstanding principal and related dues are fully paid or cleared.'],
    ['What is the best monthly routine?', 'Open period, enter collections, approve pending items, check pending dues, review dashboard and generate report.'],
    ['Who should use Reports & Audit?', 'Admins and approvers use it to verify date-range collections, member summaries and audit history.'],
    ['What should I do if numbers look incorrect?', 'Check pending approvals, selected date range, migration entries, split details, corrections and period dates before changing formulas.']
  ];

  return (
    <section className="section">
      <h3>Common Questions</h3>
      <div className="guide-formula-grid">
        {questions.map(([question, answer]) => (
          <article className="guide-formula" key={question}>
            <strong>{question}</strong>
            <p>{answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * Step indicator for guide flows
 */
function GuideStep({ number, label }) {
  return (
    <div className="guide-step">
      <span>{number}</span>
      <strong>{label}</strong>
    </div>
  );
}
