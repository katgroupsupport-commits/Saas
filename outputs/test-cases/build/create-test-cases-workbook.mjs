import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SpreadsheetFile,
  Workbook,
} from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, "..", "Bachat_Gat_SaaS_Test_Cases.xlsx");

const wb = Workbook.create();

const headerFill = "#0F766E";
const sectionFill = "#DFF4EF";
const warningFill = "#FFF4CC";
const passFill = "#E8F8EF";
const border = { style: "thin", color: "#CBD5E1" };

function sheet(name) {
  const ws = wb.worksheets.add(name);
  ws.getRange("A:Z").format.font = { name: "Aptos", size: 10 };
  ws.getRange("A:Z").format.verticalAlignment = "top";
  return ws;
}

function setTitle(ws, title, subtitle = "") {
  ws.getRange("A1:H1").merge();
  ws.getRange("A1").values = [[title]];
  ws.getRange("A1").format = {
    font: { bold: true, size: 18, color: "#0F172A" },
    fill: { color: sectionFill },
  };
  ws.getRange("A2:H2").merge();
  ws.getRange("A2").values = [[subtitle]];
  ws.getRange("A2").format = {
    font: { size: 11, color: "#475569" },
    fill: { color: sectionFill },
  };
}

function table(ws, startRow, headers, rows, widths = []) {
  const endRow = startRow + rows.length;
  const endCol = headers.length;
  const range = ws.getRangeByIndexes(startRow - 1, 0, rows.length + 1, endCol);
  range.values = [headers, ...rows];
  const headerRange = ws.getRangeByIndexes(startRow - 1, 0, 1, endCol);
  headerRange.format = {
    font: { bold: true, color: "#FFFFFF" },
    fill: { color: headerFill },
    horizontalAlignment: "center",
    verticalAlignment: "middle",
  };
  range.format.borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  range.format.wrapText = true;
  ws.getRangeByIndexes(startRow, 0, rows.length, endCol).format.fill = { color: "#FFFFFF" };
  widths.forEach((width, index) => {
    ws.getRangeByIndexes(0, index, 1, 1).format.columnWidth = width;
  });
  return endRow + 2;
}

function note(ws, cell, text) {
  ws.getRange(cell).values = [[text]];
  ws.getRange(cell).format = {
    font: { bold: true, color: "#854D0E" },
    fill: { color: warningFill },
    wrapText: true,
  };
}

const summary = sheet("00 Summary");
setTitle(summary, "Bachat Gat SaaS - User Test Cases", "Use this workbook to test registration, setup, approvals, calculations, dashboard numbers, security and reports.");
table(summary, 4, ["Area", "What to test", "Expected result"], [
  ["Login/Register", "Duplicate email, OTP resend, forgot password, Google login fallback", "Valid users register/login; duplicate email is blocked; reset and OTP links work after Supabase redirect setup."],
  ["Group & Members", "Create group, creator becomes admin member, add members with unique username", "Only current group members appear; group code is visible; hidden groups can be managed."],
  ["Setup", "Group/member/finance/period/role/approval setup", "Null member setup falls back to group setup; setup approval status shows pending approver."],
  ["Legacy Migration", "Group opening and member opening migration", "Approval flow applies when approvers exist; only one history row is shown per member migration."],
  ["Transactions", "Savings, excess, loan repayment allocation, group expense split", "Completed entries only affect dashboard; excess is savings; expenses create member expense share lines."],
  ["Loans", "Member loan request, admin approval, interest and repayment split", "Loan request goes to approvers/admin; disbursement and repayments update outstanding values."],
  ["Corrections", "Adjustment and reversal approvals", "Approved records are not edited directly; corrections create child entries and audit history."],
  ["Dashboards", "Current month and overall summaries", "Dashboard matches expected output sheet after sample test data is entered."],
  ["Security", "Member/admin/product owner access and group isolation", "No data from other groups appears in current group session."],
], [24, 72, 72]);
note(summary, "A17", "Recommended sample period: May 2026. Sample group: Maitri Test Group (BG-T01). Members: Asha Admin, Bhavna Member, Chitra Approver.");

