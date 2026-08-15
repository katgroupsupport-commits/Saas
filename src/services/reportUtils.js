const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

export const groupReportHeaders = [
  "Group",
  "Members with activity",
  "Collected",
  "Savings",
  "Income/Gain",
  "Expenses",
  "Remaining",
  "Loans disbursed",
  "Principal outstanding",
  "Interest due",
  "Penalty due",
  "Total share",
  "Withdrawn"
];

export const memberReportHeaders = [
  "Member",
  "Username",
  "Status",
  "Collected",
  "Savings",
  "Income/Gain",
  "Expense",
  "Share amount",
  "Loans",
  "Principal outstanding",
  "Interest due",
  "Penalty due",
  "Next EMI amount",
  "Next due date",
  "Total loan balance",
  "Withdrawn"
];

export function getReportSummaryRows(reportData = {}, defaultGroupName = "Group") {
  const groupSummary = reportData.group_summary || [];
  const memberSummary = reportData.member_summary || [];

  const groupRows = groupSummary.length
    ? [[
        groupSummary[0]?.group_name || defaultGroupName,
        Number(groupSummary[0]?.member_count ?? 0),
        currency.format(Number(groupSummary[0]?.collected ?? 0)),
        currency.format(Number(groupSummary[0]?.savings ?? 0)),
        currency.format(Number(groupSummary[0]?.gain ?? 0)),
        currency.format(Number(groupSummary[0]?.expenses ?? 0)),
        currency.format(Number(groupSummary[0]?.remaining ?? 0)),
        Number(groupSummary[0]?.loan_count ?? 0),
        currency.format(Number(groupSummary[0]?.loan_balance ?? 0)),
        currency.format(Number(groupSummary[0]?.interest_due ?? 0)),
        currency.format(Number(groupSummary[0]?.penalty_due ?? 0)),
        currency.format(Number(groupSummary[0]?.share_amount ?? 0)),
        currency.format(Number(groupSummary[0]?.withdrawn ?? 0))
      ]]
    : [];

  const memberRows = memberSummary.map((row) => [
    row.member_name || row.memberName || "-",
    row.username || "-",
    row.status || "-",
    currency.format(Number(row.collected ?? 0)),
    currency.format(Number(row.savings ?? 0)),
    currency.format(Number(row.gain ?? 0)),
    currency.format(Number(row.expense ?? 0)),
    currency.format(Number(row.share_amount ?? 0)),
    Number(row.loan_count ?? 0),
    currency.format(Number(row.principal_outstanding ?? 0)),
    currency.format(Number(row.interest_due ?? 0)),
    currency.format(Number(row.penalty_due ?? 0)),
    currency.format(Number(row.next_emi_amount ?? 0)),
    row.next_due_date || "-",
    currency.format(Number(row.total_loan_balance ?? 0)),
    currency.format(Number(row.withdrawn ?? 0))
  ]);

  return { groupRows, memberRows };
}

export function formatReportTablesText({ title, sections }) {
  const formatRow = (headers, row) => headers
    .map((header, index) => `  - ${header}: ${row[index] ?? "-"}`)
    .join("\n");

  const formatSection = (section) => {
    if (!section.rows.length) return `${section.title}\n  No records found.`;

    const rows = section.rows.map((row, index) => {
      const memberTitle = row[0] ? `${index + 1}. ${row[0]}` : `${index + 1}. Record`;
      return section.rows.length === 1
        ? formatRow(section.headers, row)
        : `${memberTitle}\n${formatRow(section.headers.slice(1), row.slice(1))}`;
    });

    return `${section.title}\n${rows.join("\n\n")}`;
  };

  return [title, ...sections.map(formatSection)].join("\n\n");
}
