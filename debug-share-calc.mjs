// This script will help debug the share distribution calculation
// Add this to src/App.jsx temporarily to log the calculation process

const debugCode = `
// Add this inside getStateWithComputedShares() function, right after calling getAccumulatedShareByMember()

console.log("=== SHARE DISTRIBUTION DEBUG ===");
console.log("Accumulated shares by member:", JSON.stringify(accumulatedShares, null, 2));

scopedState.members.forEach(member => {
  const memberShare = accumulatedShares[member.id] || 0;
  console.log(\`Member \${member.fullName} (ID: \${member.id}) - Share: \${memberShare}\`);
});

// Check if transactions are being found
const interestTransactions = (scopedState.transactions || []).filter(t => t.transactionType === "Interest Collection");
console.log("Interest Collection transactions found:", interestTransactions.length);
interestTransactions.forEach(t => {
  console.log(\`  - Amount: \${t.amount}, Allocation Interest: \${t.allocation?.interest || 0}, Status: \${t.approvalStatus}\`);
});

// Check periods
const periods = getSharePeriodsForState(scopedState);
console.log("Share periods:", JSON.stringify(periods.map(p => ({
  name: p.name,
  startDate: p.startDate,
  endDate: p.endDate
})), null, 2));

// Check what calculateEventBasedShareDistribution returns for each period
periods.forEach((period, idx) => {
  const shares = calculateEventBasedShareDistribution({
    members: scopedState.members,
    transactions: scopedState.transactions,
    loans: scopedState.loans,
    period,
    referenceDate: new Date()
  });
  console.log(\`Period \${idx} (\${period.name}) distribution:\`, JSON.stringify(shares.filter(s => s.shareAmount > 0), null, 2));
});
`;

console.log("Add this code to src/App.jsx in the getStateWithComputedShares() function:");
console.log(debugCode);
