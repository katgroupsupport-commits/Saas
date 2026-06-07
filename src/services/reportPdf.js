import { supabase } from "../lib/supabase";

const reportDefinitions = {
  "Members Report": {
    table: "members",
    select: "member_name,mobile_number,group_id,join_date,status",
    columns: [
      { key: "memberName", header: "Member name" },
      { key: "mobile", header: "Mobile" },
      { key: "group", header: "Group" },
      { key: "joiningDate", header: "Joining date" },
      { key: "status", header: "Status" }
    ],
    map: (row, context) => ({
      memberName: row.member_name ?? row.fullName ?? "",
      mobile: row.mobile_number ?? row.mobile ?? "",
      group: context.groupNameById?.[row.group_id ?? row.groupId] ?? row.groupName ?? context.groupName ?? "",
      joiningDate: row.join_date ?? row.dateJoined ?? "",
      status: row.status ?? ""
    })
  },
  "Savings Report": {
    table: "member_transaction_header",
    select: "trx_date,total_amount,approval_status,member_id,trx_type",
    columns: [
      { key: "memberName", header: "Member name" },
      { key: "amount", header: "Amount" },
      { key: "date", header: "Date" },
      { key: "month", header: "Month" },
      { key: "paymentStatus", header: "Payment status" }
    ],
    map: (row, context) => ({
      memberName: context.memberNameById?.[row.member_id ?? row.memberId] ?? row.memberName ?? "",
      amount: row.total_amount ?? row.amount ?? "",
      date: row.trx_date ?? row.transactionDate ?? "",
      month: formatMonth(row.trx_date ?? row.transactionDate),
      paymentStatus: row.approval_status ?? row.approvalStatus ?? ""
    })
  },
  "Loan Report": {
    table: "loan_distribution",
    select: "member_id,distributed_amount,interest_rate,distribution_date,outstanding_principal,loan_status",
    columns: [
      { key: "memberName", header: "Member name" },
      { key: "loanAmount", header: "Loan amount" },
      { key: "interest", header: "Interest" },
      { key: "issuedDate", header: "Issued date" },
      { key: "balance", header: "Balance" },
      { key: "status", header: "Status" }
    ],
    map: (row, context) => ({
      memberName: context.memberNameById?.[row.member_id ?? row.memberId] ?? row.memberName ?? "",
      loanAmount: row.distributed_amount ?? row.amount ?? "",
      interest: row.interest_rate ?? row.rate ?? "",
      issuedDate: row.distribution_date ?? row.startDate ?? "",
      balance: row.outstanding_principal ?? row.principalOutstanding ?? "",
      status: row.loan_status ?? row.status ?? ""
    })
  },
  "Collection Report": {
    table: "member_transaction_header",
    select: "member_id,total_amount,trx_date,created_by,remarks,approval_status",
    columns: [
      { key: "memberName", header: "Member name" },
      { key: "amountCollected", header: "Amount collected" },
      { key: "date", header: "Date" },
      { key: "collector", header: "Collector" },
      { key: "remarks", header: "Remarks" }
    ],
    map: (row, context) => ({
      memberName: context.memberNameById?.[row.member_id ?? row.memberId] ?? row.memberName ?? "",
      amountCollected: row.total_amount ?? row.amount ?? "",
      date: row.trx_date ?? row.transactionDate ?? "",
      collector: context.userNameById?.[row.created_by ?? row.createdBy] ?? row.collector ?? "",
      remarks: row.remarks ?? ""
    })
  },
  "Monthly collection report": {
    columns: [
      { key: "Member name", header: "Member" },
      { key: "Amount collected this month", header: "Collected" },
      { key: "Saving this month", header: "Savings" },
      { key: "Principle collected this month", header: "Principal" },
      { key: "Interest collected", header: "Interest" },
      { key: "Penalty", header: "Penalty" }
    ]
  },
  "Fresh migration backup report": {
    columns: [
      { key: "Member name", header: "Member" },
      { key: "Username", header: "Username" },
      { key: "Share amount hold by the member excluding principle amount", header: "Share amount" },
      { key: "Outsatnding principle loan amount", header: "Principal loan" },
      { key: "Interest pending to be paid", header: "Interest due" },
      { key: "Penalty pending to be paid", header: "Penalty due" }
    ]
  },
  "Outstanding report": {
    columns: [
      { key: "memberName", header: "Member" },
      { key: "amount", header: "Loan amount" },
      { key: "principalOutstanding", header: "Principal due" },
      { key: "interestOutstanding", header: "Interest due" },
      { key: "penaltyOutstanding", header: "Penalty due" },
      { key: "status", header: "Status" }
    ]
  },
  "Savings statement": {
    columns: [
      { key: "fullName", header: "Member" },
      { key: "mobile", header: "Mobile" },
      { key: "savings", header: "Savings" },
      { key: "shares", header: "Shares" },
      { key: "status", header: "Status" }
    ]
  },
  "Audit log": {
    columns: [
      { key: "timestamp", header: "When" },
      { key: "actor", header: "Actor" },
      { key: "action", header: "Action" },
      { key: "tableName", header: "Table" },
      { key: "recordId", header: "Record" }
    ]
  }
};

export function getReportColumns(reportName) {
  return (reportDefinitions[reportName]?.columns ?? inferColumns([])).map((column) => ({ ...column }));
}

