import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDashboardCards, calculateMemberDashboardCards, calculateMemberFinanceSummary, calculateMemberLedgerSummary, calculatePendingDues, getMemberLoanInterestDueDetails } from './financeFields.js';
import { getAccumulatedShareByMember, getStateWithComputedShares } from './stateHelpers.js';

test('calculateMemberLedgerSummary prefers RPC member finance summaries when available', () => {
  const member = { id: 42, savings: 100, earnedFromGroup: 10, loanOutstanding: 0 };
  const state = {
    transactions: [
      {
        memberId: 42,
        approvalStatus: 'COMPLETED',
        transactionType: 'Savings Collection',
        allocation: { savings: 10, excess: 0 }
      }
    ],
    loans: [],
    rpcMemberFinanceSummaries: {
      '42': {
        savings: 333,
        outstanding: 55,
        gain: 77,
        expense: 11,
        share_amount: 399,
        share_percent: 50
      }
    }
  };

  const summary = calculateMemberLedgerSummary(member, state);

  assert.equal(summary.savings, 333);
  assert.equal(summary.outstanding, 55);
  assert.equal(summary.gain, 77);
  assert.equal(summary.expense, 11);
  assert.equal(summary.shareAmount, 399);
});

test('calculateDashboardCards prefers RPC dashboard summaries when available', () => {
  const state = {
    groups: [{ id: 7, name: 'Test Group' }],
    members: [],
    transactions: [],
    expenses: [],
    loans: [],
    periods: [],
    rpcDashboardSummaries: {
      '7': {
        total_savings: 333,
        active_loan_balance: 77,
        current_month_collections: 111,
        expenses: 22,
        pending_dues: 44,
        remaining_balance: 555,
        active_loans_count: 5
      }
    }
  };

  const result = calculateDashboardCards(state, { name: 'Current', startDate: '2026-01-01', endDate: '2026-01-31' });

  assert.equal(result.cards.totalSavings.header, 333);
  assert.equal(result.cards.collectedInPeriod.header, 111);
  assert.equal(result.cards.activeLoan.header, 77);
  assert.equal(result.cards.remainingBalance.header, 555);
  assert.equal(result.cards.activeLoans.header, 5);
});

test('calculateDashboardCards prefers a direct dashboard card RPC payload when available', () => {
  const state = {
    groups: [{ id: 7, name: 'Test Group' }],
    members: [],
    transactions: [],
    expenses: [],
    loans: [],
    periods: [],
    rpcDashboardCardSummary: {
      total_savings: 444,
      collected_in_period: 222,
      active_loan_balance: 88,
      remaining_balance: 666,
      active_loans_count: 6,
      validation_total_savings: true,
      validation_collected_in_period: true,
      validation_active_loan: true,
      validation_remaining_balance: true,
      validation_active_loans: true
    }
  };

  const result = calculateDashboardCards(state, { name: 'Current', startDate: '2026-01-01', endDate: '2026-01-31' });

  assert.equal(result.cards.totalSavings.header, 444);
  assert.equal(result.cards.collectedInPeriod.header, 222);
  assert.equal(result.cards.activeLoan.header, 88);
  assert.equal(result.cards.remainingBalance.header, 666);
  assert.equal(result.cards.activeLoans.header, 6);
  assert.equal(result.validations.totalSavings.valid, true);
});

test('calculateMemberLedgerSummary prefers RPC member statement summaries when available', () => {
  const member = { id: 42, savings: 100, earnedFromGroup: 10, loanOutstanding: 0 };
  const state = {
    transactions: [],
    loans: [],
    rpcMemberStatements: {
      '42': {
        opening_balance: 200,
        savings_collected: 50,
        principal_collected: 20,
        interest_collected: 10,
        penalty_collected: 5,
        withdrawals: 15,
        share_allocation: 140,
        expense_allocation: 30,
        closing_balance: 260
      }
    }
  };

  const summary = calculateMemberLedgerSummary(member, state);

  assert.equal(summary.savings, 50);
  assert.equal(summary.expense, 30);
  assert.equal(summary.withdrawn, 15);
  assert.equal(summary.shareAmount, 140);
  assert.equal(summary.outstanding, 260);
});