const login = sheet("01 Login Register");
setTitle(login, "Login And Registration Tests", "Run these before financial testing so the user and group identities are clean.");
table(login, 4, ["TC ID", "Scenario", "Input / Steps", "Expected Result", "Actual Result", "Status"], [
  ["LR-01", "Register new user", "Full name: Asha Admin; email: asha.test@example.com; mobile optional; set password", "User is created. Profile name shows Asha Admin. No random member name is created.", "", ""],
  ["LR-02", "Duplicate email blocked", "Try registering again with asha.test@example.com", "Registration is stopped with readable message: account already exists.", "", ""],
  ["LR-03", "Resend OTP", "Use expired/invalid OTP link, click Resend OTP", "New verification email is sent and message disappears automatically after a few seconds.", "", ""],
  ["LR-04", "Forgot password", "Click forgot password and open email link", "Redirect opens app reset password page. Password can be updated.", "", ""],
  ["LR-05", "Create group", "Login as Asha, create Maitri Test Group", "Asha is inserted in members table for this group and assigned Admin role.", "", ""],
  ["LR-06", "Group list details", "Open Your Groups", "Group name, group code, and creator name are visible.", "", ""],
  ["LR-07", "Hide/unhide group", "Hide one group, then open hidden groups and unhide", "Hidden group is removed from normal list and returns after unhide.", "", ""],
  ["LR-08", "Member registers later", "Add Bhavna with email bhavna.test@example.com, then register using same email", "Bhavna can see all groups where that email is a member and can create a new group if needed.", "", ""],
], [14, 34, 58, 64, 24, 16]);

const setup = sheet("02 Setup Tests");
setTitle(setup, "Setup Tests", "Use null member setup values to confirm fallback to group setup.");
table(setup, 4, ["TC ID", "Setup Area", "Input Values", "Expected Result", "Actual Result", "Status"], [
  ["ST-01", "Group setup", "Monthly saving 1000; interest 2%; penalty 100; loan limit 10000; tenure 6; due day 10", "Values save or go for approval based on approver setup. Notification shows only changed fields.", "", ""],
  ["ST-02", "Member setup null fallback", "Asha custom saving blank; loan limit blank; tenure blank; interest blank", "Stored as NULL, not 0. Transactions/loans use group setup values.", "", ""],
  ["ST-03", "Member setup override", "Bhavna custom saving 1500; loan limit 7000; tenure blank", "Bhavna uses saving 1500 and loan limit 7000; tenure still falls back to group 6.", "", ""],
  ["ST-04", "Approval setup", "Make Chitra approver. Admin remains checked for creator.", "Admin checkbox is checked for creator; Chitra receives approval requests.", "", ""],
  ["ST-05", "Pending setup approval panel", "Make any setup change while approver exists", "Bottom of setup page shows setup type, changed values, status, and pending approver.", "", ""],
  ["ST-06", "Period default closed", "Create May 2026 period but do not open", "Transactions are allowed only if no other period is open. Period itself remains Closed until opened.", "", ""],
  ["ST-07", "Open selected period", "Select May 2026, click Open selected period", "May 2026 opens, all other periods close. Not April 2026.", "", ""],
  ["ST-08", "Required field marker", "Open setup forms", "Only calculation/login mandatory fields show * mark.", "", ""],
], [14, 30, 60, 64, 24, 16]);

const legacy = sheet("03 Legacy Migration");
setTitle(legacy, "Legacy Migration Tests", "Migration values should create approved/pending financial entries and clean history.");
table(legacy, 4, ["TC ID", "Scenario", "Input Values", "Expected Result", "Actual Result", "Status"], [
  ["LM-01", "Group opening migration", "Opening bank 5000; old group gain 600; old expense 300; date 2026-05-01", "If approver exists, status Pending and visible in approvals. After approval it affects dashboard.", "", ""],
  ["LM-02", "Member opening Asha", "Saving 2000; joined date 2026-05-01", "One member history row only. No duplicate source rows. No unused share earned/bank balance columns shown.", "", ""],
  ["LM-03", "Member opening Chitra", "Saving 1000; optional old loan 3000; old interest 120; old penalty 50", "Migration creates transaction/loan opening entries as per architecture after approval.", "", ""],
  ["LM-04", "Excess in migration", "Saving setup 1000, migration received amount 1300", "Split shows 1000 saving + 300 excess. Both are included in savings.", "", ""],
  ["LM-05", "No approvers configured", "Remove approver setup, save member migration", "Migration auto completes and immediately reflects in dashboard.", "", ""],
], [14, 34, 58, 68, 24, 16]);