export async function fetchReportData(reportName, context = {}) {
  const definition = reportDefinitions[reportName];
  if (!definition?.table) return context.fallbackRows ?? [];

  if (supabase) {
    let query = supabase.from(definition.table).select(definition.select);
    if (context.groupId && ["members", "member_transaction_header", "loan_distribution"].includes(definition.table)) {
      query = query.eq("group_id", context.groupId);
    }
    const { data, error } = await query.limit(1000);
    if (error) throw error;
    return (data ?? []).map((row) => definition.map(row, context));
  }

  return (context.fallbackRows ?? []).map((row) => definition.map(row, context));
}

export function generateReportPdf(reportName, data, options = {}) {
  const rows = Array.isArray(data) ? data.map(flattenRow) : [];
  if (rows.length === 0) {
    throw new Error(`No data found for ${reportName}.`);
  }
  const columns = reportDefinitions[reportName]?.columns ?? inferColumns(rows);

  const generatedAt = new Date();
  const title = reportName;
  const subtitle = [
    options.groupName ? `Group: ${options.groupName}` : "",
    `Generated: ${generatedAt.toLocaleString("en-IN")}`,
    `Rows: ${rows.length}`
  ].filter(Boolean);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 36;
  const usableWidth = pageWidth - margin * 2;
  const rowHeight = 22;
  const headerHeight = 92;
  const columnWidth = usableWidth / Math.max(1, columns.length);
  const encoder = new TextEncoder();

  function escapePdf(value) {
    return String(value ?? "")
      .replace(/[^\x20-\x7E]/g, " ")
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
  }

  function text(commands, value, x, y, size = 9, bold = false) {
    commands.push(`0 g BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`);
  }

  function rect(commands, x, y, width, height, gray = "0.95") {
    commands.push(`${gray} g ${x} ${y} ${width} ${height} re f 0.84 G ${x} ${y} ${width} ${height} re S`);
  }

  function makePage(pageRows, pageIndex, totalPages) {
    const commands = [];
    text(commands, title, margin, pageHeight - 42, 16, true);
    subtitle.forEach((line, index) => text(commands, line, margin, pageHeight - 60 - index * 13, 9));
    text(commands, `Page ${pageIndex + 1} of ${totalPages}`, pageWidth - 110, pageHeight - 42, 9);

    let y = pageHeight - headerHeight - 12;
    rect(commands, margin, y, usableWidth, rowHeight, "0.90");
    columns.forEach((column, index) => {
      text(commands, column.header.slice(0, 18), margin + index * columnWidth + 4, y + 7, 8, true);
    });

    y -= rowHeight;
    pageRows.forEach((row, rowIndex) => {
      rect(commands, margin, y, usableWidth, rowHeight, rowIndex % 2 === 0 ? "1" : "0.97");
      columns.forEach((column, index) => {
        const value = row[column.key] ?? "";
        text(commands, String(value).slice(0, 22), margin + index * columnWidth + 4, y + 7, 8);
      });
      y -= rowHeight;
    });
    return commands.join("\n");
  }

  const rowsPerPage = Math.max(1, Math.floor((pageHeight - headerHeight - 60) / rowHeight));
  const pageRows = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pageRows.push(rows.slice(index, index + rowsPerPage));
  }

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  const pageObjectIds = [];
  pageRows.forEach((rowsForPage, index) => {
    const stream = makePage(rowsForPage, index, pageRows.length);
    const pageId = objects.length + 1;
    const contentId = objects.length + 2;
    pageObjectIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: "application/pdf" });
}

export async function downloadOrSharePdf(fileBlob, fileName) {
  const capacitorResult = await shareWithCapacitorIfAvailable(fileBlob, fileName);
  if (capacitorResult) return capacitorResult;

  const file = new File([fileBlob], fileName, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({
      title: fileName,
      text: "Bachat Gat report PDF",
      files: [file]
    });
    return "shared";
  }

  const url = URL.createObjectURL(fileBlob);
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return "opened";
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.position = "fixed";
  anchor.style.left = "-9999px";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}

async function shareWithCapacitorIfAvailable(fileBlob, fileName) {
  const capacitor = window.Capacitor;
  const plugins = capacitor?.Plugins ?? window.Capacitor?.plugins;
  const filesystem = plugins?.Filesystem;
  const share = plugins?.Share;
  const isNative = typeof capacitor?.isNativePlatform === "function" ? capacitor.isNativePlatform() : Boolean(capacitor?.platform && capacitor.platform !== "web");
  if (!isNative || !filesystem || !share) return "";

  const base64 = await blobToBase64(fileBlob);
  const writeResult = await filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: "CACHE",
    recursive: true
  });
  await share.share({
    title: fileName,
    text: "Bachat Gat report PDF",
    url: writeResult.uri,
    dialogTitle: "Open or share report"
  });
  return "shared";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(blob);
  });
}

export function makeReportFileName(reportName, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `${reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${stamp}.pdf`;
}

function formatMonth(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function inferColumns(rows) {
  const first = rows?.[0] ?? {};
  return Object.keys(first).slice(0, 8).map((key) => ({ key, header: toHeaderLabel(key) }));
}

function flattenRow(value, prefix = "") {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce((result, [key, innerValue]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (innerValue && typeof innerValue === "object" && !Array.isArray(innerValue)) {
      return { ...result, ...flattenRow(innerValue, nextKey) };
    }
    return {
      ...result,
      [nextKey]: Array.isArray(innerValue) ? innerValue.join(" | ") : formatCellValue(innerValue)
    };
  }, {});
}

function formatCellValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "";
  return String(value);
}

function toHeaderLabel(key) {
  return String(key)
    .replace(/\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
