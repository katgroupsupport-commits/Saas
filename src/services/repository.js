import { supabase } from "../lib/supabase.js";
import { initialState } from "./storage.js";
import { roles } from "./permissions.js";

function requireClient() {
  if (!supabase) {
    throw new Error("Cloud sync is not configured.");
  }
  return supabase;
}

function toIsoDate(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextDocumentNumber(prefix = "DOC") {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-6)}`;
}

function normalizeRole(role) {
  return Object.values(roles).includes(role) ? role : roles.MEMBER;
}

function isProductOwnerEmail(email) {
  return String(email ?? "").toLowerCase() === "katgroupsupport@gmail.com";
}

function normalizeEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return normalized || null;
}

function periodStatus(value) {
  const normalized = String(value ?? "Open").toUpperCase();
  if (normalized === "OPEN") return "Open";
  if (normalized === "CLOSED") return "Closed";
  if (normalized === "PERMANENTLY CLOSED") return "Permanently Closed";
  return "Future";
}

function dbStatus(value) {
  return String(value ?? "").toUpperCase();
}

function lineTypeForAllocation(key) {
  return {
    savings: "SAVING",
    principal: "LOAN_PRINCIPAL",
    interest: "LOAN_INTEREST",
    penalty: "PENALTY",
    excess: "SAVING",
    charges: "CHARGES"
  }[key];
}

function transactionTypeFromLines(lines = [], fallback = "Savings Collection") {
  if (["Migrated", "Waiver", "Withdrawal"].includes(fallback)) return fallback;
  const lineTypes = new Set(lines.map((line) => line.line_type));
  if (lineTypes.has("LOAN_INTEREST") || lineTypes.has("LOAN_PRINCIPAL")) return "Loan Repayment";
  if (lineTypes.has("PENALTY")) return "Penalty Collection";
  if (lineTypes.has("OTHER")) return "Other Charge";
  return fallback;
}

async function getAuthUser(client) {
  const { data: sessionResult, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  return sessionResult.session?.user ?? null;
}

async function findMemberForAuthUser(client, authUser) {
  const email = normalizeEmail(authUser.email);
  if (email) {
    const { data: member, error } = await client
      .from("xxfp_group_members")
      .select("*")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (member) return member;
  }

  const mobile = String(authUser.user_metadata?.mobile_number || authUser.user_metadata?.mobile || authUser.phone || authUser.phone_number || "").trim();
  if (mobile) {
    const { data: member, error } = await client
      .from("xxfp_group_members")
      .select("*")
      .eq("mobile_number", mobile)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (member) return member;
  }

  return null;
}

async function ensureProfile(authUser) {
  const client = requireClient();
  const metadata = authUser.user_metadata ?? {};
  const fallbackName = metadata.full_name || authUser.email?.split("@")[0] || "User";
  const fallbackUsername = metadata.username || fallbackName || authUser.email?.split("@")[0] || `user${Date.now()}`;
  const fallbackMobile = metadata.mobile_number || metadata.mobile || null;

  const { data: existing, error: existingError } = await client
    .from("xxfp_auth_users")
    .select("*")
    .eq("supabase_user_id", authUser.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const updates = { last_login_date: new Date().toISOString() };
    const authEmail = normalizeEmail(authUser.email);
    if (authEmail && normalizeEmail(existing.email) !== authEmail) {
      updates.email = authEmail;
    }
    if (fallbackMobile && existing.mobile_number !== fallbackMobile) {
      updates.mobile_number = fallbackMobile;
    }
    if (metadata.full_name && (!existing.username || existing.username === authUser.email?.split("@")[0])) {
      updates.username = metadata.full_name;
    }
    const member = await findMemberForAuthUser(client, authUser);
    if (member && !existing.member_id) {
      updates.member_id = member.member_id;
    }
    const { data: updated } = await client.from("xxfp_auth_users").update(updates).eq("user_id", existing.user_id).select("*").single();
    return attachProfileMember(client, updated ?? existing);
  }

  const payload = {
    supabase_user_id: authUser.id,
    username: fallbackUsername,
    email: authUser.email ?? `${authUser.id}@missing.email`,
    mobile_number: fallbackMobile,
    status: "ACTIVE"
  };

  const member = await findMemberForAuthUser(client, authUser);
  if (member) {
    payload.member_id = member.member_id;
  }

  const { data, error } = await client.from("xxfp_auth_users").insert([payload]).select("*").single();
  if (error) {
    const message = String(error.message ?? error.details ?? "").toLowerCase();
    if (error.code === "23503" || message.includes("auth_users_supabase_user_id_fkey")) {
      await client.auth.signOut();
      throw new Error("Your browser had an old deleted login session. The app signed it out. Register or login again to continue fresh.");
    }
    throw error;
  }

  const profile = await attachProfileMember(client, data);
  if (!profile.member && fallbackName) {
    return { ...data, member: { member_name: fallbackName } };
  }
  return profile;
}

async function attachProfileMember(client, profile) {
  if (!profile?.member_id) return profile;

  const { data: member, error } = await client
    .from("xxfp_group_members")
    .select("*, role:xxfp_roles(role_name)")
    .eq("member_id", profile.member_id)
    .maybeSingle();
  if (error) throw error;

  return { ...profile, member };
}

async function currentProfile() {
  const client = requireClient();
  const authUser = await getAuthUser(client);
  if (!authUser) return null;
  return ensureProfile(authUser);
}

async function buildFallbackTenantData(client, profile) {
  const userId = Number(profile?.id ?? profile?.user_id ?? 0);
  const memberId = profile?.member_id ?? profile?.memberId ?? null;
  const email = normalizeEmail(profile?.email);
  const mobile = String(profile?.mobile ?? profile?.mobile_number ?? "").trim();

  const groupIds = new Set();

  if (memberId != null) {
    const { data: memberRows, error: memberError } = await client
      .from("xxfp_group_members")
      .select("group_id, member_id, email, mobile_number")
      .eq("member_id", Number(memberId));
    if (!memberError) {
      memberRows?.forEach((row) => {
        if (row?.group_id != null) groupIds.add(Number(row.group_id));
      });
    }
  }

  if (email) {
    const { data: memberRowsByEmail, error: memberEmailError } = await client
      .from("xxfp_group_members")
      .select("group_id, member_id, email, mobile_number")
      .ilike("email", email)
      .limit(50);
    if (!memberEmailError) {
      memberRowsByEmail?.forEach((row) => {
        if (row?.group_id != null) groupIds.add(Number(row.group_id));
      });
    }
  }

  if (mobile) {
    const { data: memberRowsByMobile, error: memberMobileError } = await client
      .from("xxfp_group_members")
      .select("group_id, member_id, email, mobile_number")
      .eq("mobile_number", mobile)
      .limit(50);
    if (!memberMobileError) {
      memberRowsByMobile?.forEach((row) => {
        if (row?.group_id != null) groupIds.add(Number(row.group_id));
      });
    }
  }

  if (userId) {
    const { data: createdGroups, error: createdGroupsError } = await client
      .from("xxfp_groups")
      .select("group_id")
      .eq("created_by", userId)
      .limit(100);
    if (!createdGroupsError) {
      createdGroups?.forEach((row) => {
        if (row?.group_id != null) groupIds.add(Number(row.group_id));
      });
    }
  }

  if (groupIds.size === 0) {
    return {
      ...initialState,
      session: { signedIn: true, user: mapProfile(profile) },
      groups: [],
      members: [],
      periods: [],
      loans: [],
      approvals: [],
      subscriptions: [],
      transactions: [],
      expenses: [],
      withdrawalRequests: [],
      auditLogs: [],
      legacyGroupOpenings: [],
      legacyImports: [],
      shareDistributions: [],
      shareAdjustments: [],
      rpcGroupFinanceSummaries: {},
      rpcMemberFinanceSummaries: {},
      rpcMemberStatements: {},
      rpcLoanAgingSummaries: {},
      rpcMemberDashboardCardSummaries: {},
      rpcMemberLoanInterestDues: {},
      rpcMemberLoanInterestDueDetails: {},
      rpcPendingDues: [],
      rpcShareDistribution: [],
      rpcShareDistributionSnapshots: {}
    };
  }

  const visibleGroupIds = Array.from(groupIds);

  const [{ data: groups = [] }, { data: members = [] }, { data: groupSetup = [] }, { data: memberSetup = [] }, { data: periods = [] }, { data: balances = [] }, { data: loans = [] }, { data: approvals = [] }, { data: subscriptions = [] }, { data: headers = [] }] = await Promise.all([
    client.from("xxfp_groups").select("*").in("group_id", visibleGroupIds).limit(1000),
    client.from("xxfp_group_members").select("*").in("group_id", visibleGroupIds).limit(2000),
    client.from("xxfp_group_setup").select("*").in("group_id", visibleGroupIds).limit(1000),
    client.from("xxfp_member_setup").select("*").in("member_id", members.map((member) => member.member_id)).limit(2000),
    client.from("xxfp_periods").select("*").in("group_id", visibleGroupIds).limit(1000),
    client.from("xxfp_v_member_dashboard_balances").select("*").in("member_id", members.map((member) => member.member_id)).limit(2000),
    client.from("xxfp_loan_header").select("*").in("group_id", visibleGroupIds).limit(2000),
    client.from("xxfp_approval_header").select("*").in("group_id", visibleGroupIds).limit(2000),
    client.from("xxfp_group_subscriptions").select("*").in("group_id", visibleGroupIds).limit(1000),
    client.from("xxfp_trx_header").select("*").in("group_id", visibleGroupIds).limit(2000)
  ]);

  const memberIds = new Set((members || []).map((member) => Number(member.member_id)));
  const lines = await client.from("xxfp_trx_lines").select("*").in("member_trx_id", (headers || []).map((header) => header.member_trx_id)).limit(4000);
  const memberSetupByMember = Object.fromEntries((memberSetup || []).map((row) => [row.member_id, row]));
  const balanceByMember = Object.fromEntries((balances || []).map((row) => [row.member_id, row]));
  const setupByGroup = Object.fromEntries((groupSetup || []).map((row) => [row.group_id, row]));
  const mappedGroups = (groups || []).map((group) => mapGroup(group, setupByGroup[group.group_id]));
  const mappedMembers = (members || []).map((member) => mapMember(member, balanceByMember[member.member_id], memberSetupByMember[member.member_id]));
  const linesByHeader = (lines?.data ?? []).reduce((memo, line) => {
    memo[line.member_trx_id] = memo[line.member_trx_id] ?? [];
    memo[line.member_trx_id].push(line);
    return memo;
  }, {});

  return {
    ...initialState,
    session: { signedIn: true, user: mapProfile(profile) },
    groups: mappedGroups,
    members: mappedMembers,
    periods: (periods || []).map(mapPeriod),
    loans: (loans || []).map((loan) => mapLoan(loan, members.find((member) => Number(member.member_id) === Number(loan.member_id)))),
    approvals: (approvals || []).filter((row) => isProductOwnerEmail(profile.email) || memberIds.has(Number(row.approver_member_id))).map(mapApproval),
    subscriptions: (subscriptions || []).map((row) => mapSubscription(row, row)),
    transactions: (headers || []).map((header) => mapTransaction(header, linesByHeader[header.member_trx_id] ?? [])).sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate))),
    expenses: [],
    withdrawalRequests: [],
    auditLogs: [],
    legacyGroupOpenings: [],
    legacyImports: [],
    shareDistributions: [],
    shareAdjustments: [],
    rpcGroupFinanceSummaries: {},
    rpcMemberFinanceSummaries: {},
    rpcMemberStatements: {},
    rpcLoanAgingSummaries: {},
    rpcMemberDashboardCardSummaries: {},
    rpcMemberLoanInterestDues: {},
    rpcMemberLoanInterestDueDetails: {},
    rpcPendingDues: [],
    rpcShareDistribution: [],
    rpcShareDistributionSnapshots: {}
  };
}

function mapProfile(profile) {
  const member = profile.member ?? {};
  const productOwner = isProductOwnerEmail(profile.email);
  return {
    id: profile.user_id,
    authId: profile.supabase_user_id,
    memberId: profile.member_id,
    name: productOwner ? (profile.username || profile.email || "") : (member.member_name || profile.username || profile.email || ""),
    email: profile.email,
    mobile: profile.mobile_number,
    username: profile.username,
    profilePhoto: profile.profile_photo_data || member.profile_photo_data || "",
    role: productOwner ? roles.PRODUCT_OWNER : normalizeRole(member.role?.role_name || roles.MEMBER),
    language: "en",
    groupIds: member.group_id ? [member.group_id] : []
  };
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function nullableNameList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function mapGroup(group, setup = {}) {
  return {
    id: group.group_id,
    name: group.group_name,
    code: `BG-${group.group_id}`,
    type: "Saving Group",
    currency: "INR",
    primaryContactName: group.primary_contact_name ?? "",
    mobile: group.mobile_number ?? "",
    email: group.email ?? "",
    status: group.status,
    monthlySaving: nullableNumber(setup.monthly_saving_amount),
    interestRate: nullableNumber(setup.interest_rate),
    interestType: setup.interest_type ?? "Reducing",
    penaltyAmount: nullableNumber(setup.penalty_amount),
    penaltyAfterDueDateAmount: nullableNumber(setup.penalty_amount),
    maximumLoanLimit: nullableNumber(setup.loan_limit),
    loanTenureMonths: nullableNumber(setup.loan_tenure_months),
    loanDueDay: nullableNumber(setup.loan_due_day) ?? 1,
    approvers: nullableNameList(setup.approver_names),
    admins: nullableNameList(setup.admin_names),
    maxLoanMultiplier: 3,
    subscriptionStatus: group.status === "ACTIVE" ? "Active" : "Inactive",
    createdDate: group.creation_date,
    createdBy: group.created_by
  };
}

function mapMember(member, balance = {}, setup = {}) {
  const displayName = member.member_name || member.username || member.email || `Member ${member.member_id}`;
  return {
    id: member.member_id,
    groupId: member.group_id,
    roleId: member.role_id,
    memberRole: normalizeRole(member.role?.role_name),
    fullName: displayName,
    email: member.email ?? "",
    mobile: member.mobile_number ?? "",
    username: member.username ?? member.email?.split("@")[0] ?? "",
    profilePhoto: member.profile_photo_data ?? "",
    dateJoined: member.join_date,
    exitDate: member.exit_date,
    inactiveDate: member.exit_date,
    status: dbStatus(member.status) === "ACTIVE" ? "Active" : "Inactive",
    savings: Number(balance.savings ?? 0),
    loanOutstanding: Number(balance.outstanding_loan ?? 0),
    interestOutstanding: Number(balance.outstanding_interest ?? 0),
    penaltyOutstanding: Number(balance.pending_charges ?? 0),
    shares: Number(balance.earned_from_group ?? 0),
    customSavingAmount: nullableNumber(setup.custom_saving_amount),
    loanLimit: nullableNumber(setup.loan_limit),
    maximumLoanLimit: nullableNumber(setup.loan_limit),
    loanTenureMonths: nullableNumber(setup.loan_tenure_months),
    interestRate: nullableNumber(setup.interest_rate),
    interestType: setup.interest_type ?? "Reducing",
    createdAt: member.creation_date
  };
}

function mapPeriod(period) {
  return {
    id: period.period_id,
    groupId: period.group_id,
    name: period.period_name,
    startDate: period.start_date,
    endDate: period.end_date,
    status: periodStatus(period.status)
  };
}

function allocationFromLines(lines = []) {
  return lines.reduce((memo, line) => {
    const amount = Number(line.amount ?? 0);
    if (line.line_type === "SAVING") memo.savings += amount;
    if (line.line_type === "LOAN_PRINCIPAL") memo.principal += amount;
    if (line.line_type === "LOAN_INTEREST") memo.interest += amount;
    if (line.line_type === "PENALTY") memo.penalty += amount;
    if (line.line_type === "OTHER") memo.excess += amount;
    if (line.line_type === "CHARGES") memo.charges += amount;
    return memo;
  }, { savings: 0, principal: 0, interest: 0, penalty: 0, excess: 0, charges: 0 });
}

function mapTransaction(header, lines = []) {
  const allocation = allocationFromLines(lines);
  const normalizedStatus = String(header.approval_status ?? "").toUpperCase();
  return {
    id: header.member_trx_id,
    groupId: header.group_id,
    memberId: header.member_id,
    periodId: header.period_id,
    transactionNumber: header.trx_number,
    transactionDate: header.trx_date,
    transactionType: transactionTypeFromLines(lines, header.trx_type),
    amount: Number(header.total_amount ?? 0),
    approvalStatus: normalizedStatus === "COMPLETED" ? "Completed" : normalizedStatus === "PENDING" ? "Pending" : header.approval_status,
    parentTransactionId: header.parent_trx_id,
    adjustmentFlag: header.adjustment_flag,
    reversedFlag: header.reversed_flag,
    remarks: header.remarks,
    allocation
  };
}

function mapLoan(loan, member) {
  return {
    id: loan.loan_id,
    memberId: loan.member_id,
    memberName: member?.member_name ?? "",
    amount: Number(loan.distributed_amount ?? 0),
    principalOutstanding: Number(loan.outstanding_principal ?? 0),
    interestOutstanding: Number(loan.outstanding_interest ?? 0),
    penaltyOutstanding: 0,
    rate: Number(loan.interest_rate ?? 0),
    status: loan.loan_status,
    reason: loan.purpose ?? "",
    durationMonths: loan.requested_months ?? 0,
    startDate: loan.distribution_date,
    loanNumber: loan.loan_number
  };
}

function mapApproval(approval) {
  return {
    id: approval.approval_id,
    groupId: approval.group_id,
    batchId: approval.approval_batch_id,
    referenceId: approval.reference_id,
    referenceType: approval.reference_type,
    action: approval.transaction_type,
    requester: approval.requester_name ?? approval.created_by,
    approverId: approval.approver_member_id,
    approverName: approval.approver_name,
    level: approval.approver_name ?? "Approver",
    status: approval.approval_status === "APPROVED" ? "Approved" : approval.approval_status === "REJECTED" ? "Rejected" : approval.approval_status === "RETURNED" ? "Returned" : "Pending",
    amount: Number(approval.amount ?? 0),
    remarks: approval.remarks,
    details: approval.remarks
  };
}

function mapPendingSetupChange(row) {
  return {
    id: row.setup_change_id,
    batchId: row.approval_batch_id,
    groupId: row.group_id,
    setupType: row.setup_type,
    targetId: row.target_id,
    targetName: row.target_name,
    payload: row.payload ?? {},
    oldValue: row.old_value ?? {},
    changeSummary: row.change_summary ?? "",
    status: row.status === "COMPLETED" ? "Completed" : row.status === "REJECTED" ? "Rejected" : row.status === "RETURNED" ? "Returned" : "Pending",
    createdAt: row.creation_date
  };
}

function mapWithdrawalRequest(row, member) {
  return {
    id: row.withdrawal_request_id,
    requestNumber: row.request_number,
    groupId: row.group_id,
    memberId: row.member_id,
    memberName: member?.member_name ?? "",
    amount: Number(row.requested_amount ?? 0),
    requestDate: row.request_date,
    reason: row.reason ?? "",
    status: row.status,
    approvalStatus: row.approval_status === "COMPLETED" ? "Completed" : row.approval_status === "PENDING" ? "Pending" : row.approval_status === "REJECTED" ? "Rejected" : row.approval_status,
    createdAt: row.creation_date
  };
}

function mapSubscription(row, plan) {
  return {
    id: row.group_subscription_id,
    groupId: row.group_id,
    groupName: row.groups?.group_name,
    plan: plan?.plan_name ?? "Starter",
    duration: plan?.duration ?? "",
    status: row.payment_status,
    amount: Number(plan?.amount ?? 0),
    startDate: row.start_date,
    endDate: row.end_date,
    renewsOn: row.end_date,
    renewalDate: row.end_date,
    paymentStatus: row.payment_status,
    paymentProvider: "Razorpay",
    transactionReference: row.transaction_reference,
    maxMembers: plan?.max_members ?? 50,
    features: String(plan?.features ?? "").split(",").filter(Boolean)
  };
}

function mapAudit(row) {
  return {
    id: row.audit_id,
    actor: row.changed_by ?? "System",
    action: row.action_type,
    tableName: "member_transaction_header",
    recordId: row.trx_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    timestamp: row.changed_date
  };
}

function mapExpense(row, lines = []) {
  return {
    id: row.group_expense_id,
    groupId: row.group_id,
    periodId: row.period_id,
    expenseNumber: row.expense_number,
    expenseDate: row.expense_date,
    transactionDate: row.expense_date,
    expenseType: row.expense_type,
    transactionType: "Group Expense",
    amount: Number(row.total_amount ?? 0),
    approvalStatus: row.approval_status === "COMPLETED" ? "Completed" : row.approval_status === "PENDING" ? "Pending" : row.approval_status,
    paymentMode: row.payment_mode,
    remarks: row.remarks,
    lines
  };
}

function mapLegacy(row) {
  return {
    id: row.legacy_id,
    group_id: row.group_id,
    member_id: row.member_id,
    joined_date: row.migration_date,
    exit_date: null,
    total_saving: Number(row.legacy_saving_balance ?? 0),
    pending_loan: Number(row.legacy_loan_outstanding ?? 0),
    interest_amount: Number(row.legacy_interest_balance ?? 0),
    excess_amount: Number(row.legacy_share_earned ?? 0),
    penalty_amount: Number(row.legacy_penalty_balance ?? row.penalty_amount ?? 0),
    legacy_bank_balance: Number(row.legacy_bank_balance ?? 0),
    approval_status: row.approval_status ?? "COMPLETED",
    migration_date: row.migration_date,
    remarks: row.remarks
  };
}

async function insertInitialPeriods(client, groupId, userId) {
  const now = new Date();
  const months = [-1, 0, 1].map((offset) => {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return {
      group_id: groupId,
      period_name: start.toLocaleString("default", { month: "long", year: "numeric" }),
      start_date: toIsoDate(start),
      end_date: toIsoDate(end),
      status: offset <= 0 ? "CLOSED" : "FUTURE",
      created_by: userId,
      last_updated_by: userId
    };
  });
  const { error } = await client.from("xxfp_periods").insert(months);
  if (error) throw error;
}

async function insertTransactionLines(client, headerId, allocation, userId, remarks = "") {
  const rows = Object.entries(allocation ?? {})
    .map(([key, value]) => ({
      member_trx_id: headerId,
      line_type: lineTypeForAllocation(key),
      amount: Number(value ?? 0),
      remarks,
      created_by: userId,
      last_updated_by: userId
    }))
    .filter((row) => row.line_type && row.amount !== 0);

  if (rows.length === 0) return [];
  const { data, error } = await client.from("xxfp_trx_lines").insert(rows).select();
  if (error) throw error;
  return data ?? [];
}

async function createFinancialTransaction({ transaction, parentId = null, adjustmentFlag = "N", reversedFlag = "N", remarks = "" }) {
  const client = requireClient();
  const profile = await currentProfile();
  if (!profile) throw new Error("Not signed in.");

  const amount = Number(transaction.amount ?? Object.values(transaction.allocation ?? {}).reduce((sum, value) => sum + Number(value || 0), 0));
  const payload = {
    trx_number: transaction.transactionNumber ?? nextDocumentNumber(adjustmentFlag === "Y" ? "ADJ" : reversedFlag === "Y" ? "REV" : "TRX"),
    group_id: transaction.groupId,
    member_id: transaction.memberId,
    period_id: transaction.periodId,
    trx_date: transaction.transactionDate,
    trx_type: transaction.transactionType ?? "Savings Collection",
    total_amount: amount,
    approval_status: dbStatus(transaction.approvalStatus ?? "PENDING"),
    parent_trx_id: parentId,
    adjustment_flag: adjustmentFlag,
    reversed_flag: reversedFlag,
    remarks,
    created_by: profile.user_id,
    last_updated_by: profile.user_id
  };

  const { data: header, error } = await client.from("xxfp_trx_header").insert([payload]).select().single();
  if (error) throw error;
  const lines = await insertTransactionLines(client, header.member_trx_id, transaction.allocation ?? { savings: amount }, profile.user_id, remarks);
  if (["COMPLETED", "APPROVED"].includes(payload.approval_status)) {
    await client.rpc("distribute_share_for_transaction", { target_trx_id: header.member_trx_id });
  }
  return mapTransaction(header, lines);
}

function describeFunctionError(error, functionName) {
  const message = error?.message ?? String(error ?? "");
  if (message.toLowerCase().includes("failed to send a request")) {
    return new Error(`Unable to reach secure service "${functionName}". Confirm the service is deployed and its secrets are configured.`);
  }
  return error instanceof Error ? error : new Error(message);
}

function normalizeRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function normalizeRpcRows(data) {
  if (Array.isArray(data)) return data;
  if (data) return [data];
  return [];
}

async function invokeFunctionJson(functionName, body) {
  const client = requireClient();
  const { data: sessionResult, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionResult.session?.access_token;
  if (!accessToken) throw new Error("Please login again before making this payment.");

  const runtimeEnv = typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : (typeof process !== "undefined" ? process.env : {});
  const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL;
  const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text };
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Edge Function "${functionName}" returned ${response.status}.`;
    const details = payload?.details ? ` Details: ${JSON.stringify(payload.details)}` : "";
    throw new Error(`${message}${details}`);
  }
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