const trx = sheet("04 Transactions");
setTitle(trx, "Transaction And Expense Tests", "Completed transactions only should affect dashboard.");
table(trx, 4, ["TC ID", "Scenario", "Input Values", "Expected Split / Result", "Actual Result", "Status"], [
  ["TR-01", "Asha saving", "Member Asha; date 2026-05-05; amount 1000", "Saving 1000. If no approver setup, status Completed.", "", ""],
  ["TR-02", "Bhavna saving with excess", "Member Bhavna; date 2026-05-06; amount 2000", "Saving 1500 + excess 500. Dashboard saving includes full 2000.", "", ""],
  ["TR-03", "Loan repayment preview", "Asha loan outstanding 5000; payment date 2026-05-20; amount 1200", "Before save preview shows saving 1000, interest about 33, principal about 167.", "", ""],
  ["TR-04", "Edit allocation validation", "Try interest above calculated value", "Blocked. Interest cannot exceed calculated interest.", "", ""],
  ["TR-05", "Principal validation", "Try principal above outstanding amount", "Blocked. Principal cannot exceed outstanding principal.", "", ""],
  ["TR-06", "Penalty changed manually", "Increase penalty in edit allocation", "Excess adjusts first, then principal, then interest; remaining unpaid interest stays for next payment.", "", ""],
  ["TR-07", "Group expense split", "Expense 300; lines Rent 200 and Bank charge 100", "Header and lines total must match. Creates expense header/lines and member expense share 100 each for 3 active members.", "", ""],
  ["TR-08", "Pending transaction", "Configure approver then save transaction", "Transaction remains Pending. It is not included in dashboard until all approvals complete.", "", ""],
], [14, 34, 58, 72, 24, 16]);

const loans = sheet("05 Loans Approvals");
setTitle(loans, "Loan And Approval Tests", "Loan requests should go to approvers/admin and only become active after approval.");
table(loans, 4, ["TC ID", "Scenario", "Input Values", "Expected Result", "Actual Result", "Status"], [
  ["LA-01", "Member loan request", "Login as Asha/Bhavna member; loan amount 5000; reason optional/blank", "Member can request loan only for self. Request goes to approvers/admin.", "", ""],
  ["LA-02", "Loan eligibility - account balance", "Account balance 5000; loan limit 10000; request 8000", "Blocked. Eligible amount is only 5000.", "", ""],
  ["LA-03", "Loan eligibility - setup limit", "Account balance 20000; member/group loan limit 10000; request 15000", "Blocked because setup loan limit is less than requested amount.", "", ""],
  ["LA-04", "Loan approval completion", "All approvers approve loan request", "Loan becomes Active and disbursement entry is created.", "", ""],
  ["LA-05", "Approval action confirm", "Click Approve/Reject action", "Confirmation popup appears. After confirm, buttons are disabled for that approval.", "", ""],
  ["LA-06", "Pending from label", "Create loan with multiple approvers", "Loan/approval row shows whose approval is pending.", "", ""],
  ["LA-07", "Oldest loan repayment priority", "Member has two active loans; create repayment", "Interest is collected for all loans first, then principal against oldest loan first.", "", ""],
], [14, 36, 58, 72, 24, 16]);

const corrections = sheet("06 Corrections");
setTitle(corrections, "Adjustment And Reversal Tests", "Approved financial records must not be directly edited or deleted.");
table(corrections, 4, ["TC ID", "Scenario", "Input Values", "Expected Result", "Actual Result", "Status"], [
  ["CR-01", "Partial adjustment", "Original collection 2000; correct amount 1500", "Create adjustment -500 as child entry. If approvers exist, pending until all approve.", "", ""],
  ["CR-02", "Full reversal", "Wrong member selected for 1000 collection", "Create full negative reversal child entry. Original record stays unchanged.", "", ""],
  ["CR-03", "Adjustment approval", "Approver approves adjustment", "Only after approval adjustment affects dashboard and audit history.", "", ""],
  ["CR-04", "Reversal audit", "Open audit history for reversed transaction", "Audit shows parent transaction, reversal action, changed by, date and remarks.", "", ""],
  ["CR-05", "No direct edit/delete", "Try editing approved transaction directly", "UI only offers View, Adjust, Reverse, Audit History.", "", ""],
], [14, 36, 58, 72, 24, 16]);

