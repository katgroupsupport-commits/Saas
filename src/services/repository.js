import { supabase } from "../lib/supabase";
import { initialState } from "./storage";
import { roles } from "./permissions";

function requireClient() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
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

async function ensureProfile(authUser) {
  const client = requireClient();
  const metadata = authUser.user_metadata ?? {};
  const fallbackName = metadata.full_name || authUser.email?.split("@")[0] || "User";
  const fallbackUsername = metadata.username || fallbackName || authUser.email?.split("@")[0] || `user${Date.now()}`;
  const fallbackMobile = metadata.mobile_number || metadata.mobile || null;

  const { data: existing, error: existingError } = await client
    .from("auth_users")
    .select("*")
    .eq("supabase_user_id", authUser.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const updates = { last_login_date: new Date().toISOString() };
    if (metadata.full_name && (!existing.username || existing.username === authUser.email?.split("@")[0])) {
      updates.username = metadata.full_name;
    }
    const { data: updated } = await client.from("auth_users").update(updates).eq("user_id", existing.user_id).select("*").single();
    return attachProfileMember(client, updated ?? existing);
  }

  const payload = {
    supabase_user_id: authUser.id,
    username: fallbackUsername,
    email: authUser.email ?? `${authUser.id}@missing.email`,
    mobile_number: fallbackMobile,
    status: "ACTIVE"
  };

  const { data, error } = await client.from("auth_users").insert([payload]).select("*").single();
  if (error) {
    const message = String(error.message ?? error.details ?? "").toLowerCase();
    if (error.code === "23503" || message.includes("auth_users_supabase_user_id_fkey")) {
      await client.auth.signOut();
      throw new Error("Your browser had an old deleted Supabase login session. The app signed it out. Register or login again to continue fresh.");
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
    .from("members")
    .select("*, role:roles(role_name)")
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
  const { error } = await client.from("periods").insert(months);
  if (error) throw error;
}

async function fetchAll(client, table, select = "*") {
  const { data, error } = await client.from(table).select(select);
  if (error) throw error;
  return data ?? [];
}

async function fetchAllOptional(client, table, select = "*") {
  const { data, error } = await client.from(table).select(select);
  if (error) return [];
  return data ?? [];
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
  const { data, error } = await client.from("member_transaction_lines").insert(rows).select();
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

  const { data: header, error } = await client.from("member_transaction_header").insert([payload]).select().single();
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
    return new Error(`Unable to reach Supabase Edge Function "${functionName}". Deploy it in Supabase and confirm Edge Function secrets are configured.`);
  }
  return error instanceof Error ? error : new Error(message);
}

async function invokeFunctionJson(functionName, body) {
  const client = requireClient();
  const { data: sessionResult, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionResult.session?.access_token;
  if (!accessToken) throw new Error("Please login again before making this payment.");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
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
    if (!email.includes("@")) {
      throw new Error("Please login with your email address.");
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error("Supabase did not return an authenticated user.");
    return mapProfile(await ensureProfile(data.user));
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
    if (!data.user) throw new Error("Supabase did not return a new user.");
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
      .from("auth_users")
      .update({ profile_photo_data: photoData, last_updated_by: profile.user_id })
      .eq("user_id", profile.user_id);
    if (error) throw error;

    if (profile.member_id) {
      const { error: memberError } = await client
        .from("members")
        .update({ profile_photo_data: photoData, last_updated_by: profile.user_id })
        .eq("member_id", profile.member_id);
      if (memberError) throw memberError;
    }
  },

  async createGroup(group) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");

    const payload = {
      group_name: group.name ?? group.group_name,
      primary_contact_name: group.primaryContact ?? group.primaryContactName ?? profile.username,
      mobile_number: group.mobile ?? profile.mobile_number,
      email: group.email ?? profile.email,
      status: "ACTIVE",
      created_by: profile.user_id,
      last_updated_by: profile.user_id
    };

    const { data, error } = await client.from("groups").insert([payload]).select().single();
    if (error) throw error;

    await client.from("group_setup").insert([{
      group_id: data.group_id,
      monthly_saving_amount: group.monthlySaving ?? group.loanEligibilityRules?.monthlySaving ?? null,
      interest_rate: group.interestRate ?? null,
      interest_type: group.interestType ?? "Reducing",
      penalty_amount: group.penaltyAmount ?? null,
      loan_limit: group.maximumLoanLimit ?? null,
      auto_approve_flag: "N",
      loan_tenure_months: group.loanTenureMonths ?? null,
      loan_due_day: group.loanDueDay ?? null,
      approver_names: group.approvers ?? [],
      admin_names: group.admins ?? [],
      created_by: profile.user_id,
      last_updated_by: profile.user_id
    }]);

    await insertInitialPeriods(client, data.group_id, profile.user_id);

    const adminRole = await client.from("roles").select("role_id").eq("role_name", "Group Admin").maybeSingle();
    const creatorName = profile.member?.member_name || profile.username || profile.email || "";
    const creatorUsername = `${String(profile.username || profile.email?.split("@")[0] || "creator").replace(/[^A-Za-z0-9._-]/g, "")}_${data.group_id}`;
    const { data: member, error: memberError } = await client.from("members").insert([{
      group_id: data.group_id,
      role_id: adminRole.data?.role_id ?? null,
      member_name: creatorName,
      username: creatorUsername,
      mobile_number: profile.mobile_number,
      email: profile.email,
      join_date: toIsoDate(),
      status: "ACTIVE",
      created_by: profile.user_id,
      last_updated_by: profile.user_id
    }]).select().single();
    if (memberError) throw memberError;

    if (member) {
      await client.from("member_status_history").insert([{
        member_id: member.member_id,
        group_id: data.group_id,
        status: "ACTIVE",
        start_date: toIsoDate(),
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      }]);
      await client.from("member_setup").insert([{
        member_id: member.member_id,
        custom_saving_amount: null,
        loan_limit: null,
        loan_tenure_months: null,
        interest_rate: null,
        interest_type: null,
        active_flag: "Y",
        created_by: profile.user_id,
        last_updated_by: profile.user_id
      }]);
      await client.from("auth_users").update({ member_id: member.member_id }).eq("user_id", profile.user_id);
    }

    return {
      ...mapGroup(data, {
        monthly_saving_amount: group.monthlySaving ?? null,
        interest_rate: group.interestRate ?? null,
        interest_type: group.interestType ?? "Reducing",
        penalty_amount: group.penaltyAmount ?? null,
        loan_limit: group.maximumLoanLimit ?? null,
        loan_tenure_months: group.loanTenureMonths ?? null,
        loan_due_day: group.loanDueDay ?? null,
        approver_names: group.approvers ?? [],
        admin_names: group.admins ?? []
      }),
      creatorMember: member ? { ...mapMember({ ...member, role: { role_name: roles.GROUP_ADMIN } }, {}, {
        custom_saving_amount: null,
        loan_limit: null,
        loan_tenure_months: null,
        interest_rate: null,
        interest_type: null
      }), memberRole: roles.GROUP_ADMIN } : null
    };
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
    if (Object.keys(groupPayload).some((key) => key !== "last_updated_by")) {
      const { data, error } = await client.from("groups").update(groupPayload).eq("group_id", numericGroupId).select().single();
      if (error) throw error;
      groupRow = data;
    } else {
      const { data, error } = await client.from("groups").select("*").eq("group_id", numericGroupId).single();
      if (error) throw error;
      groupRow = data;
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
        .from("group_setup")
        .upsert(setupPayload, { onConflict: "group_id" })
        .select()
        .single();
      if (error) throw error;
      setupRow = data;
    } else {
      const { data } = await client.from("group_setup").select("*").eq("group_id", numericGroupId).maybeSingle();
      setupRow = data;
    }

    return mapGroup(groupRow, setupRow ?? {});
  },

  async createMember(member, groupId) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");

    const role = await client.from("roles").select("role_id").eq("role_name", member.memberRole ?? "Member").maybeSingle();
    if (member.username) {
      const { data: existingUsername, error: usernameError } = await client
        .from("members")
        .select("member_id")
        .ilike("username", member.username)
        .maybeSingle();
      if (usernameError) throw usernameError;
      if (existingUsername) throw new Error("Username already exists. Choose a different username.");
    }
    const payload = {
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

    const { data, error } = await client.from("members").insert([payload]).select().single();
    if (error) throw error;

    await client.from("member_status_history").insert([{
      member_id: data.member_id,
      group_id: groupId,
      status: payload.status,
      start_date: payload.join_date,
      end_date: payload.status === "INACTIVE" ? toIsoDate() : null,
      created_by: profile.user_id,
      last_updated_by: profile.user_id
    }]);
    await client.from("member_setup").insert([{
      member_id: data.member_id,
      custom_saving_amount: null,
      loan_limit: null,
      loan_tenure_months: null,
      interest_rate: null,
      interest_type: null,
      active_flag: payload.status === "ACTIVE" ? "Y" : "N",
      created_by: profile.user_id,
      last_updated_by: profile.user_id
    }]);

    return mapMember(data, {}, {
      custom_saving_amount: null,
      loan_limit: null,
      loan_tenure_months: null,
      interest_rate: null,
      interest_type: null
    });
  },

  async updateMember(memberId, updates) {
    const client = requireClient();
    const profile = await currentProfile();
    if (updates.username) {
      const { data: existingUsername, error: usernameError } = await client
        .from("members")
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
    const { data, error } = await client.from("members").update(payload).eq("member_id", memberId).select().single();
    if (error) throw error;

    if (nextStatus) {
      await client.from("member_status_history").insert([{
        member_id: memberId,
        group_id: data.group_id,
        status: nextStatus,
        start_date: nextExitDate ?? toIsoDate(),
        created_by: profile?.user_id,
        last_updated_by: profile?.user_id
      }]);
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
        .from("member_setup")
        .upsert(setupPayload, { onConflict: "member_id" })
        .select()
        .single();
      if (setupError) throw setupError;
      setupRow = setupData;
    }
    return mapMember(data, {}, setupRow ?? {});
  },

  async ensurePeriod(period, groupId) {
    const client = requireClient();
    const profile = await currentProfile();
    const name = period.name || period.periodName;
    const { data: existing, error: existingError } = await client
      .from("periods")
      .select("*")
      .eq("group_id", groupId)
      .eq("period_name", name)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return mapPeriod(existing);

    const { data, error } = await client.from("periods").insert([{
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
    await client.from("periods").update({ status: "CLOSED" }).eq("group_id", groupId).eq("status", "OPEN").neq("period_id", ensured.id);
    const { data, error } = await client.from("periods").update({ status: "OPEN" }).eq("period_id", ensured.id).select().single();
    if (error) throw error;
    return mapPeriod(data);
  },

  async closeAccountingPeriod(periodId) {
    const client = requireClient();
    const { data, error } = await client.from("periods").update({ status: "CLOSED" }).eq("period_id", periodId).select().single();
    if (error) throw error;
    return mapPeriod(data);
  },

  async createTransaction(transaction) {
    return createFinancialTransaction({ transaction, remarks: transaction.remarks ?? "" });
  },

  async createGroupExpense(expense) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");

    const payload = {
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

    const { data: header, error } = await client.from("group_expense_header").insert([payload]).select().single();
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
    const { data: lines, error: lineError } = await client.from("group_expense_lines").insert(lineRows).select();
    if (lineError) throw lineError;

    return mapExpense(header, lines ?? []);
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

  async createLoan(loan, groupId, memberId) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");

    const { data: request, error: requestError } = await client.from("loan_requests").insert([{
      request_number: nextDocumentNumber("LR"),
      group_id: groupId,
      member_id: memberId,
      requested_amount: loan.amount,
      requested_months: loan.durationMonths,
      purpose: loan.reason,
      request_date: loan.startDate,
      status: "REQUESTED",
      approval_status: "PENDING",
      created_by: profile.user_id,
      last_updated_by: profile.user_id
    }]).select().single();
    if (requestError) throw requestError;

    return {
      id: `request-${request.loan_request_id}`,
      requestId: request.loan_request_id,
      memberId,
      memberName: loan.memberName ?? "",
      amount: Number(request.requested_amount ?? 0),
      principalOutstanding: 0,
      interestOutstanding: 0,
      penaltyOutstanding: 0,
      rate: Number(loan.rate ?? 0),
      status: "Pending Approval",
      reason: request.purpose ?? "",
      durationMonths: Number(request.requested_months ?? 0),
      startDate: request.request_date,
      loanNumber: request.request_number
    };
  },

  async createWithdrawalRequest(request) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");

    const payload = {
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
    const { data, error } = await client.from("withdrawal_requests").insert([payload]).select().single();
    if (error) throw error;
    return mapWithdrawalRequest(data, { member_name: request.memberName });
  },

  async updateWithdrawalStatus(requestId, status) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    const { data, error } = await client
      .from("withdrawal_requests")
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

    const { data, error } = await client.from("approvals").insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(mapApproval);
  },

  async createPendingSetupChange(change) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    const { data, error } = await client.from("pending_setup_changes").insert([{
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
  },

  async updatePendingSetupChangeStatus(changeId, status) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile || !Number.isFinite(Number(changeId))) return null;
    const { data, error } = await client
      .from("pending_setup_changes")
      .update({
        status: dbStatus(status),
        last_updated_by: profile.user_id
      })
      .eq("setup_change_id", Number(changeId))
      .select()
      .single();
    if (error) throw error;
    return mapPendingSetupChange(data);
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

    const { data: header, error: headerError } = await client.from("member_transaction_header").insert([{
      trx_number: nextDocumentNumber("MIG"),
      group_id: importRow.groupId,
      member_id: importRow.memberId,
      period_id: importRow.periodId ?? null,
      trx_date: trxDate,
      trx_type: "Migrated",
      total_amount: totalAmount,
      approval_status: approvalStatus,
      remarks: importRow.remarks ?? "Migrated opening balances",
      created_by: profile?.user_id,
      last_updated_by: profile?.user_id
    }]).select().single();
    if (headerError) throw headerError;

    const insertedLines = await insertTransactionLines(client, header.member_trx_id, {
      savings,
      principal: pendingLoan,
      interest,
      penalty,
      excess: 0
    }, profile?.user_id, "Migrated opening balances");

    let loan = null;
    if (pendingLoan > 0) {
      const { data: loanRow, error: loanError } = await client.from("loan_distribution").insert([{
        loan_number: nextDocumentNumber("MLN"),
        group_id: importRow.groupId,
        member_id: importRow.memberId,
        distributed_amount: pendingLoan,
        interest_rate: Number(importRow.interestRate ?? 0),
        distribution_date: trxDate,
        outstanding_principal: pendingLoan,
        outstanding_interest: interest,
        loan_status: approvalStatus === "PENDING" ? "PENDING" : "ACTIVE",
        created_by: profile?.user_id,
        last_updated_by: profile?.user_id
      }]).select().single();
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
  },

  async saveLegacyGroupOpening(opening) {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) throw new Error("Not signed in.");
    const payload = {
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
    const { data, error } = await client
      .from("legacy_group_opening")
      .upsert([payload], { onConflict: "group_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateLegacyGroupOpeningStatus(id, status) {
    const client = requireClient();
    const profile = await currentProfile();
    const { data, error } = await client
      .from("legacy_group_opening")
      .update({ approval_status: dbStatus(status), last_updated_by: profile?.user_id })
      .eq("legacy_group_opening_id", Number(id))
      .select()
      .single();
    if (error) throw error;
    return data;
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
    const { data, error } = await client.from("legacy_data").update(payload).eq("legacy_id", id).select().single();
    if (error) throw error;
    return data;
  },

  async createAuditLog({ recordId, action, oldValue, newValue }) {
    const client = requireClient();
    const profile = await currentProfile();
    const { data, error } = await client.from("trx_audit_history").insert([{
      trx_id: recordId,
      action_type: action,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: newValue ? JSON.stringify(newValue) : null,
      changed_by: profile?.email ?? "unknown",
      created_by: profile?.user_id,
      last_updated_by: profile?.user_id
    }]).select().single();
    if (error) throw error;
    return data;
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
    const { data, error } = await client.from("support_disputes").insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  async replyDispute(disputeId, reply) {
    const client = requireClient();
    const profile = await currentProfile();
    const { data, error } = await client
      .from("support_disputes")
      .update({ owner_reply: reply, status: "REPLIED", last_updated_by: profile?.user_id })
      .eq("dispute_id", disputeId)
      .select()
      .single();
    if (error) throw error;
    return data;
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

  async listTenantData() {
    const client = requireClient();
    const profile = await currentProfile();
    if (!profile) return initialState;

    const allMemberships = await fetchAll(client, "members", "*, role:roles(role_name)");
    const ownMemberships = allMemberships.filter((member) => {
      return member.email?.toLowerCase() === profile.email?.toLowerCase()
        || (member.mobile_number && member.mobile_number === profile.mobile_number)
        || member.member_id === profile.member_id;
    });
    const visibleGroupIds = new Set(ownMemberships.map((member) => member.group_id));

    const [
      allGroups,
      groupSetup,
      memberSetup,
      periods,
      balances,
      loans,
      approvals,
      plans,
      subscriptions,
      headers,
      lines,
      legacyRows,
      shareDistributions,
      shareAdjustments,
      audits,
      expenseHeaders,
      expenseLines,
      disputes,
      withdrawalRequests,
      legacyGroupOpenings,
      pendingSetupChanges
    ] = await Promise.all([
      fetchAll(client, "groups"),
      fetchAll(client, "group_setup"),
      fetchAll(client, "member_setup"),
      fetchAll(client, "periods"),
      fetchAll(client, "member_dashboard_balances"),
      fetchAll(client, "loan_distribution"),
      fetchAll(client, "approvals"),
      fetchAll(client, "subscription_plans"),
      fetchAll(client, "group_subscriptions"),
      fetchAll(client, "member_transaction_header"),
      fetchAll(client, "member_transaction_lines"),
      fetchAll(client, "legacy_data"),
      fetchAll(client, "share_distribution"),
      fetchAll(client, "share_adjustments"),
      fetchAll(client, "trx_audit_history"),
      fetchAll(client, "group_expense_header"),
      fetchAll(client, "group_expense_lines"),
      fetchAll(client, "support_disputes"),
      fetchAll(client, "withdrawal_requests"),
      fetchAllOptional(client, "legacy_group_opening"),
      fetchAllOptional(client, "pending_setup_changes")
    ]);

    allGroups
      .filter((group) => group.created_by === profile.user_id)
      .forEach((group) => visibleGroupIds.add(group.group_id));
    if (isProductOwnerEmail(profile.email)) {
      allGroups.forEach((group) => visibleGroupIds.add(group.group_id));
    }

    const groupIds = [...visibleGroupIds];
    const groups = allGroups.filter((group) => visibleGroupIds.has(group.group_id));
    const members = allMemberships.filter((member) => visibleGroupIds.has(member.group_id));
    const groupScoped = (row) => visibleGroupIds.has(row.group_id);
    const memberIds = new Set(members.map((member) => member.member_id));
    const memberScoped = (row) => memberIds.has(row.member_id);

    const setupByGroup = Object.fromEntries(groupSetup.map((row) => [row.group_id, row]));
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
      groups: groups.map((group) => mapGroup(group, setupByGroup[group.group_id])),
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
      notifications: []
      ,
      disputes: isProductOwnerEmail(profile.email) ? disputes : disputes.filter(groupScoped)
    };
  }
};

if (typeof window !== "undefined") {
  window.__repository = repository;
}
