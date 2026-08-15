import React, { useEffect, useState, useMemo, useRef } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  Bell,
  BookOpen,
  CalendarCheck,
  Calculator,
  CheckCircle2,
  CreditCard,
  FileClock,
  FileBarChart,
  Home,
  IndianRupee,
  Landmark,
  ListChecks,
  LockKeyhole,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  BotMessageSquare,
  PieChart,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Undo2,
  User,
  Users,
  WalletCards,
  X
} from "lucide-react";
import {
  allocateIncomingPayment,
  calculateLoanEligibility,
  calculateLoanInterest,
  calculateEventBasedShareDistribution,
  interestTypeDescriptions
} from "./services/calculationEngine";
import { canPostTransaction, getCurrentMonthPeriod, getOpenPeriod, openPeriod, periodStatuses } from "./services/periodControl";
import { roles, visibleMenu } from "./services/permissions";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { audit, clearPersistedState, initialState, loadState, makeId, saveState } from "./services/storage";
import { groupSchema, loanSchema, legacyMigrationSchema, loginSchema, memberSchema, otpPasswordSchema, passwordResetSchema, registerSchema, transactionSchema, validate } from "./services/validation";
import { repository } from "./services/repository";
import { PublicSite, StatusScreen } from "./pages/auth";
import { Dashboard, GroupSelectionPage, HubGridPage } from "./pages/dashboard";
import ContactSupport from "./pages/ContactSupport";
import FinanceAgent from "./pages/FinanceAgent";
import SettingsPage from "./pages/SettingsPage";
import MembersPage from "./pages/setup/MembersPage";
import SubscriptionsPage from "./pages/setup/SubscriptionsPage";
import SetupPageRoute from "./pages/setup/SetupPage";
import AppShell from "./layout/AppShell";
import AppRoutes from "./layout/AppRoutes";
import { useAppStore } from "./store";
import MemberNotifications from "./pages/MemberNotifications";
import MemberSavings from "./pages/MemberSavings";
import MemberLoans from "./pages/MemberLoans";
import MemberProfile from "./pages/MemberProfile";
import ShareDistribution from "./pages/ShareDistribution";
import TransactionsPage from "./pages/Transactions";
import WithdrawalsPage from "./pages/Withdrawals";
import LoansPage from "./pages/Loans";
import ReportsPage from "./pages/Reports";
import PeriodsPage from "./pages/Periods";
import ApprovalsPage from "./pages/Approvals";
import PendingDuesPage from "./pages/PendingDues";
import CorrectionsPage from "./pages/Corrections";
import AdjustmentsPage from "./pages/Adjustments";
import ReversalsPage from "./pages/Reversals";
import WaiversPage from "./pages/Waivers";
import ProductOwnerSupportPage from "./pages/ProductOwnerSupport";
import {
  bilingual,
  Page,
  MetricGrid,
  Section,
  FormCard,
  Field,
  SelectField,
  ComboField,
  ToggleCell,
  Table,
  ProfilePhoto
} from "./components";
import { isWithinPastDays } from "./services/historyUtils";
import {
  allocationPaidForMember,
  allocationWaivedForMember,
  buildOpeningShareRatioRows,
  calculateDerivedLoanOutstanding,
  calculateDerivedLoanPrincipalOutstanding,
  calculateDerivedOpeningSurplus,
  calculateDashboardCards,
  calculateMemberDashboardCards,
  calculateMemberLedgerSummary,
  calculateMemberLoanInterestDue,
  getMemberLoanInterestDueDetails,
  calculatePendingDues,
  calculateLoanOutstandingWithDues,
  configuredNumber,
  financeFieldDictionary,
  getCompletedTransactions,
  getEffectiveCompletedTransactions,
  getCurrentMember,
  getDashboardPeriod,
  getEffectiveMemberSetup,
  getLoanDueDate,
  getLoanInterestForDate,
  isCompletedFinancialStatus,
  isDateInPeriod,
  isMigratedOpeningTransaction,
  isOutstandingLoan,
  loanBelongsToMember,
  toIsoDateValue
} from "./services/financeFields";
import {
  applyShareDistributionToMembers,
  getHiddenGroupIds,
  getSharePeriodsForState,
  getStateWithComputedShares,
  getVisibleNotifications,
  isGroupAdminActor,
  isUuid,
  recalculateMemberSavingsFromEffectiveLedger,
  saveHiddenGroupIds,
  syncMemberSavingsCorrectionsToSupabase,
  withTimeout
} from "./services/stateHelpers";
import {
  formatReportTablesText,
  groupReportHeaders,
  memberReportHeaders,
  getReportSummaryRows
} from "./services/reportUtils";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const GROUP_EXPENSE_MEMBER_ID = "__GROUP_EXPENSE__";
const SUPABASE_BOOT_TIMEOUT_MS = 12000;

const navIcons = {
  Dashboard: Landmark,
  "My Dashboard": Landmark,
  Groups: Users,
  Members: Users,
  Setup: Settings,
  Subscriptions: CreditCard,
  Periods: CalendarCheck,
  Transactions: WalletCards,
  Loans: IndianRupee,
  Withdrawals: WalletCards,
  Approvals: ShieldCheck,
  Reports: FileBarChart,
  Settings: Settings
};

navIcons.Adjustments = Shuffle;
navIcons.Reversals = Undo2;
navIcons.Corrections = Shuffle;
navIcons["Audit History"] = FileClock;
navIcons["Share Distribution"] = WalletCards;
navIcons["Reports & Audit"] = FileBarChart;
navIcons.Contact = MessageCircle;
navIcons["User Guide"] = BookOpen;
navIcons["Request Loan"] = IndianRupee;
navIcons["Request Withdrawal"] = WalletCards;
navIcons["Pending Dues"] = CalendarCheck;
navIcons.Operations = WalletCards;
navIcons.Waivers = ShieldCheck;
navIcons["AI Agent"] = BotMessageSquare;

const homeHubButtons = [
  { to: "/dashboard/group", label: "Group Dashboard", Icon: PieChart },
  { to: "/dashboard/member", label: "Member Dashboard", Icon: User },
  { to: "/pending-dues", label: "Pending Dues", Icon: CalendarCheck },
  { to: "/approvals", label: "Approvals", Icon: ShieldCheck },
  { to: "/reports", label: "Reports", Icon: FileBarChart }
];

const setupHubButtons = [
  { to: "/members", label: "Add Members", Icon: Users },
  { to: "/setup/group", label: "Group Details", Icon: Landmark },
  { to: "/setup/member", label: "Member Details", Icon: User },
  { to: "/setup/roles", label: "Role Setup", Icon: Settings },
  { to: "/setup/loan", label: "Loan Setup", Icon: IndianRupee },
  { to: "/setup/periods", label: "Period Setup", Icon: CalendarCheck }
];

const transactionsHubButtons = [
  { to: "/operations/transactions", label: "Transactions", Icon: WalletCards },
  { to: "/operations/loans", label: "Loans", Icon: IndianRupee },
  { to: "/operations/withdrawals", label: "Withdrawals", Icon: WalletCards },
  { to: "/corrections/reversals", label: "Reversals", Icon: Undo2 },
  { to: "/corrections/waivers", label: "Waivers", Icon: ShieldCheck }
];

const moreHubButtons = [
  { to: "/setup/calculator", label: "Share Calculator", Icon: Calculator },
  { to: "/share-distribution", label: "Share Distribution", Icon: WalletCards },
  { to: "/contact-support", label: "Contact", Icon: MessageCircle },
  { to: "/subscriptions", label: "Subscriptions", Icon: CreditCard },
  { to: "/guide", label: "User Guide", Icon: BookOpen },
  { to: "/product-owner", label: "Product Owner", Icon: Users }
];

function buildSidebarSections(menu, role) {
  const byLabel = Object.fromEntries((menu || []).map((item) => [item.label, item]));
  const has = (label) => Boolean(byLabel[label]);
  const adminLike = role !== roles.MEMBER;
  const sections = [
    {
      label: "Dashboard",
      children: [
        { path: "/dashboard/group", label: "Group Dashboard" },
        { path: "/dashboard/member", label: "Member Dashboard" }
      ]
    },
    has("Members") && { path: "/members", label: "Members" },
    has("Setup") && {
      label: "Setup",
      children: [
        { path: "/setup/group", label: "Group Setup" },
        { path: "/setup/member", label: "Member Setup" },
        { path: "/setup/roles", label: "Role Setup" },
        { path: "/setup/loan", label: "Loan Setup" },
        { path: "/setup/periods", label: "Period Setup" },
        { path: "/setup/calculator", label: "Share Calculator" }
      ]
    },
    {
      label: "Operations",
      children: [
        has("Transactions") && { path: "/operations/transactions", label: "Transactions" },
        (has("Loans") || has("Request Loan")) && { path: "/operations/loans", label: adminLike ? "Loans" : "Request Loan" },
        (has("Withdrawals") || has("Request Withdrawal")) && { path: "/operations/withdrawals", label: adminLike ? "Withdrawals" : "Request Withdrawal" },
        has("Pending Dues") && { path: "/pending-dues", label: "Pending Dues" }
      ].filter(Boolean)
    },
    {
      label: "Corrections",
      children: adminLike ? [
        { path: "/corrections/reversals", label: "Reversals" },
        { path: "/corrections/waivers", label: "Waivers" }
      ] : []
    },
    has("Approvals") && { path: "/approvals", label: "Approvals" },
    has("Reports & Audit") && { path: "/reports", label: "Reports & Audit" },
    has("Contact") && { path: "/contact-support", label: "Contact" },
    has("Subscriptions") && { path: "/subscriptions", label: "Subscriptions" },
    has("Product Owner") && { path: "/product-owner", label: "Product Owner" }
  ].filter(Boolean);

  return sections.filter((section) => !section.children || section.children.length > 0);
}