export const repository = {
  isConfigured() {
    return Boolean(supabase);
  },

  async getSessionUser() {
    const profile = await currentProfile();
    return profile ? mapProfile(profile) : null;
  },

  async signIn(identifier, password) {
    const client = requireClient();
    const email = String(identifier ?? "").trim().toLowerCase();
    const hasPassword = Boolean(password && String(password).trim().length > 0);
    if (!email.includes("@")) {
      throw new Error("Please login with your email address.");
    }
    if (!hasPassword) {
      throw new Error("Password is required.");
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("Secure login did not return an authenticated user.");
      return mapProfile(await ensureProfile(data.user));
    } catch (error) {
      throw error;
    }
  },

  async emailExists(email) {
    const client = requireClient();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) return false;

    const { data, error } = await client.rpc("email_registered", { check_email: normalizedEmail });
    if (error) {
      const { data: resolvedEmail, error: resolveError } = await client.rpc("resolve_login_email", { login_identifier: normalizedEmail });
      if (resolveError) throw error;
      return Boolean(resolvedEmail);
    }
    return Boolean(data);
  },

  async signUp(values) {
    const client = requireClient();
    const { data, error } = await client.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          full_name: values.fullName,
          mobile_number: values.mobile,
          role: values.role
        }
      }
    });
    if (error) throw error;
    if (!data.user) throw new Error("Secure login did not return a new user.");
    if (!data.session) throw new Error("Account created. Confirm the email address, then login.");
    return mapProfile(await ensureProfile(data.user));
  },

  async sendRegistrationOtp(email, values = {}) {
    const client = requireClient();
    if (await repository.emailExists(email)) {
      throw new Error("This email is already registered. Please login or use Forgot password.");
    }
    const { data, error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          full_name: values.fullName,
          mobile_number: values.mobile
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async verifyRegistrationOtp({ email, otpCode }) {
    const client = requireClient();
    const { data, error } = await client.auth.verifyOtp({ email, token: otpCode, type: "email" });
    if (error) throw error;
    if (data.user) await ensureProfile(data.user);
    return data;
  },

  async setPassword(password) {
    const client = requireClient();
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return data;
  },

  async resetPassword(email) {
    const client = requireClient();
    const { data, error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
    return data;
  },

  async signInWithGoogle() {
    const client = requireClient();
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) throw error;
  },

  async signOut() {
    const client = requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },

  async updateProfilePhoto(photoData) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");

    const { error } = await client
      .from("xxfp_auth_users")
      .update({ profile_photo_data: photoData, last_updated_by: profile.user_id })
      .eq("user_id", profile.user_id);
    if (error) throw error;

    if (profile.member_id) {
      const { error: memberError } = await client
        .from("xxfp_group_members")
        .update({ profile_photo_data: photoData, last_updated_by: profile.user_id })
        .eq("member_id", profile.member_id);
      if (memberError) throw memberError;
    }
  },

  async createGroup(group) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    // Prefer server-side RPC for group creation; fall back to client-side inserts
    const rpcPayload = {
      name: group.name ?? group.group_name,
      primaryContact: group.primaryContact ?? group.primaryContactName ?? profile.username,
      mobile: group.mobile ?? profile.mobile_number,
      email: group.email ?? profile.email,
      setup: {
        monthlySaving: group.monthlySaving ?? group.loanEligibilityRules?.monthlySaving ?? null,
        interestType: group.interestType ?? "Reducing"
      }
    };

    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_group", rpcPayload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!created || !created.group_id) throw new Error("RPC did not return created group id");

      // fetch full group + setup + creator member to return consistent shape
      const { data: groupRow } = await client.from("xxfp_groups").select("*").eq("group_id", created.group_id).maybeSingle();
      const { data: setupRow } = await client.from("xxfp_group_setup").select("*").eq("group_id", created.group_id).maybeSingle();
      const { data: creatorMember } = await client.from("xxfp_group_members").select("*, role:xxfp_roles(role_name)").eq("group_id", created.group_id).eq("created_by", profile.user_id).limit(1).maybeSingle();

      return {
        ...mapGroup(groupRow ?? { group_id: created.group_id, group_name: created.group_name }, setupRow ?? {}),
        creatorMember: creatorMember ? { ...mapMember(creatorMember, {}, { custom_saving_amount: null, loan_limit: null, loan_tenure_months: null, interest_rate: null, interest_type: null }), memberRole: roles.GROUP_ADMIN } : null
      };
    } catch (err) {
      // fallback to original client-side behaviour
      const payload = {
        group_name: group.name ?? group.group_name,
        primary_contact_name: group.primaryContact ?? group.primaryContactName ?? profile.username,
        mobile_number: group.mobile ?? profile.mobile_number,
        email: group.email ?? profile.email,
        status: "ACTIVE",
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      };

      const { data, error } = await client.from("xxfp_groups").insert([payload]).select().single();
      if (error) throw error;

      await client.from("xxfp_group_setup").insert([{ group_id: data.group_id, monthly_saving_amount: group.monthlySaving ?? group.loanEligibilityRules?.monthlySaving ?? null, interest_rate: group.interestRate ?? null, interest_type: group.interestType ?? "Reducing", penalty_amount: group.penaltyAmount ?? null, loan_limit: group.maximumLoanLimit ?? null, auto_approve_flag: "N", loan_tenure_months: group.loanTenureMonths ?? null, loan_due_day: group.loanDueDay ?? null, approver_names: group.approvers ?? [], admin_names: group.admins ?? [], created_by: profile.user_id, last_updated_by: profile.user_id }]);
      await insertInitialPeriods(client, data.group_id, profile.user_id);
      const adminRole = await client.from("xxfp_roles").select("role_id").eq("role_name", "Group Admin").maybeSingle();
      const creatorName = profile.member?.member_name || profile.username || profile.email || "";
      const creatorUsername = `${String(profile.username || profile.email?.split("@")[0] || "creator").replace(/[^A-Za-z0-9._-]/g, "")}_${data.group_id}`;
      const { data: member, error: memberError } = await client.from("xxfp_group_members").insert([{ group_id: data.group_id, role_id: adminRole.data?.role_id ?? null, member_name: creatorName, username: creatorUsername, mobile_number: profile.mobile_number, email: profile.email, join_date: toIsoDate(), status: "ACTIVE", created_by: profile.user_id, last_updated_by: profile.user_id }]).select().single();
      if (memberError) throw memberError;
      if (member) {
        await client.from("xxfp_member_status_history").insert([{ member_id: member.member_id, group_id: data.group_id, status: "ACTIVE", start_date: toIsoDate(), created_by: profile.user_id, last_updated_by: profile.user_id }]);
        await client.from("xxfp_member_setup").insert([{ member_id: member.member_id, custom_saving_amount: null, loan_limit: null, loan_tenure_months: null, interest_rate: null, interest_type: null, active_flag: "Y", created_by: profile.user_id, last_updated_by: profile.user_id }]);
        await client.from("xxfp_auth_users").update({ member_id: member.member_id }).eq("user_id", profile.user_id);
      }

      return {
        ...mapGroup(data, { monthly_saving_amount: group.monthlySaving ?? null, interest_rate: group.interestRate ?? null, interest_type: group.interestType ?? "Reducing", penalty_amount: group.penaltyAmount ?? null, loan_limit: group.maximumLoanLimit ?? null, loan_tenure_months: group.loanTenureMonths ?? null, loan_due_day: group.loanDueDay ?? null, approver_names: group.approvers ?? [], admin_names: group.admins ?? [] }),
        creatorMember: member ? { ...mapMember({ ...member, role: { role_name: roles.GROUP_ADMIN } }, {}, { custom_saving_amount: null, loan_limit: null, loan_tenure_months: null, interest_rate: null, interest_type: null }), memberRole: roles.GROUP_ADMIN } : null
      };
    }
  },

  async updateGroup(groupId, updates) {
    const client = requireClient();
    const profile = await currentProfile();

    const numericGroupId = Number(groupId);
    if (!Number.isFinite(numericGroupId)) {
      throw new Error("This browser still has an old group id cached. Hard refresh the app or select the group again.");
    }

    const groupPayload = {
      group_name: updates.name,
      mobile_number: updates.mobile,
      email: updates.email,
      last_updated_by: profile?.user_id
    };
    Object.keys(groupPayload).forEach((key) => groupPayload[key] === undefined && delete groupPayload[key]);

    let groupRow = null;
    // prefer RPC for update if available
    try {
      const rpcPayload = { groupId: numericGroupId, updates };
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_update_group", rpcPayload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (created && (created.group_id || created.groupId)) {
        const id = created.group_id ?? created.groupId;
        const { data } = await client.from("xxfp_groups").select("*").eq("group_id", id).maybeSingle();
        groupRow = data ?? created;
      }
    } catch (err) {
      if (Object.keys(groupPayload).some((key) => key !== "last_updated_by")) {
        const { data, error } = await client.from("xxfp_groups").update(groupPayload).eq("group_id", numericGroupId).select().single();
        if (error) throw error;
        groupRow = data;
      } else {
        const { data, error } = await client.from("xxfp_groups").select("*").eq("group_id", numericGroupId).single();
        if (error) throw error;
        groupRow = data;
      }
    }

    const setupPayload = {
      group_id: numericGroupId,
      monthly_saving_amount: updates.monthlySaving ?? updates.loanEligibilityRules?.monthlySaving,
      interest_rate: updates.interestRate,
      interest_type: updates.interestType,
      penalty_amount: updates.penaltyAmount ?? updates.penaltyAfterDueDateAmount,
      loan_limit: updates.maximumLoanLimit,
      loan_tenure_months: updates.loanTenureMonths,
      loan_due_day: updates.loanDueDay,
      approver_names: updates.approvers,
      admin_names: updates.admins,
      last_updated_by: profile?.user_id
    };
    Object.keys(setupPayload).forEach((key) => setupPayload[key] === undefined && delete setupPayload[key]);

    let setupRow = null;
    if (Object.keys(setupPayload).some((key) => !["group_id", "last_updated_by"].includes(key))) {
      const { data, error } = await client
        .from("xxfp_group_setup")
        .upsert(setupPayload, { onConflict: "group_id" })
        .select()
        .single();
      if (error) throw error;
      setupRow = data;
    } else {
      const { data } = await client.from("xxfp_group_setup").select("*").eq("group_id", numericGroupId).maybeSingle();
      setupRow = data;
    }

    return mapGroup(groupRow, setupRow ?? {});
  },

  async createMember(member, groupId) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");

    const role = await client.from("xxfp_roles").select("role_id").eq("role_name", member.memberRole ?? "Member").maybeSingle();
    if (member.username) {
      const { data: existingUsername, error: usernameError } = await client
        .from("xxfp_group_members")
        .select("member_id")
        .ilike("username", member.username)
        .maybeSingle();
      if (usernameError) throw usernameError;
      if (existingUsername) throw new Error("Username already exists. Choose a different username.");
    }
    const payload = {
      groupId,
      fullName: member.fullName,
      username: member.username,
      mobile: member.mobile,
      email: member.email,
      dateJoined: member.dateJoined ?? toIsoDate(),
      status: member.status === "Inactive" ? "INACTIVE" : "ACTIVE"
    };

    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_member", payload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!created || !created.member_id) {
        // rpc returns member_id as `member_id` or `memberId` depending on function; try common keys
        const memberId = created?.member_id ?? created?.id ?? created?.memberId;
        if (!memberId) throw new Error("RPC did not return created member id");
        created.member_id = memberId;
      }

      const { data: memberRow } = await client.from("xxfp_group_members").select("*, role:xxfp_roles(role_name)").eq("member_id", created.member_id).maybeSingle();
      const { data: setupRow } = await client.from("xxfp_member_setup").select("*").eq("member_id", created.member_id).maybeSingle();
      return mapMember(memberRow ?? { member_id: created.member_id, member_name: member.fullName }, {}, setupRow ?? {});
    } catch (err) {
      // fallback to client-side behavior
      const payloadDb = {
        group_id: groupId,
        role_id: role.data?.role_id ?? null,
        member_name: member.fullName,
        username: member.username,
        mobile_number: member.mobile,
        email: member.email,
        join_date: member.dateJoined ?? toIsoDate(),
        status: member.status === "Inactive" ? "INACTIVE" : "ACTIVE",
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      };

      const { data, error } = await client.from("xxfp_group_members").insert([payloadDb]).select().single();
      if (error) throw error;
      await client.from("xxfp_member_status_history").insert([{ member_id: data.member_id, group_id: groupId, status: payloadDb.status, start_date: payloadDb.join_date, end_date: payloadDb.status === "INACTIVE" ? toIsoDate() : null, created_by: profile.user_id, last_updated_by: profile.user_id }]);
      await client.from("xxfp_member_setup").insert([{ member_id: data.member_id, custom_saving_amount: null, loan_limit: null, loan_tenure_months: null, interest_rate: null, interest_type: null, active_flag: payloadDb.status === "ACTIVE" ? "Y" : "N", created_by: profile.user_id, last_updated_by: profile.user_id }]);
      return mapMember(data, {}, { custom_saving_amount: null, loan_limit: null, loan_tenure_months: null, interest_rate: null, interest_type: null });
    }
  },

  async updateMember(memberId, updates) {
    const client = requireClient();
    const profile = await currentProfile();
    if (updates.username) {
      const { data: existingUsername, error: usernameError } = await client
        .from("xxfp_group_members")
        .select("member_id")
        .ilike("username", updates.username)
        .neq("member_id", memberId)
        .maybeSingle();
      if (usernameError) throw usernameError;
      if (existingUsername) throw new Error("Username already exists. Choose a different username.");
    }
    const hasActiveFlag = typeof updates.active === "boolean";
    const nextStatus = hasActiveFlag ? (updates.active ? "ACTIVE" : "INACTIVE") : (updates.status ? dbStatus(updates.status) : undefined);
    const nextExitDate = hasActiveFlag
      ? (updates.active ? null : (updates.inactive_date ?? updates.inactiveDate ?? updates.exitDate ?? toIsoDate()))
      : (updates.inactiveDate ?? updates.exitDate);
    const payload = {
      member_name: updates.fullName,
      username: updates.username,
      mobile_number: updates.mobile,
      email: updates.email,
      exit_date: nextExitDate,
      status: nextStatus,
      last_updated_by: profile?.user_id
    };
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    // attempt RPC update first
    let data = null;
    try {
      const rpcPayload = { memberId: Number(memberId), updates: payload };
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_update_member", rpcPayload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (created && (created.member_id || created.memberId)) {
        const id = created.member_id ?? created.memberId;
        const { data: memberRow } = await client.from("xxfp_group_members").select("*").eq("member_id", id).maybeSingle();
        data = memberRow ?? created;
      }
    } catch (err) {
      const res = await client.from("xxfp_group_members").update(payload).eq("member_id", memberId).select().single();
      if (res.error) throw res.error;
      data = res.data;
    }

    if (nextStatus) {
      await client.from("xxfp_member_status_history").insert([{ member_id: memberId, group_id: data.group_id, status: nextStatus, start_date: nextExitDate ?? toIsoDate(), created_by: profile?.user_id, last_updated_by: profile?.user_id }]);
    }
    const setupPayload = {
      member_id: memberId,
      custom_saving_amount: updates.monthlySaving,
      loan_limit: updates.maximumLoanLimit,
      loan_tenure_months: updates.loanTenureMonths,
      interest_rate: updates.interestRate,
      interest_type: updates.interestType,
      active_flag: hasActiveFlag ? (updates.active ? "Y" : "N") : undefined,
      last_updated_by: profile?.user_id
    };
    Object.keys(setupPayload).forEach((key) => setupPayload[key] === undefined && delete setupPayload[key]);
    let setupRow = null;
    if (Object.keys(setupPayload).some((key) => !["member_id", "last_updated_by"].includes(key))) {
      const { data: setupData, error: setupError } = await client
        .from("xxfp_member_setup")
        .upsert(setupPayload, { onConflict: "member_id" })
        .select()
        .single();
      if (setupError) throw setupError;
      setupRow = setupData;
    }
    return mapMember(data, {}, setupRow ?? {});
  },

  async deleteMember(memberId) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_delete_member", { member_id: Number(memberId) });
      if (rpcError) throw rpcError;
      return Array.isArray(rpcData) ? rpcData[0] : rpcData;
    } catch (err) {
      const { data, error } = await client.from("xxfp_group_members").delete().eq("member_id", memberId).select().single();
      if (error) throw error;
      return data;
    }
  },

  async ensurePeriod(period, groupId) {
    const client = requireClient();
    const profile = await currentProfile();
    const name = period.name || period.periodName;
    const { data: existing, error: existingError } = await client
      .from("xxfp_periods")
      .select("*")
      .eq("group_id", groupId)
      .eq("period_name", name)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return mapPeriod(existing);

    const { data, error } = await client.from("xxfp_periods").insert([{
      group_id: groupId,
      period_name: name,
      start_date: period.startDate,
      end_date: period.endDate,
      status: dbStatus(period.status || "OPEN"),
      created_by: profile?.user_id,
      last_updated_by: profile?.user_id
    }]).select().single();
    if (error) throw error;
    return mapPeriod(data);
  },

  async openAccountingPeriod(groupId, period) {
    const client = requireClient();
    const ensured = await repository.ensurePeriod(period, groupId);
    await client.from("xxfp_periods").update({ status: "CLOSED" }).eq("group_id", groupId).eq("status", "OPEN").neq("period_id", ensured.id);
    const { data, error } = await client.from("xxfp_periods").update({ status: "OPEN" }).eq("period_id", ensured.id).select().single();
    if (error) throw error;
    return mapPeriod(data);
  },

  async closeAccountingPeriod(periodId) {
    const client = requireClient();
    const { data, error } = await client.from("xxfp_periods").update({ status: "CLOSED" }).eq("period_id", periodId).select().single();
    if (error) throw error;
    return mapPeriod(data);
  },

  async createTransaction(transaction) {
    // prefer server-side RPC for creating transactions; fallback to client-side create
    const payload = {
      groupId: transaction.groupId,
      memberId: transaction.memberId,
      periodId: transaction.periodId,
      transactionDate: transaction.transactionDate,
      transactionType: transaction.transactionType,
      amount: transaction.amount ?? Object.values(transaction.allocation ?? {}).reduce((s, v) => s + Number(v || 0), 0),
      allocation: transaction.allocation ?? { savings: transaction.amount ?? 0 },
      transactionNumber: transaction.transactionNumber,
      approvalStatus: transaction.approvalStatus ?? transaction.status,
      remarks: transaction.remarks ?? ""
    };

    const client = requireClient();
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_transaction", payload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!created || !created.member_trx_id) {
        // if rpc didn't return expected shape, fallback
        throw new Error("RPC did not return created transaction id");
      }
      // fetch header and lines
      const { data: header } = await client.from("xxfp_trx_header").select("*").eq("member_trx_id", created.member_trx_id).maybeSingle();
      const { data: lines } = await client.from("xxfp_trx_lines").select("*").eq("member_trx_id", created.member_trx_id);
      return mapTransaction(header ?? { member_trx_id: created.member_trx_id, trx_number: created.trx_number, total_amount: created.total_amount }, lines ?? []);
    } catch (err) {
      return createFinancialTransaction({ transaction, remarks: transaction.remarks ?? "" });
    }
  },

  async createGroupExpense(expense) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    const payload = {
      groupId: expense.groupId,
      periodId: expense.periodId,
      expenseDate: expense.expenseDate,
      expenseType: expense.expenseType ?? "Group Expense",
      amount: Number(expense.amount ?? 0),
      paymentMode: expense.paymentMode ?? "Cash",
      approvalStatus: dbStatus(expense.approvalStatus ?? "PENDING"),
      remarks: expense.remarks ?? "",
      lines: expense.lines ?? (expense.category ? [{ category: expense.category, amount: Number(expense.amount ?? 0), remarks: expense.remarks ?? "" }] : [])
    };
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_group_expense", payload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const header = created?.header ?? created;
      const lines = created?.lines ?? [];
      return mapExpense(header, lines);
    } catch (err) {
      const dbPayload = {
        expense_number: expense.expenseNumber ?? nextDocumentNumber("EXP"),
        group_id: expense.groupId,
        period_id: expense.periodId,
        expense_date: expense.expenseDate,
        expense_type: expense.expenseType ?? "Group Expense",
        total_amount: Number(expense.amount ?? 0),
        payment_mode: expense.paymentMode ?? "Cash",
        approval_status: dbStatus(expense.approvalStatus ?? "PENDING"),
        remarks: expense.remarks ?? "",
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      };
      const { data: header, error } = await client.from("xxfp_group_expense_header").insert([dbPayload]).select().single();
      if (error) throw error;

      const expenseLines = Array.isArray(expense.lines) && expense.lines.length > 0
        ? expense.lines
        : [{ category: expense.category ?? "General", amount: Number(expense.amount ?? 0), remarks: expense.remarks ?? "" }];
      const lineTotal = expenseLines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
      if (Math.abs(lineTotal - Number(expense.amount ?? 0)) > 0.01) {
        throw new Error("Expense header amount and split line total must match.");
      }
      const lineRows = expenseLines.map((line) => ({
        group_expense_id: header.group_expense_id,
        expense_category: line.category ?? line.expense_category ?? "General",
        amount: Number(line.amount ?? 0),
        remarks: line.remarks ?? line.comment ?? "",
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      }));
      const { data: lines, error: lineError } = await client.from("xxfp_group_expense_lines").insert(lineRows).select();
      if (lineError) throw lineError;

      return mapExpense(header, lines ?? []);
    }
  },

  async adjustTransaction(transactionId, adjustment) {
    return createFinancialTransaction({
      transaction: {
        ...adjustment,
        transactionNumber: nextDocumentNumber("ADJ")
      },
      parentId: transactionId,
      adjustmentFlag: "Y",
      remarks: adjustment.remarks ?? "Adjustment"
    });
  },

  async reverseTransaction(transaction) {
    const negativeAllocation = Object.fromEntries(
      Object.entries(transaction.allocation ?? { savings: transaction.amount }).map(([key, value]) => [key, -Math.abs(Number(value || 0))])
    );
    return createFinancialTransaction({
      transaction: {
        ...transaction,
        amount: -Math.abs(Number(transaction.amount || 0)),
        allocation: negativeAllocation,
        transactionNumber: nextDocumentNumber("REV"),
        approvalStatus: transaction.approvalStatus ?? "PENDING",
        remarks: transaction.remarks || `Reversal of ${transaction.transactionNumber ?? transaction.id}`
      },
      parentId: transaction.id,
      reversedFlag: "Y",
      remarks: transaction.remarks || `Reversal of ${transaction.transactionNumber ?? transaction.id}`
    });
  },

  async createLoan(loan, groupId, memberId, actorId, approvalRequired = true) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    // prefer server-side RPC; fallback to direct insert
    const payload = {
      requestNumber: loan.requestNumber ?? nextDocumentNumber("LR"),
      groupId,
      memberId,
      amount: loan.amount,
      durationMonths: loan.durationMonths,
      reason: loan.reason,
      startDate: loan.startDate,
      approvalStatus: approvalRequired ? "PENDING" : "COMPLETED"
    };
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_loan_request", payload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const id = created?.loan_request_id ?? created?.id ?? null;
      return {
        id: `request-${id}`,
        requestId: id,
        memberId,
        memberName: loan.memberName ?? "",
        amount: Number(created?.requested_amount ?? created?.requestedAmount ?? payload.amount ?? 0),
        principalOutstanding: Number(created?.requested_amount ?? created?.requestedAmount ?? payload.amount ?? 0),
        interestOutstanding: 0,
        penaltyOutstanding: 0,
        rate: Number(loan.rate ?? 0),
        status: approvalRequired ? "Pending Approval" : "Active",
        approvalStatus: approvalRequired ? "Pending" : "Completed",
        loanStatus: approvalRequired ? "PENDING" : "ACTIVE",
        reason: created?.purpose ?? payload.reason ?? "",
        durationMonths: Number(created?.requested_months ?? created?.requestedMonths ?? payload.durationMonths ?? 0),
        startDate: created?.request_date ?? payload.startDate,
        loanNumber: created?.request_number ?? created?.requestNumber
      };
    } catch (err) {
      const status = approvalRequired ? "REQUESTED" : "ACTIVE";
      const approvalStatus = approvalRequired ? "PENDING" : "COMPLETED";
      const { data: request, error: requestError } = await client.from("xxfp_loan_requests").insert([{ request_number: nextDocumentNumber("LR"), group_id: groupId, member_id: memberId, requested_amount: loan.amount, requested_months: loan.durationMonths, purpose: loan.reason, request_date: loan.startDate, status, approval_status: approvalStatus, created_by: profile.user_id, last_updated_by: profile.user_id }]).select().single();
      if (requestError) throw requestError;
      return {
        id: `request-${request.loan_request_id}`,
        requestId: request.loan_request_id,
        memberId,
        memberName: loan.memberName ?? "",
        amount: Number(request.requested_amount ?? 0),
        principalOutstanding: Number(request.requested_amount ?? 0),
        interestOutstanding: 0,
        penaltyOutstanding: 0,
        rate: Number(loan.rate ?? 0),
        status: approvalRequired ? "Pending Approval" : "Active",
        approvalStatus: approvalRequired ? "Pending" : "Completed",
        loanStatus: approvalRequired ? "PENDING" : "ACTIVE",
        reason: request.purpose ?? "",
        durationMonths: Number(request.requested_months ?? 0),
        startDate: request.request_date,
        loanNumber: request.request_number
      };
    }
  },

  async createWithdrawalRequest(request) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    const payload = {
      requestNumber: request.requestNumber ?? nextDocumentNumber("WR"),
      groupId: request.groupId,
      memberId: request.memberId,
      amount: Number(request.amount ?? 0),
      requestDate: request.requestDate,
      reason: request.reason ?? "",
      approvalStatus: dbStatus(request.approvalStatus ?? "PENDING")
    };
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_withdrawal_request", payload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      return mapWithdrawalRequest({ withdrawal_request_id: created?.withdrawal_request_id ?? created?.id, request_number: created?.request_number ?? created?.requestNumber, requested_amount: created?.requested_amount ?? created?.requestedAmount ?? payload.amount, group_id: request.groupId, member_id: request.memberId, request_date: created?.request_date ?? payload.requestDate, reason: created?.reason ?? payload.reason, approval_status: created?.approval_status ?? payload.approvalStatus }, { member_name: request.memberName });
    } catch (err) {
      const dbPayload = {
        request_number: request.requestNumber ?? nextDocumentNumber("WR"),
        group_id: request.groupId,
        member_id: request.memberId,
        requested_amount: Number(request.amount ?? 0),
        request_date: request.requestDate,
        reason: request.reason ?? "",
        status: "REQUESTED",
        approval_status: dbStatus(request.approvalStatus ?? "PENDING"),
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      };
      const { data, error } = await client.from("xxfp_withdrawal_requests").insert([dbPayload]).select().single();
      if (error) throw error;
      return mapWithdrawalRequest(data, { member_name: request.memberName });
    }
  },

  async updateWithdrawalStatus(requestId, status) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    const { data, error } = await client
      .from("xxfp_withdrawal_requests")
      .update({ approval_status: dbStatus(status), status: dbStatus(status), last_updated_by: profile.user_id })
      .eq("withdrawal_request_id", Number(requestId))
      .select()
      .single();
    if (error) throw error;
    return mapWithdrawalRequest(data);
  },

  async createApprovalRequests({ groupId, approvals }) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    if (!approvals?.length) return [];

    // prefer server-side RPC for bulk approval inserts; fallback to client inserts
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_approval_requests", { p_group_id: groupId, p_approvals: approvals });
      if (rpcError) throw rpcError;
      const rows = rpcData ?? [];
      return (Array.isArray(rows) ? rows : [rows]).map(mapApproval);
    } catch (err) {
      const rows = approvals.map((approval) => ({
        group_id: groupId,
        approval_batch_id: approval.batchId,
        transaction_type: approval.action,
        reference_type: approval.referenceType,
        reference_id: Number(approval.referenceId),
        approver_member_id: Number.isFinite(Number(approval.approverId)) ? Number(approval.approverId) : null,
        requester_name: approval.requester,
        approver_name: approval.approverName,
        amount: approval.amount ?? 0,
        approval_status: "PENDING",
        remarks: approval.details ?? approval.remarks ?? "",
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      }));

      const { data, error } = await client.from("xxfp_approval_header").insert(rows).select();
      if (error) throw error;
      return (data ?? []).map(mapApproval);
    }
  },

  async createPendingSetupChange(change) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    const payload = {
      groupId: change.groupId,
      batchId: change.batchId,
      setupType: change.setupType,
      targetId: Number(change.targetId),
      targetName: change.targetName,
      payload: change.payload ?? {},
      oldValue: change.oldValue ?? {},
      changeSummary: change.changeSummary ?? ""
    };
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_pending_setup_change", payload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      return mapPendingSetupChange(created);
    } catch (err) {
      const { data, error } = await client.from("xxfp_pending_setup_changes").insert([{
        group_id: change.groupId,
        approval_batch_id: change.batchId,
        setup_type: change.setupType,
        target_id: Number(change.targetId),
        target_name: change.targetName,
        payload: change.payload ?? {},
        old_value: change.oldValue ?? {},
        change_summary: change.changeSummary ?? "",
        status: "PENDING",
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      }]).select().single();
      if (error) throw error;
      return mapPendingSetupChange(data);
    }
  },

  async updatePendingSetupChangeStatus(changeId, status) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile || !Number.isFinite(Number(changeId))) return null;
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_update_pending_setup_change_status", { changeId: Number(changeId), status: dbStatus(status) });
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      return mapPendingSetupChange(created);
    } catch (err) {
      const { data, error } = await client
        .from("xxfp_pending_setup_changes")
        .update({
          status: dbStatus(status),
          last_updated_by: profile.user_id
        })
        .eq("setup_change_id", Number(changeId))
        .select()
        .single();
      if (error) throw error;
      return mapPendingSetupChange(data);
    }
  },

  async decideApproval(approvalId, status, remarks = "") {
    const client = requireClient();
    const { data, error } = await client.rpc("decide_approval", {
      target_approval_id: Number(approvalId),
      decision_status: dbStatus(status),
      decision_remarks: remarks
    });
    if (error) throw error;
    return data;
  },

  async createLegacyImport(importRow) {
    const client = requireClient();
    const profile = await currentProfile();
    const approvalStatus = dbStatus(importRow.approvalStatus ?? "COMPLETED");
    const savings = Number(importRow.totalSaving ?? 0);
    const pendingLoan = Number(importRow.pendingLoan ?? 0);
    const interest = Number(importRow.interestAmount ?? 0);
    const penalty = Number(importRow.penaltyAmount ?? 0);
    const trxDate = importRow.joinedDate ?? toIsoDate();
    const totalAmount = savings;
    const payload = {
      groupId: importRow.groupId,
      memberId: importRow.memberId,
      periodId: importRow.periodId ?? null,
      transactionDate: trxDate,
      amount: totalAmount,
      savings,
      pendingLoan,
      interest,
      penalty,
      approvalStatus,
      remarks: importRow.remarks ?? "",
      legacyBankBalance: importRow.legacyBankBalance ?? importRow.groupBankBalance ?? 0,
      requestor: profile?.user_id
    };
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_legacy_import", payload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      return created;
    } catch (err) {
      const { data: header, error: headerError } = await client.from("xxfp_trx_header").insert([{ trx_number: nextDocumentNumber("MIG"), group_id: importRow.groupId, member_id: importRow.memberId, period_id: importRow.periodId ?? null, trx_date: trxDate, trx_type: "Migrated", total_amount: totalAmount, approval_status: approvalStatus, remarks: importRow.remarks ?? "Migrated opening balances", created_by: profile?.user_id, last_updated_by: profile?.user_id }]).select().single();
      if (headerError) throw headerError;

      const insertedLines = await insertTransactionLines(client, header.member_trx_id, { savings, principal: pendingLoan, interest, penalty, excess: 0 }, profile?.user_id, "Migrated opening balances");

      let loan = null;
      if (pendingLoan > 0) {
        const { data: loanRow, error: loanError } = await client.from("xxfp_loan_header").insert([{ loan_number: nextDocumentNumber("MLN"), group_id: importRow.groupId, member_id: importRow.memberId, distributed_amount: pendingLoan, interest_rate: Number(importRow.interestRate ?? 0), distribution_date: trxDate, outstanding_principal: pendingLoan, outstanding_interest: interest, loan_status: approvalStatus === "PENDING" ? "PENDING" : "ACTIVE", created_by: profile?.user_id, last_updated_by: profile?.user_id }]).select().single();
        if (loanError) throw loanError;
        loan = loanRow;
      }

      return {
        legacy_id: header.member_trx_id,
        group_id: importRow.groupId,
        member_id: importRow.memberId,
        migration_date: trxDate,
        legacy_saving_balance: savings,
        legacy_loan_outstanding: pendingLoan,
        legacy_interest_balance: interest,
        legacy_penalty_balance: penalty,
        penalty_amount: penalty,
        legacy_share_earned: 0,
        legacy_bank_balance: Number(importRow.legacyBankBalance ?? importRow.groupBankBalance ?? 0),
        approval_status: approvalStatus,
        transaction: mapTransaction(header, insertedLines),
        loan
      };
    }
  },

  async saveLegacyGroupOpening(opening) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    const payload = {
      groupId: opening.groupId,
      migrationDate: opening.migrationDate ?? toIsoDate(),
      openingBankBalance: Number(opening.openingBankBalance ?? 0),
      openingGroupExpense: Number(opening.openingGroupExpense ?? 0),
      openingGroupGain: Number(opening.openingGroupGain ?? 0),
      approvalStatus: dbStatus(opening.approvalStatus ?? "COMPLETED"),
      remarks: opening.remarks ?? ""
    };
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_save_legacy_group_opening", payload);
      if (rpcError) throw rpcError;
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const id = created?.legacy_group_opening_id ?? created?.id ?? null;
      if (!id) return created;
      const { data } = await client.from("xxfp_legacy_group_opening").select("*").eq("legacy_group_opening_id", id).maybeSingle();
      return data ?? created;
    } catch (err) {
      const dbPayload = {
        group_id: opening.groupId,
        migration_date: opening.migrationDate ?? toIsoDate(),
        opening_bank_balance: Number(opening.openingBankBalance ?? 0),
        opening_group_expense: Number(opening.openingGroupExpense ?? 0),
        opening_group_gain: Number(opening.openingGroupGain ?? 0),
        approval_status: dbStatus(opening.approvalStatus ?? "COMPLETED"),
        remarks: opening.remarks ?? "",
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      };
      const { data, error } = await client.from("xxfp_legacy_group_opening").upsert([dbPayload], { onConflict: "group_id" }).select().single();
      if (error) throw error;
      return data;
    }
  },

  async updateLegacyGroupOpeningStatus(id, status) {
    const client = requireClient();
    const profile = await currentProfile();
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_update_legacy_group_opening_status", { id: Number(id), status: dbStatus(status) });
      if (rpcError) throw rpcError;
      return Array.isArray(rpcData) ? rpcData[0] : rpcData;
    } catch (err) {
      const { data, error } = await client
        .from("xxfp_legacy_group_opening")
        .update({ approval_status: dbStatus(status), last_updated_by: profile?.user_id })
        .eq("legacy_group_opening_id", Number(id))
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  async updateLegacyImport(id, changes) {
    const client = requireClient();
    const profile = await currentProfile();
    const payload = {
      legacy_saving_balance: changes.total_saving ?? changes.totalSaving,
      legacy_loan_outstanding: changes.pending_loan ?? changes.pendingLoan,
      legacy_interest_balance: changes.interest_amount ?? changes.interestAmount,
      legacy_share_earned: 0,
      legacy_bank_balance: changes.legacy_bank_balance ?? changes.legacyBankBalance,
      remarks: changes.remarks,
      last_updated_by: profile?.user_id
    };
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_update_legacy_import", { id: Number(id), changes: payload });
      if (rpcError) throw rpcError;
      return Array.isArray(rpcData) ? rpcData[0] : rpcData;
    } catch (err) {
      const { data, error } = await client.from("xxfp_legacy_data").update(payload).eq("legacy_id", id).select().single();
      if (error) throw error;
      return data;
    }
  },

  async createAuditLog({ recordId, action, oldValue, newValue }) {
    const client = requireClient();
    const profile = await currentProfile();
    const payload = {
      recordId,
      action,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      changedBy: profile?.email ?? "unknown",
      createdBy: profile?.user_id
    };
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_audit_log", payload);
      if (rpcError) throw rpcError;
      return Array.isArray(rpcData) ? rpcData[0] : rpcData;
    } catch (err) {
      const { data, error } = await client.from("xxfp_audit_log").insert([{ trx_id: recordId, action_type: action, old_value: oldValue ? JSON.stringify(oldValue) : null, new_value: newValue ? JSON.stringify(newValue) : null, changed_by: profile?.email ?? "unknown", created_by: profile?.user_id, last_updated_by: profile?.user_id }]).select().single();
      if (error) throw error;
      return data;
    }
  },

  async createDispute(dispute) {
    const client = requireClient();
    const profile = await currentProfile();
    const payload = {
      group_id: dispute.groupId,
      member_id: dispute.memberId,
      group_name: dispute.groupName,
      member_name: dispute.memberName,
      contact_number: dispute.contactNumber,
      issue: dispute.issue,
      attachment_name: dispute.attachmentName || null,
      attachment_data: dispute.attachmentData || null,
      status: "OPEN",
      created_by: profile?.user_id,
      last_updated_by: profile?.user_id
    };
    // prefer RPC for dispute creation
    try {
      const rpcPayload = { groupId: dispute.groupId, memberId: dispute.memberId, groupName: dispute.groupName, memberName: dispute.memberName, contactNumber: dispute.contactNumber, issue: dispute.issue, attachmentName: dispute.attachmentName || null, attachmentData: dispute.attachmentData || null };
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_create_support_dispute", rpcPayload);
      if (rpcError) throw rpcError;
      return Array.isArray(rpcData) ? rpcData[0] : rpcData;
    } catch (err) {
      const { data, error } = await client.from("xxfp_support_disputes").insert([payload]).select().single();
      if (error) throw error;
      return data;
    }
  },

  async replyDispute(disputeId, reply) {
    const client = requireClient();
    const profile = await currentProfile();
    try {
      const { data: rpcData, error: rpcError } = await client.rpc("rpc_reply_support_dispute", { dispute_id: disputeId, owner_reply: reply });
      if (rpcError) throw rpcError;
      return Array.isArray(rpcData) ? rpcData[0] : rpcData;
    } catch (err) {
      const { data, error } = await client.from("xxfp_support_disputes").update({ owner_reply: reply, status: "REPLIED", last_updated_by: profile?.user_id }).eq("dispute_id", disputeId).select().single();
      if (error) throw error;
      return data;
    }
  },

  async createRazorpayOrder({ groupId, planName, duration }) {
    try {
      return await invokeFunctionJson("create-razorpay-order", { groupId, planName, duration });
    } catch (error) {
      throw describeFunctionError(error, "create-razorpay-order");
    }
  },

  async verifyRazorpayPayment(payload) {
    try {
      return await invokeFunctionJson("verify-razorpay-payment", payload);
    } catch (error) {
      throw describeFunctionError(error, "verify-razorpay-payment");
    }
  },

  async askFinanceAgent(payload) {
    try {
      return await invokeFunctionJson("finance-agent", payload);
    } catch (error) {
      throw describeFunctionError(error, "finance-agent");
    }
  },

  async getApprovalSummary(payload) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return null;

    try {
      const { data, error } = await client.rpc("rpc_get_approval_summary", {
        p_group_id: Number(payload.groupId),
        p_approver_member_id: payload.approverMemberId != null ? Number(payload.approverMemberId) : null,
        p_status: payload.status ?? null,
        p_reference_type: payload.referenceType ?? null
      });
      if (error) throw error;
      return normalizeRpcRow(data) ?? {};
    } catch (error) {
      throw describeFunctionError(error, "rpc_get_approval_summary");
    }
  },

  async getReportSummary(payload) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return null;

    try {
      const { data, error } = await client.rpc("rpc_get_report_summary", {
        p_group_id: Number(payload.groupId),
        p_member_id: payload.memberId != null ? Number(payload.memberId) : null,
        p_start_date: payload.startDate ?? null,
        p_end_date: payload.endDate ?? null,
        p_as_of_date: payload.asOfDate ?? null
      });
      if (error) throw error;
      return normalizeRpcRow(data);
    } catch (error) {
      throw describeFunctionError(error, "rpc_get_report_summary");
    }
  },

  async getShareDistributionRange(payload) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return [];

    try {
      const { data, error } = await client.rpc("rpc_share_distribution_range", {
        p_group_id: Number(payload.groupId),
        p_start_date: payload.startDate ?? null,
        p_end_date: payload.endDate ?? null
      });
      if (error) throw error;
      return normalizeRpcRows(data);
    } catch (error) {
      throw describeFunctionError(error, "rpc_share_distribution_range");
    }
  },

  async getShareDistributionSnapshot(payload) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return [];

    try {
      const { data, error } = await client.rpc("rpc_share_distribution_snapshot", {
        p_group_id: Number(payload.groupId),
        p_reference_date: payload.referenceDate ?? null
      });
      if (error) throw error;
      return normalizeRpcRows(data);
    } catch (error) {
      throw describeFunctionError(error, "rpc_share_distribution_snapshot");
    }
  },

  async getMemberCollectionReportRows(payload) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return [];

    try {
      const { data, error } = await client.rpc("rpc_member_collection_report_rows", {
        p_group_id: Number(payload.groupId),
        p_member_id: payload.memberId != null ? Number(payload.memberId) : null,
        p_start_date: payload.startDate ?? null,
        p_end_date: payload.endDate ?? null,
        p_include_loan_columns: Boolean(payload.includeLoanColumns),
        p_period_label: payload.periodLabel ?? null
      });
      if (error) throw error;
      return normalizeRpcRows(data);
    } catch (error) {
      throw describeFunctionError(error, "rpc_member_collection_report_rows");
    }
  },

  async getMemberShareDistribution(payload) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return [];

    try {
      const { data, error } = await client.rpc("rpc_member_share_distribution", {
        p_group_id: Number(payload.groupId),
        p_payout_pool: payload.payoutPool ?? 0,
        p_reference_date: payload.referenceDate ?? null
      });
      if (error) throw error;
      return normalizeRpcRows(data);
    } catch (error) {
      throw describeFunctionError(error, "rpc_member_share_distribution");
    }
  },

  async getPendingDues(payload) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return [];

    try {
      const { data, error } = await client.rpc("rpc_pending_dues", {
        p_group_id: Number(payload.groupId),
        p_member_id: payload.memberId != null ? Number(payload.memberId) : null,
        p_as_of_date: payload.asOfDate ?? null
      });
      if (error) throw error;
      return normalizeRpcRows(data);
    } catch (error) {
      throw describeFunctionError(error, "rpc_pending_dues");
    }
  },

  async listTenantData() {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return initialState;

    const profileId = profile.authId ?? profile.supabase_user_id;
    if (!profileId) {
      return initialState;
    }

    try {
      const payload = await client.rpc("rpc_get_tenant_payload", { p_profile_id: profileId });
      if (payload.error) {
        const fallback = await buildFallbackTenantData(client, profile);
        return fallback;
      }

      const data = payload.data ?? {};
    const allMemberships = Array.isArray(data.members) ? data.members : [];
    const allGroups = Array.isArray(data.groups) ? data.groups : [];
    const groupSetup = Array.isArray(data.group_setup) ? data.group_setup : [];
    const memberSetup = Array.isArray(data.member_setup) ? data.member_setup : [];
    const periods = Array.isArray(data.periods) ? data.periods : [];
    const balances = Array.isArray(data.member_dashboard_balances) ? data.member_dashboard_balances : [];
    const loans = Array.isArray(data.loan_distribution) ? data.loan_distribution : [];
    const approvals = Array.isArray(data.approvals) ? data.approvals : [];
    const plans = Array.isArray(data.subscription_plans) ? data.subscription_plans : [];
    const subscriptions = Array.isArray(data.group_subscriptions) ? data.group_subscriptions : [];
    const headers = Array.isArray(data.member_transaction_header) ? data.member_transaction_header : [];
    const lines = Array.isArray(data.member_transaction_lines) ? data.member_transaction_lines : [];
    const legacyRows = Array.isArray(data.legacy_data) ? data.legacy_data : [];
    const shareDistributions = Array.isArray(data.share_distribution) ? data.share_distribution : [];
    const shareAdjustments = Array.isArray(data.share_adjustments) ? data.share_adjustments : [];
    const audits = Array.isArray(data.trx_audit_history) ? data.trx_audit_history : [];
    const expenseHeaders = Array.isArray(data.group_expense_header) ? data.group_expense_header : [];
    const expenseLines = Array.isArray(data.group_expense_lines) ? data.group_expense_lines : [];
    const disputes = Array.isArray(data.support_disputes) ? data.support_disputes : [];
    const withdrawalRequests = Array.isArray(data.withdrawal_requests) ? data.withdrawal_requests : [];
    const legacyGroupOpenings = Array.isArray(data.legacy_group_opening) ? data.legacy_group_opening : [];
    const pendingSetupChanges = Array.isArray(data.pending_setup_changes) ? data.pending_setup_changes : [];

    const visibleGroupIds = new Set(allGroups.map((group) => String(group.group_id ?? group.id)));
    const groups = allGroups.filter((group) => visibleGroupIds.has(String(group.group_id ?? group.id)));
    const members = allMemberships.filter((member) => visibleGroupIds.has(String(member.group_id)));
    const groupScoped = (row) => visibleGroupIds.has(String(row.group_id));
    const memberIds = new Set(members.map((member) => String(member.member_id)));
    const memberScoped = (row) => memberIds.has(String(row.member_id));

    const setupByGroup = Object.fromEntries(groupSetup.map((row) => [row.group_id, row]));
    const mappedGroups = groups.map((group) => mapGroup(group, setupByGroup[group.group_id]));
    const memberSetupByMember = Object.fromEntries(memberSetup.map((row) => [row.member_id, row]));
    const balanceByMember = Object.fromEntries(balances.map((row) => [row.member_id, row]));
    const memberById = Object.fromEntries(members.map((row) => [row.member_id, row]));
    const planById = Object.fromEntries(plans.map((row) => [row.subscription_plan_id, row]));
    const linesByHeader = lines.reduce((memo, line) => {
      memo[line.member_trx_id] = memo[line.member_trx_id] ?? [];
      memo[line.member_trx_id].push(line);
      return memo;
    }, {});
    const expenseLinesByHeader = expenseLines.reduce((memo, line) => {
      memo[line.group_expense_id] = memo[line.group_expense_id] ?? [];
      memo[line.group_expense_id].push(line);
      return memo;
    }, {});

    return {
      ...initialState,
      session: { signedIn: true, user: mapProfile(profile) },
      groups: mappedGroups,
      members: members.map((member) => mapMember(member, balanceByMember[member.member_id], memberSetupByMember[member.member_id])),
      periods: periods.filter(groupScoped).map(mapPeriod),
      loans: loans.filter(groupScoped).map((loan) => mapLoan(loan, memberById[loan.member_id])),
      pendingSetupChanges: pendingSetupChanges.filter(groupScoped).map(mapPendingSetupChange),
      approvals: approvals
        .filter((row) => isProductOwnerEmail(profile.email) || groupScoped(row) || memberIds.has(row.approver_member_id))
        .map(mapApproval),
      subscriptions: subscriptions.filter(groupScoped).map((row) => mapSubscription(row, planById[row.subscription_plan_id])),
      transactions: headers.filter(groupScoped).map((header) => mapTransaction(header, linesByHeader[header.member_trx_id] ?? [])).sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate))),
      expenses: expenseHeaders.filter(groupScoped).map((row) => mapExpense(row, expenseLinesByHeader[row.group_expense_id] ?? [])).sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate))),
      withdrawalRequests: withdrawalRequests.filter(groupScoped).map((row) => mapWithdrawalRequest(row, memberById[row.member_id])).sort((a, b) => String(b.requestDate).localeCompare(String(a.requestDate))),
      auditLogs: isProductOwnerEmail(profile.email) ? audits.map(mapAudit).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))) : [],
      legacyGroupOpenings: legacyGroupOpenings.filter(groupScoped),
      legacyImports: legacyRows.filter(groupScoped).map(mapLegacy),
      shareDistributions: shareDistributions.filter(memberScoped),
      shareAdjustments: shareAdjustments.filter(memberScoped),
      configurableFields: [],
      notifications: [],
      disputes: isProductOwnerEmail(profile.email) ? disputes : disputes.filter(groupScoped),
      rpcGroupFinanceSummaries: {},
      rpcMemberFinanceSummaries: {},
      rpcMemberStatements: {},
      rpcLoanAgingSummaries: {},
      rpcMemberDashboardCardSummaries: {},
      rpcDashboardCardSummary: null,
      rpcMemberLoanInterestDues: {},
      rpcMemberLoanInterestDueDetails: {},
      rpcPendingDues: [],
      rpcShareDistribution: [],
      rpcShareDistributionSnapshots: {}
    };
    } catch (error) {
      throw error;
    }
  }
};

if (typeof window !== "undefined") {
  window.__repository = repository;
}
