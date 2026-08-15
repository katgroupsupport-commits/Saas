import { create } from 'zustand';
import { loadState, saveState } from '../services/storage';

/**
 * Main application store using Zustand
 * Centralizes all state management previously in App.jsx useState hooks
 */
export const useAppStore = create((set, get) => {
  const initialStorageState = loadState();

  return {
    // ====== Authentication & Session ======
    session: {
      signedIn: false,
      user: {}
    },
    setSession: (session) => set({ session }),
    signOut: () => set({ session: { signedIn: false, user: {} } }),

    // ====== Group & Tenant Data ======
    groups: initialStorageState.groups || [],
    members: initialStorageState.members || [],
    periods: initialStorageState.periods || [],
    loans: initialStorageState.loans || [],
    transactions: initialStorageState.transactions || [],
    approvals: initialStorageState.approvals || [],
    expenses: initialStorageState.expenses || [],
    legacyImports: initialStorageState.legacyImports || [],
    notifications: initialStorageState.notifications || [],
    rpcShareDistribution: initialStorageState.rpcShareDistribution || [],
    rpcShareDistributionRange: initialStorageState.rpcShareDistributionRange || [],
    rpcShareDistributionSnapshots: initialStorageState.rpcShareDistributionSnapshots || {},
    rpcMemberLoanInterestDues: initialStorageState.rpcMemberLoanInterestDues || {},
    rpcMemberLoanInterestDueDetails: initialStorageState.rpcMemberLoanInterestDueDetails || {},
    rpcMemberDashboardCardSummaries: initialStorageState.rpcMemberDashboardCardSummaries || {},
    pendingSetupChanges: initialStorageState.pendingSetupChanges || [],

    // Batch update for tenant data
    setTenantData: (tenantData) =>
      set({
        groups: tenantData.groups || [],
        members: tenantData.members || [],
        periods: tenantData.periods || [],
        loans: tenantData.loans || [],
        transactions: tenantData.transactions || [],
        approvals: tenantData.approvals || [],
        expenses: tenantData.expenses || [],
        legacyImports: tenantData.legacyImports || [],
        notifications: tenantData.notifications || [],
        rpcShareDistribution: tenantData.rpcShareDistribution || [],
        rpcShareDistributionRange: tenantData.rpcShareDistributionRange || [],
        rpcShareDistributionSnapshots: tenantData.rpcShareDistributionSnapshots || {},
        rpcMemberLoanInterestDues: tenantData.rpcMemberLoanInterestDues || {},
        rpcMemberLoanInterestDueDetails: tenantData.rpcMemberLoanInterestDueDetails || {},
        rpcMemberDashboardCardSummaries: tenantData.rpcMemberDashboardCardSummaries || {},
        pendingSetupChanges: tenantData.pendingSetupChanges || []
      }),

    // ====== UI State ======
    selectedGroupId: initialStorageState.selectedGroupId ?? null,
    setSelectedGroupId: (groupId) => {
      set({ selectedGroupId: groupId });
      saveState({ selectedGroupId: groupId, searchQuery: get().searchQuery });
    },

    searchQuery: initialStorageState.searchQuery || '',
    setSearchQuery: (query) => {
      set({ searchQuery: query });
      saveState({ selectedGroupId: get().selectedGroupId, searchQuery: query });
    },

    // ====== Modal & Dialog State ======
    confirmDialog: null,
    setConfirmDialog: (dialog) => set({ confirmDialog: dialog }),

    notification: null,
    setNotification: (notification) => set({ notification }),
    showNotificationDetails: false,
    setShowNotificationDetails: (show) => set({ showNotificationDetails: show }),

    // ====== Navigation & Menu State ======
    mobileNavOpen: false,
    setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

    expandedMenu: 'Dashboard',
    setExpandedMenu: (menu) => set({ expandedMenu: menu }),

    showProfileMenu: false,
    setShowProfileMenu: (show) => set({ showProfileMenu: show }),

    searchResultsVisible: false,
    setSearchResultsVisible: (visible) => set({ searchResultsVisible: visible }),

    // ====== Member Preview/Edit State ======
    previewMember: null,
    setPreviewMember: (member) => set({ previewMember: member }),

    editingLegacy: null,
    setEditingLegacy: (legacy) => set({ editingLegacy: legacy }),

    editingValues: {},
    setEditingValues: (values) => set({ editingValues: values }),

    // ====== Loading States ======
    booting: false,
    setBooting: (loading) => set({ booting: loading }),

    isRefreshingTenant: false,
    setIsRefreshingTenant: (loading) => set({ isRefreshingTenant: loading }),

    migrationLoading: false,
    setMigrationLoading: (loading) => set({ migrationLoading: loading }),

    appError: '',
    setAppError: (error) => set({ appError: error }),

    // ====== Derived Helpers ======
    getSelectedGroup: () => {
      const state = get();
      return state.groups.find((g) => String(g.id) === String(state.selectedGroupId)) ?? state.groups[0];
    },

    getSelectedGroupMember: () => {
      const state = get();
      const selectedGroup = state.getSelectedGroup();
      const session = state.session;
      return (state.members || []).find((member) =>
        String(member.groupId) === String(selectedGroup?.id)
        && (
          String(member.id) === String(session?.user?.memberId)
          || (member.email && session?.user?.email && member.email.toLowerCase() === session.user.email.toLowerCase())
        )
      );
    },

    // ====== Batch Update Helpers ======
    patchState: (updater) =>
      set((state) => (typeof updater === 'function' ? updater(state) : updater)),

    addNotification: (notification) =>
      set((state) => ({
        notifications: [
          {
            id: notification.id,
            groupId: state.getSelectedGroup()?.id,
            title: notification.title || notification.message || 'Notification',
            body: notification.body || notification.details || '',
            type: notification.type || 'info',
            createdAt: new Date().toISOString(),
            read: false
          },
          ...(state.notifications || [])
        ]
      }))
  };
});