function App() {
  const initialState = loadState();
  const {
    selectedGroupId,
    confirmDialog,
    setConfirmDialog,
    notification,
    setNotification,
    showNotificationDetails,
    setShowNotificationDetails,
    setSession,
    setTenantData,
    setSelectedGroupId: setStoreSelectedGroupId,
    setBooting: setStoreBooting,
    setAppError: setStoreAppError,
    booting,
    appError,
    migrationLoading,
    setMigrationLoading
  } = useAppStore();
  const [state, setState] = useState(initialState);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultsVisible, setSearchResultsVisible] = useState(false);
  const [previewMember, setPreviewMember] = useState(null);
  const [editingLegacy, setEditingLegacy] = useState(null);
  const [editingValues, setEditingValues] = useState({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  // group switcher popover removed for product owner; navigate to full page instead
  const [expandedMenu, setExpandedMenu] = useState("Dashboard");

  async function hydrateTenantState(user) {
    if (!user) return null;

    let correctedTenantData = null;
    try {
      const tenantData = await repository.listTenantData();
      correctedTenantData = recalculateMemberSavingsFromEffectiveLedger(tenantData);
    } catch (innerError) {
      console.warn("Tenant data restore failed", innerError);
    }

    if (!correctedTenantData) {
      setState((current) => ({
        ...current,
        session: { signedIn: true, user },
        selectedGroupId: current.selectedGroupId ?? null,
        searchQuery: current.searchQuery ?? ""
      }));
      return null;
    }

    const selectedGroupIdFromData = correctedTenantData.selectedGroupId ?? correctedTenantData.groups?.[0]?.id ?? null;
    const nextSelectedGroupId = selectedGroupIdFromData ?? selectedGroupId ?? null;
    if (nextSelectedGroupId) {
      setSelectedGroupId(nextSelectedGroupId);
    }

    setState((current) => ({
      ...correctedTenantData,
      session: { signedIn: true, user },
      selectedGroupId: nextSelectedGroupId,
      searchQuery: current.searchQuery ?? ""
    }));

    syncMemberSavingsCorrectionsToSupabase(correctedTenantData).catch((err) => console.error("Sync failed:", err));
    return nextSelectedGroupId;
  }
  const [isRefreshingTenant, setIsRefreshingTenant] = useState(false);
  const pageComponents = useMemo(() => ({
    Members: MembersPage,
    SetupPage: SetupPageRoute,
    Subscriptions: SubscriptionsPage,
    Periods: PeriodsPage,
    Transactions: TransactionsPage,
    Withdrawals: WithdrawalsPage,
    PendingDues: PendingDuesPage,
    FinanceAgent,
    Corrections: CorrectionsPage,
    Adjustments: AdjustmentsPage,
    Reversals: ReversalsPage,
    Waivers: WaiversPage,
    ProductOwnerSupport: ProductOwnerSupportPage,
    Loans: LoansPage,
    Approvals: ApprovalsPage,
    Reports: ReportsPage,
    ShareDistribution,
    ContactSupport,
    MemberSavings,
    MemberLoans,
    MemberNotifications,
    MemberProfile,
    DashboardPage: Dashboard,
    SettingsPage
  }), []);

  function setSelectedGroupId(value) {
    setStoreSelectedGroupId(value);
  }

  function updateBootingState(value) {
    setStoreBooting(value);
  }

  function updateAppError(value) {
    setStoreAppError(value);
  }

  useEffect(() => {
    setShowNotificationDetails(false);
  }, [notification]);

  useEffect(() => {
    setSession({ signedIn: state.session?.signedIn ?? false, user: state.session?.user ?? {} });
  }, [state.session?.signedIn, state.session?.user]);

  useEffect(() => {
    setTenantData({
      groups: state.groups ?? [],
      members: state.members ?? [],
      periods: state.periods ?? [],
      loans: state.loans ?? [],
      transactions: state.transactions ?? [],
      approvals: state.approvals ?? [],
      expenses: state.expenses ?? [],
      legacyImports: state.legacyImports ?? [],
      notifications: state.notifications ?? [],
      rpcPendingDues: state.rpcPendingDues ?? [],
      rpcShareDistribution: state.rpcShareDistribution ?? [],
      rpcShareDistributionRange: state.rpcShareDistributionRange ?? [],
      rpcShareDistributionSnapshots: state.rpcShareDistributionSnapshots ?? {},
      rpcMemberLoanInterestDues: state.rpcMemberLoanInterestDues ?? {},
      rpcMemberLoanInterestDueDetails: state.rpcMemberLoanInterestDueDetails ?? {},
      rpcMemberDashboardCardSummaries: state.rpcMemberDashboardCardSummaries ?? {},
      pendingSetupChanges: state.pendingSetupChanges ?? []
    });
  }, [state.groups, state.members, state.periods, state.loans, state.transactions, state.approvals, state.expenses, state.legacyImports, state.notifications, state.rpcPendingDues, state.rpcShareDistribution, state.rpcShareDistributionRange, state.rpcShareDistributionSnapshots, state.rpcMemberLoanInterestDues, state.rpcMemberLoanInterestDueDetails, state.rpcMemberDashboardCardSummaries, state.pendingSetupChanges]);

  useEffect(() => {
    if (!notification) return undefined;
    const timeoutId = setTimeout(() => setNotification(null), notification.details ? 9000 : 4500);
    return () => clearTimeout(timeoutId);
  }, [notification]);

  useEffect(() => {
    if (!notification || !state.session?.signedIn) return;
    const notificationId = notification.id || makeId("ntf");
    setState((current) => {
      if ((current.notifications || []).some((item) => String(item.id) === String(notificationId))) return current;
      return {
        ...current,
        notifications: [
          {
            id: notificationId,
            groupId: selectedGroupId,
            title: notification.title || notification.message || "Notification",
            body: notification.body || notification.details || "",
            type: notification.type || "info",
            createdAt: new Date().toISOString(),
            read: false
          },
          ...(current.notifications || [])
        ]
      };
    });
  }, [notification]);

  const location = useLocation();
  const navigate = useNavigate();

  const latestPathname = useRef(location.pathname);

  useEffect(() => {
    latestPathname.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const capacitor = typeof window !== "undefined" ? window.Capacitor : null;
    const isNative = Boolean(capacitor?.isNativePlatform?.() || (capacitor?.platform && capacitor.platform !== "web"));
    const app = capacitor?.App;
    if (!isNative || !app?.addListener) return undefined;

    const handleBack = (event) => {
      const currentPath = latestPathname.current;
      if (currentPath === "/" || currentPath === "/select-group") {
        return;
      }
      event?.preventDefault?.();
      navigate(-1);
    };

    const listener = app.addListener("backButton", handleBack);
    return () => listener?.remove?.();
  }, [navigate]);

  const isProductOwner = state.session?.user?.email?.toLowerCase() === "katgroupsupport@gmail.com";
  const selectedGroup = state.groups.find((g) => String(g.id) === String(selectedGroupId)) ?? state.groups[0];
  const selectedGroupMember = (state.members || []).find((member) =>
    String(member.groupId) === String(selectedGroup?.id)
    && (
      String(member.id) === String(state.session?.user?.memberId)
      || (member.email && state.session?.user?.email && member.email.toLowerCase() === state.session.user.email.toLowerCase())
    )
  );
  const hadSelectedGroup = useRef(Boolean(selectedGroupId));

  useEffect(() => {
    if (!hadSelectedGroup.current && selectedGroup && location.pathname === "/select-group") {
      navigate("/home", { replace: true });
    }
    hadSelectedGroup.current = Boolean(selectedGroup);
  }, [selectedGroup, location.pathname, navigate]);
  const groupAdminNames = new Set((selectedGroup?.admins || []).map((name) => String(name).toLowerCase()));
  const selectedMemberIsAdmin =
    selectedGroupMember?.memberRole === roles.GROUP_ADMIN
    || selectedGroupMember?.role === roles.GROUP_ADMIN
    || groupAdminNames.has(String(selectedGroupMember?.fullName || "").toLowerCase())
    || groupAdminNames.has(String(selectedGroupMember?.username || "").toLowerCase())
    || groupAdminNames.has(String(selectedGroupMember?.email || "").toLowerCase())
    || String(selectedGroup?.createdBy ?? selectedGroup?.created_by ?? "") === String(state.session?.user?.id ?? "");
  const role = isProductOwner
    ? roles.PRODUCT_OWNER
    : selectedMemberIsAdmin
      ? roles.GROUP_ADMIN
      : (selectedGroupMember?.memberRole ?? roles.MEMBER);
  const menu = visibleMenu(role);
  const sidebarSections = buildSidebarSections(menu, role);
  const visibleHomeHubButtons = homeHubButtons;
  const visibleTransactionsHubButtons = role === roles.MEMBER
    ? transactionsHubButtons.filter((item) => ["/operations/loans", "/operations/withdrawals"].includes(item.to))
    : transactionsHubButtons;
  const visibleSetupHubButtons = role === roles.MEMBER ? [] : setupHubButtons;
  const visibleMoreHubButtons = role === roles.MEMBER
    ? moreHubButtons.filter((item) => item.to !== "/product-owner")
    : moreHubButtons.filter((item) => item.to !== "/product-owner" || role === roles.PRODUCT_OWNER);
  const bottomNavItems = role === roles.MEMBER
    ? [
        { to: "/home", Icon: Home, label: "Home" },
        { to: "/transactions-hub", Icon: ArrowRightLeft, label: "Transactions" },
        { to: "/profile", Icon: User, label: "Profile" },
        { to: "/more", Icon: MoreHorizontal, label: "More" }
      ]
    : [
        { to: "/home", Icon: Home, label: "Home" },
        { to: "/transactions-hub", Icon: ArrowRightLeft, label: "Transactions" },
        { to: "/setup-hub", Icon: Settings, label: "Setup" },
        { to: "/profile", Icon: User, label: "Profile" },
        { to: "/more", Icon: MoreHorizontal, label: "More" }
      ];
  const memberPortalActive = role !== roles.MEMBER && new URLSearchParams(location.search).get("portal") === "member";
  const scopedState = getSelectedGroupState(state, selectedGroup?.id, false);
  const viewState = getStateWithComputedShares(scopedState);
  const visibleViewState = {
    ...viewState,
    notifications: getVisibleNotifications(viewState.notifications || [], role, selectedGroupMember)
  };
  const hasSelectedGroup = !!selectedGroup;

  useEffect(() => saveState({ selectedGroupId, searchQuery }), [selectedGroupId, searchQuery]);

  useEffect(() => {
    const activeSection = sidebarSections.find((section) =>
      section.children?.some((item) => item.path === location.pathname)
      || section.path === location.pathname
    );
    if (activeSection?.children?.length) {
      setExpandedMenu(activeSection.label);
    }
  }, [location.pathname, role]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      updateBootingState(false);
      return;
    }

    updateBootingState(true);

    let isMounted = true;
    const restoreSession = async () => {
      try {
        const user = await repository.getSessionUser();
        if (!user) return;

        setState((current) => ({ ...current, session: { signedIn: true, user } }));
        if (!isMounted) return;
        await hydrateTenantState(user);
      } catch (err) {
        console.warn("Session restore failed", err);
      } finally {
        if (isMounted) updateBootingState(false);
      }
    };

    const bootTimeoutId = setTimeout(() => {
      if (!isMounted) return;
      console.warn("[app] boot timed out while connecting to Supabase");
      updateBootingState(false);
      updateAppError(
        "Could not connect to the server within 30 seconds. Check your internet connection and that the Supabase project is not paused, then refresh."
      );
    }, 30000);

    restoreSession().finally(() => {
      if (isMounted) clearTimeout(bootTimeoutId);
    });

    const { subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || event === "USER_DELETED" || event === "TOKEN_REFRESH_FAILED") {
        setState((current) => ({ ...current, session: { signedIn: false, user: current.session?.user ?? {} } }));
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        try {
          const updatedUser = await repository.getSessionUser();
          if (!updatedUser) {
            setState((current) => ({ ...current, session: { signedIn: false, user: current.session?.user ?? {} } }));
            return;
          }

          setState((current) => ({ ...current, session: { signedIn: true, user: updatedUser } }));
          await hydrateTenantState(updatedUser);
        } catch (err) {
          console.warn("Auth state update failed", err);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  async function ensureLatestTenantData() {
    if (!repository.isConfigured()) return;
    if (!state.session?.signedIn) return;
    const hasSessionUser = Boolean(state.session?.user?.id || state.session?.user?.email || state.session?.user?.authId);
    if (!hasSessionUser) return;
    try {
      const tenantData = await repository.listTenantData();
      if (!tenantData) return;
      const keysToCheck = ["groups", "members", "periods", "loans", "transactions", "approvals", "expenses"];
      const stale = keysToCheck.some((k) => (Array.isArray(tenantData[k]) ? tenantData[k].length : 0) !== (Array.isArray(state[k]) ? state[k].length : 0));
      if (stale) {
        setState((current) => ({ ...tenantData, session: { signedIn: true, user: current.session?.user ?? {} } }));
      }
    } catch (err) {
      console.warn('Tenant refresh failed', err);
    }
  }

  async function refreshTenantData() {
    if (!repository.isConfigured()) return;
    if (!state.session?.signedIn) return;
    try {
      const tenantData = await repository.listTenantData();
      if (!tenantData) return;
      setState((current) => ({
        ...tenantData,
        session: current.session,
        selectedGroupId: current.selectedGroupId ?? tenantData.selectedGroupId ?? null,
        searchQuery: current.searchQuery ?? "",
        notifications: current.notifications ?? []
      }));
    } catch (err) {
      console.warn('Tenant refresh failed', err);
    }
  }

  useEffect(() => {
    const checkPeriodTransition = () => {
      // Periods are opened explicitly from Period Setup. No automatic period opening.
    };

    checkPeriodTransition();

    const intervalId = setInterval(checkPeriodTransition, 3600000);

    return () => clearInterval(intervalId);
  }, []);

  function patchState(updater) {
    setState((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  async function signIn(user, credentials) {
    if (isSupabaseConfigured && credentials) {
      if (credentials.mode === "google") {
        await repository.signInWithGoogle();
        return;
      }

      if (credentials.mode === "sendOtp") {
        await repository.sendRegistrationOtp(credentials.values.email, credentials.values);
        return;
      }

      if (credentials.mode === "register") {
        const verified = await repository.verifyRegistrationOtp({
          email: credentials.values.email,
          otpCode: credentials.values.otpCode
        });

        if (!verified) {
          throw new Error("OTP verification failed. Please check the code and try again.");
        }

        await repository.setPassword(credentials.values.password);
      }

      if (credentials.mode === "resetPassword") {
        await repository.resetPassword(credentials.values.email);
        return;
      }

      const signedInUser = credentials.mode === "login"
        ? await withTimeout(repository.signIn(credentials.values.identifier, credentials.values.password), SUPABASE_BOOT_TIMEOUT_MS, "Login")
        : await withTimeout(repository.getSessionUser(), SUPABASE_BOOT_TIMEOUT_MS, "Session check");
      const tenantData = await withTimeout(repository.listTenantData(), SUPABASE_BOOT_TIMEOUT_MS, "Tenant data loading");
      const correctedTenantData = recalculateMemberSavingsFromEffectiveLedger(tenantData);
      const selectedGroupId = correctedTenantData.selectedGroupId ?? (correctedTenantData.groups?.length === 1 ? correctedTenantData.groups[0].id : null);
      setState({ ...correctedTenantData, session: { signedIn: true, user: signedInUser } });
      syncMemberSavingsCorrectionsToSupabase(correctedTenantData).catch(err => console.error("Sync failed:", err));
      if (selectedGroupId) {
        setSelectedGroupId(selectedGroupId);
      }
      navigate("/home", { replace: true });
      return;
    }

    setState((current) => ({ ...current, session: { signedIn: true, user } }));
    navigate("/home", { replace: true });
  }

  async function signOut() {
    // eslint-disable-next-line no-console
    console.log('[app] signOut clicked');
    if (isSupabaseConfigured) {
      try {
        await repository.signOut();
        // eslint-disable-next-line no-console
        console.log('[app] repository.signOut succeeded');
      } catch (err) {
        console.error('Sign out failed:', err);
        // proceed to clear session locally even if remote signOut fails
      }
    } else {
      // eslint-disable-next-line no-console
      console.log('[app] Supabase not configured; skipping remote signOut');
    }

    setSelectedGroupId(null);
    setSession({ signedIn: false, user: {} });
    setState((current) => ({
      ...current,
      session: { signedIn: false, user: {} },
      selectedGroupId: null,
      notifications: []
    }));
    setNotification(null);
    setConfirmDialog(null);
    clearPersistedState();
    navigate('/login', { replace: true });
    window.location.assign('/login');
  }

  if (booting) {
    return <StatusScreen title="Loading secure session" message="Connecting securely and loading your data." />;
  }

  if (appError) {
    return <StatusScreen title="Production connection error" message={appError} />;
  }

  if (!state.session.signedIn) {
    return <PublicSite />;
  }

  if (!hasSelectedGroup) {
    const modalMarkup = confirmDialog ? (
      <div className="modal-overlay" onClick={() => confirmDialog.onCancel()}>
        <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
          <h3>{confirmDialog.title}</h3>
          <p>{confirmDialog.message}</p>
          <div className="modal-buttons">
            <button type="button" className="secondary-button" onClick={() => confirmDialog.onCancel()}>Cancel</button>
            <button type="button" className="primary-button" onClick={() => confirmDialog.onConfirm()}>Confirm</button>
          </div>
        </div>
      </div>
    ) : null;

    const notificationMarkup = notification ? (
      <div className={`notification toast ${notification.type}`} style={{ position: "fixed", top: "16px", right: "16px", left: "auto", zIndex: 1000, width: "min(520px, calc(100vw - 32px))", maxWidth: "calc(100vw - 32px)" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ marginRight: 12 }}>{notification.message}</strong>
          {notification.details && (
            <button className="link-button" type="button" onClick={() => setShowNotificationDetails((s) => !s)}>
              {showNotificationDetails ? 'Hide details' : 'Show details'}
            </button>
          )}
        </div>
        {showNotificationDetails && notification.details && (
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, maxHeight: 300, overflow: 'auto' }}>{notification.details}</pre>
        )}
      </div>
    ) : null;

    return (
      <div className="app-shell">
        <main className="main">
          <Routes>
            <Route path="/select-group" element={<GroupSelectionPage state={state} setState={patchState} selectedGroupId={selectedGroupId} setSelectedGroupId={setSelectedGroupId} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
            <Route path="*" element={<GroupSelectionPage state={state} setState={patchState} selectedGroupId={selectedGroupId} setSelectedGroupId={setSelectedGroupId} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          </Routes>
        </main>
        {modalMarkup}
        {notificationMarkup}
      </div>
    );
  }

  return (
    <AppShell signOut={signOut} role={role}>
      <AppRoutes
        role={role}
        state={state}
        viewState={viewState}
        visibleViewState={visibleViewState}
        selectedGroup={selectedGroup}
        selectedGroupId={selectedGroupId}
        patchState={patchState}
        setSelectedGroupId={setSelectedGroupId}
        setConfirmDialog={setConfirmDialog}
        setNotification={setNotification}
        migrationLoading={migrationLoading}
        setMigrationLoading={setMigrationLoading}
        ensureLatestTenantData={ensureLatestTenantData}
        signOut={signOut}
        pageComponents={pageComponents}
        memberPortalActive={memberPortalActive}
        visibleHomeHubButtons={visibleHomeHubButtons}
        visibleTransactionsHubButtons={visibleTransactionsHubButtons}
        visibleSetupHubButtons={visibleSetupHubButtons}
        visibleMoreHubButtons={visibleMoreHubButtons}
      />
    </AppShell>
  );
}

/*
        <div className="brand">
          <div className="brand-mark">BG</div>
          <div className="brand-copy">
            <strong>
              {selectedGroup?.name ?? "No group selected"}
              {selectedGroup?.code && <small className="brand-code">{selectedGroup.code}</small>}
            </strong>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {sidebarSections.map((section) => {
            const Icon = navIcons[section.label] ?? Landmark;
            if (!section.children?.length) {
              return (
                <NavLink key={section.path} to={section.path} onClick={() => setMobileNavOpen(false)}>
                  <Icon size={18} />
                  <span>{bilingual(section.label)}</span>
                </NavLink>
              );
            }
            const isOpen = expandedMenu === section.label;
            return (
              <div className="nav-group" key={section.label}>
                <button
                  type="button"
                  className={`nav-group-button ${isOpen ? "active" : ""}`}
                  onClick={() => setExpandedMenu((current) => current === section.label ? "" : section.label)}
                >
                  <Icon size={18} />
                  <span>{bilingual(section.label)}</span>
                </button>
                {isOpen && (
                  <div className="nav-submenu">
                    {section.children.map((item) => (
                      <NavLink key={item.path} to={item.path} onClick={() => setMobileNavOpen(false)}>
                        <span>{bilingual(item.label)}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <NavLink className="sidebar-guide-link" to="/guide" onClick={() => setMobileNavOpen(false)}>
          <BookOpen size={18} />
          <span>{bilingual("User Guide")}</span>
        </NavLink>

        <div className="sidebar-card profile-card">
          <div className="profile-row">
            <button type="button" className="profile-button" onClick={() => setShowProfileMenu((open) => !open)}>
              <span className="profile-summary">
                <ProfilePhoto photo={state.session.user?.profilePhoto} name={state.session.user?.name || state.session.user?.email || "Profile"} />
                <span>
                  <span>{state.session.user?.name || state.session.user?.email || "Profile"}</span>
                  <strong>{state.session.user?.role}</strong>
                </span>
              </span>
            </button>
            <button type="button" className="profile-logout" onClick={signOut} aria-label="Logout">
              <LogOut size={18} />
            </button>
          </div>
          {showProfileMenu && (
            <div className="profile-menu">
              <button type="button" onClick={() => { setShowProfileMenu(false); setMobileNavOpen(false); navigate("/profile"); }}>View profile</button>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h1 style={{ margin: 0, fontSize: 'inherit', fontWeight: 700, letterSpacing: '0.02em', textShadow: '1px 1px 0 rgba(0,0,0,0.12), 2px 2px 0 rgba(0,0,0,0.08)', color: 'var(--text)' }}>
                  प्रगती Finance Console
                </h1>
                <div className="group-header" style={{ marginTop: '8px' }}>
                  <span>{selectedGroup?.name ?? "No group selected"}</span>
                  {selectedGroup?.code && <small className="brand-code">{selectedGroup.code}</small>}
                </div>
                {selectedGroup && (
                  <p className="section-note" style={{ marginTop: '6px', fontSize: '0.95rem' }}>
                    Created by: {selectedGroup.creatorName || selectedGroup.primaryContactName || "Unknown"}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="topbar-right">
            <button className="icon-button notification-top-right" type="button" aria-label="Notifications" onClick={() => navigate("/notifications") }>
              <Bell size={16} />
              {(visibleViewState.notifications || []).filter((item) => !item.read).length > 0 && (
                <span className="notification-badge">{Math.min(99, (visibleViewState.notifications || []).filter((item) => !item.read).length)}</span>
              )}
            </button>
          </div>
          <div className="topbar-actions">
            {location.pathname === "/" && (
              <>
                <label className="search" onFocus={() => setSearchResultsVisible(true)}>
                  <Search size={16} />
                  <input
                    placeholder="Search member, loan, report"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchResultsVisible(true);
                    }}
                    onBlur={() => setTimeout(() => setSearchResultsVisible(false), 150)}
                    list="member-search-list"
                  />
                </label>
                <datalist id="member-search-list">
                  {viewState.members.map((member) => (
                    <option key={member.id} value={member.fullName} />
                  ))}
                </datalist>
              </>
            )}
            {role !== roles.MEMBER && location.pathname === "/" && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigate(memberPortalActive ? "/" : "/?portal=member")}
                style={{ marginLeft: "10px" }}
              >
                {memberPortalActive ? "Group dashboard" : "Member portal"}
              </button>
            )}
          </div>
        </header>

        {mobileNavOpen && (
          <button className="scrim" type="button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}>
            <X size={24} />
          </button>
        )}
        {role !== roles.MEMBER && searchQuery && searchResultsVisible && (
          <div className="search-results-card">
            <h4>Search members</h4>
            {viewState.members.filter((member) => {
              const query = searchQuery.toLowerCase();
              return [member.fullName, member.email, member.mobile, member.username]
                .some((field) => String(field).toLowerCase().includes(query));
            }).slice(0, 8).map((member) => (
              <button
                key={member.id}
                type="button"
                className="search-result"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setPreviewMember(member);
                  setSearchQuery("");
                  setSearchResultsVisible(false);
                  navigate("/members");
                }}
              >
                <strong>{member.fullName}</strong>
                <span>{member.email || member.mobile}</span>
              </button>
            ))}
            {viewState.members.filter((member) => {
              const query = searchQuery.toLowerCase();
              return [member.fullName, member.email, member.mobile, member.username]
                .some((field) => String(field).toLowerCase().includes(query));
            }).length === 0 && <p className="section-note">No matching members found.</p>}
          </div>
        )}
        <AppRoutes
          role={role}
          state={state}
          viewState={viewState}
          visibleViewState={visibleViewState}
          selectedGroup={selectedGroup}
          selectedGroupId={selectedGroupId}
          patchState={patchState}
          setSelectedGroupId={setSelectedGroupId}
          setConfirmDialog={setConfirmDialog}
          setNotification={setNotification}
          migrationLoading={migrationLoading}
          setMigrationLoading={setMigrationLoading}
          ensureLatestTenantData={ensureLatestTenantData}
          signOut={signOut}
          pageComponents={pageComponents}
          memberPortalActive={memberPortalActive}
          visibleHomeHubButtons={visibleHomeHubButtons}
          visibleTransactionsHubButtons={visibleTransactionsHubButtons}
          visibleSetupHubButtons={visibleSetupHubButtons}
          visibleMoreHubButtons={visibleMoreHubButtons}
        />
      </main>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {bottomNavItems.map(({ to, Icon, label }) => (
          <NavLink key={to} className="bottom-nav-item" to={to}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      {previewMember && (
        <div className="modal-overlay" onClick={() => setPreviewMember(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{previewMember.fullName}</h3>
            {(() => {
              const memberSummary = viewState.rpcMemberFinanceSummaries?.[String(previewMember.id)] || null;
              return (
                <>
            <div className="status-row">
              <div>
                <strong>Total savings</strong>
                <p>{currency.format(Number(memberSummary?.savings ?? previewMember.savings ?? 0))}</p>
              </div>
              <div>
                <strong>Outstanding loan amount</strong>
                <p>{currency.format(Number(memberSummary?.outstanding ?? previewMember.loanOutstanding ?? 0))}</p>
              </div>
              <div>
                <strong>Share amount</strong>
                <p>{currency.format(Number(memberSummary?.share_amount ?? memberSummary?.shareAmount ?? 0))} ({Number(memberSummary?.share_percent ?? memberSummary?.sharePercent ?? 0).toFixed(2)}%)</p>
              </div>
            </div>
            <div className="status-row">
              <div>
                <strong>Gained from group</strong>
                <p>{currency.format(Number(memberSummary?.gain ?? previewMember.earnedFromGroup ?? previewMember.groupGain ?? 0))}</p>
              </div>
              <div>
                <strong>Member expenses</strong>
                <p>{currency.format(Number(memberSummary?.expense ?? 0))}</p>
              </div>
              <div>
                <strong>Next minimum due</strong>
                <p>{currency.format(Number(memberSummary?.monthly_collections ?? memberSummary?.monthlyCollections ?? 0))}</p>
                <small>Remaining interest {currency.format(Number(memberSummary?.monthly_interest ?? memberSummary?.monthlyInterest ?? 0))}</small>
              </div>
              <div>
                <strong>Active loans</strong>
                <p>{0}</p>
              </div>
            </div>
            {0 > 0 && (
              <Section title="Active loan details">
                <Table
                  headers={["Loan amount", "Date", "Outstanding", "Interest paid"]}
                  rows={memberSummary.memberActiveLoans.map((loan) => [
                    currency.format(loan.amount),
                    loan.startDate ?? "",
                    currency.format(
                      Number(loan.principalOutstanding || 0)
                      + Number(loan.interestOutstanding || 0)
                      + Number(loan.penaltyOutstanding || 0)
                    ),
                    currency.format(loan.interestPaidTillNow || 0)
                  ])}
                />
              </Section>
            )}
                </>
              );
            })()}
            {
              // show legacy migration entries for this member
              (state.legacyImports || []).filter(l => l.member_id === previewMember.id).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h4>Legacy migrations</h4>
                  <div className="data-grid">
                    {(state.legacyImports || []).filter(l => l.member_id === previewMember.id).map((l) => (
                      <article className="entity-card" key={l.id}>
                        <h3>{l.joined_date ? new Date(l.joined_date).toLocaleDateString('en-IN') : (l.created_at ? new Date(l.created_at).toLocaleDateString('en-IN') : '—')}</h3>
                        <p><strong>Saving/share:</strong> {currency.format(Number(l.total_saving || 0))}</p>
                        <p><strong>Pending loan:</strong> {currency.format(Number(l.pending_loan || 0))}</p>
                        <p><strong>Interest:</strong> {currency.format(Number(l.interest_amount || 0))} <strong>Penalty:</strong> {currency.format(Number(l.penalty_amount || 0))}</p>
                        <p className="section-note">Source: {l.import_source ?? l.raw_payload?.importSource ?? 'Unknown'} — {l.processed ? 'Processed' : 'Unprocessed'}</p>
                        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                          <button className="secondary-button" type="button" onClick={() => { setEditingLegacy(l); setEditingValues({ total_saving: l.total_saving, pending_loan: l.pending_loan, interest_amount: l.interest_amount, penalty_amount: l.penalty_amount, processed: l.processed, invalidated: l.invalidated }); }}>Edit</button>
                          <button className="secondary-button" type="button" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(l.raw_payload || l)); setNotification({ type: 'success', message: 'Import payload copied to clipboard.' }); }}>Copy payload</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )
            }
            <button className="primary-button" type="button" onClick={() => setPreviewMember(null)}>Close</button>
          </div>
        </div>
      )}
      {editingLegacy && (
        <div className="modal-overlay" onClick={() => setEditingLegacy(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <h3>Edit legacy migration</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label>
                Saving or share amount
                <input type="number" value={editingValues.total_saving ?? ""} onChange={(e) => setEditingValues((v) => ({ ...v, total_saving: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </label>
              <label>
                Pending loan
                <input type="number" value={editingValues.pending_loan ?? ""} onChange={(e) => setEditingValues((v) => ({ ...v, pending_loan: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </label>
              <label>
                Pending interest
                <input type="number" value={editingValues.interest_amount ?? ""} onChange={(e) => setEditingValues((v) => ({ ...v, interest_amount: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </label>
              <label>
                Pending penalty
                <input type="number" value={editingValues.penalty_amount ?? ""} onChange={(e) => setEditingValues((v) => ({ ...v, penalty_amount: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </label>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!editingValues.processed} onChange={(e) => setEditingValues((v) => ({ ...v, processed: e.target.checked }))} /> Processed
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!editingValues.invalidated} onChange={(e) => setEditingValues((v) => ({ ...v, invalidated: e.target.checked }))} /> Invalidated
              </label>
            </div>
            <div className="modal-buttons" style={{ marginTop: 12 }}>
              <button className="secondary-button" type="button" onClick={() => setEditingLegacy(null)}>Cancel</button>
              <button className="primary-button" type="button" onClick={async () => {
                try {
                  const oldRow = editingLegacy;
                  const changes = {
                    total_saving: editingValues.total_saving ?? 0,
                    pending_loan: editingValues.pending_loan ?? 0,
                    interest_amount: editingValues.interest_amount ?? 0,
                    penalty_amount: editingValues.penalty_amount ?? 0,
                    processed: !!editingValues.processed,
                    invalidated: !!editingValues.invalidated
                  };
                  
                  // Only update to database if it's a valid UUID (not a local import)
                  let updated = { ...oldRow, ...changes };
                  if (isUuid(editingLegacy.id) && repository.isConfigured()) {
                    updated = await repository.updateLegacyImport(editingLegacy.id, changes);
                    // create audit log
                    await repository.createAuditLog({ groupId: updated.group_id, actorId: state.session.user.id, tableName: 'legacy_member_imports', recordId: updated.id, action: 'Correction', oldValue: oldRow, newValue: updated });
                  }
                  
                  // update local state: replace row and adjust member aggregates by delta
                  patchState((s) => {
                    const newLegacyImports = (s.legacyImports || []).map((r) => (r.id === updated.id ? updated : r));
                    const memberIdx = (s.members || []).findIndex((m) => m.id === updated.member_id);
                    if (memberIdx >= 0) {
                      const member = s.members[memberIdx];
                      const deltaSavings = Number(updated.total_saving || 0) - Number(oldRow.total_saving || 0);
                      const deltaLoan = Number(updated.pending_loan || 0) - Number(oldRow.pending_loan || 0);
                      const deltaInterest = Number(updated.interest_amount || 0) - Number(oldRow.interest_amount || 0);
                      const deltaPenalty = Number(updated.penalty_amount || 0) - Number(oldRow.penalty_amount || 0);
                      const updatedMember = { ...member, savings: Number(member.savings || 0) + deltaSavings, loanOutstanding: Number(member.loanOutstanding || 0) + deltaLoan, interestOutstanding: Number(member.interestOutstanding || 0) + deltaInterest, penaltyOutstanding: Number(member.penaltyOutstanding || 0) + deltaPenalty };
                      const newMembers = [...s.members];
                      newMembers[memberIdx] = updatedMember;
                      return { ...s, legacyImports: newLegacyImports, members: newMembers };
                    }
                    return { ...s, legacyImports: newLegacyImports };
                  });
                  const messagePrefix = isUuid(editingLegacy.id) ? 'Legacy import updated.' : 'Local legacy import updated.';
                  setNotification({ type: 'success', message: messagePrefix });
                } catch (err) {
                  console.error('Failed to update legacy import', err);
                  setNotification({ type: 'error', message: `Unable to update import: ${err.message}` });
                } finally {
                  setEditingLegacy(null);
                }
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog && (
        <div className="modal-overlay" onClick={() => !migrationLoading && confirmDialog.onCancel()}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmDialog.title}</h3>
            <p>{confirmDialog.message}</p>
            {migrationLoading && <p style={{ color: 'var(--primary)', fontStyle: 'italic' }}>Processing migration...</p>}
            <div className="modal-buttons">
              <button type="button" className="secondary-button" onClick={() => confirmDialog.onCancel()} disabled={migrationLoading}>Cancel</button>
              <button type="button" className="primary-button" onClick={() => confirmDialog.onConfirm()} disabled={migrationLoading}>
                {migrationLoading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
      {notification && (
        <div className={`notification toast ${notification.type}`} style={{ position: "fixed", top: "16px", right: "16px", left: "auto", zIndex: 1000, width: "min(520px, calc(100vw - 32px))", maxWidth: "calc(100vw - 32px)" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ marginRight: 12 }}>{notification.message}</strong>
            {notification.details && (
              <button className="link-button" type="button" onClick={() => setShowNotificationDetails((s) => !s)}>
                {showNotificationDetails ? 'Hide details' : 'Show details'}
              </button>
            )}
          </div>
          {showNotificationDetails && notification.details && (
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, maxHeight: 300, overflow: 'auto' }}>{notification.details}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function serializeError(err) {
  try {
    if (!err) return "";
    if (typeof err === "string") return err;
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
  } catch (e) {
    return String(err);
  }
}

*/

function serializeError(err) {
  try {
    if (!err) return "";
    if (typeof err === "string") return err;
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
  } catch (e) {
    return String(err);
  }
}

function getMonthPeriodDraft(year, month) {
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0);
  return {
    id: `per_${year}_${String(month).padStart(2, "0")}`,
    name: start.toLocaleString("default", { month: "long", year: "numeric" }),
    startDate: toIsoDateValue(start),
    endDate: toIsoDateValue(end),
    status: periodStatuses.FUTURE
  };
}

function formatPeriodName(dateValue) {
  if (!dateValue) return "";
  const [year, month] = String(dateValue).slice(0, 10).split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

function normalizeLookup(value) {
  return String(value ?? "").trim().toLowerCase();
}

function memberMatchesLookup(member, value) {
  const needle = normalizeLookup(value);
  if (!needle) return false;
  return [member?.id, member?.fullName, member?.username, member?.email]
    .some((candidate) => normalizeLookup(candidate) === needle);
}

function isMemberActive(member) {
  if (!member) return false;
  if (String(member.status ?? "").toLowerCase() === "inactive") return false;
  if (member.inactiveDate && String(member.inactiveDate) <= toIsoDateValue()) return false;
  if (member.exitDate && String(member.exitDate) <= toIsoDateValue()) return false;
  return true;
}

function activeMembersForTransactions(members = []) {
  return (members || []).filter(isMemberActive);
}

function isMemberNamedAdmin(member, adminNames = []) {
  const names = new Set((adminNames || []).map(normalizeLookup));
  return member?.memberRole === roles.GROUP_ADMIN
    || member?.role === roles.GROUP_ADMIN
    || names.has(normalizeLookup(member?.fullName))
    || names.has(normalizeLookup(member?.username))
    || names.has(normalizeLookup(member?.email));
}

function hasActiveAdminMember(members = [], adminNames = []) {
  return members.some((member) => isMemberActive(member) && isMemberNamedAdmin(member, adminNames));
}

function getGroupAdminMembers(state) {
  const group = state.groups?.[0] ?? {};
  const adminNames = [...(group.admins || [])].filter(Boolean);
  return (state.members || []).filter((member) => isMemberActive(member) && isMemberNamedAdmin(member, adminNames));
}

function loanApprovalRequired(state, requester) {
  const configuredApprovers = getConfiguredApprovalRecipients(state);
  if (configuredApprovers.length > 0) return true;

  const adminMembers = getGroupAdminMembers(state);
  const requesterIsAdmin = isMemberNamedAdmin(requester, [...(state.groups?.[0]?.admins || [])].filter(Boolean));
  if (requesterIsAdmin) {
    return adminMembers.some((member) => String(member.id) !== String(requester?.id));
  }
  return adminMembers.length > 0;
}

function getApprovalRecipients(state) {
  const group = state.groups?.[0] ?? {};
  const names = new Set([...(group.admins || []), ...(group.approvers || [])].filter(Boolean));
  (state.members || []).forEach((member) => {
    if (member.memberRole === roles.GROUP_ADMIN || member.role === roles.GROUP_ADMIN) {
      names.add(member.fullName);
    }
  });
  return [...names].map((name) => {
    const member = (state.members || []).find((item) => memberMatchesLookup(item, name));
    return {
      id: member?.id ?? name,
      name,
      role: member?.memberRole ?? member?.role ?? "Approver"
    };
  });
}

function getConfiguredApprovalRecipients(state) {
  const group = state.groups?.[0] ?? {};
  const names = new Set([...(group.approvers || [])].filter(Boolean));
  return [...names].map((name) => {
    const member = (state.members || []).find((item) => memberMatchesLookup(item, name));
    return {
      id: member?.id ?? name,
      name,
      role: member?.memberRole ?? member?.role ?? "Approver"
    };
  });
}

function createApprovalRecords({ state, action, requester, amount, referenceId, referenceType, details = "" }) {
  const recipients = getApprovalRecipients(state);
  const batchId = makeId("aprb");
  return recipients.map((recipient, index) => ({
    id: makeId("apr"),
    batchId,
    groupId: state.groups?.[0]?.id,
    referenceId,
    referenceType,
    action,
    requester,
    approverId: recipient.id,
    approverName: recipient.name,
    level: `Level ${index + 1}`,
    status: "Pending",
    amount,
    details
  }));
}

function createConfiguredApprovalRecords({ state, action, requester, amount, referenceId, referenceType, details = "" }) {
  const recipients = getConfiguredApprovalRecipients(state);
  const batchId = makeId("aprb");
  return recipients.map((recipient, index) => ({
    id: makeId("apr"),
    batchId,
    groupId: state.groups?.[0]?.id,
    referenceId,
    referenceType,
    action,
    requester,
    approverId: recipient.id,
    approverName: recipient.name,
    level: `Level ${index + 1}`,
    status: "Pending",
    amount,
    details
  }));
}

function getSetupChangeTypeLabel(type) {
  return type === "member" ? "Member setup" : "Group setup";
}

function applySetupChangeToState(state, change, updatedRecord = null) {
  if (!change) return state;
  if (change.setupType === "member") {
    return {
      ...state,
      members: (state.members || []).map((member) =>
        String(member.id) === String(change.targetId)
          ? { ...member, ...(updatedRecord || {}), ...change.payload }
          : member
      ),
      pendingSetupChanges: (state.pendingSetupChanges || []).map((item) =>
        item.id === change.id ? { ...item, status: "Completed", completedAt: new Date().toISOString() } : item
      )
    };
  }
  return {
    ...state,
    groups: (state.groups || []).map((group) =>
      String(group.id) === String(change.targetId)
        ? { ...group, ...(updatedRecord || {}), ...change.payload }
        : group
    ),
    pendingSetupChanges: (state.pendingSetupChanges || []).map((item) =>
      item.id === change.id ? { ...item, status: "Completed", completedAt: new Date().toISOString() } : item
    )
  };
}

function rejectSetupChangeInState(state, change, status = "Rejected") {
  if (!change) return state;
  return {
    ...state,
    pendingSetupChanges: (state.pendingSetupChanges || []).map((item) =>
      item.id === change.id ? { ...item, status, completedAt: new Date().toISOString() } : item
    )
  };
}

function metric(label, value, Icon, details = []) {
  return { label, value, Icon, details };
}

function statusWithPendingApprover(item, approvals = [], explicitReferenceType = null) {
  const pending = pendingApprovalsForItem(item, approvals, explicitReferenceType);
  if (pending.length === 0) return item.approvalStatus || item.status || "";
  return `${item.approvalStatus || item.status || "Pending"} (pending: ${formatPendingApproverNames(pending)})`;
}

function approvalReferenceTypeForItem(item, explicitReferenceType = null) {
  return explicitReferenceType ?? (item.transactionType === "Group Expense" ? "expense" : item.requestId ? "loan_request" : "transaction");
}

function pendingApprovalsForItem(item, approvals = [], explicitReferenceType = null) {
  const referenceType = approvalReferenceTypeForItem(item, explicitReferenceType);
  return (approvals || []).filter((approval) =>
    (String(approval.referenceId) === String(item?.id) || String(approval.referenceId) === String(item?.requestId))
    && approval.referenceType === referenceType
    && approval.status === "Pending"
  );
}

function formatPendingApproverNames(pendingApprovals = []) {
  const names = pendingApprovals
    .map((approval) => approval.approverName || approval.level)
    .filter(Boolean);
  return names.length ? names.join(", ") : "No pending approver";
}

function isApprovalAssignedToActor(approval, actor, actorMembers = []) {
  const actorLookupValues = new Set([
    actor?.memberId,
    actor?.name,
    actor?.username,
    actor?.email,
    ...actorMembers.flatMap((member) => [member.id, member.fullName, member.username, member.email])
  ].map(normalizeLookup).filter(Boolean));
  return actorLookupValues.has(normalizeLookup(approval?.approverId))
    || actorLookupValues.has(normalizeLookup(approval?.approverName));
}

function describeChanges(before = {}, after = {}, labels = {}) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(String).sort().join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    if (value === null || value === undefined || value === "") return "";
    if (!Number.isNaN(Number(value)) && String(value).trim() !== "") return String(Number(value));
    return String(value);
  };
  const changes = Object.entries(after)
    .filter(([key]) => labels[key])
    .filter(([key, value]) => normalize(before?.[key]) !== normalize(value))
    .map(([key, value]) => `${labels[key]}: ${normalize(before?.[key]) || "blank"} to ${normalize(value) || "blank"}`);
  return changes.length ? changes.join("; ") : "No visible field change";
}

function addGroupNotification(state, { title, body, type = "info" }) {
  const recipientMemberIds = (state.members || [])
    .filter((member) => String(member.groupId) === String(state.groups?.[0]?.id) || !member.groupId)
    .map((member) => member.id);
  return {
    ...state,
    notifications: [
      {
        id: makeId("ntf"),
        groupId: state.groups?.[0]?.id,
        title,
        body,
        type,
        recipientMemberIds,
        createdAt: new Date().toISOString()
      },
      ...(state.notifications || [])
    ]
  };
}

function makeWithdrawalTransaction(request) {
  return {
    id: makeId("trx"),
    groupId: request.groupId,
    memberId: request.memberId,
    transactionNumber: request.requestNumber ?? makeId("WDR"),
    transactionDate: request.requestDate ?? toIsoDateValue(),
    transactionType: "Withdrawal",
    amount: Math.abs(Number(request.amount || 0)),
    approvalStatus: "Completed",
    remarks: request.reason || "Withdrawal",
    allocation: { savings: -Math.abs(Number(request.amount || 0)), excess: 0 },
    withdrawalRequestId: request.id
  };
}


function hasMemberGroupActivity(member, state) {
  if (!member) return false;
  const memberId = String(member.id ?? member.memberId ?? "");
  const matchesMemberId = (candidate) => String(candidate ?? "") === memberId;

  const hasTransactionActivity = (state.transactions || []).some((transaction) =>
    [transaction.memberId, transaction.member_id, transaction.member?.id, transaction.member?.memberId, transaction.member?.member_id]
      .some(matchesMemberId)
  );
  const hasLoanActivity = (state.loans || []).some((loan) =>
    [loan.memberId, loan.member_id, loan.member?.id, loan.member?.memberId, loan.member?.member_id]
      .some(matchesMemberId)
  );
  const hasWithdrawalActivity = (state.withdrawals || []).some((withdrawal) =>
    [withdrawal.memberId, withdrawal.member_id, withdrawal.member?.id, withdrawal.member?.memberId, withdrawal.member?.member_id]
      .some(matchesMemberId)
  );

  return hasTransactionActivity || hasLoanActivity || hasWithdrawalActivity;
}



function Periods({ state, setState, actor, setConfirmDialog, setNotification }) {
  const periodsData = Array.isArray(state.periods) ? state.periods : [];
  const openPeriodValue = getOpenPeriod(periodsData);
  const lastClosedPeriod = [...periodsData]
    .filter((period) => period.status === periodStatuses.CLOSED)
    .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))[0];
  const visiblePeriods = [openPeriodValue, lastClosedPeriod].filter(Boolean);

  useEffect(() => {
    // Periods are opened manually; absence of open period blocks financial entry.
  }, [periodsData, setState, actor]);

  function setOpen(periodId) {
    setState((current) => audit({
      state: { ...current, periods: openPeriod(current.periods, periodId) },
      actor,
      action: "open_period",
      tableName: "periods",
      recordId: periodId
    }));
  }

  function close(periodId) {
    setState((current) => audit({
      state: {
        ...current,
        periods: current.periods.map((period) =>
          period.id === periodId ? { ...period, status: periodStatuses.CLOSED } : period
        )
      },
      actor,
      action: "close_period",
      tableName: "periods",
      recordId: periodId
    }));
  }

  return (
    <Page title="Period Control" subtitle="Only the open period accepts financial entries" action={null}>
      <div className="period-list">
        {visiblePeriods.map((period) => (
          <article className="entity-card compact-card" key={period.id}>
            <span className="pill">{period.status}</span>
            <h3>{period.name}</h3>
            <p>{period.startDate} to {period.endDate}</p>
            <div className="button-row">
              <button type="button" onClick={() => setOpen(period.id)} disabled={period.status === periodStatuses.OPEN}>Open</button>
              <button type="button" onClick={() => close(period.id)} disabled={period.status !== periodStatuses.OPEN}>Close</button>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}

function Transactions({ state, setState, actor, setSelectedGroupId, setConfirmDialog, setNotification }) {
  const activeTransactionMembers = activeMembersForTransactions(state.members || []);
  const [values, setValues] = useState({
    memberId: "",
    amount: 0,
    transactionDate: toIsoDateValue(),
    transactionType: "Savings Collection"
  });
  const [editableAllocation, setEditableAllocation] = useState(null);
  const [allocationEditing, setAllocationEditing] = useState(false);
  const [errors, setErrors] = useState({});
  const [allocationErrors, setAllocationErrors] = useState({});
  const [expenseLines, setExpenseLines] = useState([{ category: "Accessories", amount: "", remarks: "" }]);
  const visibleTransactionRows = [...(state.transactions || []), ...(state.expenses || [])]
    .filter((item) => isPendingOrRecentCompleted(item, "transactionDate", 60))
    .sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)));
  
  
  // Add fallback for periods
  const periodsData = Array.isArray(state.periods) ? state.periods : [];
  
  const openPeriod = getOpenPeriod(periodsData) || getCurrentMonthPeriod(periodsData);
  const isGroupExpense = values.memberId === GROUP_EXPENSE_MEMBER_ID;
  let member = isGroupExpense ? null : state.members.find((item) => String(item.id) === String(values.memberId));
  
  const trx86 = state.transactions?.find(t => t.id === 86);
  if (trx86) {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const trx86Date = new Date(trx86.transactionDate);
    const isPast60 = trx86Date < sixtyDaysAgo;
  }
  
  const memberActiveLoans = state.loans
    .filter((item) => loanBelongsToMember(item, member) && (item.principalOutstanding || 0) > 0)
    .sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")));
  const loan = memberActiveLoans[0];
  const totalPrincipalOutstanding = memberActiveLoans.reduce((sum, item) => sum + Number(item.principalOutstanding || 0), 0);
  // Use member finance summary as authoritative source for interest due so it matches dashboard and pending-due pages
  const memberSummary = member ? (state.rpcMemberFinanceSummaries?.[String(member.id)] || null) : null;
  const maxInterestDue = Number(memberSummary?.monthly_interest ?? memberSummary?.monthlyInterest ?? 0);
  // Prefer RPC-backed loan interest detail rows when available, else fallback to local engine.
  const interestDueDetails = member ? getMemberLoanInterestDueDetails(member, state, new Date(values.transactionDate || new Date())) : [];
  const calculatedInterestDue = interestDueDetails.reduce((sum, row) => sum + Number(row.calculated || 0), 0);
  const totalInterestOutstanding = interestDueDetails.reduce((sum, row) => sum + Number(row.due || 0), 0);
  const maxPrincipalDue = totalPrincipalOutstanding;
  const paymentDate = new Date(values.transactionDate);
  const dueDateForPayment = getLoanDueDate(state.groups[0]);
  const setup = getEffectiveMemberSetup(member, state.groups[0] ?? {});
  const latePenalty = memberActiveLoans.length > 0 && paymentDate > dueDateForPayment ? Number(setup.penaltyAfterDueDateAmount || 0) : 0;
  const penaltyPaidTillDate = member ? allocationPaidForMember(state, member.id, "penalty", { untilDate: values.transactionDate }) : 0;
  const penaltyWaivedTillDate = member ? allocationWaivedForMember(state, member.id, "penalty", { untilDate: values.transactionDate }) : 0;
  const totalPenaltyOutstanding = Math.max(0, memberActiveLoans.reduce((sum, item) => sum + Number(item.penaltyOutstanding || 0), 0) + Number(member?.penaltyOutstanding || 0) + latePenalty - penaltyPaidTillDate - penaltyWaivedTillDate);
  const monthlySavingSetup = setup.monthlySaving;
  const monthlySavingPaid = monthlySavingPaidForMember(state.transactions || [], member?.id, openPeriod);
  const remainingMonthlySavingDue = Math.max(0, monthlySavingSetup - monthlySavingPaid);
  const defaultAllocation = allocateIncomingPayment({
    amount: Number(values.amount) || 0,
    dueSavings: remainingMonthlySavingDue,
    principalOutstanding: totalPrincipalOutstanding,
    interestOutstanding: maxInterestDue,
    penaltyOutstanding: totalPenaltyOutstanding
  });
  
  const allocation = editableAllocation || defaultAllocation;
  const expenseLineTotal = expenseLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  
  // For pure collection types, place full amount in the appropriate bucket
  const finalAllocation = values.transactionType === "Interest Collection"
    ? { savings: 0, principal: 0, interest: Number(values.amount || 0), penalty: 0, excess: 0 }
    : values.transactionType === "Penalty Collection"
      ? { savings: 0, principal: 0, interest: 0, penalty: Number(values.amount || 0), excess: 0 }
      : allocation;
  
  // When amount changes, reset editable allocation and recalculate
  useEffect(() => {
    setEditableAllocation(null);
    setAllocationEditing(false);
    setAllocationErrors({});
  }, [values.amount]);

  // When member changes, reset editable allocation so splits and interest recalc
  useEffect(() => {
    setEditableAllocation(null);
    setAllocationEditing(false);
    setAllocationErrors({});
  }, [values.memberId]);

  // Keep member selection empty by default; user will choose or type to select.

  useEffect(() => {
    if (!isGroupExpense) return;
    setExpenseLines((current) => {
      if (current.length !== 1) return current;
      const first = current[0] ?? { category: "Accessories", amount: "", remarks: "" };
      return [{
        ...first,
        category: first.category || "Accessories",
        amount: values.amount || ""
      }];
    });
  }, [isGroupExpense, values.amount]);

  function updateExpenseLine(index, key, value) {
    setExpenseLines((current) => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, [key]: value } : line
    ));
  }

  function addExpenseLine() {
    setExpenseLines((current) => [...current, { category: "", amount: "", remarks: "" }]);
  }

  function removeExpenseLine(index) {
    setExpenseLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index));
  }
  
  function handleAllocationChange(key, newValue) {
    const collectedAmount = Number(values.amount) || 0;
    const editableBuckets = ["savings", "interest", "penalty", "principal"];
    let nextValue = Math.max(0, Number(newValue) || 0);
    const otherEditableTotal = editableBuckets
      .filter((bucket) => bucket !== key)
      .reduce((sum, bucket) => sum + Number(allocation[bucket] || 0), 0);
    nextValue = Math.min(nextValue, Math.max(0, collectedAmount - otherEditableTotal));
    if (key === "interest") {
      nextValue = Math.min(nextValue, maxInterestDue);
    }
    if (key === "principal") {
      nextValue = Math.min(nextValue, maxPrincipalDue);
    }
    const updated = { ...allocation, excess: 0 };
    updated[key] = nextValue;
    const usedTotal = editableBuckets.reduce((sum, bucket) => sum + Number(updated[bucket] || 0), 0);
    updated.excess = Math.max(0, collectedAmount - usedTotal);
    const nextTotal = usedTotal + Number(updated.excess || 0);
    setAllocationErrors(nextTotal > collectedAmount + 0.01
      ? { total: `Split total cannot be more than amount collected ${currency.format(collectedAmount)}.` }
      : {}
    );
    setEditableAllocation(updated);
  }
  
  function validateAllocation() {
    const currentAllocation = editableAllocation ?? finalAllocation;
    const allocationTotal = Object.values(currentAllocation).reduce((sum, val) => sum + val, 0);
    const collectedAmount = Number(values.amount) || 0;
    if (allocationTotal > collectedAmount + 0.01) {
      setAllocationErrors({ total: `Split total (${currency.format(allocationTotal)}) cannot be more than amount collected (${currency.format(collectedAmount)}).` });
      return false;
    }
    if (Number(currentAllocation.interest || 0) > maxInterestDue + 0.01) {
      setAllocationErrors({ total: `Interest cannot be more than calculated due ${currency.format(maxInterestDue)}.` });
      return false;
    }
    if (Number(currentAllocation.principal || 0) > maxPrincipalDue + 0.01) {
      setAllocationErrors({ total: `Principal cannot be more than outstanding amount ${currency.format(maxPrincipalDue)}.` });
      return false;
    }
    
    if (Math.abs(allocationTotal - collectedAmount) > 0.01) {
      setAllocationErrors({ total: `Total allocation (${currency.format(allocationTotal)}) must equal amount collected (${currency.format(collectedAmount)})` });
      return false;
    }
    setAllocationErrors({});
    return true;
  }

  async function submit(event) {
    event.preventDefault();
    const originalMember = member;
    const result = validate(transactionSchema, isGroupExpense ? { ...values, memberId: state.members[0]?.id ?? "group-expense" } : values);
    let periodResult = canPostTransaction(periodsData, values.transactionDate);
    // effective IDs used for checks and calls after potential auto-persist
    let effectiveGroupId = state.groups[0]?.id;
    let effectiveMemberId = member?.id;
    let effectivePeriod = periodResult.period;
    setErrors({ ...result.errors, transactionDate: periodResult.allowed ? result.errors.transactionDate : periodResult.reason });
    if (!result.data || !periodResult.allowed) return;
    if (!isGroupExpense && !member) {
      setErrors((current) => ({ ...current, memberId: "Create or select a member first." }));
      return;
    }
    if (!isGroupExpense && !isMemberActive(member)) {
      setErrors((current) => ({ ...current, memberId: "Inactive members cannot have new transactions." }));
      setNotification({ type: "error", message: "Inactive members cannot have savings, repayment, interest, penalty or other transactions." });
      setTimeout(() => setNotification(null), 4000);
      return;
    }
    if (isGroupExpense) {
      const validExpenseLines = expenseLines
        .map((line) => ({ ...line, amount: Number(line.amount || 0), category: line.category.trim() || "General", remarks: line.remarks.trim() }))
        .filter((line) => line.amount > 0);
      if (validExpenseLines.length === 0) {
        setErrors((current) => ({ ...current, amount: "Add at least one expense split line." }));
        return;
      }
      const splitTotal = validExpenseLines.reduce((sum, line) => sum + line.amount, 0);
      if (Math.abs(splitTotal - Number(result.data.amount || 0)) > 0.01) {
        setErrors((current) => ({ ...current, amount: `Expense line total ${currency.format(splitTotal)} must match header amount ${currency.format(Number(result.data.amount || 0))}.` }));
        return;
      }
    }
    
    if (allocationEditing) {
      setNotification({ type: "error", message: "Save the edited allocation first, then save the transaction." });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    if (!repository.isConfigured()) {
      setNotification({ type: 'error', message: 'Cloud sync is not configured. Enable secure storage to post transactions.' });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    // Auto-persist group if running with a local/demo group
    if (!isUuid(state.groups[0]?.id)) {
      try {
        const localGroup = state.groups[0];
        const createdGroup = await repository.createGroup({
          name: localGroup.name || localGroup.group_name || 'New group',
          code: localGroup.code || localGroup.group_code || `BG-${Date.now().toString().slice(-5)}`,
          type: localGroup.type || localGroup.group_type || 'Saving Group',
          currency: localGroup.currency || 'INR',
          interestType: localGroup.interestType || localGroup.interest_calculation_type || 'Reducing',
          startMonth: localGroup.startMonth || new Date().getMonth() + 1,
          maximumLoanLimit: localGroup.maximumLoanLimit || 0,
          loanMultiplier: localGroup.loanMultiplier || 3,
          loanEligibilityRules: localGroup.loanEligibilityRules || { monthlySaving: 0 },
          createdBy: actor?.id,
          createdDate: new Date().toISOString().slice(0, 10),
          subscriptionStatus: localGroup.subscriptionStatus || 'Active'
        });

        // Refresh tenant data to get canonical members/periods.
        const tenantData = await repository.listTenantData();
        const correctedTenantData = recalculateMemberSavingsFromEffectiveLedger(tenantData);
        setState((current) => ({ ...correctedTenantData }));
        syncMemberSavingsCorrectionsToSupabase(correctedTenantData).catch(err => console.error("Sync failed:", err));
        setSelectedGroupId(createdGroup.id);
        effectiveGroupId = createdGroup.id;
        // re-resolve member from refreshed tenant data if possible
        if (originalMember) {
          const found = tenantData.members.find((m) => (m.email && originalMember.email && m.email === originalMember.email) || (m.fullName === originalMember.fullName));
          member = found || originalMember;
          effectiveMemberId = member?.id;
        }
        // recompute periodResult against refreshed periods
        const refreshedPeriods = Array.isArray(tenantData.periods) ? tenantData.periods : periodsData;
        periodResult = canPostTransaction(refreshedPeriods, values.transactionDate);
        effectivePeriod = periodResult.period;
      } catch (err) {
        const details = serializeError(err);
        setNotification({ type: 'error', message: `Failed to persist group before posting: ${err.message}`, details });
        setState((current) => ({
          ...current,
          notifications: [
            { id: makeId('err'), groupId: state.groups[0]?.id, title: 'Group persist failed', body: details || err.message, type: 'error' },
            ...(current.notifications || [])
          ]
        }));
        if (!details) setTimeout(() => setNotification(null), 5000);
        return;
      }
    }

    // Auto-persist member if we have a local/demo member but the group exists online.
    if (!isGroupExpense && !isUuid(effectiveMemberId) && isUuid(effectiveGroupId)) {
      try {
        const created = await repository.createMember(
          {
            fullName: member.fullName,
            email: member.email,
            mobile: member.mobile,
            username: member.username,
            savings: member.savings,
            loanOutstanding: member.loanOutstanding,
            interestOutstanding: member.interestOutstanding,
            penaltyOutstanding: member.penaltyOutstanding,
            shares: member.shares
          },
          effectiveGroupId
        );

        setState((current) => ({
          ...current,
          members: current.members.map((m) => (m === member ? created : m))
        }));
        member = created;
        effectiveMemberId = created.id;
      } catch (err) {
        const details = serializeError(err);
        setNotification({ type: 'error', message: `Failed to persist member before posting: ${err.message}`, details });
        setState((current) => ({
          ...current,
          notifications: [
            { id: makeId('err'), groupId: state.groups[0]?.id, title: 'Member persist failed', body: details || err.message, type: 'error' },
            ...(current.notifications || [])
          ]
        }));
        if (!details) setTimeout(() => setNotification(null), 5000);
        return;
      }
    }

    // If the open period is still a local/demo period id, refresh tenant data to pick up a persisted period.
    if (isUuid(effectiveGroupId) && effectivePeriod && !isUuid(effectivePeriod?.id)) {
      try {
        const tenantData = await repository.listTenantData();
        const correctedTenantData = recalculateMemberSavingsFromEffectiveLedger(tenantData);
        setState((current) => ({ ...correctedTenantData }));
        syncMemberSavingsCorrectionsToSupabase(correctedTenantData).catch(err => console.error("Sync failed:", err));

        const refreshedPeriods = Array.isArray(tenantData.periods) ? tenantData.periods : periodsData;
        const refreshedOpenPeriod = getOpenPeriod(refreshedPeriods);
        effectivePeriod = refreshedOpenPeriod;

        if (effectivePeriod) {
          periodResult = canPostTransaction(refreshedPeriods, values.transactionDate);
          effectivePeriod = periodResult.period;
        }

        if (!isUuid(effectivePeriod?.id) && effectivePeriod) {
          const persistedPeriod = await repository.ensurePeriod(effectivePeriod, effectiveGroupId);
          effectivePeriod = persistedPeriod;
          setState((current) => ({
            ...current,
            periods: current.periods.map((period) =>
              period.id === effectivePeriod.id || period.name === effectivePeriod.name
                ? { ...period, id: persistedPeriod.id, name: persistedPeriod.name, startDate: persistedPeriod.startDate, endDate: persistedPeriod.endDate, status: persistedPeriod.status }
                : period
            )
          }));
        }
      } catch (err) {
        const details = serializeError(err);
        setNotification({ type: 'error', message: `Failed to persist or refresh periods before posting: ${err.message}`, details });
        setState((current) => ({
          ...current,
          notifications: [
            { id: makeId('err'), groupId: state.groups[0]?.id, title: 'Period persistence failed', body: details || err.message, type: 'error' },
            ...(current.notifications || [])
          ]
        }));
        if (!details) setTimeout(() => setNotification(null), 5000);
        return;
      }
    }

    const gOk = isUuid(effectiveGroupId);
    const mOk = isGroupExpense || isUuid(effectiveMemberId);
    const pOk = !effectivePeriod || isUuid(effectivePeriod?.id);
    const aOk = isUuid(actor?.id);
    if (!gOk || !mOk || !pOk || !aOk) {
      const details = `effectiveGroupId: ${effectiveGroupId} (isUuid: ${gOk})\n` +
                      `effectiveMemberId: ${isGroupExpense ? "Group Expense" : effectiveMemberId} (isUuid: ${mOk})\n` +
                      `effectivePeriodId: ${effectivePeriod?.id} (isUuid: ${pOk})\n` +
                      `actorId: ${actor?.id} (isUuid: ${aOk})\n`;
      const baseMessage = !aOk
        ? 'You must sign in before posting transactions.'
        : 'Group/member/period/user must be saved online before posting transactions.';
      console.warn('Transaction blocked - persistence checks failed', { effectiveGroupId, effectiveMemberId, effectivePeriod: effectivePeriod?.id, actorId: actor?.id });
      setNotification({ type: 'error', message: baseMessage, details });
      setState((current) => ({
        ...current,
        notifications: [
          { id: makeId('err'), groupId: state.groups[0]?.id, title: 'Preflight failed: transaction blocked', body: details, type: 'error' },
          ...(current.notifications || [])
        ]
      }));
      // Keep notification visible for review (don't auto-clear when details exist)
      if (!details) setTimeout(() => setNotification(null), 4000);
      return;
    }

    setConfirmDialog({
      title: isGroupExpense ? 'Save group expense' : 'Save transaction',
      message: isGroupExpense ? 'Save this group expense online? Confirm to commit.' : 'Save transaction online? Confirm to commit.',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
          if (isGroupExpense) {
            const createdExpense = await repository.createGroupExpense({
              groupId: effectiveGroupId,
              periodId: effectivePeriod?.id ?? null,
              expenseDate: result.data.transactionDate,
              amount: Number(result.data.amount),
              approvalStatus: hasGroupApprovers ? "Pending" : "Completed",
              lines: expenseLines
                .map((line) => ({ ...line, amount: Number(line.amount || 0), category: line.category.trim() || "General", remarks: line.remarks.trim() }))
                .filter((line) => line.amount > 0),
              category: expenseLines[0]?.category?.trim() || "General",
              remarks: expenseLines.map((line) => line.remarks).filter(Boolean).join("; ") || "Group expense"
            });
            const activeMembers = activeMembersForTransactions(state.members || []);
            const expenseAmount = Number(result.data.amount);
            let remainingExpenseShare = expenseAmount;
            const adjustmentTransactions = [];
            for (let index = 0; index < activeMembers.length; index += 1) {
              const expenseMember = activeMembers[index];
              const shareAmount = index === activeMembers.length - 1
                ? Number(remainingExpenseShare.toFixed(2))
                : Number((expenseAmount / activeMembers.length).toFixed(2));
              remainingExpenseShare -= shareAmount;
              const adjustment = await repository.createTransaction({
                groupId: effectiveGroupId,
                memberId: expenseMember.id,
                periodId: effectivePeriod?.id ?? null,
                transactionDate: result.data.transactionDate,
                amount: -Math.abs(shareAmount),
                transactionType: "Group Expense Share",
                approvalStatus: hasGroupApprovers ? "Pending" : "Completed",
                remarks: `Expense share for expense ${createdExpense.id}`,
                allocation: { savings: -Math.abs(shareAmount), excess: 0 }
              });
              adjustmentTransactions.push({ ...adjustment, parentExpenseId: createdExpense.id });
            }
            const approvalRecord = hasGroupApprovers
              ? createConfiguredApprovalRecords({
                  state,
                  action: "Group expense",
                  requester: actor.name,
                  amount: Number(result.data.amount),
                  referenceId: createdExpense.id,
                  referenceType: "expense"
                })
              : [];
            const persistedApprovals = approvalRecord.length && repository.isConfigured()
              ? await repository.createApprovalRequests({ groupId: effectiveGroupId, approvals: approvalRecord })
              : approvalRecord;
            setState((current) => audit({
              state: {
                ...current,
                expenses: [createdExpense, ...(current.expenses || [])],
                transactions: [...adjustmentTransactions, ...current.transactions],
                approvals: [...persistedApprovals, ...current.approvals],
                notifications: hasGroupApprovers
                  ? [
                      { id: makeId("ntf"), groupId: state.groups[0]?.id, title: "Expense approval requested", body: `${actor.name} submitted ${currency.format(result.data.amount)} group expense for approval.`, type: "info", createdAt: new Date().toISOString() },
                      ...current.notifications
                    ]
                  : current.notifications
              },
              actor,
              action: "create",
              tableName: "group_expense_header",
              recordId: createdExpense.id,
              newValue: createdExpense
            }));
            setNotification({ type: "success", message: hasGroupApprovers ? "Group expense submitted for approval." : "Group expense saved." });
            setValues({ memberId: "", amount: 0, transactionDate: toIsoDateValue(), transactionType: "Savings Collection" });
            setExpenseLines([{ category: "Accessories", amount: "", remarks: "" }]);
            setEditableAllocation(null);
            setAllocationEditing(false);
            setAllocationErrors({});
            await refreshTenantData();
            setTimeout(() => setNotification(null), 3000);
            return;
          }

          const createdTransaction = await repository.createTransaction({
            groupId: effectiveGroupId,
            memberId: effectiveMemberId,
            periodId: effectivePeriod?.id ?? null,
            transactionDate: result.data.transactionDate,
            amount: Number(result.data.amount),
            transactionType: values.transactionType,
            approvalStatus: hasGroupApprovers ? 'Pending' : 'Completed',
            createdBy: actor.id,
            allocation: finalAllocation
          });

          const approvalRecord = hasGroupApprovers
            ? createConfiguredApprovalRecords({
                state,
                action: "Transaction posting",
                requester: actor.name,
                amount: Number(result.data.amount),
                referenceId: createdTransaction.id,
                referenceType: "transaction"
              })
            : [];
          let persistedApprovals = approvalRecord;
          if (approvalRecord.length && repository.isConfigured()) {
            persistedApprovals = await repository.createApprovalRequests({
              groupId: effectiveGroupId,
              approvals: approvalRecord
            });
          }

          setState((current) => {
            const updatedMembers = hasGroupApprovers ? current.members : current.members.map((item) =>
              item.id === member.id
                ? {
                    ...item,
                    savings: item.savings + allocation.savings,
                    loanOutstanding: Math.max(0, item.loanOutstanding - allocation.principal)
                  }
                : item
            );
            let remainingInterestPayment = Number(allocation.interest || 0);
            let remainingPenaltyPayment = Number(allocation.penalty || 0);
            let remainingPrincipalPayment = Number(allocation.principal || 0);
            const interestDueByLoan = new Map(interestDueDetails.map((row) => [String(row.loan.id), row]));
            const repaymentLoanIds = new Set(memberActiveLoans.map((item) => String(item.id)));
            const updatedLoans = hasGroupApprovers ? current.loans : current.loans.map((item) => {
              if (!repaymentLoanIds.has(String(item.id))) return item;
              const interestDueForLoan = interestDueByLoan.get(String(item.id));
              const interestPaid = Math.min(Number(interestDueForLoan?.due ?? item.interestOutstanding ?? 0), remainingInterestPayment);
              remainingInterestPayment -= interestPaid;
              const openingInterestReduction = Math.min(Number(item.interestOutstanding || 0), interestPaid);
              const penaltyPaid = Math.min(Number(item.penaltyOutstanding || 0), remainingPenaltyPayment);
              remainingPenaltyPayment -= penaltyPaid;
              const principalPaid = remainingInterestPayment <= 0
                ? Math.min(Number(item.principalOutstanding || 0), remainingPrincipalPayment)
                : 0;
              remainingPrincipalPayment -= principalPaid;
              return {
                ...item,
                principalOutstanding: Math.max(0, Number(item.principalOutstanding || 0) - principalPaid),
                interestOutstanding: Math.max(0, Number(item.interestOutstanding || 0) - openingInterestReduction),
                penaltyOutstanding: Math.max(0, Number(item.penaltyOutstanding || 0) - penaltyPaid),
                interestPaidTillNow: Number(item.interestPaidTillNow || 0) + interestPaid
              };
            });

        return audit({
          state: {
            ...current,
            members: updatedMembers,
            loans: updatedLoans,
            transactions: [createdTransaction, ...current.transactions],
            approvals: [...persistedApprovals, ...current.approvals],
            notifications: hasGroupApprovers
              ? [
                  { id: makeId("ntf"), groupId: state.groups[0]?.id, title: "Transaction approval requested", body: `${actor.name} submitted ${currency.format(result.data.amount)} ${values.transactionType.toLowerCase()} for ${member?.fullName ?? "the selected member"} for approval.`, type: "info", createdAt: new Date().toISOString() },
                  ...current.notifications
                ]
              : current.notifications
          },
          actor,
          action: "create",
          tableName: "savings_transactions",
          recordId: createdTransaction.id,
          newValue: createdTransaction
        });
      });

          setNotification({ type: 'success', message: hasGroupApprovers ? 'Transaction submitted for approval.' : `Completed ${currency.format(result.data.amount)} for ${member.fullName}.` });
          setValues({ memberId: "", amount: 0, transactionDate: toIsoDateValue(), transactionType: "Savings Collection" });
          setEditableAllocation(null);
          setAllocationEditing(false);
          setAllocationErrors({});
          await refreshTenantData();
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          console.error('Create transaction failed', error);
          const details = serializeError(error);
          setNotification({ type: 'error', message: `Unable to save transaction for ${member?.fullName ?? 'member'}: ${error.message}`, details });
          setState((current) => ({
            ...current,
            notifications: [
              { id: makeId('err'), groupId: state.groups[0]?.id, title: 'Transaction save failed', body: details || error.message, type: 'error' },
              ...(current.notifications || [])
            ]
          }));
          if (!details) setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
        setNotification({ type: 'info', message: 'Transaction not saved online.' });
        setTimeout(() => setNotification(null), 3000);
      }
    });
    return;
  }

  return (
    <Page title="Transactions" subtitle="Savings, repayments, interest, penalty, deposits and withdrawals" action={null}>
      <FormCard title="Post collection" onSubmit={submit}>
        <div className="section-note">Open period: <strong>{openPeriod?.name ?? "No open period"}</strong></div>
        <ComboField
          label="Member / Group expense"
          value={values.memberId}
          onChange={(value) => setValues({ ...values, memberId: value })}
          options={[
            { label: "Group Expense", value: GROUP_EXPENSE_MEMBER_ID },
            ...activeTransactionMembers.map((item) => ({ label: item.fullName, value: item.id }))
          ]}
          error={errors.memberId}
          required
        />
        <Field label={isGroupExpense ? "Expense amount" : "Amount collected"} type="number" value={values.amount} onChange={(value) => setValues({ ...values, amount: value })} error={errors.amount} required />
        <Field label="Transaction date" type="date" value={values.transactionDate} onChange={(value) => setValues({ ...values, transactionDate: value })} error={errors.transactionDate} required />
        {isGroupExpense && (
          <div className="expense-split-editor">
            <div className="expense-split-header">
              <strong>Expense split lines</strong>
              <span>Total: {currency.format(expenseLineTotal)} / Header: {currency.format(Number(values.amount || 0))}</span>
            </div>
            {expenseLines.map((line, index) => (
              <div className="expense-line-row" key={`expense-line-${index}`}>
                <Field label="Category" value={line.category} onChange={(value) => updateExpenseLine(index, "category", value)} />
                <Field label="Amount" type="number" value={line.amount} onChange={(value) => updateExpenseLine(index, "amount", value)} />
                <Field label="Comment" value={line.remarks} onChange={(value) => updateExpenseLine(index, "remarks", value)} />
                <button type="button" className="secondary-button" onClick={() => removeExpenseLine(index)} disabled={expenseLines.length === 1}>Remove</button>
              </div>
            ))}
            <button type="button" className="secondary-button" onClick={addExpenseLine}>Add split line</button>
          </div>
        )}
      </FormCard>
      {!isGroupExpense && <Section title={allocationEditing ? "Edit allocation breakdown" : "Automatic allocation preview"}>
        {!allocationEditing && (
          <div style={{ marginBottom: '16px' }}>
            <button 
              type="button" 
              className="secondary-button"
              onClick={() => {
                setAllocationEditing(true);
                setEditableAllocation({ ...finalAllocation });
              }}
            >
              Edit allocation
            </button>
          </div>
        )}
        
        <div className="allocation" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {['savings','interest','penalty','principal','excess'].map((keyName) => {
            const value = Number(finalAllocation?.[keyName] || 0);
            return (
              <div key={keyName} style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', textTransform: 'capitalize' }}>
                  {keyName}
                </label>
                {keyName === "interest" && <small className="section-note">Max calculated: {currency.format(maxInterestDue)}</small>}
                {keyName === "principal" && <small className="section-note">Outstanding: {currency.format(maxPrincipalDue)}</small>}
                {keyName === "savings" && <small className="section-note">Remaining this month: {currency.format(Math.max(0, remainingMonthlySavingDue))}</small>}
                {keyName === "excess" && <small className="section-note">Auto calculated from remaining split amount</small>}
                {allocationEditing && keyName !== "excess" ? (
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => handleAllocationChange(keyName, e.target.value)}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                ) : (
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--primary)' }}>
                    {currency.format(value)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {allocationEditing && (
          <>
            {allocationErrors.total && (
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626' }}>
                Warning: {allocationErrors.total}
              </div>
            )}
            <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
              <button 
                type="button" 
                className="primary-button"
                onClick={() => {
                  if (validateAllocation()) {
                    setAllocationEditing(false);
                  }
                }}
              >
                Save allocation
              </button>
              <button 
                type="button" 
                className="secondary-button"
                onClick={() => {
                  setEditableAllocation(null);
                  setAllocationEditing(false);
                  setAllocationErrors({});
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </Section>}
      <Table
        headers={["Date", "Number", "Member", "Type", "Amount", "Savings", "Principal", "Interest", "Penalty", "Status"]}
        rows={visibleTransactionRows.map((item) => {
          if (item.transactionType === "Group Expense") {
            return [
              item.transactionDate,
              item.expenseNumber ?? item.id,
              "Group",
              "Group Expense",
              currency.format(item.amount),
              currency.format(0),
              currency.format(0),
              currency.format(0),
              currency.format(0),
              statusWithPendingApprover(item, state.approvals)
            ];
          }
          const member = state.members.find((member) => member.id === item.memberId);
          return [
            item.transactionDate,
            item.transactionNumber ?? item.id,
            member?.fullName || item.memberName || item.memberId || "Unknown",
            item.transactionType,
            currency.format(item.amount),
            currency.format(item.allocation?.savings || 0),
            currency.format(item.allocation?.principal || 0),
            currency.format(item.allocation?.interest || 0),
            currency.format(item.allocation?.penalty || 0),
            statusWithPendingApprover(item, state.approvals)
          ];
        })}
      />
    </Page>
  );
}

function getSelectedGroupState(state, selectedGroupId, includeAllGroups = false) {
  if (includeAllGroups || !selectedGroupId) return state;
  const groupId = String(selectedGroupId);
  const members = (state.members || []).filter((member) => String(member.groupId) === groupId);
  const memberIds = new Set(members.map((member) => String(member.id)));
  return {
    ...state,
    groups: (state.groups || []).filter((group) => String(group.id) === groupId),
    members,
    periods: (state.periods || []).filter((period) => String(period.groupId) === groupId),
    loans: (state.loans || []).filter((loan) => String(loan.groupId ?? "") === groupId || memberIds.has(String(loan.memberId))),
    approvals: (state.approvals || []).filter((approval) => String(approval.groupId ?? "") === groupId),
    expenses: (state.expenses || []).filter((expense) => !expense.groupId || String(expense.groupId) === groupId),
    withdrawalRequests: (state.withdrawalRequests || []).filter((request) => !request.groupId || String(request.groupId) === groupId),
    subscriptions: (state.subscriptions || []).filter((subscription) => !subscription.groupId || String(subscription.groupId) === groupId),
    transactions: (state.transactions || []).filter((transaction) => String(transaction.groupId) === groupId || memberIds.has(String(transaction.memberId))),
    legacyGroupOpenings: (state.legacyGroupOpenings || []).filter((row) => String(row.group_id ?? row.groupId) === groupId),
    legacyImports: (state.legacyImports || []).filter((row) => String(row.group_id ?? row.groupId) === groupId || memberIds.has(String(row.member_id ?? row.memberId))),
    shareDistributions: (state.shareDistributions || []).filter((row) => memberIds.has(String(row.member_id ?? row.memberId))),
    shareAdjustments: (state.shareAdjustments || []).filter((row) => memberIds.has(String(row.member_id ?? row.memberId))),
    auditLogs: [],
    notifications: (state.notifications || []).filter((notification) => String(notification.groupId ?? "") === groupId),
    disputes: (state.disputes || []).filter((row) => String(row.group_id ?? row.groupId) === groupId),
    rpcPendingDues: (state.rpcPendingDues || []).filter((row) => {
      const rowGroupId = String(row.group_id ?? row.groupId ?? "");
      return !rowGroupId || rowGroupId === groupId;
    }),
    rpcShareDistribution: (state.rpcShareDistribution || []).filter((row) => {
      const rowGroupId = String(row.group_id ?? row.groupId ?? "");
      return !rowGroupId || rowGroupId === groupId;
    }),
    rpcShareDistributionRange: (state.rpcShareDistributionRange || []).filter((row) => {
      const rowGroupId = String(row.group_id ?? row.groupId ?? "");
      return !rowGroupId || rowGroupId === groupId;
    }),
    rpcShareDistributionSnapshots: Object.fromEntries(
      Object.entries(state.rpcShareDistributionSnapshots || {}).filter(([, row]) => {
        const rowGroupId = String(row.group_id ?? row.groupId ?? "");
        return !rowGroupId || rowGroupId === groupId;
      })
    )
  };
}

function isPendingFinancialStatus(status) {
  return String(status ?? "").toUpperCase() === "PENDING";
}

function isPendingOrRecentCompleted(item, dateField = "transactionDate", days = 60) {
  return isPendingFinancialStatus(item?.approvalStatus)
    || (isCompletedFinancialStatus(item?.approvalStatus) && isWithinPastDays(item?.[dateField], days));
}

function correctionChildrenFor(transactions = [], parentId) {
  return transactions.filter((transaction) => String(transaction.parentTransactionId) === String(parentId));
}

function reversalChildrenFor(transactions = [], parentId) {
  return correctionChildrenFor(transactions, parentId).filter((transaction) =>
    transaction.reversedFlag === "Y" || transaction.transactionNumber?.startsWith("REV")
  );
}

function adjustmentChildrenFor(transactions = [], parentId) {
  return correctionChildrenFor(transactions, parentId).filter((transaction) =>
    transaction.adjustmentFlag === "Y" || transaction.transactionNumber?.startsWith("ADJ")
  );
}

function effectiveAmountAfterAdjustments(transactions = [], parentTransaction) {
  if (!parentTransaction) return 0;
  const adjustmentTotal = adjustmentChildrenFor(transactions, parentTransaction.id)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  return Math.max(0, Number(parentTransaction.amount || 0) + adjustmentTotal);
}

function correctionBlockReason(transactions = [], parentTransaction, correctionType) {
  if (!parentTransaction) return "Select a valid original transaction.";
  if (parentTransaction.adjustmentFlag === "Y" || parentTransaction.reversedFlag === "Y") {
    return "Select the original transaction, not an adjustment or reversal child entry.";
  }
  const reversals = reversalChildrenFor(transactions, parentTransaction.id);
  if (reversals.length > 0) {
    return "This transaction already has a pending or completed reversal, so no further correction is allowed.";
  }
  const effectiveAmount = effectiveAmountAfterAdjustments(transactions, parentTransaction);
  if (correctionType === "reversal" && adjustmentChildrenFor(transactions, parentTransaction.id).length > 0) {
    return "This transaction already has adjustment entries. Reverse is not allowed after adjustment.";
  }
  if (correctionType === "adjustment" && effectiveAmount <= 0) {
    return "This transaction amount is already fully adjusted.";
  }
  return "";
}

function monthlySavingPaidForMember(transactions = [], memberId, period) {
  if (!memberId || !period) return 0;
  return getEffectiveCompletedTransactions(getCompletedTransactions(transactions))
    .filter((transaction) =>
      String(transaction.memberId) === String(memberId)
      && transaction.transactionType !== "Group Expense Share"
      && transaction.transactionType !== "Withdrawal"
      && transaction.transactionType !== "Waiver"
      && isDateInPeriod(transaction.transactionDate, period)
    )
    .reduce((sum, transaction) => sum + Number(transaction.allocation?.savings || 0) + Number(transaction.allocation?.excess || 0), 0);
}

function Adjustments({ state, setState, actor, setConfirmDialog, setNotification }) {
  const activeGroupId = state.groups?.[0]?.id;
  const activeMemberIds = new Set((state.members || []).map((member) => String(member.id)));
  const belongsToActiveGroup = (transaction) =>
    String(transaction.groupId ?? "") === String(activeGroupId)
    || activeMemberIds.has(String(transaction.memberId));
  const adjustableTransactions = state.transactions.filter((item) =>
    belongsToActiveGroup(item)
    && isCompletedFinancialStatus(item.approvalStatus)
    && item.reversedFlag !== "Y"
    && item.adjustmentFlag !== "Y"
    && !item.transactionNumber?.startsWith("REV")
    && !item.transactionNumber?.startsWith("ADJ")
  );
  const [values, setValues] = useState({
    transactionId: adjustableTransactions[0]?.id ?? "",
    correctAmount: adjustableTransactions[0]?.amount ?? 0,
    bucket: "savings",
    adjustmentDate: toIsoDateValue(),
    reason: ""
  });
  const [errors, setErrors] = useState({});
  const adjustmentRows = state.transactions
    .filter((item) => item.adjustmentFlag === "Y" || item.transactionNumber?.startsWith("ADJ"))
    .filter((item) => isPendingOrRecentCompleted(item, "transactionDate", 60));
  const selectedTransaction = adjustableTransactions.find((item) => String(item.id) === String(values.transactionId));
  const selectedMember = state.members.find((item) => String(item.id) === String(selectedTransaction?.memberId));
  const originalAmount = Number(selectedTransaction?.amount ?? 0);
  const effectiveOriginalAmount = effectiveAmountAfterAdjustments(state.transactions, selectedTransaction);
  const correctAmount = Number(values.correctAmount ?? 0);
  const adjustmentAmount = correctAmount - effectiveOriginalAmount;
  const selectedBlockReason = correctionBlockReason(state.transactions, selectedTransaction, "adjustment");

  useEffect(() => {
    if (!selectedTransaction) return;
    setValues((current) => {
      if (String(current.transactionId) !== String(selectedTransaction.id)) return current;
      const effectiveAmount = effectiveAmountAfterAdjustments(state.transactions, selectedTransaction);
      return Number(current.correctAmount) === Number(selectedTransaction.amount)
        ? { ...current, correctAmount: effectiveAmount }
        : current;
    });
  }, [selectedTransaction?.id]);
  const selectedBucketAmount = Number(selectedTransaction?.allocation?.[values.bucket] ?? 0);

  function changeTransaction(transactionId) {
    const nextTransaction = adjustableTransactions.find((item) => String(item.id) === String(transactionId));
    setValues((current) => ({
      ...current,
      transactionId,
      correctAmount: effectiveAmountAfterAdjustments(state.transactions, nextTransaction)
    }));
    setErrors({});
  }

  function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!selectedTransaction) nextErrors.transactionId = "Select an original transaction.";
    if (selectedBlockReason) nextErrors.transactionId = selectedBlockReason;
    if (selectedMember && !isMemberActive(selectedMember)) nextErrors.transactionId = "Inactive members cannot have new adjustment transactions.";
    if (!Number.isFinite(correctAmount)) nextErrors.correctAmount = "Enter a valid corrected amount.";
    if (correctAmount < 0) nextErrors.correctAmount = "Correct amount cannot be negative.";
    if (adjustmentAmount === 0) nextErrors.correctAmount = "Correct amount is same as original.";
    if (adjustmentAmount < 0 && Math.abs(adjustmentAmount) > Math.abs(selectedBucketAmount)) {
      nextErrors.correctAmount = `${values.bucket} adjustment cannot reduce more than existing ${currency.format(selectedBucketAmount)}. Choose another bucket or smaller corrected amount.`;
    }
    if (!values.reason.trim()) nextErrors.reason = "Add a reason for audit history.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setConfirmDialog({
      title: "Create adjustment",
      message: `Post an adjustment of ${currency.format(adjustmentAmount)} against ${selectedTransaction.transactionNumber ?? selectedTransaction.id}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const hasGroupApprovers = getApprovalRecipients(state).length > 0;
          const created = await repository.adjustTransaction(selectedTransaction.id, {
            ...selectedTransaction,
            amount: adjustmentAmount,
            allocation: { [values.bucket]: adjustmentAmount },
            transactionDate: values.adjustmentDate,
            approvalStatus: hasGroupApprovers ? "Pending" : "Completed",
            remarks: values.reason.trim()
          });
          const approvalRecord = hasGroupApprovers
            ? createApprovalRecords({
                state,
                action: "Adjustment correction",
                requester: actor.name,
                amount: adjustmentAmount,
                referenceId: created.id,
                referenceType: "transaction"
              })
            : [];
          const persistedApprovals = approvalRecord.length && repository.isConfigured()
            ? await repository.createApprovalRequests({ groupId: state.groups[0]?.id, approvals: approvalRecord })
            : approvalRecord;
          setState((current) => {
            const nextTransactions = [created, ...current.transactions];
            const affectedMember = current.members.find((m) => String(m.id) === String(selectedTransaction?.memberId));
            const nextState = {
              ...current,
              transactions: nextTransactions,
              approvals: [...persistedApprovals, ...current.approvals],
              notifications: hasGroupApprovers
                ? [
                    { id: makeId("ntf"), groupId: state.groups[0]?.id, recipientMemberIds: approvalRecord.map((approval) => approval.approverId), title: "Adjustment approval requested", body: `${actor.name} submitted ${currency.format(adjustmentAmount)} adjustment for approval.`, type: "info", createdAt: new Date().toISOString() },
                    ...current.notifications
                  ]
                : current.notifications
            };
            if (affectedMember) {
              nextState.members = current.members.map((m) => String(m.id) === String(affectedMember.id)
                ? { ...m, savings: calculateMemberLedgerSummary(m, { ...nextState, transactions: nextTransactions }).savings }
                : m
              );
            }
            return audit({
              state: nextState,
              actor,
              action: "adjust",
              tableName: "member_transaction_header",
              recordId: created.id,
              newValue: created
            });
          });
          setNotification({ type: "success", message: hasGroupApprovers ? "Adjustment submitted for approval." : "Adjustment posted as a separate child entry." });
          setValues((current) => ({ ...current, correctAmount: selectedTransaction.amount, reason: "" }));
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          setNotification({ type: "error", message: `Unable to post adjustment: ${error.message}`, details: serializeError(error) });
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  return (
    <Page title="Adjustments" subtitle="Post partial corrections without editing the original transaction" action={null}>
      <div className="two-column">
        <FormCard title="New adjustment" onSubmit={submit}>
          <SelectField
            label="Original transaction"
            value={values.transactionId}
            onChange={changeTransaction}
            options={adjustableTransactions.map((item) => {
              const member = state.members.find((entry) => String(entry.id) === String(item.memberId));
              return {
                label: `${item.transactionDate} / ${member?.fullName ?? "Member"} / ${currency.format(item.amount)} / ${item.transactionNumber ?? item.id}`,
                value: item.id
              };
            })}
            error={errors.transactionId}
          />
          <SelectField
            label="Correction bucket"
            value={values.bucket}
            onChange={(bucket) => setValues({ ...values, bucket })}
            options={[
              { label: "Savings", value: "savings" },
              { label: "Loan principal", value: "principal" },
              { label: "Loan interest", value: "interest" },
              { label: "Penalty", value: "penalty" },
              { label: "Other income/charge", value: "excess" }
            ]}
          />
          <Field label="Correct total amount" type="number" value={values.correctAmount} onChange={(correctAmount) => setValues({ ...values, correctAmount })} error={errors.correctAmount} />
          <Field label="Adjustment date" type="date" value={values.adjustmentDate} onChange={(adjustmentDate) => setValues({ ...values, adjustmentDate })} />
          <Field label="Reason" value={values.reason} onChange={(reason) => setValues({ ...values, reason })} error={errors.reason} />
        </FormCard>
        <Section title="Adjustment preview">
          <div className="status-row">
            <div>
              <strong>Original</strong>
              <p>{currency.format(originalAmount)}</p>
            </div>
            <div>
              <strong>Remaining after earlier adjustments</strong>
              <p>{currency.format(effectiveOriginalAmount)}</p>
            </div>
          </div>
          <div className="status-row">
            <div>
              <strong>Correct amount</strong>
              <p>{currency.format(Number.isFinite(correctAmount) ? correctAmount : 0)}</p>
            </div>
            <div>
              <strong>Adjustment entry</strong>
              <p>{currency.format(Number.isFinite(adjustmentAmount) ? adjustmentAmount : 0)}</p>
            </div>
            <div>
              <strong>Selected bucket balance</strong>
              <p>{currency.format(selectedBucketAmount)}</p>
            </div>
          </div>
          <div className="status-row">
            <div>
              <strong>Member</strong>
              <p>{selectedMember?.fullName ?? "Select transaction"}</p>
            </div>
          </div>
          {selectedBlockReason && <p className="form-error">{selectedBlockReason}</p>}
          <p className="section-note">A negative adjustment reduces the selected bucket. A positive adjustment adds to it. The original transaction remains untouched.</p>
        </Section>
      </div>
      <Table
        headers={["Date", "Parent", "Member", "Amount", "Status", "Remarks"]}
        rows={adjustmentRows.map((item) => {
          const member = state.members.find((entry) => entry.id === item.memberId);
          return [
            item.transactionDate,
            item.parentTransactionId ?? "-",
            member?.fullName ?? item.memberId,
            currency.format(item.amount),
            item.approvalStatus,
            item.remarks ?? ""
          ];
        })}
      />
    </Page>
  );
}

function Corrections({ state, setState, actor, setConfirmDialog, setNotification }) {
  useEffect(() => { ensureLatestTenantData(); }, []);
  return (
    <Page title="Corrections" subtitle="Use adjustments for partial fixes and reversals for full wrong entries" action={null}>
      <Adjustments state={state} setState={setState} actor={actor} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />
      <Reversals state={state} setState={setState} actor={actor} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />
    </Page>
  );
}

function Reversals({ state, setState, actor, setConfirmDialog, setNotification }) {
  const activeGroupId = state.groups?.[0]?.id;
  const activeMemberIds = new Set((state.members || []).map((member) => String(member.id)));
  const belongsToActiveGroup = (item) =>
    String(item.groupId ?? "") === String(activeGroupId)
    || activeMemberIds.has(String(item.memberId));
  const reversibleTransactions = state.transactions.filter((item) =>
    belongsToActiveGroup(item)
    && isCompletedFinancialStatus(item.approvalStatus)
    && item.reversedFlag !== "Y"
    && item.adjustmentFlag !== "Y"
    && !item.transactionNumber?.startsWith("REV")
    && !item.transactionNumber?.startsWith("ADJ")
    && correctionBlockReason(state.transactions, item, "reversal") === ""
  );
  const reversibleLoans = (state.loans || []).filter((loan) =>
    belongsToActiveGroup(loan)
    && isOutstandingLoan(loan)
  );
  const reversibleItems = [
    ...reversibleTransactions.map((item) => ({ ...item, itemType: "transaction", key: `transaction:${item.id}` })),
    ...reversibleLoans.map((loan) => ({ ...loan, itemType: "loan", key: `loan:${loan.id}` }))
  ];
  // Sort reversible items by their date (transactionDate or startDate) descending
  const sortedReversibleItems = reversibleItems.slice().sort((a, b) => {
    const aDate = new Date(a.transactionDate || a.startDate || 0).getTime();
    const bDate = new Date(b.transactionDate || b.startDate || 0).getTime();
    return bDate - aDate;
  });

  const [values, setValues] = useState({
    itemKey: sortedReversibleItems[0]?.key ?? "",
    reversalDate: toIsoDateValue(),
    reason: ""
  });
  const [errors, setErrors] = useState({});
  const reversalRows = (state.transactions || [])
    .filter((item) => item.reversedFlag === "Y" || item.transactionNumber?.startsWith("REV"))
    .filter((item) => isPendingOrRecentCompleted(item, "transactionDate", 60))
    .slice()
    .sort((a, b) => String(b.transactionDate || "").localeCompare(String(a.transactionDate || "")));
  const selectedItem = reversibleItems.find((item) => item.key === values.itemKey);
  const selectedMember = state.members.find((item) => String(item.id) === String(selectedItem?.memberId));
  const blockedOriginal = selectedItem?.itemType === "transaction"
    ? state.transactions.find((item) => String(item.id) === String(selectedItem.id))
    : null;
  const selectedBlockReason = selectedItem?.itemType === "transaction"
    ? correctionBlockReason(state.transactions, blockedOriginal, "reversal")
    : "";
  const selectedTransaction = selectedItem?.itemType === "transaction" ? selectedItem : null;

  function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!selectedItem) nextErrors.itemKey = "Select the wrong transaction or loan.";
    if (selectedBlockReason) nextErrors.itemKey = selectedBlockReason;
    if (selectedMember && !isMemberActive(selectedMember)) nextErrors.itemKey = "Inactive members cannot have new reversal transactions.";
    if (!values.reason.trim()) nextErrors.reason = "Add a reason for audit history.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const reversalTitle = selectedItem?.itemType === "loan" ? "Reverse loan" : "Create reversal";
    const reversalMessage = selectedItem?.itemType === "loan"
      ? `Reverse the active loan ${selectedItem.loanNumber ?? selectedItem.id}?`
      : `Reverse the full transaction ${selectedItem.transactionNumber ?? selectedItem.id}?`;

    setConfirmDialog({
      title: reversalTitle,
      message: reversalMessage,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          if (selectedItem?.itemType === "loan") {
            setState((current) => audit({
              state: {
                ...current,
                loans: (current.loans || []).filter((loan) => String(loan.id) !== String(selectedItem.id))
              },
              actor,
              action: "reverse",
              tableName: "loan_master",
              recordId: selectedItem.id,
              newValue: { ...selectedItem, status: "REVERSED", principalOutstanding: 0, interestOutstanding: 0, penaltyOutstanding: 0 }
            }));
            setNotification({ type: "success", message: "Loan reversed and removed from active loans." });
            setValues((current) => ({ ...current, reason: "" }));
            setTimeout(() => setNotification(null), 3000);
            return;
          }

          const hasGroupApprovers = getApprovalRecipients(state).length > 0;
          const created = await repository.reverseTransaction({
            ...selectedItem,
            transactionDate: values.reversalDate,
            approvalStatus: hasGroupApprovers ? "Pending" : "Completed",
            remarks: values.reason.trim()
          });
          const approvalRecord = hasGroupApprovers
            ? createApprovalRecords({
                state,
                action: "Transaction reversal",
                requester: actor.name,
                amount: Math.abs(Number(selectedItem.amount || 0)),
                referenceId: created.id,
                referenceType: "transaction"
              })
            : [];
          const persistedApprovals = approvalRecord.length && repository.isConfigured()
            ? await repository.createApprovalRequests({ groupId: state.groups[0]?.id, approvals: approvalRecord })
            : approvalRecord;
          setState((current) => {
            const nextTransactions = [created, ...current.transactions];
            const affectedMember = current.members.find((m) => String(m.id) === String(selectedItem.memberId));
            const nextState = {
              ...current,
              transactions: nextTransactions,
              approvals: [...persistedApprovals, ...current.approvals],
              notifications: hasGroupApprovers
                ? [
                    { id: makeId("ntf"), groupId: state.groups[0]?.id, recipientMemberIds: approvalRecord.map((approval) => approval.approverId), title: "Reversal approval requested", body: `${actor.name} submitted reversal for approval.`, type: "info", createdAt: new Date().toISOString() },
                    ...current.notifications
                  ]
                : current.notifications
            };
            if (affectedMember) {
              nextState.members = current.members.map((m) => String(m.id) === String(affectedMember.id)
                ? { ...m, savings: calculateMemberLedgerSummary(m, { ...nextState, transactions: nextTransactions }).savings }
                : m
              );
            }
            return audit({
              state: nextState,
              actor,
              action: "reverse",
              tableName: "member_transaction_header",
              recordId: created.id,
              newValue: created
            });
          });
          setNotification({ type: "success", message: hasGroupApprovers ? "Reversal submitted for approval." : "Full reversal posted as a separate child entry." });
          setValues((current) => ({ ...current, reason: "" }));
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          setNotification({ type: "error", message: `Unable to post reversal: ${error.message}`, details: serializeError(error) });
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  return (
    <Page title="Reversals" subtitle="Cancel an entire wrong transaction with a full negative child entry" action={null}>
      <div className="two-column">
        <FormCard title="New reversal" onSubmit={submit}>
          <ComboField
            label="Wrong transaction or loan"
            value={values.itemKey}
            onChange={(itemKey) => {
              setValues({ ...values, itemKey });
              setErrors({});
            }}
            options={sortedReversibleItems.map((item) => {
              const member = state.members.find((entry) => String(entry.id) === String(item.memberId));
              const label = item.itemType === "loan"
                ? `${item.startDate ?? ""} / ${member?.fullName ?? item.memberName ?? "Member"} / Loan ${currency.format(item.amount)} / ${item.loanNumber ?? item.id}`
                : `${item.transactionDate} / ${member?.fullName ?? "Member"} / ${currency.format(item.amount)} / ${item.transactionNumber ?? item.id}`;
              return {
                label,
                value: item.key
              };
            })}
            placeholder="Type to search..."
            error={errors.itemKey}
          />
          <Field label="Reversal date" type="date" value={values.reversalDate} onChange={(reversalDate) => setValues({ ...values, reversalDate })} />
          <Field label="Reason" value={values.reason} onChange={(reason) => setValues({ ...values, reason })} error={errors.reason} />
        </FormCard>
        <Section title="Reversal preview">
          <div className="status-row">
            <div>
              <strong>Original amount</strong>
              <p>{currency.format(selectedItem?.amount ?? 0)}</p>
            </div>
            <div>
              <strong>Reversal entry</strong>
              <p>{currency.format(-Math.abs(Number(selectedItem?.amount ?? 0)))}</p>
            </div>
          </div>
          <div className="status-row">
            <div>
              <strong>Member</strong>
              <p>{selectedMember?.fullName ?? selectedItem?.memberName ?? "Select transaction"}</p>
            </div>
            <div>
              <strong>Parent transaction</strong>
              <p>{selectedItem?.itemType === "loan" ? selectedItem.loanNumber ?? selectedItem.id : selectedItem?.transactionNumber ?? selectedItem?.id ?? "-"}</p>
            </div>
          </div>
          <p className="section-note">Use reversal only when the whole transaction is wrong, such as wrong member or duplicate posting.</p>
        </Section>
      </div>
      <Table
        headers={["Date", "Parent", "Member", "Amount", "Status", "Remarks"]}
        rows={reversalRows.map((item) => {
          const member = state.members.find((entry) => entry.id === item.memberId);
          return [
            item.transactionDate,
            item.parentTransactionId ?? "-",
            member?.fullName ?? item.memberId,
            currency.format(item.amount),
            item.approvalStatus,
            item.remarks ?? ""
          ];
        })}
      />
    </Page>
  );
}

function Waivers({ state, setState, actor, setConfirmDialog, setNotification }) {
  const activeWaiverMembers = activeMembersForTransactions(state.members || []);
  const [values, setValues] = useState({
    memberId: activeWaiverMembers[0]?.id ?? "",
    waiverType: "interest",
    amount: "",
    waiverDate: toIsoDateValue(),
    reason: ""
  });
  const [errors, setErrors] = useState({});
  const selectedMember = state.members.find((member) => String(member.id) === String(values.memberId));
  useEffect(() => {
    if (!selectedMember || !isMemberActive(selectedMember)) {
      setValues((current) => ({ ...current, memberId: activeWaiverMembers[0]?.id ?? "" }));
    }
  }, [selectedMember?.id, selectedMember?.status, selectedMember?.inactiveDate, activeWaiverMembers.length]);
  const dueDate = getLoanDueDate(state.groups?.[0]);
  const interestDue = selectedMember
    ? calculateMemberLoanInterestDue(selectedMember, state, dueDate)
    : 0;
  const penaltyDue = selectedMember
    ? (state.rpcPendingDues || [])
        .filter((row) => String(row.member_id ?? row.memberId ?? "") === String(selectedMember.id))
        .reduce((sum, row) => sum + Number(row.penalty_due ?? row.penaltyDue ?? 0), 0)
    : 0;
  const maxWaiver = values.waiverType === "interest" ? interestDue : penaltyDue;
  const waiverRows = (state.transactions || []).filter((item) => item.transactionType === "Waiver");

  function submit(event) {
    event.preventDefault();
    const amount = Number(values.amount || 0);
    const nextErrors = {};
    if (!selectedMember) nextErrors.memberId = "Select a member.";
    if (selectedMember && !isMemberActive(selectedMember)) nextErrors.memberId = "Inactive members cannot receive waiver transactions.";
    if (!amount || amount <= 0) nextErrors.amount = "Enter waiver amount.";
    if (amount > maxWaiver) nextErrors.amount = `Maximum ${values.waiverType} waiver is ${currency.format(maxWaiver)}.`;
    if (!values.reason.trim()) nextErrors.reason = "Add reason for waiver.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setConfirmDialog({
      title: "Create waiver",
      message: `Create ${values.waiverType} waiver of ${currency.format(amount)} for ${selectedMember.fullName}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
          const allocation = values.waiverType === "interest"
            ? { interest: -Math.abs(amount) }
            : { penalty: -Math.abs(amount) };
          const created = await repository.createTransaction({
            groupId: state.groups[0]?.id,
            memberId: selectedMember.id,
            periodId: getOpenPeriod(state.periods || [])?.id ?? null,
            transactionDate: values.waiverDate,
            amount: -Math.abs(amount),
            transactionType: "Waiver",
            approvalStatus: hasGroupApprovers ? "Pending" : "Completed",
            remarks: `${values.waiverType} waiver: ${values.reason.trim()}`,
            allocation
          });
          const approvalRecord = hasGroupApprovers
            ? createConfiguredApprovalRecords({
                state,
                action: `${values.waiverType === "interest" ? "Interest" : "Penalty"} waiver`,
                requester: actor.name,
                amount,
                referenceId: created.id,
                referenceType: "transaction"
              })
            : [];
          const persistedApprovals = approvalRecord.length && repository.isConfigured()
            ? await repository.createApprovalRequests({ groupId: state.groups[0]?.id, approvals: approvalRecord })
            : approvalRecord;
          setState((current) => audit({
            state: {
              ...current,
              transactions: [created, ...current.transactions],
              approvals: [...persistedApprovals, ...current.approvals],
              notifications: hasGroupApprovers
                ? [
                    { id: makeId("ntf"), groupId: state.groups[0]?.id, title: "Waiver approval requested", body: `${actor.name} submitted ${currency.format(amount)} ${values.waiverType} waiver for ${selectedMember.fullName}.`, type: "info", createdAt: new Date().toISOString() },
                    ...current.notifications
                  ]
                : current.notifications
            },
            actor,
            action: "waive",
            tableName: "member_transaction_header",
            recordId: created.id,
            newValue: created
          }));
          setNotification({ type: "success", message: hasGroupApprovers ? "Waiver submitted for approval." : "Waiver completed." });
          setValues({ memberId: activeWaiverMembers[0]?.id ?? "", waiverType: "interest", amount: "", waiverDate: toIsoDateValue(), reason: "" });
          await refreshTenantData();
        } catch (error) {
          setNotification({ type: "error", message: `Unable to create waiver: ${error.message}`, details: serializeError(error) });
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  return (
    <Page title="Waivers" subtitle="Waive interest or penalty using an approved correction entry" action={null}>
      <div className="two-column">
        <FormCard title="New waiver" onSubmit={submit}>
          <SelectField
            label="Member"
            value={values.memberId}
            onChange={(memberId) => setValues({ ...values, memberId })}
            options={activeWaiverMembers.map((member) => ({ label: member.fullName, value: member.id }))}
            error={errors.memberId}
          />
          <SelectField
            label="Waiver type"
            value={values.waiverType}
            onChange={(waiverType) => setValues({ ...values, waiverType })}
            options={[
              { label: "Interest", value: "interest" },
              { label: "Penalty", value: "penalty" }
            ]}
          />
          <Field label="Waiver amount" type="number" value={values.amount} onChange={(amount) => setValues({ ...values, amount })} error={errors.amount} />
          <Field label="Waiver date" type="date" value={values.waiverDate} onChange={(waiverDate) => setValues({ ...values, waiverDate })} />
          <Field label="Reason" value={values.reason} onChange={(reason) => setValues({ ...values, reason })} error={errors.reason} />
        </FormCard>
        <Section title="Waiver limit">
          <div className="status-row">
            <div>
              <strong>Interest due</strong>
              <p>{currency.format(interestDue)}</p>
            </div>
            <div>
              <strong>Penalty due</strong>
              <p>{currency.format(penaltyDue)}</p>
            </div>
          </div>
          <p className="section-note">Waiver cannot be more than the selected due amount. If approvers are configured, this entry affects dues only after approval.</p>
        </Section>
      </div>
      <Table
        headers={["Date", "Member", "Amount", "Status", "Remarks"]}
        rows={waiverRows.map((item) => {
          const member = state.members.find((entry) => String(entry.id) === String(item.memberId));
          return [
            item.transactionDate,
            member?.fullName ?? item.memberId,
            currency.format(item.amount),
            statusWithPendingApprover(item, state.approvals),
            item.remarks ?? ""
          ];
        })}
      />
    </Page>
  );
}

function ProductOwnerSupport({ state, setState, selectedGroupId, setSelectedGroupId, setNotification }) {
  const [replyById, setReplyById] = useState({});
  const scopedMembers = state.members || [];
  const scopedSubscriptions = state.subscriptions || [];
  const subscribedGroupIds = new Set((state.subscriptions || []).map((subscription) => String(subscription.groupId)));
  const disputes = state.disputes || [];
  const totalSubscriptionAmount = scopedSubscriptions.reduce((sum, subscription) => sum + Number(subscription.amount || 0), 0);
  const activeUsers = scopedMembers.filter((member) => member.status === "Active").length;
  const subscriptionByPlan = Object.entries(scopedSubscriptions.reduce((memo, subscription) => {
    const plan = subscription.plan || "Unknown";
    memo[plan] = (memo[plan] || 0) + 1;
    return memo;
  }, {}));
  const monthRows = getProductOwnerMonthRows(state.groups || [], state.members || [], state.subscriptions || []);

  async function reply(dispute) {
    const text = replyById[dispute.dispute_id]?.trim();
    if (!text) {
      setNotification({ type: "error", message: "Enter a reply before sending." });
      return;
    }
    try {
      await repository.replyDispute(dispute.dispute_id, text);
      setState((current) => ({
        ...current,
        disputes: (current.disputes || []).map((item) =>
          String(item.dispute_id) === String(dispute.dispute_id)
            ? { ...item, owner_reply: text, status: "REPLIED" }
            : item
        )
      }));
      setNotification({ type: "success", message: "Reply saved." });
    } catch (error) {
      setNotification({ type: "error", message: `Unable to save reply: ${error.message}`, details: serializeError(error) });
    }
  }

  return (
    <Page title="Product Owner" subtitle="Platform dashboard, subscriptions, growth, groups, users and support disputes" action={null}>
      <MetricGrid
        metrics={[
          ["Total groups", String(state.groups.length), Landmark],
          ["Subscribed groups", String(subscribedGroupIds.size), CreditCard],
          ["Subscription collection", currency.format(totalSubscriptionAmount), IndianRupee],
          ["Total users", String(scopedMembers.length), Users],
          ["Active users", String(activeUsers), CheckCircle2],
          ["Subscriptions per user", scopedMembers.length ? (scopedSubscriptions.length / scopedMembers.length).toFixed(2) : "0", WalletCards]
        ]}
      />
      <div className="two-column">
        <Section title="Subscription mix">
          <Table
            headers={["Plan", "Subscriptions"]}
            rows={subscriptionByPlan.length ? subscriptionByPlan.map(([plan, count]) => [plan, count]) : [["No active plan", 0]]}
          />
        </Section>
        <Section title="Monthly growth">
          <Table
            headers={["Month", "New groups", "New users", "New subscriptions", "Subscription amount"]}
            rows={monthRows.map((row) => [
              row.month,
              row.groups,
              row.users,
              row.subscriptions,
              currency.format(row.amount)
            ])}
          />
        </Section>
      </div>
      <Section title="Groups overview">
        <Table
          headers={["Group", "Code", "Members", "Subscription", "Created"]}
          rows={(state.groups || []).slice(0, 25).map((group) => {
            const groupMembers = state.members.filter((member) => String(member.groupId) === String(group.id));
            const subscription = state.subscriptions.find((item) => String(item.groupId) === String(group.id));
            return [
              group.name,
              group.code,
              groupMembers.length,
              subscription?.plan ?? "Not subscribed",
              group.createdDate ? new Date(group.createdDate).toLocaleDateString("en-IN") : ""
            ];
          })}
        />
      </Section>
      <Section title="Disputes">
        <div className="chat-list">
          {disputes.length === 0 ? (
            <p className="section-note">No disputes for this selection.</p>
          ) : disputes.map((dispute) => (
            <article className="chat-window" key={dispute.dispute_id}>
              <div className="chat-meta">
                <strong>{dispute.group_name || "Group"} / {dispute.member_name}</strong>
                <span className="pill">{dispute.status}</span>
              </div>
              <p className="section-note">Contact: {dispute.contact_number}</p>
              <div className="chat-bubble chat-sent">
                <small>User sent</small>
                <p>{dispute.issue}</p>
              </div>
              {dispute.attachment_name && (
                <p className="section-note">
                  Attachment: {dispute.attachment_data
                    ? <a href={dispute.attachment_data} download={dispute.attachment_name}> {dispute.attachment_name}</a>
                    : dispute.attachment_name}
                </p>
              )}
              {dispute.owner_reply && (
                <div className="chat-bubble chat-reply">
                  <small>Support replied</small>
                  <p>{dispute.owner_reply}</p>
                </div>
              )}
              <Field
                label="Reply"
                value={replyById[dispute.dispute_id] ?? ""}
                onChange={(value) => setReplyById({ ...replyById, [dispute.dispute_id]: value })}
              />
              <button type="button" className="primary-button" onClick={() => reply(dispute)}>Save reply</button>
            </article>
          ))}
        </div>
      </Section>
    </Page>
  );
}

function PendingDues({ state, setState, actor, setNotification }) {
  const memberOnly = !isGroupAdminActor(state, actor);
  const currentMember = getCurrentMember(state, actor);
  const currentMemberId = currentMember?.id ?? actor?.memberId ?? null;

  useEffect(() => {
    let active = true;
    const groupId = state.groups?.[0]?.id;
    if (!groupId) return undefined;

    async function refreshPendingDues() {
      try {
        const pendingDues = await repository.getPendingDues({
          groupId,
          memberId: memberOnly ? currentMemberId : null,
          asOfDate: toIsoDateValue()
        });
        if (!active) return;
        setState((current) => ({
          ...current,
          rpcPendingDues: Array.isArray(pendingDues)
            ? pendingDues.map((row) => ({ ...row, groupId, group_id: groupId }))
            : []
        }));
      } catch (error) {
        console.warn("Failed to refresh pending dues", error);
      }
    }

    refreshPendingDues();
    return () => { active = false; };
  }, [state.groups?.[0]?.id, memberOnly, currentMemberId, setState]);

  const dueRows = calculatePendingDues(state, actor, memberOnly);
  function removeDue(rowId) {
    if (memberOnly) return;
    setState((current) => ({
      ...current,
      dismissedPendingDues: Array.from(new Set([...(current.dismissedPendingDues || []), rowId]))
    }));
    setNotification({ type: "success", message: "Pending due record removed from this list." });
  }

  async function copyAllPendingDues() {
    if (dueRows.length === 0) {
      setNotification({ type: "info", message: "No pending dues to copy." });
      return;
    }
    const headerLines = [
      `Pending dues for ${state.groups[0]?.name || "the group"}`,
      `Generated on ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
      ""
    ];
    const rowBlocks = dueRows.map((row) => {
      return [
        `Member: ${row.memberName}`,
        `Saving: ${currency.format(row.savingDue)}`,
        `Principal: ${currency.format(row.principalDue ?? row.outstandingPrincipal)}`,
        `Interest: ${currency.format(row.interestDue)}`,
        `Penalty: ${currency.format(row.penaltyDue)}`,
        `Total: ${currency.format(row.totalDue)}`
      ].join("\n");
    });
    const text = [
      ...headerLines,
      ...dueRows.flatMap((row, index) => {
        const sharedHeader = [
          `Month: ${row.periodName}`,
          `Due date: ${new Date(row.dueDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`
        ];
        return [...sharedHeader, rowBlocks[index], ""];
      })
    ].join("\n");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard not available");
      await navigator.clipboard.writeText(text);
      setNotification({ type: "success", message: "Pending dues copied. You can paste it anywhere." });
    } catch (error) {
      setNotification({ type: "error", message: `Unable to copy pending dues: ${error.message}`, details: serializeError(error) });
    }
  }

  function notifyMembers() {
    if (dueRows.length === 0) {
      setNotification({ type: "info", message: "No pending dues to notify." });
      return;
    }
    const rowsByMember = dueRows.reduce((memo, row) => {
      memo[row.memberId] = memo[row.memberId] || [];
      memo[row.memberId].push(row);
      return memo;
    }, {});
    const notifications = Object.entries(rowsByMember).map(([memberId, rows]) => {
      const total = rows.reduce((sum, row) => sum + row.totalDue, 0);
      const latestDue = rows.map((row) => row.dueDate).sort()[0];
      const memberName = rows[0]?.memberName || "Member";
      const body = rows.map((row) =>
        `${row.periodName}: Saving ${currency.format(row.savingDue)}, principal due ${currency.format(row.principalDue ?? row.outstandingPrincipal)}, interest ${currency.format(row.interestDue)}, penalty ${currency.format(row.penaltyDue)}, total ${currency.format(row.totalDue)}, due ${new Date(row.dueDate).toLocaleDateString("en-IN")}`
      ).join(" | ");
      return {
        id: makeId("ntf"),
        groupId: state.groups[0]?.id,
        memberId,
        recipientMemberIds: [memberId],
        title: `Payment due for ${memberName}: ${currency.format(total)}`,
        body: `Pending dues for ${memberName}: ${body}. Next due date: ${new Date(latestDue).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
        type: "warning",
        createdAt: new Date().toISOString(),
        read: false
      };
    });
    setState((current) => ({
      ...current,
      notifications: [...notifications, ...(current.notifications || [])]
    }));
    setNotification({ type: "success", message: `Sent due notifications to ${notifications.length} member(s).` });
  }

  return (
    <Page
      title="Pending Dues"
      subtitle={memberOnly ? "Your pending payment amount and due dates" : "Members who are yet to pay minimum due for current or past months"}
      action={!memberOnly ? (
        <>
          <button type="button" className="secondary-button" onClick={notifyMembers}>Notify members</button>
          <button type="button" className="secondary-button" onClick={copyAllPendingDues}>Copy pending dues</button>
        </>
      ) : null}
    >
      <Table
        headers={["Month", "Member", "Due date", "Saving", "Principal due", "Interest", "Penalty", "Total to pay", ...(!memberOnly ? ["Action"] : [])]}
        rows={dueRows.map((row) => [
          row.periodName,
          row.memberName,
          new Date(row.dueDate).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
          currency.format(row.savingDue),
          currency.format(row.principalDue ?? row.outstandingPrincipal),
          currency.format(row.interestDue),
          currency.format(row.penaltyDue),
          currency.format(row.totalDue),
          ...(!memberOnly ? [<button type="button" className="secondary-button" onClick={() => removeDue(row.id)}>Remove</button>] : [])
        ])}
      />
      {dueRows.length === 0 && (
        <Section title="No pending dues">
          <p className="section-note">No member has pending minimum due for the current or past months.</p>
        </Section>
      )}
    </Page>
  );
}

function Withdrawals({ state, setState, actor, setConfirmDialog, setNotification }) {
  const requesterMember = getCurrentMember(state, actor);
  const memberOnlyRequest = !isGroupAdminActor(state, actor);
  const activeWithdrawalMembers = memberOnlyRequest && requesterMember
    ? (isMemberActive(requesterMember) ? [requesterMember] : [])
    : activeMembersForTransactions(state.members || []);
  const [values, setValues] = useState({
    memberId: memberOnlyRequest ? requesterMember?.id ?? "" : activeWithdrawalMembers[0]?.id ?? "",
    amount: "",
    requestDate: toIsoDateValue(),
    reason: ""
  });
  const [errors, setErrors] = useState({});
  const selectedMember = memberOnlyRequest
    ? requesterMember
    : state.members.find((member) => String(member.id) === String(values.memberId));
  const visibleRequests = memberOnlyRequest
    ? (state.withdrawalRequests || []).filter((request) => String(request.memberId) === String(requesterMember?.id))
    : (state.withdrawalRequests || []);
  const rpcMemberSummary = selectedMember ? (state.rpcMemberFinanceSummaries?.[String(selectedMember.id)] || null) : null;
  const shareAmount = Number(rpcMemberSummary?.share_amount ?? rpcMemberSummary?.shareAmount ?? 0);
  const outstanding = Number(rpcMemberSummary?.outstanding ?? 0);
  const availableShare = Math.max(0, shareAmount - outstanding);
  const rpcGroupSummary = state.rpcGroupFinanceSummaries?.[String(state.groups?.[0]?.id)] || null;
  const remainingAccountBalance = Math.max(0, Number(rpcGroupSummary?.remaining_balance ?? rpcGroupSummary?.remainingBalance ?? 0));
  const withdrawableAmount = Math.min(availableShare, remainingAccountBalance);

  useEffect(() => {
    if (memberOnlyRequest && requesterMember?.id && String(values.memberId) !== String(requesterMember.id)) {
      setValues((current) => ({ ...current, memberId: requesterMember.id }));
    }
    if (!memberOnlyRequest && (!selectedMember || !isMemberActive(selectedMember))) {
      setValues((current) => ({ ...current, memberId: activeLoanMembers[0]?.id ?? "" }));
    }
  }, [memberOnlyRequest, requesterMember?.id, values.memberId]);

  function submit(event) {
    event.preventDefault();
    const amount = Number(values.amount || 0);
    const nextErrors = {};
    if (!selectedMember) nextErrors.memberId = "Select a member.";
    if (selectedMember && !isMemberActive(selectedMember)) nextErrors.memberId = "Inactive members cannot request withdrawals.";
    if (!amount || amount <= 0) nextErrors.amount = "Enter withdrawal amount.";
    if (amount > availableShare) nextErrors.amount = `Maximum available share is ${currency.format(availableShare)} after loan, interest and penalty.`;
    if (amount > remainingAccountBalance) nextErrors.amount = `Maximum available account balance is ${currency.format(remainingAccountBalance)}.`;
    if (!values.requestDate) nextErrors.requestDate = "Select request date.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setConfirmDialog({
      title: "Submit withdrawal request",
      message: `Submit withdrawal request of ${currency.format(amount)} for ${selectedMember.fullName}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
          const localRequest = {
            id: makeId("wr"),
            requestNumber: makeId("WR"),
            groupId: state.groups[0]?.id,
            memberId: selectedMember.id,
            memberName: selectedMember.fullName,
            amount,
            requestDate: values.requestDate,
            reason: values.reason.trim(),
            status: hasGroupApprovers ? "REQUESTED" : "COMPLETED",
            approvalStatus: hasGroupApprovers ? "Pending" : "Completed"
          };
          const createdRequest = repository.isConfigured()
            ? await repository.createWithdrawalRequest({
                ...localRequest,
                approvalStatus: hasGroupApprovers ? "Pending" : "Completed"
              })
            : localRequest;

          const approvalRecord = hasGroupApprovers
            ? createConfiguredApprovalRecords({
                state,
                action: "Withdrawal request",
                requester: actor.name,
                amount,
                referenceId: createdRequest.id,
                referenceType: "withdrawal_request"
              })
            : [];
          const persistedApprovals = approvalRecord.length && repository.isConfigured()
            ? await repository.createApprovalRequests({ groupId: state.groups[0]?.id, approvals: approvalRecord })
            : approvalRecord;

          setState((current) => audit({
            state: {
              ...current,
              withdrawalRequests: [createdRequest, ...(current.withdrawalRequests || [])],
              transactions: hasGroupApprovers
                ? current.transactions
                : [makeWithdrawalTransaction(createdRequest), ...current.transactions],
              approvals: [...persistedApprovals, ...current.approvals],
              notifications: hasGroupApprovers
                ? [
                    { id: makeId("ntf"), groupId: state.groups[0]?.id, title: "Withdrawal approval requested", body: `${selectedMember.fullName} requested ${currency.format(amount)} withdrawal.`, type: "info", createdAt: new Date().toISOString() },
                    ...current.notifications
                  ]
                : current.notifications
            },
            actor,
            action: "create",
            tableName: "withdrawal_requests",
            recordId: createdRequest.id,
            newValue: createdRequest
          }));
          setNotification({ type: "success", message: hasGroupApprovers ? "Withdrawal request submitted for approval." : "Withdrawal request completed." });
          setValues({ memberId: memberOnlyRequest ? requesterMember?.id ?? "" : activeWithdrawalMembers[0]?.id ?? "", amount: "", requestDate: toIsoDateValue(), reason: "" });
        } catch (error) {
          setNotification({ type: "error", message: `Unable to submit withdrawal request: ${error.message}`, details: serializeError(error) });
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  return (
    <Page title={memberOnlyRequest ? "Request Withdrawal" : "Withdrawals"} subtitle={memberOnlyRequest ? "Request withdrawal for yourself" : "Create withdrawal requests for any member"} action={null}>
      <FormCard title="New withdrawal request" onSubmit={submit}>
        {memberOnlyRequest ? (
          <Field label="Member" value={selectedMember?.fullName ?? actor?.name ?? ""} onChange={() => {}} />
        ) : (
          <SelectField label="Member" required value={values.memberId} onChange={(memberId) => setValues({ ...values, memberId })} options={activeWithdrawalMembers.map((member) => ({ label: member.fullName, value: member.id }))} error={errors.memberId} />
        )}
        <Field label="Withdrawal amount" required type="number" value={values.amount} onChange={(amount) => setValues({ ...values, amount })} error={errors.amount} />
        <Field label="Request date" required type="date" value={values.requestDate} onChange={(requestDate) => setValues({ ...values, requestDate })} error={errors.requestDate} />
        <Field label="Reason" value={values.reason} onChange={(reason) => setValues({ ...values, reason })} />
        <p className="section-note">Withdrawable amount: {currency.format(withdrawableAmount)} / Member share after dues: {currency.format(availableShare)} / Account balance: {currency.format(remainingAccountBalance)}</p>
      </FormCard>
      <Table
        headers={["Date", "Number", "Member", "Amount", "Status", "Reason"]}
        rows={visibleRequests.map((request) => [
          request.requestDate,
          request.requestNumber ?? request.id,
          request.memberName || state.members.find((member) => String(member.id) === String(request.memberId))?.fullName || request.memberId,
          currency.format(request.amount),
          statusWithPendingApprover({ ...request, requestId: request.id }, state.approvals, "withdrawal_request"),
          request.reason || ""
        ])}
      />
    </Page>
  );
}

function Loans({ state, setState, actor, setConfirmDialog, setNotification, ensureLatestTenantData }) {
  useEffect(() => { ensureLatestTenantData(); }, [ensureLatestTenantData]);
  const requesterMember = getCurrentMember(state, actor);
  const memberOnlyRequest = !isGroupAdminActor(state, actor);
  const activeLoanMembers = memberOnlyRequest && requesterMember
    ? (isMemberActive(requesterMember) ? [requesterMember] : [])
    : activeMembersForTransactions(state.members || []);
  const [values, setValues] = useState({
    memberId: memberOnlyRequest ? requesterMember?.id ?? "" : activeLoanMembers[0]?.id ?? "",
    amount: "",
    reason: "",
    startDate: toIsoDateValue()
  });
  const [errors, setErrors] = useState({});
  const selectedMember = memberOnlyRequest ? requesterMember : state.members.find((member) => String(member.id) === String(values.memberId));
  const visibleLoanMembers = activeLoanMembers;
  const visibleLoans = (memberOnlyRequest
    ? state.loans.filter((loanItem) => loanBelongsToMember(loanItem, requesterMember))
    : state.loans)
    .filter((loanItem) => isPendingFinancialStatus(loanItem.approvalStatus || loanItem.status) || isWithinPastDays(loanItem.startDate, 60) || Number(loanItem.principalOutstanding || 0) > 0);

  useEffect(() => {
    if (memberOnlyRequest && requesterMember?.id && String(values.memberId) !== String(requesterMember.id)) {
      setValues((current) => ({ ...current, memberId: requesterMember.id }));
    }
    if (!memberOnlyRequest && (!selectedMember || !isMemberActive(selectedMember))) {
      setValues((current) => ({ ...current, memberId: activeLoanMembers[0]?.id ?? "" }));
    }
  }, [memberOnlyRequest, requesterMember?.id, values.memberId]);

  async function submit(event) {
    event.preventDefault();
    const periodResult = canPostTransaction(state.periods || [], values.startDate);
    if (!periodResult.allowed) {
      setErrors((current) => ({ ...current, startDate: periodResult.reason }));
      setNotification({ type: "error", message: periodResult.reason });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    const setup = getEffectiveMemberSetup(selectedMember, state.groups[0] ?? {});
    const effectiveRate = setup.interestRate;
    const effectiveDuration = setup.loanTenureMonths;
    const result = validate(loanSchema, { ...values, rate: effectiveRate, durationMonths: effectiveDuration });
    if (!selectedMember) {
      setErrors((current) => ({ ...current, memberId: "Create or select a member first." }));
      return;
    }
    if (!isMemberActive(selectedMember)) {
      setErrors((current) => ({ ...current, memberId: "Inactive members cannot request or receive loans." }));
      setNotification({ type: "error", message: "Inactive members cannot request or receive loans." });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    // Check if loan start date is before member joining date
    const memberJoinDate = selectedMember?.dateJoined;
    const loanStartDate = values.startDate;
    if (memberJoinDate && loanStartDate < memberJoinDate) {
      setConfirmDialog({
        title: "Loan start date before joining date",
        message: `The loan start date (${loanStartDate}) is before the member's joining date (${memberJoinDate}). Would you like to update the member's joining date to allow this loan?`,
        onConfirm: async () => {
          setConfirmDialog(null);
          try {
            await repository.updateMember(selectedMember.id, { dateJoined: loanStartDate });
            setState((current) => ({
              ...current,
              members: current.members.map((member) =>
                String(member.id) === String(selectedMember.id)
                  ? { ...member, dateJoined: loanStartDate }
                  : member
              )
            }));
            setNotification({ type: "success", message: `Member's joining date updated to ${loanStartDate}. You can now proceed with the loan.` });
            setTimeout(() => setNotification(null), 3000);
          } catch (error) {
            setNotification({ type: "error", message: `Failed to update joining date: ${error.message}` });
            setTimeout(() => setNotification(null), 4000);
          }
        },
        onCancel: () => {
          setConfirmDialog(null);
          setErrors((current) => ({ ...current, startDate: "Loan start date cannot be before member joining date." }));
          setNotification({ type: "error", message: "Loan start date must be on or after the member's joining date." });
          setTimeout(() => setNotification(null), 4000);
        }
      });
      return;
    }

    const remainingBalance = Math.max(0, Number((state.rpcGroupFinanceSummaries?.[String(selectedGroup?.id)] || state.rpcGroupFinanceSummaries?.[state.groups?.[0]?.id] || null)?.remaining_balance ?? (state.rpcGroupFinanceSummaries?.[String(selectedGroup?.id)] || state.rpcGroupFinanceSummaries?.[state.groups?.[0]?.id] || null)?.remainingBalance ?? 0));
    const setupLimit = setup.loanLimit;
    const loanLimit = setupLimit > 0 ? setupLimit : remainingBalance;
    const eligibleAmount = Math.min(remainingBalance, loanLimit);
    const amount = Number(values.amount || 0);
    const amountError = amount > eligibleAmount
      ? `Maximum eligible loan is ${currency.format(eligibleAmount)} based on available group balance and loan limit.`
      : result.errors.amount;
    setErrors({ ...result.errors, amount: amountError });
    if (!result.data || amount > eligibleAmount) return;

    const localLoan = {
      id: makeId("loan"),
      memberName: selectedMember.fullName,
      amount: result.data.amount,
      principalOutstanding: result.data.amount,
      interestOutstanding: 0,
      penaltyOutstanding: 0,
      rate: result.data.rate,
      status: "Submitted",
      reason: result.data.reason ?? "",
      durationMonths: result.data.durationMonths ?? 0,
      startDate: result.data.startDate
    };

    // Require online save when cloud sync is configured.
    if (!repository.isConfigured()) {
      setNotification({ type: 'error', message: 'Cloud sync is not configured. Enable secure storage to save loans.' });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    const primaryGroupId = state.groups[0]?.id;
    if (!isUuid(primaryGroupId) || !isUuid(selectedMember.id) || !isUuid(actor?.id)) {
      setNotification({ type: 'error', message: 'Group/member or user is not saved online. Save the group and member first.' });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setConfirmDialog({
      title: 'Submit loan request',
      message: 'Submit this loan request for approval? Loan distribution will happen only after approval.',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const approvalRequired = loanApprovalRequired(state, selectedMember);
          const createdLoan = await repository.createLoan(localLoan, primaryGroupId, selectedMember.id, actor.id, approvalRequired);
          if (!createdLoan.memberName) createdLoan.memberName = selectedMember.fullName;

          const approvalRecord = approvalRequired ? createApprovalRecords({
            state,
            action: "Loan request",
            requester: selectedMember.fullName,
            amount: createdLoan.amount,
            referenceId: createdLoan.requestId ?? createdLoan.id,
            referenceType: "loan_request",
            details: `Rate: ${Number(createdLoan.rate || effectiveRate || 0)}% monthly / Reason: ${createdLoan.reason || "Not provided"} / Request date: ${createdLoan.startDate || values.startDate}`
          }) : [];
          const persistedApprovals = approvalRequired && repository.isConfigured()
            ? await repository.createApprovalRequests({ groupId: primaryGroupId, approvals: approvalRecord })
            : approvalRecord;

          setState((current) => audit({
            state: {
              ...current,
              loans: [{
                ...createdLoan,
                status: approvalRequired ? createdLoan.status : "Active",
                approvalStatus: approvalRequired ? createdLoan.approvalStatus : "Completed",
                loanStatus: approvalRequired ? createdLoan.loanStatus : "ACTIVE",
                principalOutstanding: Number(createdLoan.amount || 0),
                interestOutstanding: 0,
                penaltyOutstanding: 0,
                startDate: createdLoan.startDate || values.startDate
              }, ...current.loans],
              approvals: [...persistedApprovals, ...current.approvals],
              notifications: [
                { id: makeId("ntf"), groupId: state.groups[0]?.id, title: approvalRequired ? "Loan approval requested" : "Loan created", body: `${selectedMember.fullName} ${approvalRequired ? `requested ${currency.format(createdLoan.amount)} on ${createdLoan.startDate || values.startDate}` : `created a loan of ${currency.format(createdLoan.amount)} on ${createdLoan.startDate || values.startDate}`} at ${Number(createdLoan.rate || effectiveRate || 0)}% monthly. Reason: ${createdLoan.reason || "Not provided"}.`, type: "info", createdAt: new Date().toISOString() },
                ...current.notifications
              ]
            },
            actor,
            action: 'create',
            tableName: 'loan_master',
            recordId: createdLoan.id,
            newValue: createdLoan
          }));

          setNotification({ type: 'success', message: approvalRequired ? 'Loan request submitted for approval.' : 'Loan created successfully.' });
          setValues({ memberId: memberOnlyRequest ? requesterMember?.id ?? "" : state.members[0]?.id ?? "", amount: "", reason: "", startDate: toIsoDateValue() });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          console.error('Create loan failed', error);
          setNotification({ type: 'error', message: `Unable to save loan online: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
        setNotification({ type: 'info', message: 'Loan not saved online.' });
        setTimeout(() => setNotification(null), 3000);
      }
    });
    return;
  }

  return (
    <Page title={memberOnlyRequest ? "Request Loan" : "Loans"} subtitle={memberOnlyRequest ? "Request a loan for yourself and track your loans" : "Loan creation, eligibility, repayment schedule and outstanding split"} action={null}>
      <FormCard title="Create loan request" onSubmit={submit}>
        {memberOnlyRequest ? (
          <Field label="Member" value={selectedMember?.fullName ?? actor?.name ?? ""} onChange={() => {}} />
        ) : (
          <SelectField label="Member" required value={values.memberId} onChange={(value) => setValues({ ...values, memberId: value })} options={visibleLoanMembers.map((member) => ({ label: member.fullName, value: member.id }))} error={errors.memberId} />
        )}
        <Field label="Loan amount" required type="number" value={values.amount} onChange={(value) => setValues({ ...values, amount: value })} error={errors.amount} />
        <div className="section-note">Interest rate (monthly): {getEffectiveMemberSetup(selectedMember, state.groups[0] ?? {}).interestRate ? `${getEffectiveMemberSetup(selectedMember, state.groups[0] ?? {}).interestRate}%` : "Not set"}</div>
        <Field label="Loan reason" value={values.reason} onChange={(value) => setValues({ ...values, reason: value })} error={errors.reason} />
        <Field label="Start date" required type="date" value={values.startDate} onChange={(value) => setValues({ ...values, startDate: value })} error={errors.startDate} />
        <div className="section-note">Interest rate (monthly) and loan tenure are taken from member setup first, then group setup. Blank tenure uses group setup; 0 means no fixed payback limit.</div>
      </FormCard>
      <div className="data-grid">
        {visibleLoans.map((loanItem) => {
          const interest = calculateLoanInterest({
            principalOutstanding: loanItem.principalOutstanding,
            monthlyRate: loanItem.rate,
            days: 30
          });
          const member = state.members.find((item) => item.id === loanItem.memberId || item.fullName === loanItem.memberName);
          const eligibility = calculateLoanEligibility({
            totalSavings: member?.savings ?? 0,
            multiplier: state.groups[0]?.maxLoanMultiplier ?? 3,
            activeLoanCount: loanItem.principalOutstanding > 0 ? 1 : 0,
            maxActiveLoans: 2,
            repaymentScore: 82
          });

          return (
            <article className="entity-card" key={loanItem.id}>
              <span className="pill">{statusWithPendingApprover(loanItem, state.approvals)}</span>
              <h3>{loanItem.memberName}</h3>
              <p>{loanItem.reason}</p>
              {isPendingFinancialStatus(loanItem.approvalStatus || loanItem.status) && (
                <p className="section-note">{statusWithPendingApprover(loanItem, state.approvals)}</p>
              )}
              <dl>
                <div><dt>Loan amount</dt><dd>{currency.format(loanItem.amount)}</dd></div>
                <div><dt>Principal due</dt><dd>{currency.format(loanItem.principalOutstanding)}</dd></div>
                <div><dt>30-day interest (monthly)</dt><dd>{currency.format(interest)}</dd></div>
                <div><dt>Eligibility</dt><dd>{eligibility.eligible ? currency.format(eligibility.limit) : eligibility.reason}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

function Approvals({ state, setState, actor, setConfirmDialog, setNotification }) {
  const adminLikeApproverView = actor?.role === roles.PRODUCT_OWNER || isGroupAdminActor(state, actor);
  const actorMembers = (state.members || []).filter((member) =>
    String(member.id) === String(actor?.memberId)
    || (member.email && actor?.email && normalizeLookup(member.email) === normalizeLookup(actor.email))
    || (member.username && actor?.username && normalizeLookup(member.username) === normalizeLookup(actor.username))
    || (member.fullName && actor?.name && normalizeLookup(member.fullName) === normalizeLookup(actor.name))
  );
  const [approvalSummary, setApprovalSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadApprovalSummary() {
      const targetGroupId = state.groups?.[0]?.id;
      if (!targetGroupId) return;
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const summary = await repository.getApprovalSummary({
          groupId: targetGroupId,
          approverMemberId: adminLikeApproverView ? null : actor?.memberId ?? actorMembers[0]?.id ?? null,
          status: "Pending",
          referenceType: null
        });
        if (!active) return;
        setApprovalSummary(summary);
      } catch (error) {
        if (!active) return;
        setSummaryError(error.message || String(error));
        setApprovalSummary(null);
      } finally {
        if (active) setSummaryLoading(false);
      }
    }
    loadApprovalSummary();
    return () => { active = false; };
  }, [state.groups, adminLikeApproverView, actor?.memberId, actor?.email, actor?.name, actor?.username, actorMembers]);

  const visibleApprovals = (approvalSummary?.pending_rows || []).map((approval) => ({
    ...approval,
    id: approval.id ?? approval.approval_id,
    batchId: approval.batch_id ?? approval.batchId,
    referenceId: approval.reference_id ?? approval.referenceId,
    referenceType: approval.reference_type ?? approval.referenceType,
    action: approval.action ?? approval.transaction_type,
    requester: approval.requester ?? approval.requester_name,
    approverId: approval.approver_member_id ?? approval.approverId,
    approverName: approval.approver_name ?? approval.approverName,
    level: approval.level ?? approval.approver_name ?? "Approver",
    status: approval.status ?? "Pending",
    amount: Number(approval.amount ?? 0),
    remarks: approval.remarks,
    details: approval.details ?? approval.remarks,
    createdAt: approval.created_at ?? approval.createdAt,
    pendingWith: approval.pending_with ?? approval.pendingWith ?? "No pending approver"
  }));

  const approvalCounts = approvalSummary?.counts ?? {
    pending_count: visibleApprovals.length,
    approved_count: 0,
    rejected_count: 0,
    returned_count: 0
  };

  async function applyDecision(id, status) {
    const targetBeforeDecision = (state.approvals || []).find((approval) => String(approval.id) === String(id));
    const approvalsAfterDecision = (state.approvals || []).map((approval) =>
      targetBeforeDecision?.batchId
        && targetBeforeDecision.batchId === approval.batchId
        && (status === "Rejected" || status === "Returned")
        && approval.status === "Pending"
        ? { ...approval, status }
        : String(approval.id) === String(id) ? { ...approval, status } : approval
    );
    const setupChangeBeforeDecision = targetBeforeDecision?.batchId
      ? (state.pendingSetupChanges || []).find((change) =>
          change.batchId === targetBeforeDecision.batchId && change.status === "Pending"
        )
      : null;
    const setupBatchAfterDecision = targetBeforeDecision?.batchId
      ? approvalsAfterDecision.filter((approval) => approval.batchId === targetBeforeDecision.batchId)
      : [];
    const setupChangeApproved = setupChangeBeforeDecision
      && status === "Approved"
      && setupBatchAfterDecision.length > 0
      && setupBatchAfterDecision.every((approval) => approval.status === "Approved");
    let setupUpdatedRecord = null;
    let persistedSetupChangeStatus = null;

    if (repository.isConfigured() && Number.isFinite(Number(id))) {
      try {
        await repository.decideApproval(id, status);
      } catch (error) {
        setNotification({ type: "error", message: `Unable to save approval decision: ${error.message}`, details: serializeError(error) });
        return;
      }
    }
    if (setupChangeApproved && repository.isConfigured()) {
      try {
        setupUpdatedRecord = setupChangeBeforeDecision.setupType === "member"
          ? await repository.updateMember(setupChangeBeforeDecision.targetId, setupChangeBeforeDecision.payload)
          : await repository.updateGroup(setupChangeBeforeDecision.targetId, setupChangeBeforeDecision.payload);
        persistedSetupChangeStatus = await repository.updatePendingSetupChangeStatus(setupChangeBeforeDecision.id, "Completed");
      } catch (error) {
        setNotification({ type: "error", message: `Approval saved, but setup update failed: ${error.message}`, details: serializeError(error) });
        return;
      }
    }
    if (setupChangeBeforeDecision && (status === "Rejected" || status === "Returned") && repository.isConfigured()) {
      try {
        persistedSetupChangeStatus = await repository.updatePendingSetupChangeStatus(setupChangeBeforeDecision.id, status === "Rejected" ? "Rejected" : "Returned");
      } catch (error) {
        setNotification({ type: "error", message: `Unable to update setup request status: ${error.message}`, details: serializeError(error) });
        return;
      }
    }
    const memberAdditionBatch = targetBeforeDecision?.batchId
      ? approvalsAfterDecision.filter((approval) => approval.batchId === targetBeforeDecision.batchId)
      : [];
    const memberAdditionApproved = targetBeforeDecision?.referenceType === "member_addition"
      && status === "Approved"
      && memberAdditionBatch.length > 0
      && memberAdditionBatch.every((approval) => approval.status === "Approved");
    if (memberAdditionApproved) {
      const groupId = targetBeforeDecision.groupId ?? state.groups?.[0]?.id;
      const activePlan = getGroupPlan(state, groupId);
      const activeMemberCount = activeMembersForTransactions(state.members || [])
        .filter((member) => String(member.id) !== String(targetBeforeDecision.referenceId))
        .length;
      if (Number.isFinite(activePlan.maxMembers) && activeMemberCount >= activePlan.maxMembers) {
        setNotification({
          type: "error",
          message: `Cannot approve member addition. The current plan allows ${activePlan.maxMembers} active members only.`
        });
        return;
      }
    }
    if (targetBeforeDecision?.referenceType === "member_addition" && repository.isConfigured()) {
      try {
        if (memberAdditionApproved) {
          await repository.updateMember(targetBeforeDecision.referenceId, { active: true });
        }
        if (status === "Rejected" || status === "Returned") {
          await repository.updateMember(targetBeforeDecision.referenceId, { active: false });
        }
      } catch (error) {
        setNotification({ type: "error", message: `Approval saved, but member status update failed: ${error.message}`, details: serializeError(error) });
        return;
      }
    }
    setState((current) => {
      const target = current.approvals.find((approval) => String(approval.id) === String(id));
      const approvals = current.approvals.map((approval) =>
        target?.batchId
          && target.batchId === approval.batchId
          && (status === "Rejected" || status === "Returned")
          && approval.status === "Pending"
          ? { ...approval, status }
          : String(approval.id) === String(id) ? { ...approval, status } : approval
      );
      let nextState = { ...current, approvals };
      const pendingSetupChange = target?.batchId
        ? (nextState.pendingSetupChanges || []).find((change) => change.batchId === target.batchId && change.status === "Pending")
        : null;

      if (target && (status === "Rejected" || status === "Returned")) {
        if (target.referenceType === "transaction") {
          nextState = {
            ...nextState,
            transactions: nextState.transactions.map((item) =>
              String(item.id) === String(target.referenceId) ? { ...item, approvalStatus: status } : item
            )
          };
        }
        if (target.referenceType === "loan" || target.referenceType === "loan_request") {
          nextState = {
            ...nextState,
            loans: nextState.loans.map((loan) =>
              String(loan.id) === String(target.referenceId) || String(loan.requestId) === String(target.referenceId)
                ? { ...loan, status, approvalStatus: status }
                : loan
            )
          };
        }
        if (target.referenceType === "withdrawal_request") {
          if (repository.isConfigured()) {
            repository.updateWithdrawalStatus(target.referenceId, status).catch((error) =>
              setNotification({ type: "error", message: `Unable to update withdrawal status: ${error.message}`, details: serializeError(error) })
            );
          }
          nextState = {
            ...nextState,
            withdrawalRequests: (nextState.withdrawalRequests || []).map((request) =>
              String(request.id) === String(target.referenceId)
                ? { ...request, approvalStatus: status, status }
                : request
              )
          };
        }
        if (target.referenceType === "legacy_group_opening") {
          if (repository.isConfigured()) {
            repository.updateLegacyGroupOpeningStatus(target.referenceId, status).catch((error) =>
              setNotification({ type: "error", message: `Unable to update legacy opening status: ${error.message}`, details: serializeError(error) })
            );
          }
          nextState = {
            ...nextState,
            legacyGroupOpenings: (nextState.legacyGroupOpenings || []).map((opening) =>
              String(opening.legacy_group_opening_id ?? opening.id) === String(target.referenceId)
                ? { ...opening, approval_status: status, approvalStatus: status }
                : opening
            )
          };
        }
        if (target.referenceType === "member_addition") {
          nextState = addGroupNotification({
            ...nextState,
            members: (nextState.members || []).map((member) =>
              String(member.id) === String(target.referenceId)
                ? { ...member, status: "Inactive", approvalStatus: status }
                : member
            )
          }, {
            title: `Member addition ${status.toLowerCase()}`,
            body: `${target.action} for member was ${status.toLowerCase()}.`,
            type: "warning"
          });
        }
          if (target.referenceType === "expense") {
            nextState = {
              ...nextState,
              expenses: (nextState.expenses || []).map((expense) =>
                String(expense.id) === String(target.referenceId) ? { ...expense, approvalStatus: status } : expense
              ),
              transactions: (nextState.transactions || []).map((transaction) =>
                String(transaction.parentExpenseId) === String(target.referenceId) ? { ...transaction, approvalStatus: status } : transaction
              )
            };
          }
        if ((target.referenceType === "group_setup" || target.referenceType === "member_setup") && pendingSetupChange) {
          nextState = addGroupNotification(rejectSetupChangeInState(nextState, pendingSetupChange, status), {
            title: `${getSetupChangeTypeLabel(pendingSetupChange.setupType)} change ${status.toLowerCase()}`,
            body: `${pendingSetupChange.targetName || "Setup"} change was ${status.toLowerCase()}. ${pendingSetupChange.changeSummary}`,
            type: "warning"
          });
        }
      }

      if (target?.batchId && status === "Approved") {
        const batch = approvals.filter((approval) => approval.batchId === target.batchId);
        const allApproved = batch.length > 0 && batch.every((approval) => approval.status === "Approved");
        if (allApproved) {
          if (target.referenceType === "transaction") {
            const transaction = nextState.transactions.find((item) => String(item.id) === String(target.referenceId));
            const updatedTransactions = nextState.transactions.map((item) =>
              String(item.id) === String(target.referenceId) ? { ...item, approvalStatus: "Completed" } : item
            );
            nextState = {
              ...nextState,
              transactions: updatedTransactions
            };
            if (transaction) {
              const rpcSummary = (nextState.rpcMemberFinanceSummaries || {})[String(transaction.memberId)] || null;
              nextState = {
                ...nextState,
                members: nextState.members.map((member) => String(member.id) === String(transaction.memberId)
                  ? {
                      ...member,
                      savings: Number(rpcSummary?.savings ?? member.savings ?? 0),
                      loanOutstanding: Math.max(0, Number(member.loanOutstanding || 0) - Number(transaction.allocation?.principal || 0))
                    }
                  : member
                )
              };
            }
          }
          if (target.referenceType === "loan" || target.referenceType === "loan_request") {
            nextState = {
              ...nextState,
              loans: nextState.loans.map((loan) =>
                String(loan.id) === String(target.referenceId) || String(loan.requestId) === String(target.referenceId)
                  ? {
                      ...loan,
                      status: "Active",
                      approvalStatus: "Completed",
                      principalOutstanding: Number(loan.amount || 0),
                      loanStatus: "ACTIVE",
                      startDate: loan.startDate || toIsoDateValue(new Date())
                    }
                  : loan
              )
            };
          }
          if (target.referenceType === "expense") {
            nextState = {
              ...nextState,
              expenses: (nextState.expenses || []).map((expense) =>
                String(expense.id) === String(target.referenceId) ? { ...expense, approvalStatus: "Completed" } : expense
              ),
              transactions: (nextState.transactions || []).map((transaction) =>
                String(transaction.parentExpenseId) === String(target.referenceId) ? { ...transaction, approvalStatus: "Completed" } : transaction
              )
            };
          }
          if (target.referenceType === "withdrawal_request") {
            if (repository.isConfigured()) {
              repository.updateWithdrawalStatus(target.referenceId, "Completed").catch((error) =>
                setNotification({ type: "error", message: `Unable to complete withdrawal: ${error.message}`, details: serializeError(error) })
              );
            }
            const request = (nextState.withdrawalRequests || []).find((item) => String(item.id) === String(target.referenceId));
            const withdrawalAlreadyPosted = (nextState.transactions || []).some((transaction) => String(transaction.withdrawalRequestId) === String(target.referenceId));
            nextState = {
              ...nextState,
              withdrawalRequests: (nextState.withdrawalRequests || []).map((request) =>
                String(request.id) === String(target.referenceId)
                  ? { ...request, approvalStatus: "Completed", status: "Completed" }
                  : request
              ),
              transactions: request && !withdrawalAlreadyPosted
                ? [makeWithdrawalTransaction({ ...request, approvalStatus: "Completed", status: "Completed" }), ...(nextState.transactions || [])]
                : nextState.transactions
            };
          }
          if (target.referenceType === "legacy_group_opening") {
            if (repository.isConfigured()) {
              repository.updateLegacyGroupOpeningStatus(target.referenceId, "Completed").catch((error) =>
                setNotification({ type: "error", message: `Unable to complete legacy opening: ${error.message}`, details: serializeError(error) })
              );
            }
            nextState = {
              ...nextState,
              legacyGroupOpenings: (nextState.legacyGroupOpenings || []).map((opening) =>
                String(opening.legacy_group_opening_id ?? opening.id) === String(target.referenceId)
                  ? { ...opening, approval_status: "Completed", approvalStatus: "Completed" }
                  : opening
              )
            };
          }
          if (target.referenceType === "member_addition") {
            nextState = addGroupNotification({
              ...nextState,
              members: (nextState.members || []).map((member) =>
                String(member.id) === String(target.referenceId)
                  ? { ...member, status: "Active", approvalStatus: "Completed" }
                  : member
              )
            }, {
              title: "Member addition approved",
              body: "Member is now active in the group.",
              type: "success"
            });
          }
          if ((target.referenceType === "group_setup" || target.referenceType === "member_setup") && pendingSetupChange) {
            nextState = addGroupNotification(applySetupChangeToState(nextState, pendingSetupChange, setupUpdatedRecord), {
              title: `${getSetupChangeTypeLabel(pendingSetupChange.setupType)} changed`,
              body: `${pendingSetupChange.targetName || "Setup"} setup change was approved. ${pendingSetupChange.changeSummary}`,
              type: "success"
            });
          }
          nextState = addGroupNotification(nextState, {
            title: "Approval completed",
            body: `${target.action} was approved by all required approvers.`,
            type: "success"
          });
        }
      }

      return audit({
        state: nextState,
        actor,
        action: status.toLowerCase(),
        tableName: "approvals",
        recordId: id
      });
    });
  }

  function decide(id, status) {
    const approval = state.approvals.find((item) => item.id === id);
    if (!approval || approval.status !== "Pending") return;
    if (!adminLikeApproverView && !isApprovalAssignedToActor(approval, actor, actorMembers)) {
      setNotification({ type: "error", message: "This approval is pending with another approver." });
      return;
    }
    setConfirmDialog({
      title: `${status} approval`,
      message: `Confirm ${status.toLowerCase()} for ${approval.action}? This action cannot be changed from this screen.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        await applyDecision(id, status);
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  return (
    <Page title="Approvals" subtitle="Two-level workflow for sensitive financial actions" action={null}>
      <Section title="Approval summary">
        <div className="status-row">
          <div>
            <strong>Pending</strong>
            <p>{approvalCounts.pending_count ?? visibleApprovals.length}</p>
          </div>
          <div>
            <strong>Approved</strong>
            <p>{approvalCounts.approved_count ?? 0}</p>
          </div>
          <div>
            <strong>Rejected</strong>
            <p>{approvalCounts.rejected_count ?? 0}</p>
          </div>
          <div>
            <strong>Returned</strong>
            <p>{approvalCounts.returned_count ?? 0}</p>
          </div>
        </div>
        {summaryLoading && <p className="section-note">Loading approval summary…</p>}
        {summaryError && <p className="section-note error-text">{summaryError}</p>}
      </Section>
      <div className="approval-list">
        {visibleApprovals.map((approval) => {
          const assignedToActor = isApprovalAssignedToActor(approval, actor, actorMembers);
          const canDecide = approval.status === "Pending" && (adminLikeApproverView || assignedToActor);
          return (
            <article className="entity-card compact-card" key={approval.id}>
              <span className="pill">{approval.status}</span>
              <h3>{approval.action}</h3>
              <p>{approval.requester} / Pending with {approval.pendingWith || "No pending approver"} / {approval.amount ? currency.format(approval.amount) : "No amount"}</p>
              {approval.details && <p className="section-note">{approval.details}</p>}
              <div className="button-row">
                <button type="button" disabled={!canDecide} onClick={() => decide(approval.id, "Approved")}>Approve</button>
                <button type="button" disabled={!canDecide} onClick={() => decide(approval.id, "Rejected")}>Reject</button>
                <button type="button" disabled={!canDecide} onClick={() => decide(approval.id, "Returned")}>Return</button>
              </div>
            </article>
          );
        })}
        {visibleApprovals.length === 0 && <p className="section-note">No pending approvals assigned to your login.</p>}
      </div>
    </Page>
  );
}

function Reports({ state, actor, setNotification }) {
  const todayIso = toIsoDateValue();
  const [draftEndDate, setDraftEndDate] = useState(todayIso);
  const [reportRange, setReportRange] = useState({ endDate: todayIso });
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadReport() {
      if (!state.groups?.[0]?.id) return;
      setReportLoading(true);
      setReportError(null);
      try {
        const payload = await repository.getReportSummary({
          groupId: state.groups[0].id,
          memberId: null,
          startDate: null,
          endDate: reportRange.endDate,
          asOfDate: reportRange.endDate
        });

        if (!active) return;
        setReportData(payload ?? {});
      } catch (error) {
        if (!active) return;
        setReportError(error.message || String(error));
        // ensure reportData is an object to avoid downstream crashes
        setReportData({});
      } finally {
        if (active) setReportLoading(false);
      }
    }
    loadReport();
    return () => { active = false; };
  }, [state.groups, reportRange.endDate]);

  const groupHeaders = groupReportHeaders;
  const memberHeaders = memberReportHeaders;
  const { groupRows, memberRows } = getReportSummaryRows(reportData, state.groups?.[0]?.name || "Group");

  const reportText = formatReportTablesText({
    title: `Bachat Gat report till ${reportRange.endDate}`,
    sections: [
      { title: "Group summary", headers: groupHeaders, rows: groupRows },
      { title: "Member summary", headers: memberHeaders, rows: memberRows }
    ]
  });

  async function copyReportText() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Bachat Gat Report", text: reportText });
        setNotification?.({ type: "success", message: "Report shared." });
        return;
      }
      await navigator.clipboard.writeText(reportText);
      setNotification?.({ type: "success", message: "Report copied. You can paste it in WhatsApp or any other app." });
    } catch (error) {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(reportText);
        setNotification?.({ type: "success", message: "Report copied. You can paste it in WhatsApp or any other app." });
        return;
      }
      setNotification?.({ type: "error", message: `Unable to share report: ${error.message}`, details: serializeError(error) });
    }
  }

  return (
    <Page title="Reports & Audit" subtitle="Group and member financial summary for selected dates" action={null}>
      <Section title="Report dates">
        <form
          className="form-grid single-control-form report-generate-form"
          onSubmit={(event) => {
            event.preventDefault();
            const nextEndDate = draftEndDate || todayIso;
            setReportRange({ endDate: nextEndDate });
          }}
        >
          <Field label="Report till date" type="date" value={draftEndDate} onChange={setDraftEndDate} />
          <button className="primary-button" type="submit">Generate report</button>
        </form>
        <p className="section-note">Showing values till {reportRange.endDate}.</p>
      </Section>
      <Section title="Group summary">
        <div className="button-row" style={{ marginBottom: 14 }}>
          <button type="button" className="secondary-button" onClick={copyReportText}>Copy / Share report</button>
        </div>
        <Table
          headers={groupHeaders}
          rows={groupRows}
        />
      </Section>
      <Section title="Member summary">
        <Table
          headers={memberHeaders}
          rows={memberRows}
        />
      </Section>
    </Page>
  );
}




export default App;