const security = sheet("07 Role Security");
setTitle(security, "Role, Privacy And Product Owner Tests", "Current group session must never show another group data.");
table(security, 4, ["TC ID", "Scenario", "Steps", "Expected Result", "Actual Result", "Status"], [
  ["RS-01", "Member view only", "Login as member without admin role", "Setup, transactions and admin loan actions are hidden/restricted. Dashboards/reports/contact visible.", "", ""],
  ["RS-02", "Approver access", "Login as Chitra approver", "Approvals visible only for groups where Chitra is approver.", "", ""],
  ["RS-03", "Group isolation dashboard", "Switch from BG-T01 to another group", "All dashboard, member, loan, contact, profile context changes to selected group only.", "", ""],
  ["RS-04", "Profile context", "Open profile while current group is BG-T01", "Shows logged-in user profile, not another member from another group.", "", ""],
  ["RS-05", "Product owner login", "Login with katgroupsupport@gmail.com", "Product Owner page visible. Profile does not show normal member details from unrelated group.", "", ""],
  ["RS-06", "Product owner disputes", "Open support disputes and attachment", "Attachment downloads; chat replies are visible only to that user and group session.", "", ""],
  ["RS-07", "Popup readability", "Trigger validation error", "Popup background is readable and disappears automatically after a few seconds.", "", ""],
], [14, 36, 58, 72, 24, 16]);

const calc = sheet("09 Calculation Details");
setTitle(calc, "Sample Calculation Inputs", "These values feed the expected dashboard sheet. Replace Actual values while testing if your data differs.");
table(calc, 4, ["Input", "Value", "Notes"], [
  ["Active members", 3, "Asha, Bhavna, Chitra"],
  ["Group monthly saving", 1000, "Group setup"],
  ["Bhavna monthly saving override", 1500, "Member setup override"],
  ["Monthly interest rate", 0.02, "2% per month"],
  ["Loan due day", 10, "Finance setup"],
  ["Opening bank balance", 5000, "Group legacy opening"],
  ["Opening group gain", 600, "Legacy group earning from old interest/penalty"],
  ["Opening group expense", 300, "Legacy group expense"],
  ["Asha migrated saving", 2000, "Member legacy opening"],
  ["Chitra migrated saving", 1000, "Member legacy opening"],
  ["Asha May saving", 1000, "TR-01"],
  ["Bhavna May saving plus excess", 2000, "TR-02: 1500 saving + 500 excess"],
  ["Loan disbursed to Asha", 5000, "LA-04"],
  ["Repayment amount", 1200, "TR-03"],
  ["Repayment saving portion", 1000, "From group setup"],
  ["Repayment interest portion", 33, "Approx 5000 * 2% * 10/30"],
  ["Repayment principal portion", 167, "1200 - 1000 - 33"],
  ["Penalty collected", 0, "No late penalty in base sample"],
  ["May group expense", 300, "TR-07"],
  ["Member expense share", 100, "300 / 3 active members"],
  ["Asha distributed gain", 11, "33 / 3 simple sample; use weighted distribution when enabled"],
  ["Bhavna distributed gain", 11, "33 / 3 simple sample"],
  ["Chitra distributed gain", 11, "33 / 3 simple sample"],
], [42, 18, 80]);
calc.getRange("B8:B27").format.numberFormat = [["0.00"]];

