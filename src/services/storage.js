import { roles } from "./permissions.js";

const key = "bachat-gat-saas-state-v3";
const legacyKeys = [
  "bachat-gat-saas-state-v2",
  "bachat-gat-saas-state"
];

export const initialState = {
  session: {
    signedIn: false,
    user: {
      id: null,
      name: "",
      email: "",
      mobile: "",
      username: "",
      role: roles.GROUP_ADMIN,
      language: "en",
      groupIds: []
    }
  },
  groups: [],
  members: [],
  subscriptions: [],
  periods: [],
  loans: [],
  approvals: [],
  pendingSetupChanges: [],
  notifications: [],
  configurableFields: [],
  transactions: [],
  expenses: [],
  withdrawalRequests: [],
  auditLogs: [],
  legacyMigration: {},
  legacyGroupOpenings: [],
  legacyImports: [],
  shareDistributions: [],
  shareAdjustments: [],
  disputes: [],
  rpcGroupFinanceSummaries: {},
  rpcMemberFinanceSummaries: {},
  rpcMemberStatements: {},
  rpcLoanAgingSummaries: {},
  rpcMemberLoanInterestDues: {},
  rpcMemberDashboardCardSummaries: {},
  rpcDashboardSummaries: {},
  rpcPendingDues: [],
  rpcShareDistribution: [],
  rpcShareDistributionRange: [],
  rpcShareDistributionSnapshots: {},
  rpcMemberLoanInterestDueDetails: {},
  selectedGroupId: null
};

function mergeState(saved) {
  return {
    ...initialState,
    selectedGroupId: saved?.selectedGroupId ?? null,
    searchQuery: typeof saved?.searchQuery === "string" ? saved.searchQuery : ""
  };
}

export function loadState() {
  try {
    legacyKeys.forEach((legacyKey) => localStorage.removeItem(legacyKey));
    const saved = localStorage.getItem(key);
    return saved ? mergeState(JSON.parse(saved)) : initialState;
  } catch {
    return initialState;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(key, JSON.stringify({
      selectedGroupId: state.selectedGroupId ?? null,
      searchQuery: state.searchQuery ?? ""
    }));
  } catch {
    // Persistence is helpful for the demo, but the app should still render if storage is unavailable.
  }
}

export function clearPersistedState() {
  try {
    localStorage.removeItem(key);
    legacyKeys.forEach((legacyKey) => localStorage.removeItem(legacyKey));
  } catch {
    // Ignore storage errors during logout cleanup.
  }
}

export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function audit({ state, actor, action, tableName, recordId, oldValue, newValue }) {
  return {
    ...state,
    auditLogs: [
      {
        id: makeId("aud"),
        actor: actor?.name ?? "System",
        action,
        tableName,
        recordId,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        timestamp: new Date().toISOString()
      },
      ...state.auditLogs
    ]
  };
}