test('calculateMemberFinanceSummary prefers RPC loan aging summaries when available', () => {
  const member = { id: 42, savings: 100, earnedFromGroup: 10, loanOutstanding: 0 };
  const state = {
    groups: [{ id: 7 }],
    members: [member],
    transactions: [],
    loans: [],
    rpcLoanAgingSummaries: {
      '42': {
        outstanding_principal: 120,
        overdue_days: 14,
        next_due_amount: 35,
        due_date: '2026-08-05',
        repayment_status: 'OVERDUE'
      }
    }
  };

  const summary = calculateMemberFinanceSummary(member, state);

  assert.equal(summary.dueDate, '2026-08-05');
  assert.equal(summary.nextDueAmount, 35);
  assert.equal(summary.outstanding, 120);
  assert.equal(summary.overdueDays, 14);
  assert.equal(summary.repaymentStatus, 'OVERDUE');
});

test('calculateMemberFinanceSummary prefers rpc member loan interest due when available', () => {
  const member = { id: 42, savings: 100, earnedFromGroup: 10, loanOutstanding: 0 };
  const state = {
    groups: [{ id: 7, loanDueDay: 5, createdDate: '2026-01-01' }],
    members: [member],
    transactions: [],
    loans: [],
    rpcMemberLoanInterestDues: {
      '42': 19.5
    }
  };

  const summary = calculateMemberFinanceSummary(member, state);

  assert.equal(summary.interestDue, 19.5);
});

test('getMemberLoanInterestDueDetails prefers RPC detail rows when available', () => {
  const member = { id: 42 };
  const state = {
    rpcMemberLoanInterestDueDetails: {
      '42': [
        {
          loan_id: 101,
          loan_number: 'LN-101',
          outstanding_principal: 500,
          outstanding_interest: 55,
          outstanding_penalty: 0,
          interest_due: 55
        },
        {
          loan_id: 102,
          loan_number: 'LN-102',
          outstanding_principal: 200,
          outstanding_interest: 20,
          outstanding_penalty: 5,
          interest_due: 20
        }
      ]
    }
  };

  const rows = getMemberLoanInterestDueDetails(member, state, new Date('2026-08-01'));

  assert.equal(rows.length, 2);
  assert.equal(rows[0].loan.id, 101);
  assert.equal(rows[0].loan.loanNumber, 'LN-101');
  assert.equal(rows[0].due, 55);
  assert.equal(rows[1].loan.id, 102);
  assert.equal(rows[1].loan.loanNumber, 'LN-102');
  assert.equal(rows[1].due, 20);
});

test('getMemberLoanInterestDueDetails falls back to local calculation when RPC rows are absent', () => {
  const member = { id: 42 };
  const state = {
    members: [{ id: 42, fullName: 'Test Member' }],
    loans: [
      {
        id: 7,
        memberId: 42,
        loanNumber: 'LN-007',
        principalOutstanding: 1000,
        interestOutstanding: 10,
        penaltyOutstanding: 0,
        amount: 1000,
        startDate: '2026-07-01',
        status: 'ACTIVE'
      }
    ],
    groups: [{ id: 1, loanDueDay: 5 }],
    transactions: []
  };

  const rows = getMemberLoanInterestDueDetails(member, state, new Date('2026-08-01'));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].loan.id, 7);
  assert.equal(rows[0].loan.loanNumber, 'LN-007');
  assert.equal(rows[0].due, Number(rows[0].due));
});

