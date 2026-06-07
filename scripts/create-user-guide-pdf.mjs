import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputPath = resolve("public/user-guide.pdf");
const page = { width: 595, height: 842 };
const teal = [0.06, 0.45, 0.41];
const navy = [0.06, 0.14, 0.25];
const gold = [0.79, 0.54, 0.02];
const greenSoft = [0.93, 0.99, 0.96];
const blueSoft = [0.94, 0.97, 1];
const goldSoft = [1, 0.98, 0.92];
const line = [0.78, 0.84, 0.9];
const muted = [0.38, 0.44, 0.52];

function esc(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function rgb([r, g, b]) {
  return `${r} ${g} ${b}`;
}

function wrap(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function text(cmd, value, x, y, size = 10, color = navy, bold = false) {
  cmd.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb(color)} rg ${x} ${y} Td (${esc(value)}) Tj ET`);
}

function rect(cmd, x, y, w, h, fill, stroke = line) {
  cmd.push(`${rgb(fill)} rg ${x} ${y} ${w} ${h} re f`);
  cmd.push(`${rgb(stroke)} RG 0.8 w ${x} ${y} ${w} ${h} re S`);
}

function header(cmd, subtitle) {
  rect(cmd, 0, 785, page.width, 57, navy, navy);
  text(cmd, "Bachat Gat SaaS", 42, 815, 18, [1, 1, 1], true);
  text(cmd, subtitle, 42, 796, 10, [0.86, 0.93, 0.96]);
}

function section(cmd, title, y) {
  rect(cmd, 38, y - 5, 519, 28, greenSoft, [0.78, 0.9, 0.87]);
  text(cmd, title, 52, y + 4, 13, teal, true);
}

function flow(cmd, steps, y) {
  const boxW = 104;
  const gap = 23;
  let x = 42;
  steps.forEach((step, index) => {
    rect(cmd, x, y, boxW, 58, index % 2 === 0 ? blueSoft : greenSoft);
    text(cmd, String(index + 1), x + 10, y + 37, 12, teal, true);
    wrap(step, 15).slice(0, 2).forEach((lineText, lineIndex) => {
      text(cmd, lineText, x + 30, y + 38 - lineIndex * 14, 10, navy, true);
    });
    if (index < steps.length - 1) text(cmd, ">", x + boxW + 8, y + 24, 16, gold, true);
    x += boxW + gap;
  });
}

function noteGrid(cmd, notes, y, soft = goldSoft) {
  const colW = 247;
  const rowH = 62;
  notes.forEach((note, index) => {
    const x = index % 2 === 0 ? 42 : 306;
    const row = Math.floor(index / 2);
    const top = y - row * (rowH + 12);
    rect(cmd, x, top, colW, rowH, soft);
    const [title, body] = note;
    text(cmd, title, x + 12, top + 39, 10.5, navy, true);
    wrap(body, 34).slice(0, 2).forEach((lineText, lineIndex) => {
      text(cmd, lineText, x + 12, top + 23 - lineIndex * 12, 9, muted);
    });
  });
}

function bulletList(cmd, items, x, y) {
  items.forEach((item, index) => {
    const itemY = y - index * 24;
    text(cmd, "-", x, itemY, 11, teal, true);
    text(cmd, item, x + 16, itemY, 10, navy);
  });
}

function miniFlow(cmd, steps, x, y, cols = 5) {
  const boxW = 92;
  const boxH = 42;
  const gapX = 12;
  const gapY = 18;
  steps.forEach((step, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = x + col * (boxW + gapX);
    const top = y - row * (boxH + gapY);
    rect(cmd, left, top, boxW, boxH, index % 2 === 0 ? blueSoft : greenSoft);
    text(cmd, String(index + 1), left + 7, top + 25, 9, teal, true);
    wrap(step, 13).slice(0, 2).forEach((lineText, lineIndex) => {
      text(cmd, lineText, left + 23, top + 26 - lineIndex * 11, 8, navy, true);
    });
  });
}

function pageOne() {
  const cmd = [];
  header(cmd, "Complete process flow");
  text(cmd, "Follow this order when starting a new group.", 42, 746, 16, navy, true);
  text(cmd, "Completed records show in dashboard and reports. Pending approvals do not change balances.", 42, 724, 10, muted);
  section(cmd, "Full app flow", 682);
  miniFlow(cmd, [
    "Register",
    "Login",
    "Create group",
    "Add members",
    "Group setup",
    "Member setup",
    "Financial setup",
    "Legacy migration",
    "Transactions",
    "Approval flow",
    "Loan request",
    "Loan approval",
    "Withdrawal request",
    "Withdrawal approval",
    "Adjustment / reversal",
    "Correction approval",
    "Base tables",
    "Dashboard reports"
  ], 42, 596);
  section(cmd, "Quick flows", 214);
  flow(cmd, ["Select member", "Enter amount", "Check split", "Save"], 136);
  return cmd.join("\n");
}

function pageTwo() {
  const cmd = [];
  header(cmd, "Main features");
  section(cmd, "What users can do", 742);
  noteGrid(cmd, [
    ["Member login", "Member registers with the same email used while adding member."],
    ["See own groups", "After login, member can see all groups where that email is added."],
    ["Create new group", "Logged-in user can create new group and becomes group admin."],
    ["Dashboard access", "Members can freely see their own dashboard and group summary."],
    ["Active / inactive", "Inactive members stop getting future event profit share."],
    ["Role restriction", "Admin manages setup. Member gets view and own loan request access."],
    ["Withdrawal", "Member requests self withdrawal. Admin can request for any member."],
    ["Period restriction", "If a period is open, entries are allowed only in that period."],
    ["Corrections", "Wrong entries use adjustment or reversal. Original entry stays safe."]
  ], 650, greenSoft);
  return cmd.join("\n");
}

function pageThree() {
  const cmd = [];
  header(cmd, "Setup values and when to use them");
  section(cmd, "Setup flow", 742);
  flow(cmd, ["Group setup", "Member setup", "Loan setup", "Approver setup"], 664);
  noteGrid(cmd, [
    ["Monthly saving", "Default amount every member should pay each month."],
    ["Interest rate", "Monthly rate. Example: 2 means 2 percent per month."],
    ["Penalty", "Late payment charge. Keep 0 if the group does not use penalty."],
    ["Loan limit", "Maximum loan allowed. Member setup can override group setup."],
    ["Loan tenure", "Number of months allowed to repay the loan."],
    ["Due day", "Monthly date by which loan repayment should be paid."],
    ["Approvers", "People who approve loan, transaction, migration and correction."],
    ["Open period", "Only one month should be open when entries are being posted."]
  ], 548);
  text(cmd, "Rule: member setup value is used first. If blank or zero, group setup value is used.", 42, 92, 10, teal, true);
  text(cmd, "Use financial setup before regular transactions so calculation stays correct.", 42, 72, 10, teal, true);
  return cmd.join("\n");
}

function pageFour() {
  const cmd = [];
  header(cmd, "Legacy migration and expense handling");
  section(cmd, "Legacy migration flow", 742);
  flow(cmd, ["Choose member", "Enter old balance", "Check loan/expense", "Migrate"], 664);
  noteGrid(cmd, [
    ["When to use", "Use when moving old notebook/register balance to this app."],
    ["Saving balance", "Old saved amount held by the member."],
    ["Pending loan", "Old loan amount still pending from that member."],
    ["Old interest", "Interest already pending before using the app."],
    ["Old group gain", "Profit already earned by group before app start."],
    ["Old expense", "Expense already spent by group before app start."]
  ], 548, blueSoft);
  section(cmd, "Expense flow", 270);
  flow(cmd, ["Enter expense", "Add split lines", "Total must match", "Member share reduces"], 192);
  text(cmd, "Expense split line examples: rent, bank charges, meeting expense, stationery.", 42, 112, 10, muted);
  text(cmd, "Header amount and all split line amounts must be equal before saving.", 42, 92, 10, teal, true);
  return cmd.join("\n");
}

function pageFive() {
  const cmd = [];
  header(cmd, "Gain sharing rules");
  section(cmd, "Loan interest sharing", 742);
  flow(cmd, ["Loan date share", "Ignore new savings", "Reduce withdrawals", "Share interest"], 664);
  noteGrid(cmd, [
    ["Loan interest", "Shared by old share amount and how long it stayed in group."],
    ["New member", "Member added after loan date does not get that loan interest."],
    ["Extra saving", "Saving added after loan date is not counted for that loan."],
    ["Withdrawal", "Withdrawal reduces old eligible share from that date."],
    ["Penalty", "Shared equally between active members."],
    ["Other income", "Shared equally between active members."]
  ], 548, blueSoft);
  text(cmd, "Example: penalty 100 and 2 active members means 50 each.", 42, 112, 10, teal, true);
  text(cmd, "Example: other income 300 and 3 active members means 100 each.", 42, 92, 10, teal, true);
  return cmd.join("\n");
}

function pageSix() {
  const cmd = [];
  header(cmd, "Approvals, interest and corrections");
  section(cmd, "Approval flow", 742);
  flow(cmd, ["Entry created", "Approval pending", "All approvers approve", "Dashboard updates"], 664);
  noteGrid(cmd, [
    ["Transactions", "If approvers exist, collection waits until approval."],
    ["Loans", "Loan request becomes active only after approval."],
    ["Migration", "Old data migration waits for approval if approvers exist."],
    ["Corrections", "Adjustment/reversal waits for approval if approvers exist."],
    ["Interest", "Interest is calculated from setup rate and payment date."],
    ["Gain share", "Group gain is shared by member share weight and holding time."]
  ], 548, goldSoft);
  section(cmd, "Wrong entry rule", 196);
  bulletList(cmd, [
    "Use adjustment when amount is partly wrong.",
    "Use reversal when whole entry is wrong.",
    "Approved original record is never edited directly.",
    "Audit history keeps who changed what and when."
  ], 54, 146);
  return cmd.join("\n");
}

function pageSeven() {
  const cmd = [];
  header(cmd, "Screen guide");
  section(cmd, "Common screens", 742);
  noteGrid(cmd, [
    ["Dashboard", "Shows this month collection, savings, loans and balance."],
    ["Transactions", "Use for savings, repayments, penalty and group expense."],
    ["Loans", "Member requests loan. Admin/approver approves before active."],
    ["Approvals", "Approve or reject pending work assigned to you."],
    ["Reports & Audit", "Download reports and see full history."],
    ["Contact", "Raise issue and chat with support."]
  ], 650, greenSoft);
  section(cmd, "Remember", 276);
  bulletList(cmd, [
    "Do not delete approved money entries.",
    "Use adjustment for small correction.",
    "Use reversal when full entry is wrong.",
    "Only completed entries show in dashboard.",
    "Open the correct period before posting."
  ], 54, 226);
  text(cmd, "End of guide", 42, 58, 12, teal, true);
  return cmd.join("\n");
}

function pageEight() {
  const cmd = [];
  header(cmd, "Formula guide");
  section(cmd, "Dashboard and backend formulas", 742);
  noteGrid(cmd, [
    ["Total savings", "Completed savings + excess savings + migrated savings + corrections."],
    ["This month collection", "Savings + principal + interest + penalty + migrated/corrections."],
    ["Remaining balance", "Collections + migration - loans - withdrawals - expenses."],
    ["Group gain", "Interest + penalty + other income. Waiver is not gain."],
    ["Member share", "Savings + gain - expense - outstanding loan/interest/penalty."],
    ["Saving split", "Only unpaid saving for the month is collected as saving."],
    ["Loan interest", "Principal x monthly rate x days / 30 / 100."],
    ["Loan eligibility", "Minimum of account balance and member/group loan limit."]
  ], 650, blueSoft);
  section(cmd, "Distribution formulas", 270);
  bulletList(cmd, [
    "Loan interest share = interest x member capital-time weight / total weight.",
    "Penalty share = penalty amount / active members.",
    "Other income share = other income / active members.",
    "Member setup is used first. If blank or zero, group setup is used.",
    "Waived interest reduces receivable amount. It is not distributed."
  ], 54, 220);
  return cmd.join("\n");
}

function pageNine() {
  const cmd = [];
  header(cmd, "Reconciliation guide");
  section(cmd, "End of day or month checks", 742);
  noteGrid(cmd, [
    ["Group balance", "Opening + collections + gain - loans - withdrawals - expenses = closing."],
    ["Member share", "Opening share + saving + gain - withdrawal - expense - loan due = closing."],
    ["Transaction check", "Header amount must equal all split lines."],
    ["Expense check", "Expense header must equal category line total."],
    ["Loan check", "Opening loan + disbursement + charges - repayments - waiver = closing."],
    ["Approval check", "Pending entries do not affect dashboards until completed."]
  ], 650, goldSoft);
  return cmd.join("\n");
}

const pageStreams = [pageOne(), pageTwo(), pageThree(), pageFour(), pageFive(), pageSix(), pageSeven(), pageEight(), pageNine()];

const objects = [];
function addObject(body) {
  objects.push(body);
  return objects.length;
}

const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
const pagesId = addObject("");
const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
const pageIds = [];

pageStreams.forEach((stream) => {
  const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  pageIds.push(pageId);
});

objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((body, index) => {
  offsets.push(Buffer.byteLength(pdf, "utf8"));
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(pdf, "utf8");
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
offsets.slice(1).forEach((offset) => {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
});
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, pdf);
console.log(`Created ${outputPath}`);
