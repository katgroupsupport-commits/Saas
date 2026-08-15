import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, IndianRupee, Users, WalletCards } from "lucide-react";
import {
  calculateDashboardCards,
  calculateMemberDashboardCards,
  calculateMemberLedgerSummary,
  financeFieldDictionary,
  getCompletedTransactions,
  getEffectiveCompletedTransactions,
  getCurrentMember,
  getDashboardPeriod,
  getEffectiveMemberSetup,
  getLoanDueDate,
  isCompletedFinancialStatus,
  isOutstandingLoan,
  loanBelongsToMember,
  toIsoDateValue
} from "../../services/financeFields";
import { roles } from "../../services/permissions";
import { Page, Section, MetricGrid, Table, ComboField } from "../../components";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function metric(label, value, Icon, details = []) {
  return { label, value, Icon, details };
}

export default function Dashboard({
  role,
  state,
  actor,
  forceGroupView = false,
  memberPortal = false,
  setConfirmDialog,
  setNotification
}) {
  const navigate = useNavigate();
  const [selectedDashboardMemberId, setSelectedDashboardMemberId] = useState(() => {
    const currentMember = getCurrentMember(state, actor);
    return String(currentMember?.id ?? state.members?.[0]?.id ?? "");
  });

  useEffect(() => {
    if (!selectedDashboardMemberId) {
      const currentMember = getCurrentMember(state, actor);
      setSelectedDashboardMemberId(String(currentMember?.id ?? state.members?.[0]?.id ?? ""));
    }
  }, [state.members, actor, selectedDashboardMemberId]);

  const dashboardPeriod = getDashboardPeriod(state);
  const dashboardCards = calculateDashboardCards(state, dashboardPeriod).cards;
  const memberFields = financeFieldDictionary.member;
  const group = state.groups?.[0] ?? {};
  const financialDueDate = getLoanDueDate(group);
  const financialPeriodStart = new Date(financialDueDate);
  financialPeriodStart.setMonth(financialPeriodStart.getMonth() - 1);
  financialPeriodStart.setDate(financialPeriodStart.getDate() + 1);
  const financialPeriodLabel = `${financialPeriodStart.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  })} - ${financialDueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  if ((role === roles.MEMBER || memberPortal) && !forceGroupView) {
    const canChooseMember = true;
    const member =
      state.members.find((item) => String(item.id) === String(selectedDashboardMemberId)) ??
      getCurrentMember(state, actor) ?? {
        savings: 0,
        loanOutstanding: 0,
        shares: 0,
        interestOutstanding: 0,
        penaltyOutstanding: 0
      };
    const memberDashboard = calculateMemberDashboardCards(member, state, dashboardPeriod, actor);
    const memberSummary = memberDashboard.summary;
    const memberCards = memberDashboard.cards;
    const effectiveSetup = getEffectiveMemberSetup(member, state.groups?.[0] ?? {});

    const formatDate = (value) =>
      value
        ? new Date(value).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })
        : "-";

    const loanDate = (loan) => loan.startDate || loan.distributionDate || loan.requestDate || loan.createdAt || "";

    const loanActivityDate = (loan) => {
      const loanStartDate = loanDate(loan);
      const memberLoanTransactions = getEffectiveCompletedTransactions(
        getCompletedTransactions(state.transactions || [])
      )
        .filter((transaction) =>
          loanBelongsToMember(loan, { id: transaction.memberId, fullName: transaction.memberName })
        )
        .filter((transaction) => !loanStartDate || String(transaction.transactionDate || "") >= String(loanStartDate))
        .map((transaction) => transaction.transactionDate)
        .filter(Boolean)
        .sort();
      return loan.closedDate || loan.completedAt || memberLoanTransactions.at(-1) || loanStartDate;
    };

    const closedLoans = memberSummary.memberLoans
      .filter((loan) => !isOutstandingLoan(loan))
      .sort((a, b) => String(loanActivityDate(b)).localeCompare(String(loanActivityDate(a))));
    const recentClosedLoan = closedLoans[0];
    const sortedDueRows = [...memberSummary.dueRows].sort((a, b) =>
      String(a.dueDate).localeCompare(String(b.dueDate))
    );
    const nextEmiRow = sortedDueRows[0];
    const openingInterestDue = memberSummary.memberActiveLoans.reduce(
      (sum, loan) => sum + Number(loan.interestOutstanding || 0),
      0
    );
    const openingPenaltyDue = memberSummary.memberActiveLoans.reduce(
      (sum, loan) => sum + Number(loan.penaltyOutstanding || 0),
      0
    );

    return (
      <Page
        title={canChooseMember ? "Member Dashboard" : "My Dashboard"}
        subtitle="Savings, loans, repayments, shares and notifications"
        action={null}
      >
        {canChooseMember && (
          <Section title="Select member">
            <ComboField
              label="Member"
              value={member?.id ?? ""}
              onChange={setSelectedDashboardMemberId}
              placeholder="Search member by name, email or mobile"
              options={state.members.map((item) => ({
                label: item.fullName,
                value: item.id,
                code: [item.fullName, item.email, item.mobile, item.username].filter(Boolean).join(" ")
              }))}
            />
          </Section>
        )}
        <MetricGrid
          metrics={[
            metric(
              memberCards.shareAmount.label,
              currency.format(memberCards.shareAmount.header ?? 0),
              WalletCards,
              [
                `Savings: ${currency.format(memberCards.shareAmount.subfields.savings ?? 0)}`,
                `Income/Gain share: ${currency.format(memberCards.shareAmount.subfields.incomeGainShare ?? 0)}`,
                `Expense share: ${currency.format(memberCards.shareAmount.subfields.expenseShare ?? 0)}`,
                `Share percent: ${memberCards.sharePercent.header ?? 0}%`
              ]
            ),
            metric(
              memberCards.loanBalance.label,
              currency.format(memberCards.loanBalance.header ?? 0),
              IndianRupee,
              [
                `Active loans: ${memberCards.loanBalance.subfields.activeLoans ?? 0}`,
                `Principal outstanding: ${currency.format(memberCards.loanBalance.subfields.principalOutstanding ?? 0)}`,
                `Interest pending: ${currency.format(memberCards.loanBalance.subfields.interestPending ?? 0)}`,
                `Penalty pending: ${currency.format(memberCards.loanBalance.subfields.penaltyPending ?? 0)}`,
                `Disbursed till now: ${currency.format(memberCards.loanBalance.subfields.disbursedTillNow ?? 0)}`
              ]
            )
          ]}
        />
        <Section title="Loan and EMI details">
          <div className="status-row">
            <div>
              <strong>Next EMI amount</strong>
              <p>{currency.format(nextEmiRow?.totalDue ?? memberSummary.nextDueAmount)}</p>
            </div>
            <div>
              <strong>EMI date</strong>
              <p>{formatDate(nextEmiRow?.dueDate ?? memberSummary.dueDate)}</p>
            </div>
            <div>
              <strong>Interest due</strong>
              <p>{currency.format(memberSummary.interestDue || openingInterestDue)}</p>
            </div>
            <div>
              <strong>Principal due</strong>
              <p>
                {currency.format(
                  sortedDueRows.reduce(
                    (sum, row) => sum + Number(row.principalDue ?? (row.outstandingPrincipal || 0)),
                    0
                  )
                )}
              </p>
            </div>
            <div>
              <strong>Penalty due</strong>
              <p>
                {currency.format(
                  sortedDueRows.reduce((sum, row) => sum + Number(row.penaltyDue || 0), 0) || openingPenaltyDue
                )}
              </p>
            </div>
          </div>
          <Table
            headers={[
              "Loan amount",
              "Start date",
              "Principal outstanding",
              "Principal due",
              "Interest due",
              "Penalty due",
              "Total outstanding",
              "Rate",
              "Status"
            ]}
            rows={memberSummary.memberActiveLoans.map((loan) => [
              currency.format(loan.amount || 0),
              formatDate(loanDate(loan)),
              currency.format(Number(loan.principalOutstanding || 0)),
              currency.format(Math.max(0, Number(loan.principalOutstanding || 0))),
              currency.format(loan.interestOutstanding || 0),
              currency.format(loan.penaltyOutstanding || 0),
              currency.format(
                Number(loan.principalOutstanding || 0) +
                  Number(loan.interestOutstanding || 0) +
                  Number(loan.penaltyOutstanding || 0)
              ),
              `${Number(loan.rate || effectiveSetup.interestRate || 0)}%`,
              loan.loanStatus || loan.status || loan.approvalStatus || "Active"
            ])}
          />
        </Section>
        <Section title="Member details">
          <div className="status-row">
            <div>
              <strong>Member</strong>
              <p>{member?.fullName ?? "-"}</p>
            </div>
            <div>
              <strong>Status</strong>
              <p>{member?.status ?? "-"}</p>
            </div>
            <div>
              <strong>Mobile</strong>
              <p>{member?.mobile || "-"}</p>
            </div>
            <div>
              <strong>Email</strong>
              <p>{member?.email || "-"}</p>
            </div>
            <div>
              <strong>Username</strong>
              <p>{member?.username || "-"}</p>
            </div>
            <div>
              <strong>Monthly saving</strong>
              <p>{currency.format(effectiveSetup.monthlySaving || 0)}</p>
            </div>
            <div>
              <strong>Loan limit</strong>
              <p>{currency.format(effectiveSetup.loanLimit || 0)}</p>
            </div>
            <div>
              <strong>Loan interest rate</strong>
              <p>{Number(effectiveSetup.interestRate || 0)}%</p>
            </div>
          </div>
        </Section>
        <Section title="Recent closed loan">
          <Table
            headers={["Loan amount", "Start date", "Closed / last paid", "Interest paid", "Status"]}
            rows={
              recentClosedLoan
                ? [
                    [
                      currency.format(recentClosedLoan.amount || 0),
                      formatDate(loanDate(recentClosedLoan)),
                      formatDate(loanActivityDate(recentClosedLoan)),
                      currency.format(recentClosedLoan.interestPaidTillNow || 0),
                      recentClosedLoan.loanStatus || recentClosedLoan.status || recentClosedLoan.approvalStatus || "Closed"
                    ]
                  ]
                : []
            }
          />
        </Section>
      </Page>
    );
  }

  return (
    <Page
      title="Group Dashboard"
      subtitle="Live operating view for collectors, admins, approvers, and members"
      action={
        role === roles.MEMBER ? (
          <button type="button" className="secondary-button" onClick={() => navigate("/")}>
            My Dashboard
          </button>
        ) : null
      }
    >
      <MetricGrid
        metrics={[
          metric(
            dashboardCards.collectedInPeriod.label,
            currency.format(dashboardCards.collectedInPeriod.header ?? 0),
            WalletCards,
            [
              `Savings collected: ${currency.format(dashboardCards.collectedInPeriod.subfields.savingsCollected ?? 0)}`,
              `Principal collected: ${currency.format(dashboardCards.collectedInPeriod.subfields.principalCollected ?? 0)}`,
              `Interest collected: ${currency.format(dashboardCards.collectedInPeriod.subfields.interestCollected ?? 0)}`,
              `Penalty collected: ${currency.format(dashboardCards.collectedInPeriod.subfields.penaltyCollected ?? 0)}`,
              `Withdrawn in period: ${currency.format(dashboardCards.collectedInPeriod.subfields.withdrawnInPeriod ?? 0)}`
            ]
          ),
          metric(
            dashboardCards.remainingBalance.label,
            currency.format(dashboardCards.remainingBalance.header ?? 0),
            WalletCards,
            [
              `Opening balance: ${currency.format(dashboardCards.remainingBalance.subfields.openingBalance ?? 0)}`,
              `Savings: ${currency.format(dashboardCards.remainingBalance.subfields.savings ?? 0)}`,
              `Principal collected: ${currency.format(dashboardCards.remainingBalance.subfields.principalCollected ?? 0)}`,
              `Interest collected: ${currency.format(dashboardCards.remainingBalance.subfields.interestCollected ?? 0)}`,
              `Penalty collected: ${currency.format(dashboardCards.remainingBalance.subfields.penaltyCollected ?? 0)}`,
              `Other income/Gain: ${currency.format(dashboardCards.remainingBalance.subfields.otherIncomeGain ?? 0)}`,
              `Expense: ${currency.format(dashboardCards.remainingBalance.subfields.expense ?? 0)}`,
              `Withdrawals: ${currency.format(dashboardCards.remainingBalance.subfields.withdrawals ?? 0)}`,
              `Loan outstanding: ${currency.format(dashboardCards.remainingBalance.subfields.loanOutstanding ?? 0)}`
            ]
          ),
          metric(dashboardCards.activeLoans.label, String(dashboardCards.activeLoans.header ?? 0), Users, [
            `Activated this month: ${dashboardCards.activeLoans.subfields.activatedThisMonth ?? 0}`,
            `Overdue loans: ${dashboardCards.activeLoans.subfields.overdueLoans ?? 0}`,
            `Pending approval loans: ${dashboardCards.activeLoans.subfields.pendingApprovalLoans ?? 0}`
          ]),
          metric("Financial period", `${financialPeriodLabel}`, CalendarCheck, [
            `Cycle: ${financialPeriodStart.toLocaleDateString("en-IN", {
              year: "numeric",
              month: "short",
              day: "numeric"
            })} - ${financialDueDate.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}`,
            `Repayment day: ${Math.min(28, Math.max(1, Number(group.loanDueDay || 1)))}`,
            `Open period: ${dashboardCards.openPeriod.subfields.currentOpenMonth ?? "None"}`
          ])
        ].filter(Boolean)}
      />
    </Page>
  );
}