test('calculateMemberFinanceSummary prefers rpc pending dues when available', () => {
  const member = { id: 42, savings: 100, earnedFromGroup: 10, loanOutstanding: 0 };
  const state = {
    groups: [{ id: 7, loanDueDay: 5, createdDate: '2026-01-01' }],
    members: [member],
    transactions: [],
    loans: [],
    rpcPendingDues: [
      {
        id: 'due_42_2026-08-05',
        member_id: 42,
        member_name: 'Test Member',
        due_date: '2026-08-05',
        saving_due: 10,
        principal_due: 50,
        interest_due: 15,
        penalty_due: 5,
        total_due: 80
      }
    ]
  };

  const summary = calculateMemberFinanceSummary(member, state);

  assert.equal(summary.dueRows.length, 1);
  assert.equal(summary.dueRows[0].dueDate, '2026-08-05');
  assert.equal(summary.nextDueAmount, 80);
  assert.equal(summary.interestDue, 15);
});

test('calculatePendingDues prefers rpc pending dues when available', () => {
  const state = {
    groups: [{ id: 7, name: 'Test Group', loanDueDay: 5, createdDate: '2026-01-01' }],
    members: [{ id: 42, fullName: 'Test Member', status: 'Active' }],
    transactions: [],
    loans: [],
    dismissedPendingDues: [],
    rpcPendingDues: [
      {
        id: 'due_42_2026-08-01',
        period_name: 'Current',
        member_id: 42,
        member_name: 'Test Member',
        due_date: '2026-08-01',
        cycle_start_date: '2026-07-01',
        saving_due: 10,
        principal_due: 50,
        outstanding_principal: 50,
        interest_due: 15,
        penalty_due: 5,
        total_due: 80
      }
    ]
  };

  const result = calculatePendingDues(state);

  assert.equal(result.length, 1);
  assert.equal(result[0].memberId, 42);
  assert.equal(result[0].savingDue, 10);
  assert.equal(result[0].principalDue, 50);
  assert.equal(result[0].interestDue, 15);
  assert.equal(result[0].penaltyDue, 5);
  assert.equal(result[0].totalDue, 80);
});

test('calculateMemberDashboardCards prefers a direct member dashboard card RPC payload when available', () => {
  const member = { id: 42, fullName: 'Test Member', savings: 100 };
  const state = {
    groups: [{ id: 7, loanDueDay: 5, createdDate: '2026-01-01' }],
    members: [member],
    transactions: [],
    loans: [],
    rpcMemberDashboardCardSummaries: {
      '42': {
        savings: 120,
        collected_in_period: 40,
        share_amount: 130,
        loan_balance: 60,
        next_minimum_due: 20,
        share_percent: 25,
        validation_savings: true,
        validation_collected_in_period: true,
        validation_share_amount: true,
        validation_loan_balance: true,
        validation_next_minimum_due: true,
        validation_share_percent: true
      }
    }
  };

  const result = calculateMemberDashboardCards(member, state, { name: 'Current', startDate: '2026-01-01', endDate: '2026-01-31' });

  assert.equal(result.cards.savings.header, 120);
  assert.equal(result.validations.savings.valid, true);
});

test('getAccumulatedShareByMember prefers rpc share distribution range rows when available', () => {
  const state = {
    members: [{ id: 42, fullName: 'Test Member' }],
    transactions: [],
    loans: [],
    rpcShareDistributionRange: [
      {
        member_id: 42,
        share_amount: 150
      }
    ]
  };

  const result = getAccumulatedShareByMember(state, {
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  });

  assert.equal(result['42'], 150);
});

test('getStateWithComputedShares prefers rpc share distribution snapshots when available', () => {
  const member = { id: 42, fullName: 'Test Member', savings: 0 };
  const state = {
    members: [member],
    transactions: [],
    loans: [],
    rpcShareDistributionSnapshots: {
      '42': {
        member_id: 42,
        share_amount: 150,
        share_percent: 40,
        payout_status: 'READY'
      }
    }
  };

  const result = getStateWithComputedShares(state);

  assert.equal(result.members[0].shareAmount, 150);
  assert.equal(result.members[0].sharePercent, 40);
  assert.equal(result.members[0].earnedFromGroup, 150);
  assert.equal(result.members[0].groupGain, 150);
});
