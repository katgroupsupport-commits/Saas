import React, { useEffect, useState } from "react";
import { roles } from "../services/permissions";
import { repository } from "../services/repository";
import {
  getCurrentMember,
  getDashboardPeriod
} from "../services/financeFields";
import { Page, Section } from "../components";

function buildFinanceAgentContext(state, actor) {
  const period = getDashboardPeriod(state);
  const group = state.groups?.[0] ?? {};
  const isMemberOnly = actor?.role === roles.MEMBER;
  const groupSummary = state.rpcGroupFinanceSummaries?.[String(group.id)] || state.rpcGroupFinanceSummaries?.[group.id] || null;
  const visibleMembers = isMemberOnly
    ? [getCurrentMember(state, actor)].filter(Boolean)
    : (state.members || []);
  const memberSummaries = visibleMembers.map((member) => {
    const summary = state.rpcMemberFinanceSummaries?.[String(member.id)] || null;
    return {
      id: member.id,
      name: member.fullName,
      status: member.status,
      savings: Number(summary?.savings ?? member.savings ?? 0),
      shareAmount: Number(summary?.share_amount ?? summary?.shareAmount ?? 0),
      sharePercent: Number(summary?.share_percent ?? summary?.sharePercent ?? 0),
      gain: Number(summary?.gain ?? member.earnedFromGroup ?? member.groupGain ?? 0),
      expense: Number(summary?.expense ?? 0),
      loanOutstanding: Number(summary?.outstanding ?? member.loanOutstanding ?? 0),
      nextDueAmount: Number(summary?.monthly_collections ?? summary?.monthlyCollections ?? 0),
      interestDue: Number(summary?.monthly_interest ?? summary?.monthlyInterest ?? 0),
      monthlySavings: Number(summary?.monthly_savings ?? summary?.monthlySavings ?? 0),
      monthlyPrincipal: Number(summary?.monthly_principal ?? summary?.monthlyPrincipal ?? 0),
      monthlyInterest: Number(summary?.monthly_interest ?? summary?.monthlyInterest ?? 0),
      monthlyPenalty: Number(summary?.monthly_penalty ?? summary?.monthlyPenalty ?? 0),
      activeLoans: 0
    };
  });

  return {
    group: {
      id: group.id,
      name: group.name,
      code: group.code,
      role: actor?.role,
      period: {
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate
      }
    },
    fieldRules: {},
    groupSummary: {
      totalSavings: Number(groupSummary?.total_savings ?? groupSummary?.totalSavings ?? 0),
      monthlyCollections: Number(groupSummary?.monthly_collections ?? groupSummary?.monthlyCollections ?? 0),
      monthlySavings: Number(groupSummary?.monthly_savings ?? groupSummary?.monthlySavings ?? 0),
      monthlyPrincipal: Number(groupSummary?.monthly_principal ?? groupSummary?.monthlyPrincipal ?? 0),
      monthlyInterest: Number(groupSummary?.monthly_interest ?? groupSummary?.monthlyInterest ?? 0),
      monthlyPenalty: Number(groupSummary?.monthly_penalty ?? groupSummary?.monthlyPenalty ?? 0),
      monthlyWithdrawn: Number(groupSummary?.monthly_withdrawn ?? groupSummary?.monthlyWithdrawn ?? 0),
      totalActiveLoan: Number(groupSummary?.total_active_loan ?? groupSummary?.totalActiveLoan ?? 0),
      totalExpenses: Number(groupSummary?.total_expenses ?? groupSummary?.totalExpenses ?? 0),
      totalWithdrawn: Number(groupSummary?.total_withdrawn ?? groupSummary?.totalWithdrawn ?? 0),
      groupGain: Number(groupSummary?.group_gain ?? groupSummary?.groupGain ?? 0),
      collectedGain: Number(groupSummary?.collected_gain ?? groupSummary?.collectedGain ?? 0),
      remainingBalance: Number(groupSummary?.remaining_balance ?? groupSummary?.remainingBalance ?? 0),
      activeLoanCount: 0,
      legacyOpening: null
    },
    memberSummaries,
    pendingDues: (state.rpcPendingDues || [])
      .filter((row) => !isMemberOnly || String(row.member_id) === String(actor?.memberId))
      .map((row) => ({
        memberName: row.member_name || row.memberName || "",
        periodName: row.period_name || row.periodName || "",
        dueDate: row.due_date || row.dueDate,
        savingDue: Number(row.saving_due ?? row.savingDue ?? 0),
        principalDue: Number(row.principal_due ?? row.principalDue ?? row.outstandingPrincipal ?? 0),
        interestDue: Number(row.interest_due ?? row.interestDue ?? 0),
        penaltyDue: Number(row.penalty_due ?? row.penaltyDue ?? 0),
        totalDue: Number(row.total_due ?? row.totalDue ?? 0)
      })),
    recentTransactions: getCurrentMember(state, actor)
      ? []
      : getDashboardPeriod(state) && []
  };
}

function FinanceAgent({ state, actor, setNotification }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Ask me about savings, loans, pending dues, migrated balances, group gain, remaining balance, or why a dashboard number is showing."
    }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function askAgent(event) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;

    const nextMessages = [...messages, { role: "user", content: trimmedQuestion }];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);

    try {
      const response = await repository.askFinanceAgent({
        question: trimmedQuestion,
        messages: nextMessages,
        context: buildFinanceAgentContext(state, actor)
      });
      setMessages((current) => [...current, { role: "assistant", content: response.answer || "No answer returned." }]);
    } catch (error) {
      const message = `Unable to reach AI Agent: ${error.message}`;
      setMessages((current) => [...current, { role: "assistant", content: message }]);
      setNotification?.({ type: "error", message, details: error?.message || String(error) });
    } finally {
      setLoading(false);
    }
  }

  const sampleQuestions = [
    "Why is remaining balance different from total savings?",
    "Which members have pending dues?",
    "Explain migrated savings, interest and penalty in this group.",
    "How is group gain calculated?"
  ];

  return (
    <Page title="AI Agent" subtitle="Read-only finance assistant for dashboard formulas, dues, savings and loans" action={null}>
      <Section title="Finance Assistant">
        <div className="chat-window ai-agent-window">
          <div className="chat-meta">
            <strong>Context</strong>
            <span className="pill">Read-only</span>
          </div>
          <div className="chat-list">
            {messages.map((message, index) => (
              <div className={`chat-bubble ${message.role === "user" ? "chat-sent" : "chat-reply"}`} key={`${message.role}-${index}`}>
                <small>{message.role === "user" ? "You" : "AI Agent"}</small>
                <p>{message.content}</p>
              </div>
            ))}
            {loading && (
              <div className="chat-bubble chat-waiting">
                <small>AI Agent</small>
                <p>Thinking through the finance context...</p>
              </div>
            )}
          </div>
          <form className="ai-agent-form" onSubmit={askAgent}>
            <label className="field ai-agent-input">
              <span>Ask a question</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                placeholder="Example: Why is loan repaid showing different from principal collected?"
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading || !question.trim()}>
              {loading ? "Asking..." : "Ask AI Agent"}
            </button>
          </form>
        </div>
      </Section>
      <Section title="Suggested questions">
        <div className="chip-row">
          {sampleQuestions.map((item) => (
            <button key={item} type="button" className="secondary-button" onClick={() => setQuestion(item)}>
              {item}
            </button>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export default FinanceAgent;
