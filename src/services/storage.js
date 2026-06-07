import { roles } from "./permissions";

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
  selectedGroupId: null
};

function mergeState(saved) {
  return {
    ...initialState,
    ...saved,
    session: {
      ...initialState.session,
      ...(saved?.session ?? {}),
      user: {
        ...initialState.session.user,
        ...(saved?.session?.user ?? {})
      }
    },
    groups: Array.isArray(saved?.groups) ? saved.groups : [],
    members: Array.isArray(saved?.members) ? saved.members : [],
    subscriptions: Array.isArray(saved?.subscriptions) ? saved.subscriptions : [],
    periods: Array.isArray(saved?.periods) ? saved.periods : [],
    loans: Array.isArray(saved?.loans) ? saved.loans : [],
    approvals: Array.isArray(saved?.approvals) ? saved.approvals : [],
    pendingSetupChanges: Array.isArray(saved?.pendingSetupChanges) ? saved.pendingSetupChanges : [],
    notifications: Array.isArray(saved?.notifications) ? saved.notifications : [],
    configurableFields: Array.isArray(saved?.configurableFields) ? saved.configurableFields : [],
    transactions: Array.isArray(saved?.transactions) ? saved.transactions : [],
    expenses: Array.isArray(saved?.expenses) ? saved.expenses : [],
    withdrawalRequests: Array.isArray(saved?.withdrawalRequests) ? saved.withdrawalRequests : [],
    auditLogs: Array.isArray(saved?.auditLogs) ? saved.auditLogs : [],
    legacyMigration: saved?.legacyMigration ?? {},
    legacyGroupOpenings: Array.isArray(saved?.legacyGroupOpenings) ? saved.legacyGroupOpenings : [],
    legacyImports: Array.isArray(saved?.legacyImports) ? saved.legacyImports : [],
    shareDistributions: Array.isArray(saved?.shareDistributions) ? saved.shareDistributions : [],
    shareAdjustments: Array.isArray(saved?.shareAdjustments) ? saved.shareAdjustments : [],
    disputes: Array.isArray(saved?.disputes) ? saved.disputes : [],
    selectedGroupId: saved?.selectedGroupId ?? null
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
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Persistence is helpful for the demo, but the app should still render if storage is unavailable.
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