const dashboard = sheet("08 Dashboard Expected");
setTitle(dashboard, "Dashboard Expected Output", "Expected values after entering the sample data and completing required approvals.");
table(dashboard, 4, ["Dashboard Field", "Expected Value", "Formula / Meaning", "Actual App Value", "Pass/Fail"], [
  ["Total savings", "='09 Calculation Details'!B13+'09 Calculation Details'!B14+'09 Calculation Details'!B15+'09 Calculation Details'!B16+'09 Calculation Details'!B18", "Asha migrated + Chitra migrated + Asha saving + Bhavna saving/excess + repayment saving", "", ""],
  ["Collected in May 2026", "='09 Calculation Details'!B15+'09 Calculation Details'!B16+'09 Calculation Details'!B18+'09 Calculation Details'!B19+'09 Calculation Details'!B20", "Savings + principal collected + interest collected + penalty. Excludes loan disbursed and expenses.", "", ""],
  ["Collected split - savings", "='09 Calculation Details'!B15+'09 Calculation Details'!B16+'09 Calculation Details'!B18", "Savings includes excess amount", "", ""],
  ["Collected split - principal", "='09 Calculation Details'!B19", "Principal collected this month", "", ""],
  ["Collected split - interest", "='09 Calculation Details'!B20", "Interest collected this month", "", ""],
  ["Collected split - penalty", "='09 Calculation Details'!B21", "Penalty collected this month", "", ""],
  ["Active loan count", 1, "Asha active loan", "", ""],
  ["Closed loan count till now", 0, "No closed loan in base sample", "", ""],
  ["Loans activated in May 2026", 1, "Asha loan approved in May", "", ""],
  ["Loans disbursed till now count", 1, "One approved loan disbursement", "", ""],
  ["Active loan amount", "='09 Calculation Details'!B17-'09 Calculation Details'!B19", "Outstanding principal = disbursed - principal repaid", "", ""],
  ["Loan disbursed in May 2026", "='09 Calculation Details'!B17", "Loan amount released in current month", "", ""],
  ["Loan disbursed till now", "='09 Calculation Details'!B17", "Total loan disbursement so far", "", ""],
  ["Loan repaid till now", "='09 Calculation Details'!B19", "Principal repaid so far", "", ""],
  ["Remaining account balance", "='09 Calculation Details'!B9+B5+'09 Calculation Details'!B10-'09 Calculation Details'!B17-('09 Calculation Details'!B11+'09 Calculation Details'!B22)", "Opening bank + May collected + opening gain - loan disbursed - total expenses", "", ""],
  ["Remaining split - outstanding loan", "='09 Calculation Details'!B17-'09 Calculation Details'!B19", "Outstanding principal", "", ""],
  ["Remaining split - overall expense", "='09 Calculation Details'!B11+'09 Calculation Details'!B22", "Opening expense + May expense", "", ""],
  ["Remaining split - gain", "='09 Calculation Details'!B10+'09 Calculation Details'!B20+'09 Calculation Details'!B21", "Opening gain + interest + penalty; not negative expense", "", ""],
  ["Remaining split - savings", "=B5", "Same as total savings", "", ""],
  ["Member Asha savings", "='09 Calculation Details'!B13+'09 Calculation Details'!B15+'09 Calculation Details'!B18", "Savings field does not subtract expenses", "", ""],
  ["Member Asha gain", "='09 Calculation Details'!B24", "Distributed gain from interest/penalty", "", ""],
  ["Member Asha expense", "='09 Calculation Details'!B11/'09 Calculation Details'!B7+'09 Calculation Details'!B23", "Opening expense share + May expense share", "", ""],
  ["Member Asha outstanding loan", "='09 Calculation Details'!B17-'09 Calculation Details'!B19", "Active loan outstanding principal", "", ""],
  ["Member Asha share amount", "=B24+B25-B26-B27", "Savings + gain - expense - outstanding loan", "", ""],
  ["Member Asha next minimum due", "='09 Calculation Details'!B5+'09 Calculation Details'!B20+'09 Calculation Details'!B21", "Saving setup + interest due + penalty due", "", ""],
], [36, 20, 82, 24, 16]);
dashboard.getRange("B5:B29").format.numberFormat = [["0.00"]];
note(dashboard, "A32", "If your app uses weighted group-gain distribution instead of equal distribution, replace member gain rows with the weighted result while keeping the same dashboard principles.");

const regression = sheet("10 Final Regression");
setTitle(regression, "Final End-To-End Regression", "Use this sheet after individual tests pass.");
table(regression, 4, ["Run Order", "End-to-End Flow", "Expected Result", "Actual Result", "Status"], [
  [1, "Register Asha, create group, verify creator admin/member", "Asha appears in member LOV and admin role setup.", "", ""],
  [2, "Add Bhavna and Chitra, configure Chitra approver", "Only BG-T01 members are visible in BG-T01.", "", ""],
  [3, "Open May 2026 period", "May opens, other periods close.", "", ""],
  [4, "Enter group/member legacy migration and approve", "One clean history row per member; group opening has approval/history.", "", ""],
  [5, "Enter savings/excess and group expense", "Dashboard savings include excess; expense is split to active members.", "", ""],
  [6, "Request and approve loan", "Loan request appears in approvals and becomes active only after approvals complete.", "", ""],
  [7, "Enter repayment", "Preview calculates interest before save and applies repayment to interest then principal.", "", ""],
  [8, "Create adjustment/reversal and approve", "Dashboard updates only after approval; audit history is complete.", "", ""],
  [9, "Login as member", "Member has view-only access and can request own loan.", "", ""],
  [10, "Login as product owner", "Product owner dashboard, disputes, subscriptions and group inspection are visible without leaking wrong profile context.", "", ""],
  [11, "Compare dashboard with expected output sheet", "All key dashboard values match or differences are explained by changed test values.", "", ""],
], [14, 64, 72, 24, 16]);

for (const ws of wb.worksheets.items) {
  ws.freezePanes.freezeRows(3);
  ws.getRange("A:Z").format.wrapText = true;
}

await wb.recalculate();
const inspected = await wb.inspect();
if (inspected.errors?.length) {
  console.warn("Workbook inspect warnings/errors:", JSON.stringify(inspected.errors, null, 2));
}
const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outPath);
console.log(outPath);
