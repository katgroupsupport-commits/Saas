import React, { useEffect, useState, useMemo } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  CalendarCheck,
  Calculator,
  Camera,
  CheckCircle2,
  CreditCard,
  FileClock,
  FileBarChart,
  IndianRupee,
  Landmark,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  BotMessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Undo2,
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
import { isSupabaseConfigured } from "./lib/supabase";
import { audit, initialState, loadState, makeId, saveState } from "./services/storage";
import { groupSchema, loanSchema, legacyMigrationSchema, memberSchema, otpPasswordSchema, passwordResetSchema, registerSchema, transactionSchema, validate } from "./services/validation";
import { repository } from "./services/repository";
import {
  allocationPaidForMember,
  allocationWaivedForMember,
  buildOpeningShareRatioRows,
  calculateDerivedLoanOutstanding,
  calculateDerivedLoanPrincipalOutstanding,
  calculateDerivedOpeningSurplus,
  calculateDashboardCards,
  calculateGroupFinanceSummary,
  calculateMemberDashboardCards,
  calculateMemberFinanceSummary,
  calculateMemberLedgerSummary,
  calculateMemberLoanInterestDue,
  calculateMemberLoanInterestDueDetails,
  calculatePendingDues,
  calculateLoanOutstandingWithDues,
  configuredNumber,
  financeFieldDictionary,
  getCompletedTransactions,
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

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const GROUP_EXPENSE_MEMBER_ID = "__GROUP_EXPENSE__";
const SUPABASE_BOOT_TIMEOUT_MS = 12000;

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out. Please check your internet connection and try again.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

const bilingualLabels = {
  Dashboard: "डॅशबोर्ड (Dashboard)",
  "Group Dashboard": "गट डॅशबोर्ड (Group Dashboard)",
  "Member Dashboard": "सभासद डॅशबोर्ड (Member Dashboard)",
  "My Dashboard": "माझा डॅशबोर्ड (My Dashboard)",
  Members: "सभासद (Members)",
  Setup: "सेटअप (Setup)",
  Operations: "व्यवहार (Operations)",
  Transactions: "व्यवहार (Transactions)",
  Loans: "कर्ज (Loans)",
  Withdrawals: "पैसे काढणे (Withdrawals)",
  "Pending Dues": "बाकी रक्कम (Pending Dues)",
  Corrections: "दुरुस्ती (Corrections)",
  Approvals: "मंजुरी (Approvals)",
  "Reports & Audit": "रिपोर्ट व ऑडिट (Reports & Audit)",
  Contact: "संपर्क (Contact)",
  Subscriptions: "सबस्क्रिप्शन (Subscriptions)",
  "AI Agent": "AI सहाय्यक (AI Agent)",
  "User Guide": "वापर मार्गदर्शक (User Guide)",
  "Full name": "पूर्ण नाव (Full Name)",
  Member: "सभासद (Member)",
  Email: "ईमेल (Email)",
  Mobile: "मोबाईल (Mobile)",
  Username: "युजरनेम (Username)",
  Savings: "बचत (Savings)",
  Loan: "कर्ज (Loan)",
  Status: "स्थिती (Status)",
  Amount: "रक्कम (Amount)",
  Interest: "व्याज (Interest)",
  Penalty: "दंड (Penalty)",
  Principal: "मुद्दल (Principal)",
  Excess: "जादा (Excess)",
  "Total savings": "एकूण बचत (Total Savings)",
  "Collected in period": "कालावधीतील जमा (Collected)",
  "Active loan amount": "सक्रिय कर्ज रक्कम (Active Loan)",
  "Remaining balance": "शिल्लक रक्कम (Remaining Balance)",
  "Active loans": "सक्रिय कर्जे (Active Loans)",
  "Open period": "चालू महिना (Open Period)",
  "Share amount": "हिस्सा रक्कम (Share Amount)",
  "Loan balance": "कर्ज बाकी (Loan Balance)",
  "Next minimum due": "पुढील किमान देय (Next Due)",
  "Share percentage": "हिस्सा टक्केवारी (Share %)",
  "Add member": "नवीन सभासद जोडा (Add Member)",
  "Post collection": "जमा व्यवहार (Post Collection)",
  "Create loan request": "कर्ज विनंती (Create Loan Request)",
  "New withdrawal request": "पैसे काढण्याची विनंती (Withdrawal Request)",
  "Finance Assistant": "वित्त सहाय्यक (Finance Assistant)"
  ,
  "Share Calculator": "हिस्सा कॅल्क्युलेटर (Share Calculator)",
  "Calculator": "कॅल्क्युलेटर (Calculator)",
  "Member share calculator": "सभासद हिस्सा कॅल्क्युलेटर (Member Share Calculator)",
  "Remaining money in account": "खात्यातील शिल्लक रक्कम (Remaining Money)",
  "Outstanding loan": "बाकी कर्ज (Outstanding Loan)",
  "Per member monthly saving": "प्रति सभासद मासिक बचत (Per Member Saving)",
  "Number of members": "सभासद संख्या (Number of Members)",
  "Total months": "एकूण महिने (Total Months)",
  "Group start date": "गट सुरू तारीख (Group Start Date)",
  "Group last date": "गट शेवट तारीख (Group Last Date)",
  "Total amount": "एकूण रक्कम (Total Amount)",
  "Per member share": "प्रति सभासद हिस्सा (Per Member Share)",
  "Group gain": "गट नफा (Group Gain)",
  "Per member gain": "प्रति सभासद नफा (Per Member Gain)",
  "Check total": "एकूण पडताळणी (Check Total)",
  "Member share amount": "सभासद हिस्सा रक्कम (Member Share Amount)",
  "Total group share amount": "गटाची एकूण हिस्सा रक्कम (Total Group Share)",
  "Profit pool / group gain": "नफा पूल / गट नफा (Profit Pool)",
  "Interest amount": "व्याज रक्कम (Interest Amount)",
  "Penalty amount": "दंड रक्कम (Penalty Amount)",
  "Profit share": "नफा हिस्सा (Profit Share)"
};

function bilingual(label) {
  return bilingualLabels[label] ?? label;
}

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
        { path: "/setup/approval", label: "Approval Setup" },
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
        { path: "/corrections/adjustments", label: "Adjustments" },
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
  const [state, setState] = useState(initialState);
  const [selectedGroupId, setSelectedGroupId] = useState(initialState.selectedGroupId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultsVisible, setSearchResultsVisible] = useState(false);
  const [previewMember, setPreviewMember] = useState(null);
  const [editingLegacy, setEditingLegacy] = useState(null);
  const [editingValues, setEditingValues] = useState({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [booting, setBooting] = useState(isSupabaseConfigured);
  const [appError, setAppError] = useState("");
  const [confirmDialog, _setConfirmDialog] = useState(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  function setConfirmDialog(value) {
    // open with a short delay to avoid the original click event closing the modal immediately
    if (value === null) {
      _setConfirmDialog(null);
    } else {
      setTimeout(() => _setConfirmDialog(value), 0);
    }
  }
  const [notification, setNotification] = useState(null);
  const [showNotificationDetails, setShowNotificationDetails] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  // group switcher popover removed for product owner; navigate to full page instead
  const [expandedMenu, setExpandedMenu] = useState("Dashboard");

  useEffect(() => {
    setShowNotificationDetails(false);
  }, [notification]);

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
  const isProductOwner = state.session?.user?.email?.toLowerCase() === "katgroupsupport@gmail.com";
  const selectedGroup = state.groups.find((g) => String(g.id) === String(selectedGroupId)) ?? state.groups[0];
  const selectedGroupMember = (state.members || []).find((member) =>
    String(member.groupId) === String(selectedGroup?.id)
    && (
      String(member.id) === String(state.session?.user?.memberId)
      || (member.email && state.session?.user?.email && member.email.toLowerCase() === state.session.user.email.toLowerCase())
    )
  );
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
  const memberPortalActive = role !== roles.MEMBER && new URLSearchParams(location.search).get("portal") === "member";
  const scopedState = getSelectedGroupState(state, selectedGroup?.id, false);
  const viewState = getStateWithComputedShares(scopedState);
  const visibleViewState = {
    ...viewState,
    notifications: getVisibleNotifications(viewState.notifications || [], role, selectedGroupMember)
  };
  const hasSelectedGroup = !!selectedGroup;

  useEffect(() => saveState({ ...state, selectedGroupId, searchQuery }), [state, selectedGroupId, searchQuery]);

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
    if (!isSupabaseConfigured) return;

    let active = true;
    async function boot() {
      try {
        const user = await withTimeout(repository.getSessionUser(), SUPABASE_BOOT_TIMEOUT_MS, "Session check");
        if (!active) return;

        if (!user) {
          setState((current) => ({
            ...current,
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
            }
          }));
          return;
        }

        const tenantData = await withTimeout(repository.listTenantData(), SUPABASE_BOOT_TIMEOUT_MS, "Tenant data loading");
        if (!active) return;
        if (tenantData.groups?.length > 0) {
          const selectedStillExists = tenantData.groups.some((group) => String(group.id) === String(selectedGroupId));
          if (!selectedStillExists) {
            setSelectedGroupId(tenantData.groups[0].id);
          }
        }
        
        setState(() => ({
          ...tenantData,
          session: { signedIn: true, user }
        }));
        if (tenantData.groups.length === 0 && location.pathname === "/") {
          navigate("/select-group", { replace: true });
        }
      } catch (error) {
        if (active) {
          setNotification({
            type: "warning",
            message: "Connection is taking too long. Opened cached data instead.",
            details: serializeError(error)
          });
        }
      } finally {
        if (active) setBooting(false);
      }
    }

    boot();
    return () => {
      active = false;
    };
  }, []);

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
      setState({ ...tenantData, session: { signedIn: true, user: signedInUser } });
      navigate("/select-group", { replace: true });
      return;
    }

    setState((current) => ({ ...current, session: { signedIn: true, user } }));
    navigate("/", { replace: true });
  }

  async function signOut() {
    if (isSupabaseConfigured) {
      await repository.signOut();
    }
    setState((current) => ({ ...current, session: { ...current.session, signedIn: false } }));
    navigate("/", { replace: true });
  }

  if (booting) {
    return <StatusScreen title="Loading secure session" message="Connecting securely and loading your data." />;
  }

  if (appError) {
    return <StatusScreen title="Production connection error" message={appError} />;
  }

  if (!state.session.signedIn) {
    return <PublicSite onSignIn={signIn} />;
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
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">BG</div>
          <div className="brand-copy">
            <strong>Bachat Gat</strong>
            <span className="brand-group-line">
              <span>{selectedGroup?.name ?? "No group selected"}</span>
              <button
                type="button"
                className="brand-switch"
                onClick={() => {
                  if (isProductOwner) {
                    setMobileNavOpen(false);
                    navigate("/select-group");
                    return;
                  }
                  setSelectedGroupId(null);
                  setMobileNavOpen(false);
                  navigate("/select-group");
                }}
              >
                Switch
              </button>
            </span>
            {selectedGroup?.code && <small>{selectedGroup.code}</small>}
            
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
          <button className="icon-button mobile-only" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="topbar-title">
            <div>
              <p className="eyebrow">Bachat Gat finance platform</p>
              <h1>प्रगती (Finance Console)</h1>
            </div>
            <button className="icon-button notification-top-right" type="button" aria-label="Notifications" onClick={() => navigate("/notifications")}>
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
        <Routes>
          <Route path="/select-group" element={<GroupSelectionPage state={state} setState={patchState} selectedGroupId={selectedGroupId} setSelectedGroupId={setSelectedGroupId} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/" element={<Dashboard role={role} state={visibleViewState} actor={{ ...state.session.user, role }} memberPortal={memberPortalActive} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/dashboard/group" element={<Dashboard role={role} state={visibleViewState} actor={{ ...state.session.user, role }} forceGroupView setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/dashboard/member" element={<Dashboard role={role} state={visibleViewState} actor={{ ...state.session.user, role }} memberPortal setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/group-dashboard" element={<Dashboard role={role} state={visibleViewState} actor={{ ...state.session.user, role }} forceGroupView setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/my-savings" element={<MemberSavings state={visibleViewState} actor={{ ...state.session.user, role }} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/my-loans" element={<MemberLoans state={visibleViewState} actor={{ ...state.session.user, role }} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/notifications" element={<MemberNotifications state={visibleViewState} actor={{ ...state.session.user, role }} setState={patchState} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/profile" element={<MemberProfile state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/members" element={<Members state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/setup" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/subscriptions" element={<Subscriptions state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/periods" element={<Periods state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/transactions" element={<Transactions state={viewState} setState={patchState} actor={state.session.user} setSelectedGroupId={setSelectedGroupId} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/operations/transactions" element={<Transactions state={viewState} setState={patchState} actor={state.session.user} setSelectedGroupId={setSelectedGroupId} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/withdrawals" element={<Withdrawals state={visibleViewState} setState={patchState} actor={{ ...state.session.user, role }} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/operations/withdrawals" element={<Withdrawals state={visibleViewState} setState={patchState} actor={{ ...state.session.user, role }} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/pending-dues" element={<PendingDues state={visibleViewState} setState={patchState} actor={{ ...state.session.user, role }} setNotification={setNotification} />} />
          <Route path="/ai-agent" element={<FinanceAgent state={visibleViewState} actor={{ ...state.session.user, role }} setNotification={setNotification} />} />
          <Route path="/corrections" element={<Corrections state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/corrections/adjustments" element={<Adjustments state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/corrections/reversals" element={<Reversals state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/corrections/waivers" element={<Waivers state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/adjustments" element={<Adjustments state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/reversals" element={<Reversals state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/audit-history" element={<Reports state={viewState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/loans" element={<Loans state={visibleViewState} setState={patchState} actor={{ ...state.session.user, role }} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/operations/loans" element={<Loans state={visibleViewState} setState={patchState} actor={{ ...state.session.user, role }} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/approvals" element={<Approvals state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/reports" element={<Reports state={viewState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/contact-support" element={<ContactSupport state={viewState} setState={patchState} actor={state.session.user} setNotification={setNotification} />} />
          <Route path="/product-owner" element={<ProductOwnerSupport state={state} setState={patchState} selectedGroupId={selectedGroupId} setSelectedGroupId={setSelectedGroupId} setNotification={setNotification} />} />
          <Route path="/settings" element={<SettingsPage state={viewState} setState={patchState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
          <Route path="/setup/group" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="group" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/setup/member" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="member" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/setup/financial" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="financial" initialFinancialTab="approvers" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/setup/approval" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="financial" initialFinancialTab="approvers" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/setup/loan" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="financial" initialFinancialTab="loan" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/setup/periods" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="financial" initialFinancialTab="period" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/setup/roles" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="financial" initialFinancialTab="roles" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/setup/calculator" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="financial" initialFinancialTab="calculator" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/setup/legacy" element={<SetupPage state={viewState} setState={patchState} actor={state.session.user} selectedGroup={selectedGroup} initialSetupTab="financial" initialFinancialTab="calculator" setConfirmDialog={setConfirmDialog} setNotification={setNotification} migrationLoading={migrationLoading} setMigrationLoading={setMigrationLoading} />} />
          <Route path="/guide" element={<GuidePage insideApp />} />
          <Route path="*" element={<Dashboard role={role} state={viewState} actor={state.session.user} setConfirmDialog={setConfirmDialog} setNotification={setNotification} />} />
        </Routes>
      </main>
      {previewMember && (
        <div className="modal-overlay" onClick={() => setPreviewMember(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{previewMember.fullName}</h3>
            {(() => {
              const memberSummary = calculateMemberFinanceSummary(previewMember, viewState, getDashboardPeriod(viewState), { ...state.session.user, role });
              return (
                <>
            <div className="status-row">
              <div>
                <strong>Total savings</strong>
                <p>{currency.format(memberSummary.savings)}</p>
              </div>
              <div>
                <strong>Outstanding loan amount</strong>
                <p>{currency.format(memberSummary.outstanding)}</p>
              </div>
              <div>
                <strong>Share amount</strong>
                <p>{currency.format(memberSummary.shareAmount)} ({memberSummary.sharePercent.toFixed(2)}%)</p>
              </div>
            </div>
            <div className="status-row">
              <div>
                <strong>Gained from group</strong>
                <p>{currency.format(memberSummary.gain)}</p>
              </div>
              <div>
                <strong>Member expenses</strong>
                <p>{currency.format(memberSummary.expense)}</p>
              </div>
              <div>
                <strong>Next minimum due</strong>
                <p>{currency.format(memberSummary.nextDueAmount)}</p>
                <small>Due {memberSummary.dueDate.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })} / remaining interest {currency.format(memberSummary.interestDue)}</small>
              </div>
              <div>
                <strong>Active loans</strong>
                <p>{memberSummary.memberActiveLoans.length}</p>
              </div>
            </div>
            {memberSummary.memberActiveLoans.length > 0 && (
              <Section title="Active loan details">
                <Table
                  headers={["Loan amount", "Date", "Outstanding", "Interest paid"]}
                  rows={memberSummary.memberActiveLoans.map((loan) => [
                    currency.format(loan.amount),
                    loan.startDate ?? "",
                    currency.format(calculateLoanOutstandingWithDues(loan, state)),
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

function PublicSite({ onSignIn }) {
  return (
    <main className="public-shell">
      <Routes>
        <Route path="/" element={<AuthScreen onSignIn={onSignIn} />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PolicyPage type="privacy" />} />
        <Route path="/terms" element={<PolicyPage type="terms" />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/login" element={<AuthScreen onSignIn={onSignIn} />} />
        <Route path="*" element={<AuthScreen onSignIn={onSignIn} />} />
      </Routes>
    </main>
  );
}

function LandingPage() {
  return (
    <PublicPage title="Bachat Gat SaaS" subtitle="" showFooter={false}>
      <section className="public-hero simple-login-hero">
        <div>
          <p className="eyebrow">Bachat Gat finance platform</p>
          <h1>Bachat Gat</h1>
          <div className="button-row">
            <NavLink className="primary-button public-button" to="/login">Login</NavLink>
            <NavLink className="secondary-button" to="/guide">User Guide</NavLink>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}

function AboutPage() {
  return (
    <PublicPage title="About" subtitle="A finance workflow platform built for Indian saving groups.">
      <CardGrid items={[
        { title: "Vision", body: "Bring professional-grade financial management to every community saving group." },
        { title: "Mission", body: "Make savings, loans, approvals, and reports simple for village and women self-help groups." },
        { title: "Why", body: "Manual registers are hard to audit, easy to lose, and difficult for members to verify." }
      ]} />
    </PublicPage>
  );
}

function PricingPage() {
  const plans = [
    ["Free Trial", "Limited members, basic reports, limited storage"],
    ["Monthly", "Member tracking, collections, reports, one collector"],
    ["Quarterly", "Loan module, approvals, exports, more storage"],
    ["Half-Yearly", "Advanced reports, renewal reminders, more collectors"],
    ["Yearly", "Best value with future AI features and priority support"]
  ];

  return (
    <PublicPage title="Pricing" subtitle="Plans control members, reports, storage, collectors, approvals, and future AI features.">
      <CardGrid items={plans.map(([title, body]) => ({ title, body }))} />
      <PublicSection title="Subscription rules" items={["Razorpay subscription integration ready", "Upgrade and downgrade flow planned", "Expired groups become read-only", "Reports remain visible after expiry"]} />
    </PublicPage>
  );
}

function ContactPage() {
  const [sent, setSent] = useState(false);
  const [values, setValues] = useState({ name: "", email: "", mobile: "", subject: "", message: "" });
  return (
    <PublicPage title="Contact" subtitle="Talk to us about your saving group, SHG, or community finance workflow.">
      <section className="section">
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); setSent(true); }}>
          <Field label="Name" value={values.name} onChange={(value) => setValues({ ...values, name: value })} />
          <Field label="Email" value={values.email} onChange={(value) => setValues({ ...values, email: value })} />
          <Field label="Mobile number" value={values.mobile} onChange={(value) => setValues({ ...values, mobile: value })} />
          <Field label="Subject" value={values.subject} onChange={(value) => setValues({ ...values, subject: value })} />
          <Field label="Message" value={values.message} onChange={(value) => setValues({ ...values, message: value })} />
          <button className="primary-button" type="submit">Send message</button>
        </form>
        {sent && <p className="section-note">Message captured. Email sending can be connected through the secure server.</p>}
      </section>
      <PublicSection title="Support" items={["support@bachatgat.example", "+91 90000 00000", "Business hours: 10 AM to 6 PM IST"]} />
    </PublicPage>
  );
}

function PolicyPage({ type }) {
  const privacy = ["Data collection", "User privacy", "Authentication security", "Payment security", "Data storage", "Cookies usage", "Third-party integrations", "User rights", "Data deletion request", "Account deletion", "Legal compliance"];
  const terms = ["Subscription policies", "Refund policy", "User responsibilities", "Data usage rules", "Platform limitations", "Account suspension rules", "Group ownership rules", "Payment terms", "Legal disclaimer"];
  return (
    <PublicPage title={type === "privacy" ? "Privacy Policy" : "Terms & Conditions"} subtitle="Production legal sections are structured and ready for counsel review.">
      <PublicSection title="Sections" items={type === "privacy" ? privacy : terms} />
    </PublicPage>
  );
}

function GuidePage({ insideApp = false }) {
  const [showQa, setShowQa] = useState(false);
  function downloadGuidePdf() {
    const url = `${window.location.origin}/user-guide.pdf`;
    const isMobileDownload = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (isMobileDownload) {
      const opened = window.open(url, "_blank", "noopener");
      if (!opened) window.location.href = url;
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bachat-gat-user-guide.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  const content = showQa ? <QaGuide /> : <GuideContent />;
  const guideActions = (
    <div className="button-row">
      <button type="button" className="secondary-button" onClick={() => setShowQa((value) => !value)}>
        {showQa ? "Show Process Guide" : "Show Q&A"}
      </button>
      <button type="button" className="secondary-button" onClick={downloadGuidePdf}>Download PDF</button>
    </div>
  );
  if (insideApp) {
    return (
      <Page title="User Guide" subtitle="Simple visual steps, common questions and operating rules" action={guideActions}>
        {content}
      </Page>
    );
  }

  return (
    <PublicPage title="User Guide" subtitle="Simple visual steps for admins, approvers and members.">
      <div className="button-row">
        <button type="button" className="secondary-button" onClick={() => setShowQa((value) => !value)}>
          {showQa ? "Show Process Guide" : "Show Q&A"}
        </button>
        <button type="button" className="primary-button public-button" onClick={downloadGuidePdf}>Download PDF</button>
        <NavLink className="secondary-button" to="/login">Login</NavLink>
      </div>
      {content}
    </PublicPage>
  );
}

function QaGuide() {
  const questions = [
    ["Where should I start after login?", "First create or select a group, add members, set group setup, set approvers/admins, open the current period, then start entering transactions."],
    ["What is group setup?", "Group setup stores common rules like monthly saving, interest rate, penalty after due date, loan limit, loan tenure and repayment due date."],
    ["What is member setup?", "Member setup is used only when one member has different saving amount, loan limit, interest rate or loan tenure from the group default. Email, mobile and profile details are optional."],
    ["What is approval setup?", "Approval setup decides who must approve setup changes, transactions, loans, withdrawals and corrections before they affect dashboards."],
    ["Why should I set at least one admin?", "An active admin is needed to manage setup, members, operations and approvals. The app blocks setup changes if no active admin remains."],
    ["How do members login?", "Members can login only when their email is added. Email is optional, but for member app access add the member email and ask them to register with the same email."],
    ["Can I add old notebook data?", "Yes. Use the calculator for old data. Enter migration date and old balances, calculate per-member share, then post that share as Saving from Transactions."],
    ["Should I use legacy data setup for a new group?", "No. If the group is new and has no previous balances, skip this and start with period setup and transactions."],
    ["What does old saving/share mean?", "It is the member's old saved amount or calculated share from old records. Post it as a completed Saving transaction so dashboards include it."],
    ["What does old pending loan mean?", "It means old loan principal still to be paid by the member. Use it while calculating the legacy share and future dues."],
    ["When should I open a period?", "Open the month where entries are allowed. Transactions are expected to be posted only in the open period."],
    ["Why is my transaction blocked?", "Usually because no period is open, the date is outside the open period, required setup is missing, or the record is not yet saved online."],
    ["How does transaction split work?", "When you enter collected amount, the app splits it into savings, interest, penalty, principal and excess based on dues. You can edit splits, but total cannot exceed collected amount."],
    ["What is excess amount?", "Excess is the remaining amount after other split fields. It cannot be negative and it should not make total split greater than collected amount."],
    ["Why are pending approvals not shown in dashboard totals?", "Pending entries are not final. Dashboard values update only after approval is Completed."],
    ["Who can approve requests?", "Configured approvers can approve assigned requests. Group admins can also view group approval requests and see with whom they are pending."],
    ["What happens when a member is added with approvers configured?", "The member is shown as pending/inactive until all required approvals are completed. After approval, the member becomes active."],
    ["How does loan request work?", "A member or admin creates a loan request. If approvals are configured, the loan becomes active only after approval."],
    ["How is minimum EMI principal decided?", "Minimum principal due is based on loan tenure. Original loan principal is divided by tenure months, capped by remaining outstanding principal."],
    ["What if loan tenure is blank or zero?", "Then there is no minimum principal restriction. The member can still pay principal, but the app will not force a minimum principal due."],
    ["Does member loan tenure override group tenure?", "Yes. If member tenure is set, it overrides group tenure for that member."],
    ["How is EMI cycle decided?", "The repayment due date creates the EMI cycle. For example, due date 5 July means the cycle runs from 6 June to 5 July."],
    ["If a member pays before due date, will due become zero?", "Yes, if the full saving, principal, interest and penalty due for that EMI cycle are paid before the due date, next due shows zero for that cycle."],
    ["When is penalty added?", "Penalty is added only after the due date passes and the EMI cycle still has unpaid due."],
    ["Can penalty be waived?", "Yes. Go to Waivers, select Penalty, enter the waiver amount and reason. If approvers are set, waiver affects dues only after approval."],
    ["Can interest be waived?", "Yes. Use Waivers and select Interest. Waived interest reduces receivable interest and is not treated as group gain."],
    ["What is withdrawal?", "Withdrawal is money taken out from a member's savings/share. Members can request it; admins can also create requests depending on role."],
    ["What if I entered a wrong transaction?", "Use Adjustment for a partial correction. Use Reversal when the full transaction is wrong or duplicated."],
    ["Why not edit old approved transactions directly?", "Approved records are audit records. Corrections are posted separately so the history remains clear."],
    ["What is group gain?", "Group gain is income such as interest, penalty and other income after completion. It can be distributed to members based on group rules."],
    ["What is member share?", "Member share is the member's savings plus distributed gain minus expenses, withdrawals and outstanding loan-related dues."],
    ["Why does a dashboard value change after approval?", "Because the app counts only Completed financial entries. Approval completion moves the entry into final dashboard totals."],
    ["How do I generate report?", "Open Reports, choose start date and end date, click Generate Report, then use Copy / Share report to send the readable summary."],
    ["Why is my report empty for a member?", "If the member had no transactions or loans in the selected date range, that member may not appear in the range report."],
    ["What should I do before deploying or refreshing?", "Save setup changes, confirm approvals if required, and make sure the latest database updates are applied when new fields are added."],
    ["Why did approver disappear after refresh earlier?", "That happened when approvers were not persisted to the database. After the persistence fix and migration, saved approvers should load after refresh."],
    ["What should I check if a payment value looks wrong?", "Check whether the period is correct, approval is completed, transaction split total matches collected amount, and any correction or waiver has been approved."],
    ["Can I use the app without approvers?", "Yes. If no approvers are configured, entries can complete immediately. For safer workflow, configure approvers."],
    ["What is the safest daily process?", "Open period, collect money, verify split, save transaction, approve if required, check dashboard, and review pending dues."],
    ["Where can members see their own dues?", "Members can use their dashboard, pending dues, loans and notifications to see savings due, EMI due, due date and loan details."]
  ];
  return (
    <div className="guide-content">
      <Section title="Questions & Answers">
        <div className="guide-screen-grid">
          {questions.map(([question, answer]) => (
            <article className="guide-screen" key={question}>
              <div className="guide-screen-top"><span /><span /><span /></div>
              <strong>{question}</strong>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

function GuideContent() {
  const setupJourney = [
    {
      title: "1. Create or select group",
      text: "Start with one group. Confirm group name, monthly saving, interest rate, loan limit, loan tenure and EMI due date. If approvers are added, check the status at the bottom and wait until setup is Completed.",
      path: "/setup/group",
      action: "Open group setup"
    },
    {
      title: "2. Add members",
      text: "Add every member with correct name and username. Email and mobile are optional. Add email only when the member needs login access. If approval is enabled, member is usable only after status becomes Completed/Active.",
      path: "/members",
      action: "Add members"
    },
    {
      title: "3. Set approvers and admins",
      text: "Choose approvers for loans, transactions and corrections. Choose admins who can manage setup and operations. Save and confirm that the setup approval is Completed before depending on the workflow.",
      path: "/setup/approval",
      action: "Set approvals"
    },
    {
      title: "4. Open the period",
      text: "Open the month where entries are allowed. Transactions should be posted only in the open period. If period changes need approval, check status and continue only after Completed.",
      path: "/setup/periods",
      action: "Open period"
    },
    {
      title: "5. Calculate old legacy share",
      text: "If old notebook data exists, use the calculator with migration date, remaining account money, outstanding loan, savings and member count. Check how much amount should be shared per member. Then go to Transactions, select each member, enter that calculated share as Saving, save it, and use only Completed transactions in dashboards.",
      path: "/setup/calculator",
      action: "Calculate legacy share"
    },
    {
      title: "6. Start collections",
      text: "Go to Transactions, select member, enter collected amount, check the split, then save. If approvers are configured, check the transaction status at the bottom/list. It affects dashboard only after Completed.",
      path: "/operations/transactions",
      action: "Create transaction"
    },
    {
      title: "7. Correct mistakes if any",
      text: "If any saved entry is wrong, use Corrections. Use Adjustment for a small split/amount difference and Reversal for a fully wrong or duplicate transaction. Correction also counts only after Completed approval status.",
      path: "/corrections",
      action: "Open corrections"
    },
    {
      title: "8. Handle loans and withdrawals",
      text: "Members can request loans or withdrawals. Admins and approvers can review, approve and track EMI dues. Loan and withdrawal requests should be checked until status becomes Completed/Active.",
      path: "/operations/loans",
      action: "Open loans"
    },
    {
      title: "9. Review reports",
      text: "Generate reports by date range, copy/share the readable summary, and use audit/corrections for mistakes. Reports and dashboards should be verified from Completed entries only.",
      path: "/reports",
      action: "Generate report"
    }
  ];
  const flows = [
    ["Register", "Create group", "Add members", "Open period"],
    ["Group setup", "Member setup", "Loan setup", "Approver setup"],
    ["Enter legacy values", "Calculate per member share", "Post as saving transaction", "Approve to Completed"],
    ["Enter savings", "System splits amount", "Approver checks", "Completed updates dashboard"],
    ["Member asks loan", "Admin/approver approves", "Loan active", "Repay monthly"],
    ["Wrong entry", "Use correction", "Adjustment / Reverse", "Completed audit saved"]
  ];
  const fullFlow = [
    "Register",
    "Login",
    "Create group",
    "Add members",
    "Group setup",
    "Member setup",
    "Financial setup",
    "Calculate legacy share if old data",
    "Transactions",
    "Correction if any",
    "Approval flow",
    "Loan request",
    "Loan approval",
    "Withdrawal request",
    "Withdrawal approval",
    "Adjustment or reversal",
    "Correction approval",
    "Dashboards and reports"
  ];
  const screens = [
    ["Login", "Enter email / username and password. Press Login."],
    ["Group Dashboard", "See this month collection, savings, loans and balance."],
    ["Transactions", "Select member, amount and date. Check split before save."],
    ["Loans", "Member requests loan. Approval is required before loan is active."],
    ["Approvals", "Approver presses Approve or Reject after checking details."],
    ["Reports & Audit", "Download reports and check full history."]
  ];

  return (
    <div className="guide-content">
      <section className="section">
        <h3>Step-by-step setup guide</h3>
        <p className="section-note">Follow these steps from top to bottom. Each button opens the exact screen needed for that step.</p>
        <div className="guide-screen-grid">
          {setupJourney.map((step) => (
            <article className="guide-screen" key={step.title}>
              <div className="guide-screen-top"><span /><span /><span /></div>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
              <NavLink className="secondary-button" to={step.path}>{step.action}</NavLink>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Complete Flow</h3>
        <div className="guide-flow guide-flow-long">
          {fullFlow.map((step, index) => <GuideStep key={step} number={index + 1} label={step} />)}
        </div>
        <p className="section-note">Final balances are shown only after entries are completed. Pending approvals do not change dashboard totals.</p>
      </section>

      <section className="section">
        <h3>Start Here</h3>
        <div className="guide-flow">
          {flows[0].map((step, index) => <GuideStep key={step} number={index + 1} label={step} />)}
        </div>
      </section>

      <section className="section">
        <h3>Daily Money Flow</h3>
        <div className="guide-flow">
          {flows[3].map((step, index) => <GuideStep key={step} number={index + 1} label={step} />)}
        </div>
      </section>

      <section className="section">
        <h3>Setup Flow</h3>
        <div className="guide-flow">
          {flows[1].map((step, index) => <GuideStep key={step} number={index + 1} label={step} />)}
        </div>
        <div className="guide-symbol-row guide-setup-notes">
          <span>Group setup: default monthly saving, interest rate, penalty, loan limit</span>
          <span>Member setup: use only when one member has different saving or loan limit</span>
          <span>Financial setup: repayment due date means monthly payment date</span>
          <span>Approver setup: add people who must approve loans or money entries</span>
        </div>
        <div className="guide-screen-grid">
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Interest rate</strong><p>Enter monthly percent. Example: 2 means 2% per month.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Penalty</strong><p>Use when payment is late. Keep blank or 0 if no penalty.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Open period</strong><p>Open only the month where entries are allowed.</p></article>
        </div>
      </section>

      <section className="section">
        <h3>Main Features</h3>
        <div className="guide-screen-grid">
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Member login</strong><p>Members register with the same email used while adding them. Then they can see their groups and dashboards.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Create groups</strong><p>Any logged-in user can create a new group and becomes that group admin.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Active / inactive</strong><p>Deactivate members who leave. They do not get future gains after exit.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Role restriction</strong><p>Members get view access. Admins manage setup, members, transactions and loans.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Wrong entries</strong><p>Use adjustment for partial correction. Use reversal for a fully wrong entry.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Approvals</strong><p>If approvers are defined, setup, transactions, loans, withdrawals and corrections wait for approval. Count them only after status is Completed.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Withdrawal</strong><p>Members request for themselves. Admin can request for any member. Approval is required if approvers exist.</p></article>
        </div>
      </section>

      <section className="section">
        <h3>Group Gain Sharing</h3>
        <div className="guide-screen-grid">
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Loan interest</strong><p>Interest is shared by old share amount and time. New saving after loan date is not counted for that loan.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Penalty</strong><p>Penalty gain is shared by member share weight, not by plain equal count.</p></article>
          <article className="guide-screen"><div className="guide-screen-top"><span /><span /><span /></div><strong>Other income</strong><p>Other income is shared by member share weight unless group policy changes later.</p></article>
        </div>
        <div className="guide-symbol-row guide-setup-notes">
          <span>Loan given on 10 Jun: only members active on 10 Jun are counted for that loan interest</span>
          <span>If B had 10000 then withdrew money, only the remaining old share is counted</span>
          <span>A new member added after loan date will not get share from that loan interest</span>
          <span>This rule continues until that loan is fully repaid</span>
        </div>
      </section>

      <section className="section">
        <h3>Legacy Data Setup</h3>
        <div className="guide-flow">
          {flows[2].map((step, index) => <GuideStep key={step} number={index + 1} label={step} />)}
        </div>
        <div className="guide-symbol-row guide-setup-notes">
          <span>Use the calculator when shifting old notebook/register balance to this app</span>
          <span>Select the migration date and enter old account balance, loans, savings and member count</span>
          <span>Use the calculated per-member share as Saving in the Transactions screen</span>
          <span>If approvers are configured, dashboard should be checked only after those legacy saving transactions are Completed</span>
        </div>
      </section>

      <section className="section">
        <h3>Loan Flow</h3>
        <div className="guide-flow">
          {flows[4].map((step, index) => <GuideStep key={step} number={index + 1} label={step} />)}
        </div>
      </section>

      <section className="section">
        <h3>Wrong Entry Flow</h3>
        <div className="guide-flow">
          {flows[5].map((step, index) => <GuideStep key={step} number={index + 1} label={step} />)}
        </div>
      </section>

      <section className="section">
        <h3>Screen Guide</h3>
        <div className="guide-screen-grid">
          {screens.map(([title, text]) => (
            <article className="guide-screen" key={title}>
              <div className="guide-screen-top">
                <span />
                <span />
                <span />
              </div>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <GuideQaSection />

      <section className="section">
        <h3>Remember</h3>
        <div className="guide-symbol-row">
          <span>Save money</span>
          <span>Check loan</span>
          <span>Approve safely</span>
          <span>Use only Completed records for dashboards and reports</span>
        </div>
      </section>
    </div>
  );
}

function GuideQaSection() {
  const questions = [
    ["How do I know which screen to open first?", "Use the step-by-step setup guide at the top of this page. Start with group setup, then members, approvals, period, optional legacy calculator and transactions."],
    ["Why are there many setup screens?", "Each setup screen controls one area: group rules, member overrides, approvers, admins, loan settings, periods and share calculator."],
    ["Can I skip legacy data setup?", "Yes. Skip it if your group is new or you do not want to bring old balances into the app."],
    ["How should I add old legacy savings?", "Use the calculator first. Enter migration date and old balances, calculate the per-member share, then post that amount as Saving from the Transactions screen for each member."],
    ["When will old legacy savings affect dashboards?", "Only after the saving transaction is Completed. If approvers are configured, wait for approval before checking dashboard or reports."],
    ["Can I change setup later?", "Yes. Setup changes can be saved later. If approvers are configured, changes may wait for approval before becoming final."],
    ["How do I know a request is pending?", "Pending screens show status and pending approver. The approval page also shows who needs to approve."],
    ["Why does the app show both Marathi and English labels?", "It helps local users understand field names while keeping finance terms clear for reports and support."],
    ["What should I do when a member leaves?", "Mark the member inactive or set exit details. They should not receive future gains after exit."],
    ["Can a member have different saving amount?", "Yes. Use Member Setup to set a custom monthly saving for that member."],
    ["Can a member have different loan tenure?", "Yes. Member loan tenure overrides group loan tenure."],
    ["What does loan limit mean?", "Loan limit controls the maximum loan a member can request or receive, depending on group and member setup."],
    ["What is repayment due date?", "It is the monthly EMI due date. The app uses it to decide EMI cycle, due date and late penalty."],
    ["Why is penalty not added immediately?", "Penalty is added only after the due date passes and that EMI cycle is still unpaid."],
    ["Can a member pay before due date?", "Yes. Early payment is counted for that EMI cycle."],
    ["What if only part payment is made?", "The paid split reduces that cycle's due. Remaining due continues to show, and penalty can apply after due date."],
    ["Can I enter only interest payment?", "Yes, if the split is valid and total split does not exceed amount collected."],
    ["Can I enter only principal payment?", "Yes. You can edit split, but total split cannot be more than collected amount and principal cannot exceed outstanding principal."],
    ["What is pending dues page for?", "It shows members who still have saving, principal, interest or penalty due for current or previous EMI cycles."],
    ["What should collectors check before saving?", "Check member, date, amount, allocation split and approval status."],
    ["What happens if split total is greater than collected amount?", "The app blocks it. Excess is recalculated from the remaining amount and cannot be negative."],
    ["Why is dashboard not changing after I saved?", "If approvals are enabled, dashboard changes after approval completion, not at pending stage."],
    ["Where do admins approve?", "Open Approvals. Admins can see group approval requests, and assigned approvers can approve their own requests."],
    ["What if approver cannot see request?", "Check that approver is saved in setup, migration for approver persistence is applied, and the user is logged in with the approver's member email."],
    ["Can I reject a request?", "Yes. Approvers can approve, reject or return depending on the workflow action."],
    ["How do reports work?", "Reports use selected start and end dates. They show only activity available in that range."],
    ["Can I share a report on WhatsApp?", "Yes. Use Copy / Share report. The text is formatted in readable lines."],
    ["How do I fix a duplicate transaction?", "Use Reversal to cancel the full wrong entry."],
    ["How do I fix only one wrong split amount?", "Use Adjustment to post only the difference."],
    ["Can corrections also require approval?", "Yes. If approvers are configured, adjustments, reversals and waivers can stay pending until approved."],
    ["What is waiver?", "Waiver reduces payable interest or penalty without treating it as cash collected."],
    ["Should waived interest become group gain?", "No. Waived interest is not collected money, so it is not group gain."],
    ["What is active loan?", "Active loan is loan principal still outstanding, with related interest or penalty if applicable."],
    ["When is loan closed?", "A loan is effectively closed when outstanding principal and related dues are fully paid or cleared."],
    ["What is the best monthly routine?", "Open period, enter collections, approve pending items, check pending dues, review dashboard and generate report."],
    ["Who should use Reports & Audit?", "Admins and approvers use it to verify date-range collections, member summaries and audit history."],
    ["What should I do if numbers look incorrect?", "Check pending approvals, selected date range, migration entries, split details, corrections and period dates before changing formulas."]
  ];
  return (
    <section className="section">
      <h3>Common Questions</h3>
      <div className="guide-formula-grid">
        {questions.map(([question, answer]) => (
          <article className="guide-formula" key={question}>
            <strong>{question}</strong>
            <p>{answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function GuideStep({ number, label }) {
  return (
    <div className="guide-step">
      <span>{number}</span>
      <strong>{label}</strong>
    </div>
  );
}

function PublicPage({ title, subtitle, children, showFooter = true }) {
  return (
    <div className="public-page">
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
      {showFooter && <footer className="public-footer">
        <NavLink to="/privacy">Privacy Policy</NavLink>
        <NavLink to="/terms">Terms & Conditions</NavLink>
        <NavLink to="/guide">User Guide</NavLink>
      </footer>}
    </div>
  );
}

function CardGrid({ items }) {
  return (
    <div className="data-grid">
      {items.map((item) => (
        <article className="entity-card" key={item.title}>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

function PublicSection({ title, items }) {
  return (
    <section className="section">
      <h3>{title}</h3>
      <div className="tag-list">
        {items.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}

function AuthScreen({ onSignIn }) {
  const [mode, setMode] = useState("login");
  const [values, setValues] = useState({
    identifier: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    email: "",
    mobile: "",
    otpCode: ""
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitError("");
    setSuccessMessage("");

    if (mode === "register") {
      async function requestOtp() {
        const result = validate(registerSchema, values);
        setErrors(result.errors);
        if (!result.data) return false;

        try {
          setSubmitting(true);
          await onSignIn(null, { mode: "sendOtp", values: result.data });
          setOtpSent(true);
          setSuccessMessage("OTP sent to your email. Enter the code and create a password to finish registration.");
          return true;
        } catch (error) {
          setSubmitError(error.message);
          return false;
        } finally {
          setSubmitting(false);
        }
      }

      if (!otpSent) {
        await requestOtp();
        return;
      }

      const result = validate(otpPasswordSchema, values);
      setErrors(result.errors);
      if (!result.data) return;
    }

    if (mode === "resetPassword") {
      const result = validate(passwordResetSchema, values);
      setErrors(result.errors);
      if (!result.data) return;
    }

    try {
      setSubmitting(true);
      await onSignIn({
        id: makeId("usr"),
        name: values.fullName || "Demo User",
        role: roles.MEMBER,
        language: "en",
        groupIds: ["grp_sakhi"]
      }, { mode, values });
      if (mode === "resetPassword") {
        setSuccessMessage("If this email exists, a password reset link has been sent.");
      }
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div>
          <p className="eyebrow">Bachat Gat SaaS</p>
          <h1>{mode === "login" ? "Login" : mode === "resetPassword" ? "Reset password" : "Register group user"}</h1>
          <p>{isSupabaseConfigured ? "Secure login is enabled." : "Demo mode is active until secure login is enabled."}</p>
        </div>
        <form className="form-grid" onSubmit={submit}>
          {mode === "login" ? (
            <>
              <Field label="Email" type="email" value={values.identifier} onChange={(value) => update("identifier", value)} />
              <Field label="Password" type="password" value={values.password} onChange={(value) => update("password", value)} />
            </>
          ) : mode === "resetPassword" ? (
            <>
              <Field label="Email" value={values.email} onChange={(value) => update("email", value)} error={errors.email} />
            </>
          ) : (
            <>
              <Field label="Full name" required value={values.fullName} onChange={(value) => update("fullName", value)} error={errors.fullName} />
              <Field label="Email" required value={values.email} onChange={(value) => update("email", value)} error={errors.email} />
              <Field label="Mobile number" type="tel" value={values.mobile} onChange={(value) => update("mobile", value)} error={errors.mobile} />
              {otpSent && (
                <>
                  <Field label="OTP code" value={values.otpCode} onChange={(value) => update("otpCode", value)} error={errors.otpCode} />
                  <Field label="Password" type={showPassword ? "text" : "password"} value={values.password} onChange={(value) => update("password", value)} error={errors.password} />
                  <Field label="Confirm password" type={showPassword ? "text" : "password"} value={values.confirmPassword || ""} onChange={(value) => update("confirmPassword", value)} error={errors.confirmPassword} />
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={submitting}
                    onClick={async () => {
                      setSubmitError("");
                      setSuccessMessage("");
                      const result = validate(registerSchema, values);
                      setErrors(result.errors);
                      if (!result.data) return;
                      try {
                        setSubmitting(true);
                        await onSignIn(null, { mode: "sendOtp", values: result.data });
                        setSuccessMessage("A new OTP has been sent to your email.");
                      } catch (error) {
                        setSubmitError(error.message);
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    Resend OTP
                  </button>
                  <label className="field checkbox-field">
                    <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
                    <span>Show password</span>
                  </label>
                </>
              )}
            </>
          )}
          {submitError && <div className="form-error">{submitError}</div>}
          {successMessage && <div className="form-success">{successMessage}</div>}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Please wait" : mode === "login" ? "Login" : mode === "resetPassword" ? "Send reset link" : otpSent ? "Verify OTP and create account" : "Send OTP"}
          </button>
        </form>
        <button className="secondary-button" type="button" onClick={() => onSignIn(null, { mode: "google", values: {} })}>
          Continue with Google
        </button>
        <NavLink className="secondary-button" to="/guide">
          User Guide
        </NavLink>
        {mode === "login" ? (
          <>
            <button className="link-button" type="button" onClick={() => {
              setMode("resetPassword");
              setErrors({});
              setSubmitError("");
              setSuccessMessage("");
              setOtpSent(false);
              setShowPassword(false);
            }}>
              Forgot password?
            </button>
            <button className="link-button" type="button" onClick={() => {
              setMode("register");
              setValues({ identifier: "", password: "", fullName: "", email: "", mobile: "", otpCode: "", confirmPassword: "" });
              setErrors({});
              setSubmitError("");
              setSuccessMessage("");
              setOtpSent(false);
              setShowPassword(false);
            }}>
              Create new account
            </button>
          </>
        ) : mode === "resetPassword" ? (
          <>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setMode("login");
                setValues({ identifier: "", password: "", fullName: "", email: "", mobile: "", otpCode: "", confirmPassword: "" });
                setErrors({});
                setSubmitError("");
                setSuccessMessage("");
                setOtpSent(false);
                setShowPassword(false);
              }}
            >
              Back to login
            </button>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setMode("register");
                setValues({ identifier: "", password: "", fullName: "", email: "", mobile: "", otpCode: "", confirmPassword: "" });
                setErrors({});
                setSubmitError("");
                setSuccessMessage("");
                setOtpSent(false);
                setShowPassword(false);
              }}>
              Create new account
            </button>
          </>
        ) : (
          <button
            className="link-button"
            type="button"
            onClick={() => {
              setMode("login");
              setValues({ identifier: "", password: "", fullName: "", email: "", mobile: "", otpCode: "", confirmPassword: "" });
              setErrors({});
              setSubmitError("");
              setSuccessMessage("");
              setOtpSent(false);
              setShowPassword(false);
            }}
          >
            Back to login
          </button>
        )}
      </section>
    </main>
  );
}

function StatusScreen({ title, message }) {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Bachat Gat SaaS</p>
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function Dashboard({ role, state, actor, forceGroupView = false, memberPortal = false, setConfirmDialog, setNotification }) {
  const navigate = useNavigate();
  const [selectedDashboardMemberId, setSelectedDashboardMemberId] = useState("");
  const dashboardPeriod = getDashboardPeriod(state);
  const dashboardCards = calculateDashboardCards(state, dashboardPeriod).cards;
  const memberFields = financeFieldDictionary.member;
  const group = state.groups?.[0] ?? {};
  const financialDueDate = getLoanDueDate(group);
  const financialPeriodStart = new Date(financialDueDate);
  financialPeriodStart.setMonth(financialPeriodStart.getMonth() - 1);
  financialPeriodStart.setDate(financialPeriodStart.getDate() + 1);
  const financialPeriodLabel = `${financialPeriodStart.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} - ${financialDueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  if ((role === roles.MEMBER || memberPortal) && !forceGroupView) {
    const canChooseMember = role !== roles.MEMBER;
    const member = canChooseMember
      ? (state.members.find((item) => String(item.id) === String(selectedDashboardMemberId)) ?? state.members[0])
      : (getCurrentMember(state, actor) ?? { savings: 0, loanOutstanding: 0, shares: 0, interestOutstanding: 0, penaltyOutstanding: 0 });
    const memberDashboard = calculateMemberDashboardCards(member, state, dashboardPeriod, actor);
    const memberSummary = memberDashboard.summary;
    const memberCards = memberDashboard.cards;
    const effectiveSetup = getEffectiveMemberSetup(member, state.groups?.[0] ?? {});
    const formatDate = (value) => value
      ? new Date(value).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })
      : "-";
    const loanDate = (loan) => loan.startDate || loan.distributionDate || loan.requestDate || loan.createdAt || "";
    const loanActivityDate = (loan) => {
      const loanStartDate = loanDate(loan);
      const memberLoanTransactions = getCompletedTransactions(state.transactions || [])
        .filter((transaction) => loanBelongsToMember(loan, { id: transaction.memberId, fullName: transaction.memberName }))
        .filter((transaction) => !loanStartDate || String(transaction.transactionDate || "") >= String(loanStartDate))
        .map((transaction) => transaction.transactionDate)
        .filter(Boolean)
        .sort();
      return loan.closedDate || loan.completedAt || memberLoanTransactions.at(-1) || loanStartDate;
    };
    const closedLoans = memberSummary.memberLoans
      .filter((loan) => !isOutstandingLoan(loan))
      .sort((a, b) => String(loanActivityDate(b)).localeCompare(String(loanActivityDate(a))));
    const recentClosedLoan = closedLoans[0];
    const sortedDueRows = [...memberSummary.dueRows].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const nextEmiRow = sortedDueRows[0];
    const openingInterestDue = memberSummary.memberActiveLoans.reduce((sum, loan) => sum + Number(loan.interestOutstanding || 0), 0);
    const openingPenaltyDue = memberSummary.memberActiveLoans.reduce((sum, loan) => sum + Number(loan.penaltyOutstanding || 0), 0);

    return (
      <Page title={canChooseMember ? "Member Dashboard" : "My Dashboard"} subtitle="Savings, loans, repayments, shares and notifications" action={null}>
        {canChooseMember && (
          <Section title="Select member">
            <SelectField
              label="Member"
              value={member?.id ?? ""}
              onChange={setSelectedDashboardMemberId}
              options={state.members.map((item) => ({ label: item.fullName, value: item.id }))}
            />
          </Section>
        )}
        <MetricGrid
          metrics={[
            metric(memberCards.savings.label, currency.format(memberCards.savings.header ?? 0), Users, [
              `Savings before withdrawals: ${currency.format(memberCards.savings.subfields.savingsBeforeWithdrawals ?? 0)}`,
              `Withdrawn savings: ${currency.format(memberCards.savings.subfields.withdrawnSavings ?? 0)}`,
              `This period savings: ${currency.format(memberCards.savings.subfields.thisPeriodSavings ?? 0)}`
            ]),
            metric(memberCards.collectedInPeriod.label, currency.format(memberCards.collectedInPeriod.header ?? 0), WalletCards, [
              `Savings collected: ${currency.format(memberCards.collectedInPeriod.subfields.savingsCollected ?? 0)}`,
              `Principal collected: ${currency.format(memberCards.collectedInPeriod.subfields.principalCollected ?? 0)}`,
              `Interest collected: ${currency.format(memberCards.collectedInPeriod.subfields.interestCollected ?? 0)}`,
              `Penalty collected: ${currency.format(memberCards.collectedInPeriod.subfields.penaltyCollected ?? 0)}`,
              `Withdrawn in period: ${currency.format(memberCards.collectedInPeriod.subfields.withdrawnInPeriod ?? 0)}`
            ]),
            metric(memberCards.shareAmount.label, currency.format(memberCards.shareAmount.header ?? 0), WalletCards, [
              `Savings: ${currency.format(memberCards.shareAmount.subfields.savings ?? 0)}`,
              `Income/Gain share: ${currency.format(memberCards.shareAmount.subfields.incomeGainShare ?? 0)}`,
              `Expense share: ${currency.format(memberCards.shareAmount.subfields.expenseShare ?? 0)}`
            ]),
            metric(memberCards.loanBalance.label, currency.format(memberCards.loanBalance.header ?? 0), IndianRupee, [
              `Active loans: ${memberCards.loanBalance.subfields.activeLoans ?? 0}`,
              `Principal outstanding: ${currency.format(memberCards.loanBalance.subfields.principalOutstanding ?? 0)}`,
              `Interest pending: ${currency.format(memberCards.loanBalance.subfields.interestPending ?? 0)}`,
              `Penalty pending: ${currency.format(memberCards.loanBalance.subfields.penaltyPending ?? 0)}`,
              `Disbursed till now: ${currency.format(memberCards.loanBalance.subfields.disbursedTillNow ?? 0)}`
            ]),
            metric(memberCards.nextMinimumDue.label, currency.format(memberCards.nextMinimumDue.header ?? 0), CalendarCheck, [
              `Saving due: ${currency.format(memberCards.nextMinimumDue.subfields.savingDue ?? 0)}`,
              `Principal due: ${currency.format(memberCards.nextMinimumDue.subfields.principalDue ?? 0)}`,
              `Interest due: ${currency.format(memberCards.nextMinimumDue.subfields.interestDue ?? 0)}`,
              `Penalty due: ${currency.format(memberCards.nextMinimumDue.subfields.penaltyDue ?? 0)}`,
              `Due: ${memberCards.nextMinimumDue.subfields.dueDate?.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }) ?? "-"}`
            ]),
            metric(memberCards.sharePercent.label, `${memberCards.sharePercent.header ?? 0}%`, WalletCards, [
              `Member share amount: ${currency.format(memberCards.sharePercent.subfields.memberShareAmount ?? 0)}`,
              `Total group share: ${currency.format(memberCards.sharePercent.subfields.totalGroupShare ?? 0)}`
            ])
          ]}
        />
        <Section title="Next payment">
          <div className="status-row">
            <div>
              <strong>Next minimum due</strong>
              <p>{currency.format(memberSummary.nextDueAmount)}</p>
            </div>
            <div>
              <strong>Due date</strong>
              <p>{memberSummary.dueDate.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <p className="section-note">Amount includes saving due, tenure-based principal due, interest till next month, and any charges.</p>
        </Section>
        <Section title="Member details">
          <div className="status-row">
            <div>
              <strong>Member</strong>
              <p>{member?.fullName ?? "-"}</p>
            </div>
            <div>
              <strong>Status</strong>
              <p>{member?.status ?? "-"}</p>
            </div>
            <div>
              <strong>Mobile</strong>
              <p>{member?.mobile || "-"}</p>
            </div>
            <div>
              <strong>Email</strong>
              <p>{member?.email || "-"}</p>
            </div>
            <div>
              <strong>Username</strong>
              <p>{member?.username || "-"}</p>
            </div>
            <div>
              <strong>Monthly saving</strong>
              <p>{currency.format(effectiveSetup.monthlySaving || 0)}</p>
            </div>
            <div>
              <strong>Loan limit</strong>
              <p>{currency.format(effectiveSetup.loanLimit || 0)}</p>
            </div>
            <div>
              <strong>Loan interest rate</strong>
              <p>{Number(effectiveSetup.interestRate || 0)}%</p>
            </div>
          </div>
        </Section>
        <Section title="Loan and EMI details">
          <div className="status-row">
            <div>
              <strong>Active loan</strong>
              <p>{memberSummary.memberActiveLoans.length}</p>
            </div>
            <div>
              <strong>Active loan outstanding</strong>
              <p>{currency.format(memberSummary.outstanding)}</p>
            </div>
            <div>
              <strong>Next EMI amount</strong>
              <p>{currency.format(nextEmiRow?.totalDue ?? memberSummary.nextDueAmount)}</p>
            </div>
            <div>
              <strong>EMI date</strong>
              <p>{formatDate(nextEmiRow?.dueDate ?? memberSummary.dueDate)}</p>
            </div>
            <div>
              <strong>Interest due</strong>
              <p>{currency.format(memberSummary.interestDue || openingInterestDue)}</p>
            </div>
            <div>
              <strong>Penalty due</strong>
              <p>{currency.format(sortedDueRows.reduce((sum, row) => sum + Number(row.penaltyDue || 0), 0) || openingPenaltyDue)}</p>
            </div>
          </div>
          <Table
            headers={["Loan amount", "Start date", "Principal outstanding", "Interest due", "Penalty due", "Total outstanding", "Rate", "Status"]}
            rows={memberSummary.memberActiveLoans.map((loan) => [
              currency.format(loan.amount || 0),
              formatDate(loanDate(loan)),
              currency.format(calculateDerivedLoanPrincipalOutstanding(loan, state)),
              currency.format(loan.interestOutstanding || 0),
              currency.format(loan.penaltyOutstanding || 0),
              currency.format(calculateLoanOutstandingWithDues(loan, state)),
              `${Number(loan.rate || effectiveSetup.interestRate || 0)}%`,
              loan.loanStatus || loan.status || loan.approvalStatus || "Active"
            ])}
          />
        </Section>
        <Section title="Next EMI schedule">
          <Table
            headers={["Month", "EMI date", "Saving due", "Loan principal", "Interest", "Penalty", "Total EMI"]}
            rows={sortedDueRows.map((row) => [
              row.periodName,
              formatDate(row.dueDate),
              currency.format(row.savingDue),
              currency.format(row.principalDue ?? row.outstandingPrincipal),
              currency.format(row.interestDue),
              currency.format(row.penaltyDue),
              currency.format(row.totalDue)
            ])}
          />
        </Section>
        <Section title="Recent closed loan">
          <Table
            headers={["Loan amount", "Start date", "Closed / last paid", "Interest paid", "Status"]}
            rows={recentClosedLoan ? [[
              currency.format(recentClosedLoan.amount || 0),
              formatDate(loanDate(recentClosedLoan)),
              formatDate(loanActivityDate(recentClosedLoan)),
              currency.format(recentClosedLoan.interestPaidTillNow || 0),
              recentClosedLoan.loanStatus || recentClosedLoan.status || recentClosedLoan.approvalStatus || "Closed"
            ]] : []}
          />
        </Section>
        <Section title="Recent notifications">
          <NotificationList notifications={state.notifications} />
        </Section>
      </Page>
    );
  }

  return (
    <Page title="Group Dashboard" subtitle="Live operating view for collectors, admins, approvers, and members" action={role === roles.MEMBER ? <button type="button" className="secondary-button" onClick={() => navigate("/")}>My Dashboard</button> : null}>
      <MetricGrid
        metrics={[
          metric(dashboardCards.totalSavings.label, currency.format(dashboardCards.totalSavings.header ?? 0), WalletCards, [
            `Members: ${dashboardCards.totalSavings.subfields.members ?? 0}`,
            `Active members: ${dashboardCards.totalSavings.subfields.activeMembers ?? 0}`,
            `Active member savings: ${currency.format(dashboardCards.totalSavings.subfields.activeMemberSavings ?? 0)}`,
            `Closed/Exited member savings: ${currency.format(dashboardCards.totalSavings.subfields.closedExitedMemberSavings ?? 0)}`,
            `Withdrawn savings: ${currency.format(dashboardCards.totalSavings.subfields.withdrawnSavings ?? 0)}`
          ]),
          metric(dashboardCards.collectedInPeriod.label, currency.format(dashboardCards.collectedInPeriod.header ?? 0), WalletCards, [
            `Savings collected: ${currency.format(dashboardCards.collectedInPeriod.subfields.savingsCollected ?? 0)}`,
            `Principal collected: ${currency.format(dashboardCards.collectedInPeriod.subfields.principalCollected ?? 0)}`,
            `Interest collected: ${currency.format(dashboardCards.collectedInPeriod.subfields.interestCollected ?? 0)}`,
            `Penalty collected: ${currency.format(dashboardCards.collectedInPeriod.subfields.penaltyCollected ?? 0)}`,
            `Withdrawn in period: ${currency.format(dashboardCards.collectedInPeriod.subfields.withdrawnInPeriod ?? 0)}`
          ]),
          metric(dashboardCards.activeLoan.label, currency.format(dashboardCards.activeLoan.header ?? 0), IndianRupee, [
            `Disbursed this month: ${currency.format(dashboardCards.activeLoan.subfields.disbursedThisMonth ?? 0)}`,
            `Loan disbursed till now: ${currency.format(dashboardCards.activeLoan.subfields.loanDisbursedTillNow ?? 0)}`,
            `Principal repaid till now: ${currency.format(dashboardCards.activeLoan.subfields.principalRepaidTillNow ?? 0)}`,
            `Interest pending: ${currency.format(dashboardCards.activeLoan.subfields.interestPending ?? 0)}`,
            `Penalty pending: ${currency.format(dashboardCards.activeLoan.subfields.penaltyPending ?? 0)}`
          ]),
          metric(dashboardCards.remainingBalance.label, currency.format(dashboardCards.remainingBalance.header ?? 0), WalletCards, [
            `Opening balance: ${currency.format(dashboardCards.remainingBalance.subfields.openingBalance ?? 0)}`,
            `Savings: ${currency.format(dashboardCards.remainingBalance.subfields.savings ?? 0)}`,
            `Principal collected: ${currency.format(dashboardCards.remainingBalance.subfields.principalCollected ?? 0)}`,
            `Interest collected: ${currency.format(dashboardCards.remainingBalance.subfields.interestCollected ?? 0)}`,
            `Penalty collected: ${currency.format(dashboardCards.remainingBalance.subfields.penaltyCollected ?? 0)}`,
            `Other income/Gain: ${currency.format(dashboardCards.remainingBalance.subfields.otherIncomeGain ?? 0)}`,
            `Expense: ${currency.format(dashboardCards.remainingBalance.subfields.expense ?? 0)}`,
            `Withdrawals: ${currency.format(dashboardCards.remainingBalance.subfields.withdrawals ?? 0)}`,
            `Loan outstanding: ${currency.format(dashboardCards.remainingBalance.subfields.loanOutstanding ?? 0)}`
          ]),
          metric(dashboardCards.activeLoans.label, String(dashboardCards.activeLoans.header ?? 0), Users, [
            `Disbursed till now: ${dashboardCards.activeLoans.subfields.disbursedTillNow ?? 0}`,
            `Closed till now: ${dashboardCards.activeLoans.subfields.closedTillNow ?? 0}`,
            `Activated this month: ${dashboardCards.activeLoans.subfields.activatedThisMonth ?? 0}`,
            `Overdue loans: ${dashboardCards.activeLoans.subfields.overdueLoans ?? 0}`,
            `Pending approval loans: ${dashboardCards.activeLoans.subfields.pendingApprovalLoans ?? 0}`
          ]),
          metric("Financial Period", financialPeriodLabel, CalendarCheck, [
            `Cycle start: ${financialPeriodStart.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
            `Repayment date: ${financialDueDate.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
            `Repayment day: ${Math.min(28, Math.max(1, Number(group.loanDueDay || 1)))}`
          ]),
          metric(dashboardCards.openPeriod.label, dashboardCards.openPeriod.header ?? "None", ShieldCheck, [
            `Current open month: ${dashboardCards.openPeriod.subfields.currentOpenMonth ?? "None"}`,
            `Period status: ${dashboardCards.openPeriod.subfields.periodStatus ?? "Not open"}`,
            `Start date: ${dashboardCards.openPeriod.subfields.startDate ?? "-"}`,
            `End date: ${dashboardCards.openPeriod.subfields.endDate ?? "-"}`
          ])
        ].filter(Boolean)}
      />
    </Page>
  );
}

function isUuid(value) {
  return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
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

function applyShareDistributionToMembers(members, shareRows) {
  const shareMap = Object.fromEntries((shareRows || []).map((row) => [row.memberId, row]));
  return members.map((member) => {
    const share = shareMap[member.id];
    const earnedFromGroup = Number(member.earnedFromGroup ?? member.groupGain ?? member.shares ?? 0) + Number(share?.shareAmount ?? 0);
    const savingsHeld = Number(member.savings || 0);
    return {
      ...member,
      earnedFromGroup,
      shares: savingsHeld + earnedFromGroup,
      sharePercent: share?.sharePercent ?? 0,
      shareActiveDays: share?.daysActive ?? 0
    };
  });
}

function getStateWithComputedShares(state) {
  const sharePeriod = getDashboardPeriod(state);
  const shareRows = calculateEventBasedShareDistribution({
    members: state.members || [],
    transactions: getCompletedTransactions(state.transactions || []),
    loans: (state.loans || []).filter((loan) =>
      isCompletedFinancialStatus(loan.approvalStatus)
      || ["ACTIVE", "COMPLETED", "APPROVED", "CLOSED"].includes(String(loan.status ?? loan.loanStatus ?? "").toUpperCase())
    ),
    period: sharePeriod
  });
  const shareByMember = Object.fromEntries(shareRows.map((row) => [row.memberId, row]));
  const stateWithGain = {
    ...state,
    members: (state.members || []).map((member) => ({
      ...member,
      earnedFromGroup: Number(shareByMember[member.id]?.shareAmount || 0),
      groupGain: Number(shareByMember[member.id]?.shareAmount || 0)
    }))
  };
  const summaries = (stateWithGain.members || []).map((member) => [member.id, calculateMemberLedgerSummary(member, stateWithGain)]);
  const totalShareAmount = summaries.reduce((sum, [, summary]) => sum + Math.max(0, summary.shareAmount), 0);
  const summaryByMember = Object.fromEntries(summaries);
  return {
    ...stateWithGain,
    members: (stateWithGain.members || []).map((member) => ({
      ...member,
      shareAmount: summaryByMember[member.id]?.shareAmount ?? 0,
      sharePercent: totalShareAmount > 0
        ? Number(((Math.max(0, summaryByMember[member.id]?.shareAmount ?? 0) / totalShareAmount) * 100).toFixed(2))
        : 0
    }))
  };
}

function getVisibleNotifications(notifications = [], role, member) {
  if (role !== roles.MEMBER) return notifications;
  return notifications.filter((notification) =>
    (Array.isArray(notification.recipientMemberIds) && notification.recipientMemberIds.length > 0
      ? notification.recipientMemberIds.map(String).includes(String(member?.id))
      : true)
    &&
    !notification.memberId || String(notification.memberId) === String(member?.id)
  );
}

function isGroupAdminActor(state, actor) {
  if ([roles.SUPER_ADMIN, roles.PRODUCT_OWNER, roles.GROUP_ADMIN].includes(actor?.role)) return true;
  const member = getCurrentMember(state, actor);
  return member?.memberRole === roles.GROUP_ADMIN;
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

function approvalBatchFor(approval, approvals = []) {
  if (!approval?.batchId) return approval ? [approval] : [];
  return (approvals || []).filter((item) => item.batchId === approval.batchId);
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

function formatHistoryValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  try {
    const json = JSON.stringify(value);
    return json.length > 160 ? `${json.slice(0, 160)}...` : json;
  } catch {
    return String(value);
  }
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

function getHiddenGroupIds(actor) {
  const storageKey = `bachat-hidden-groups-${actor?.id || actor?.email || "local"}`;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.from(new Set([...(actor?.hiddenGroupIds || []), ...(Array.isArray(saved) ? saved : [])].map(String)));
  } catch {
    return (actor?.hiddenGroupIds || []).map(String);
  }
}

function saveHiddenGroupIds(actor, ids) {
  const storageKey = `bachat-hidden-groups-${actor?.id || actor?.email || "local"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Hiding groups is a convenience preference; the app can continue without storage.
  }
}

function GroupSelectionPage({ state, setState, selectedGroupId, setSelectedGroupId, actor, setConfirmDialog, setNotification }) {
  const navigate = useNavigate();
  const [showCreateForm, setShowCreateForm] = useState(state.groups.length === 0);
  const [showHiddenGroups, setShowHiddenGroups] = useState(false);
  const [values, setValues] = useState({
    name: "",
    primaryContact: ""
  });
  const [errors, setErrors] = useState({});
  const hiddenGroupIds = new Set(getHiddenGroupIds(actor));
  const visibleGroups = (state.groups || []).filter((group) => !hiddenGroupIds.has(String(group.id)));
  const hiddenGroups = (state.groups || []).filter((group) => hiddenGroupIds.has(String(group.id)));
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const filteredVisibleGroups = visibleGroups.filter((group) => {
    const q = String(groupSearchQuery || "").toLowerCase();
    if (!q) return true;
    return [group.name, group.code].some((f) => String(f || "").toLowerCase().includes(q));
  });

  function setGroupHidden(groupId, hidden) {
    const nextHiddenIds = new Set(getHiddenGroupIds(actor));
    if (hidden) nextHiddenIds.add(String(groupId));
    else nextHiddenIds.delete(String(groupId));
    saveHiddenGroupIds(actor, Array.from(nextHiddenIds));
    setState((current) => ({
      ...current,
      session: {
        ...current.session,
        user: {
          ...current.session.user,
          hiddenGroupIds: Array.from(nextHiddenIds)
        }
      }
    }));
    setNotification({ type: "success", message: hidden ? "Group hidden from this list." : "Group unhidden." });
  }

  async function submit(event) {
    event.preventDefault();
    const result = validate(groupSchema, values);
    setErrors(result.errors);
    if (!result.data) return;
    if (!repository.isConfigured()) {
      setNotification({ type: "error", message: "Cloud sync is not configured. Enable secure storage to save groups." });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setConfirmDialog({
      title: 'Save group',
      message: 'Save group online? Confirm to commit.',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const createdGroup = await repository.createGroup({
            group_name: result.data.name,
            name: result.data.name,
            code: `BG-${Date.now().toString().slice(-5)}`,
            type: 'Saving Group',
            currency: 'INR',
            interestType: 'Reducing',
            financialYear: `2026-${(new Date().getFullYear() + 1).toString().slice(-2)}`,
            startMonth: new Date().getMonth() + 1,
            maximumLoanLimit: 0,
            loanMultiplier: 3,
            loanEligibilityRules: { monthlySaving: 0 },
            createdBy: isUuid(actor?.id) ? actor.id : undefined,
            createdDate: new Date().toISOString().slice(0, 10),
            subscriptionStatus: 'Active'
          });

          const tenantData = await repository.listTenantData();
          const tenantMembers = tenantData.members?.some((member) => String(member.groupId) === String(createdGroup.id))
            ? tenantData.members
            : createdGroup.creatorMember
              ? [createdGroup.creatorMember, ...(tenantData.members || [])]
              : tenantData.members;
          setState(() => ({
            ...tenantData,
            members: tenantMembers,
            session: { signedIn: true, user: tenantData.session?.user ?? actor }
          }));

          setSelectedGroupId(createdGroup.id);
          setValues({ name: '', primaryContact: '' });
          setShowCreateForm(false);
          setNotification({ type: 'success', message: 'Group saved online.' });
          setTimeout(() => setNotification(null), 3000);
          navigate('/', { replace: true });
        } catch (error) {
          console.error('Create group failed', error);
          setNotification({ type: 'error', message: `Unable to save group online: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
        setNotification({ type: 'info', message: 'Group not saved online.' });
        setTimeout(() => setNotification(null), 3000);
      }
    });
    return;
  }

  function viewTransaction(item) {
    const details = [
      `Transaction: ${item.transactionNumber ?? item.id}`,
      `Date: ${item.transactionDate}`,
      `Amount: ${currency.format(item.amount)}`,
      `Status: ${item.approvalStatus}`,
      `Remarks: ${item.remarks ?? "None"}`
    ].join("\n");
    setNotification({ type: "info", message: "Transaction details", details });
  }

  function adjustTransaction(item) {
    const rawAmount = window.prompt("Enter adjustment amount. Use negative value for reduction.", "0");
    if (rawAmount === null) return;
    const adjustmentAmount = Number(rawAmount);
    if (!Number.isFinite(adjustmentAmount) || adjustmentAmount === 0) {
      setNotification({ type: "error", message: "Enter a non-zero adjustment amount." });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setConfirmDialog({
      title: "Create adjustment",
      message: `Create ${currency.format(adjustmentAmount)} adjustment for ${item.transactionNumber ?? item.id}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const created = await repository.adjustTransaction(item.id, {
            ...item,
            amount: adjustmentAmount,
            allocation: { savings: adjustmentAmount },
            transactionDate: toIsoDateValue(),
            approvalStatus: "PENDING",
            remarks: `Adjustment for ${item.transactionNumber ?? item.id}`
          });
          setState((current) => audit({
            state: { ...current, transactions: [created, ...current.transactions] },
            actor,
            action: "adjust",
            tableName: "member_transaction_header",
            recordId: created.id,
            newValue: created
          }));
          setNotification({ type: "success", message: "Adjustment entry created." });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          setNotification({ type: "error", message: `Unable to create adjustment: ${error.message}`, details: serializeError(error) });
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  function reverseTransaction(item) {
    setConfirmDialog({
      title: "Reverse transaction",
      message: `Create a full negative reversal for ${item.transactionNumber ?? item.id}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const created = await repository.reverseTransaction(item);
          setState((current) => audit({
            state: { ...current, transactions: [created, ...current.transactions] },
            actor,
            action: "reverse",
            tableName: "member_transaction_header",
            recordId: created.id,
            newValue: created
          }));
          setNotification({ type: "success", message: "Reversal entry created." });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          setNotification({ type: "error", message: `Unable to reverse transaction: ${error.message}`, details: serializeError(error) });
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  function selectGroup(groupId) {
    setSelectedGroupId(groupId);
    navigate("/", { replace: true });
  }

  async function ensureLatestTenantData() {
    if (!repository.isConfigured()) return;
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Select a group</h1>
          <p>Choose which Bachat Gat group you want to work with</p>
        </div>
      </div>

      <div className="button-row group-switch-actions">
        <button type="button" className="primary-button" onClick={() => setShowCreateForm((open) => !open)}>
          {showCreateForm ? "Close Group Form" : "Create New Group"}
        </button>
        <button type="button" className="secondary-button" onClick={() => setShowHiddenGroups((open) => !open)} disabled={hiddenGroups.length === 0}>
          {showHiddenGroups ? "Hide Hidden Groups" : `Hidden Groups (${hiddenGroups.length})`}
        </button>
      </div>

      {showCreateForm && (
        <FormCard title="Create new group" onSubmit={submit}>
          <Field label="Group name" value={values.name} onChange={(value) => setValues({ ...values, name: value })} error={errors.name} required />
          <Field label="Primary mobile or email" value={values.primaryContact} onChange={(value) => setValues({ ...values, primaryContact: value })} error={errors.primaryContact} />
        </FormCard>
      )}

      {state.groups.length === 0 ? (
        <Section title="No groups yet">
          <p className="section-note">
            Create your first Bachat Gat group to unlock members, periods, collections, loans, approvals, and reports.
          </p>
        </Section>
      ) : (
        <Section title="Your groups">
          <div style={{ marginBottom: 12 }}>
            <input placeholder="Search groups by name or code" value={groupSearchQuery} onChange={(e) => setGroupSearchQuery(e.target.value)} />
          </div>
          <div className="data-grid">
            {filteredVisibleGroups.map((group) => {
              const creator = group.creatorName
                || state.members.find((member) => String(member.groupId) === String(group.id) && member.memberRole === roles.GROUP_ADMIN)?.fullName
                || group.primaryContactName
                || "Not available";
              return (
              <article
                className="entity-card"
                key={group.id}
                onClick={() => selectGroup(group.id)}
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    selectGroup(group.id);
                  }
                }}
              >
                <div>
                  <h3>{group.name}</h3>
                  <p>{group.code}</p>
                  <p className="section-note">Creator: {creator}</p>
                  <p className="section-note">Created: {new Date(group.createdDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setGroupHidden(group.id, true);
                    }}
                  >
                    Hide
                  </button>
                </div>
              </article>
            );})}
          </div>
          {visibleGroups.length === 0 && <p className="section-note">All groups are hidden. Open hidden groups below to unhide one.</p>}
        </Section>
      )}

      {showHiddenGroups && hiddenGroups.length > 0 && (
        <Section title="Hidden groups">
            <div className="data-grid">
              {hiddenGroups.map((group) => (
                <article className="entity-card" key={group.id}>
                  <h3>{group.name}</h3>
                  <p>{group.code}</p>
                  <div className="button-row">
                    <button type="button" onClick={() => setGroupHidden(group.id, false)}>Unhide</button>
                  </div>
                </article>
              ))}
            </div>
        </Section>
      )}

    </div>
  );
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

function Members({ state, setState, actor, setConfirmDialog, setNotification }) {
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    mobile: "",
    username: ""
  });
  const [errors, setErrors] = useState({});

  async function submit(event) {
    event.preventDefault();
    const normalizedFullName = values.fullName.trim();
    const normalizedEmail = values.email.trim().toLowerCase();
    const normalizedMobile = values.mobile.replace(/\D/g, "");
    const firstName = normalizedFullName.split(" ")[0] || normalizedFullName;
    const username = values.username.trim();
    const validatedValues = { ...values, fullName: normalizedFullName, email: normalizedEmail, mobile: normalizedMobile, username };
    const result = validate(memberSchema, validatedValues);

    const duplicateMember = state.members.find((member) =>
      (normalizedFullName && member.fullName?.trim().toLowerCase() === normalizedFullName.toLowerCase())
      || (normalizedEmail && member.email === normalizedEmail)
      || (normalizedMobile && member.mobile === normalizedMobile)
      || member.username?.toLowerCase() === username.toLowerCase()
    );

    const nextErrors = {
      ...result.errors,
      ...(duplicateMember ? {
        ...(normalizedFullName && duplicateMember.fullName?.trim().toLowerCase() === normalizedFullName.toLowerCase() ? { fullName: "Member full name already exists in this group" } : {}),
        ...(normalizedEmail && duplicateMember.email === normalizedEmail ? { email: "Email already exists" } : {}),
        ...(normalizedMobile && duplicateMember.mobile === normalizedMobile ? { mobile: "Mobile already exists" } : {}),
        ...(duplicateMember.username?.toLowerCase() === username.toLowerCase() ? { username: "Username must be unique in this group" } : {})
      } : {})
    };

    setErrors(nextErrors);
    if (!result.data || duplicateMember) return;

    const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
    const localMember = {
      id: makeId("mem"),
      ...result.data,
      username,
      address: "",
      dateJoined: new Date().toISOString().slice(0, 10),
      nominee: "",
      aadhaar: "",
      pan: "",
      status: hasGroupApprovers ? "Inactive" : "Active",
      approvalStatus: hasGroupApprovers ? "Pending" : "Completed",
      savings: 0,
      loanOutstanding: 0,
      shares: 0
    };

    // Require online save when cloud sync is configured.
    if (!repository.isConfigured()) {
      setNotification({ type: 'error', message: 'Cloud sync is not configured. Enable secure storage to save members.' });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    const primaryGroupId = state.groups[0]?.id;
    const activePlan = getGroupPlan(state, primaryGroupId);
    const activeMemberCount = activeMembersForTransactions(state.members || []).length;
    if (Number.isFinite(activePlan.maxMembers) && activeMemberCount >= activePlan.maxMembers) {
      setNotification({ type: "error", message: `Free plan allows ${activePlan.maxMembers} active members only. Make a member inactive or subscribe to add more active members.` });
      return;
    }
    if (!isUuid(primaryGroupId)) {
      setNotification({ type: 'error', message: 'Selected group is not yet persisted. Save a group first.' });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setConfirmDialog({
      title: 'Save member',
      message: 'Save member online? Confirm to commit.',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const createdMember = await repository.createMember(localMember, primaryGroupId);
          const approvalRecords = hasGroupApprovers
            ? createConfiguredApprovalRecords({
                state,
                action: "Approve member addition",
                requester: actor.name,
                amount: 0,
                referenceId: createdMember.id,
                referenceType: "member_addition",
                details: `Add member ${createdMember.fullName} (${createdMember.username || createdMember.email || "-"})`
              })
            : [];
          const persistedApprovals = approvalRecords.length && repository.isConfigured()
            ? await repository.createApprovalRequests({ groupId: primaryGroupId, approvals: approvalRecords })
            : approvalRecords;
          const memberForState = hasGroupApprovers
            ? { ...createdMember, status: "Inactive", approvalStatus: "Pending" }
            : createdMember;
          setState((current) => audit({
            state: addGroupNotification({
              ...current,
              members: [memberForState, ...current.members],
              approvals: [...persistedApprovals, ...current.approvals]
            }, hasGroupApprovers ? {
              title: "Member addition approval requested",
              body: `${actor.name} requested approval to add ${createdMember.fullName}. Pending with ${approvalRecords.map((approval) => approval.approverName || approval.level).join(", ")}.`,
              type: "info"
            } : {
              title: "Member added",
              body: `${createdMember.fullName} was added to the group.`,
              type: "success"
            }),
            actor,
            action: hasGroupApprovers ? "request" : "create",
            tableName: 'group_members',
            recordId: createdMember.id,
            newValue: memberForState
          }));
          setNotification({ type: 'success', message: hasGroupApprovers ? 'Member addition sent for approval.' : 'Member saved online.' });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          console.error('Create member failed', error);
          setNotification({ type: 'error', message: `Unable to save member online: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
        setNotification({ type: 'info', message: 'Member not saved online.' });
        setTimeout(() => setNotification(null), 3000);
      }
    });
    return;

    setState((current) => audit({
      state: {
        ...current,
        members: [createdMember, ...current.members],
        approvals: hasGroupApprovers
          ? [{
              id: makeId("apr"),
              action: "Member addition",
              requester: actor.name,
              level: "Level 1",
              status: "Pending",
              amount: null
            }, ...current.approvals]
          : current.approvals
      },
      actor,
      action: "create",
      tableName: "group_members",
      recordId: createdMember.id,
      newValue: createdMember
    }));
  }

  async function handleDeleteMember(member) {
    if (!member) return;
    if (hasMemberGroupActivity(member, state)) {
      setNotification({ type: "error", message: `${member.fullName} already has group activity, so it cannot be deleted.` });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setConfirmDialog({
      title: "Delete member",
      message: `Delete ${member.fullName} from this group? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        if (!repository.isConfigured()) {
          setNotification({ type: "error", message: "Cloud sync is not configured. Enable secure storage before deleting a member." });
          setTimeout(() => setNotification(null), 4000);
          return;
        }

        try {
          await repository.deleteMember(member.id);
          setState((current) => audit({
            state: {
              ...current,
              members: current.members.filter((item) => String(item.id) !== String(member.id))
            },
            actor,
            action: "delete",
            tableName: "group_members",
            recordId: member.id,
            oldValue: member,
            newValue: null
          }));
          setNotification({ type: "success", message: `${member.fullName} was deleted from the group.` });
          setTimeout(() => setNotification(null), 4000);
        } catch (error) {
          console.error("Delete member failed", error);
          setNotification({ type: "error", message: `Unable to delete member: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
      }
    });
  }

  return (
    <Page title="Members" subtitle="Member master with unique mobile, email, username, nominee and bank readiness" action={null}>
      <FormCard title="Add member" onSubmit={submit}>
        <Field label="Full name" value={values.fullName} onChange={(value) => setValues({ ...values, fullName: value })} error={errors.fullName} required />
        <Field label="Email" type="email" value={values.email} onChange={(value) => setValues({ ...values, email: value })} error={errors.email} />
        <Field label="Mobile" type="tel" value={values.mobile} onChange={(value) => setValues({ ...values, mobile: value })} error={errors.mobile} />
        <Field label="Username" value={values.username} onChange={(value) => setValues({ ...values, username: value })} error={errors.username} required />
        <div className="section-note">Email and mobile are optional. If you want the member to login later, add their email and ask them to register with the same email.</div>
      </FormCard>
      <Table
        headers={["Member", "Email", "Mobile", "Username", "Savings", "Loan", "Status", "Actions"]}
        rows={state.members.map((member) => {
          const summary = calculateMemberFinanceSummary(member, state, getDashboardPeriod(state), actor);
          const canDelete = !hasMemberGroupActivity(member, state);
          return [
            member.fullName,
            member.email,
            member.mobile,
            member.username,
            currency.format(summary.savings),
            currency.format(summary.outstanding),
            statusWithPendingApprover({ id: member.id, approvalStatus: member.approvalStatus ?? member.status }, state.approvals, "member_addition"),
            canDelete ? (
              <button type="button" className="secondary-button" onClick={() => handleDeleteMember(member)}>
                Delete
              </button>
            ) : (
              <span className="section-note">In use</span>
            )
          ];
        })}
      />
    </Page>
  );
}

const subscriptionPlans = [
  {
    id: "free",
    name: "Free",
    duration: "Free",
    amount: 0,
    maxGroups: 1,
    maxMembers: 5,
    features: ["1 group", "5 members", "Basic savings and loan tracking", "Member app access"]
  },
  {
    id: "starter-monthly",
    name: "Starter",
    duration: "Monthly",
    amount: 99,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["1 group", "Unlimited members", "Approvals", "Audit control", "Role control", "Free member app access", "Contact support to setup your group", "Technical issue support"]
  },
  {
    id: "starter-yearly",
    name: "Starter",
    duration: "Yearly",
    amount: 999,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["1 group", "Unlimited members", "Approvals", "Audit control", "Role control", "Free member app access", "Contact support to setup your group", "Technical issue support"]
  },
  {
    id: "growth-monthly",
    name: "Growth",
    duration: "Monthly",
    amount: 299,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["Everything in Starter", "Group management query support", "Assisted transaction entry support", "Daily/monthly adjustment support"]
  },
  {
    id: "growth-yearly",
    name: "Growth",
    duration: "Yearly",
    amount: 2999,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["Everything in Starter", "Group management query support", "Assisted transaction entry support", "Daily/monthly adjustment support"]
  },
  {
    id: "premium-monthly",
    name: "Premium",
    duration: "Monthly",
    amount: 999,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["Everything in Growth", "Priority support", "Advanced reconciliation support", "Dedicated setup guidance"]
  },
  {
    id: "premium-yearly",
    name: "Premium",
    duration: "Yearly",
    amount: 9999,
    maxGroups: 1,
    maxMembers: Infinity,
    features: ["Everything in Growth", "Priority support", "Advanced reconciliation support", "Dedicated setup guidance"]
  }
];

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function loadRazorpayCheckout() {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay checkout is available only in the browser."));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay checkout.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout."));
    document.body.appendChild(script);
  });
}

function monthKey(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

function getProductOwnerMonthRows(groups, members, subscriptions) {
  const rows = {};
  function ensure(month) {
    rows[month] = rows[month] ?? { month, groups: 0, users: 0, subscriptions: 0, amount: 0 };
    return rows[month];
  }

  groups.forEach((group) => {
    ensure(monthKey(group.createdDate)).groups += 1;
  });
  members.forEach((member) => {
    ensure(monthKey(member.createdAt || member.dateJoined)).users += 1;
  });
  subscriptions.forEach((subscription) => {
    const row = ensure(monthKey(subscription.startDate || subscription.renewalDate || subscription.renewsOn));
    row.subscriptions += 1;
    row.amount += Number(subscription.amount || 0);
  });

  return Object.values(rows)
    .filter((row) => row.month !== "Unknown")
    .sort((a, b) => new Date(`1 ${b.month}`) - new Date(`1 ${a.month}`))
    .slice(0, 12);
}

function getActiveGroupSubscription(state, groupId) {
  return (state.subscriptions || []).find((subscription) =>
    String(subscription.groupId) === String(groupId)
    && ["ACTIVE", "PAID"].includes(String(subscription.status || subscription.paymentStatus || "").toUpperCase())
  );
}

function getGroupPlan(state, groupId) {
  const subscription = getActiveGroupSubscription(state, groupId);
  return subscriptionPlans.find((plan) => plan.name === subscription?.plan && plan.duration === subscription?.duration)
    ?? subscriptionPlans.find((plan) => plan.id === "free");
}

function Subscriptions({ state, setState, actor, selectedGroup, setConfirmDialog, setNotification }) {
  const currentSubscription = state.subscriptions.find((subscription) => !subscription.groupId || String(subscription.groupId) === String(selectedGroup?.id));
  const activePlan = getGroupPlan(state, selectedGroup?.id);
  const [paymentPlanId, setPaymentPlanId] = useState("");

  function subscribe(plan) {
    if (plan.id === "free") {
      setNotification({ type: "info", message: "Free plan is active by default for 1 group and 5 members." });
      return;
    }
    if (!selectedGroup?.id) {
      setNotification({ type: "error", message: "Create/select a group before buying a plan." });
      return;
    }
    if (!repository.isConfigured()) {
      setNotification({ type: "error", message: "Cloud sync must be enabled before payments can be used." });
      return;
    }
    if (!import.meta.env.VITE_RAZORPAY_KEY_ID) {
      setNotification({ type: "error", message: "Add VITE_RAZORPAY_KEY_ID in .env.local before taking payments." });
      return;
    }
    setConfirmDialog({
      title: `Subscribe to ${plan.name}`,
      message: `Proceed with ${plan.duration.toLowerCase()} payment of ${currency.format(plan.amount)} per group using Razorpay?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setPaymentPlanId(plan.id);
        try {
          await loadRazorpayCheckout();
          const orderResult = await repository.createRazorpayOrder({
            groupId: selectedGroup.id,
            planName: plan.name,
            duration: plan.duration
          });
          const order = orderResult.order;
          if (!order?.id) throw new Error("Razorpay order was not created.");

          const checkoutResult = await new Promise((resolve, reject) => {
            const razorpay = new window.Razorpay({
              key: import.meta.env.VITE_RAZORPAY_KEY_ID,
              amount: order.amount,
              currency: order.currency ?? "INR",
              name: "Bachat Gat SaaS",
              description: `${plan.name} ${plan.duration} plan`,
              order_id: order.id,
              prefill: {
                name: actor?.name ?? "",
                email: actor?.email ?? "",
                contact: actor?.mobile ?? ""
              },
              notes: {
                group_id: String(selectedGroup.id),
                plan_name: plan.name,
                duration: plan.duration
              },
              theme: { color: "#0f766e" },
              handler: resolve,
              modal: {
                ondismiss: () => reject(new Error("Payment cancelled."))
              }
            });
            razorpay.on("payment.failed", (response) => {
              const description = response?.error?.description || response?.error?.reason || "Payment failed.";
              reject(new Error(description));
            });
            razorpay.open();
          });

          const verification = await repository.verifyRazorpayPayment({
            groupId: selectedGroup.id,
            planName: plan.name,
            duration: plan.duration,
            ...checkoutResult
          });
          const verifiedPlan = verification.plan ?? plan;
          const verifiedSubscription = verification.subscription ?? {};
          const subscription = {
            id: verifiedSubscription.group_subscription_id ?? makeId("sub"),
            groupId: selectedGroup.id,
            groupName: selectedGroup.name ?? state.groups[0]?.name ?? "Current group",
            plan: verifiedPlan.name ?? plan.name,
            duration: verifiedPlan.duration ?? plan.duration,
            status: "Active",
            amount: Number(verifiedPlan.amount ?? plan.amount),
            startDate: verifiedSubscription.start_date,
            endDate: verifiedSubscription.end_date,
            renewalDate: verifiedSubscription.end_date ?? addMonths(new Date(), plan.duration === "Yearly" ? 12 : 1).toISOString().slice(0, 10),
            paymentStatus: "Paid",
            paymentProvider: "Razorpay",
            transactionReference: verifiedSubscription.transaction_reference ?? checkoutResult.razorpay_payment_id,
            maxMembers: Number(verifiedPlan.maxMembers ?? plan.maxMembers),
            features: verifiedPlan.features ?? plan.features
          };

          setState((current) => audit({
            state: {
              ...current,
              subscriptions: [
                subscription,
                ...(current.subscriptions || []).filter((item) => String(item.groupId) !== String(selectedGroup.id))
              ]
            },
            actor,
            action: "subscribe",
            tableName: "group_subscriptions",
            recordId: subscription.id,
            newValue: subscription
          }));
          setNotification({ type: "success", message: `${subscription.plan} ${subscription.duration} subscription activated. Razorpay payment ${checkoutResult.razorpay_payment_id} verified.` });
          setTimeout(() => setNotification(null), 6000);
        } catch (error) {
          setNotification({ type: "error", message: `Unable to complete Razorpay payment: ${error.message}`, details: serializeError(error) });
        } finally {
          setPaymentPlanId("");
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
        setNotification({ type: "info", message: "Subscription payment cancelled." });
        setTimeout(() => setNotification(null), 3000);
      }
    });
  }

  return (
    <Page title="Subscriptions" subtitle="Choose a plan and complete one-time Razorpay payment" action={null}>
      {!currentSubscription && (
        <Section title="Current plan">
          <div className="status-row">
            <CheckCircle2 className="success" size={22} />
            <div>
              <strong>{activePlan.name} plan active</strong>
              <span>1 group / {activePlan.maxMembers} members. Subscribe when you need more members or assisted support.</span>
            </div>
          </div>
        </Section>
      )}
      {currentSubscription && (
        <Section title="Current subscription">
          <div className="status-row">
            <CheckCircle2 className="success" size={22} />
            <div>
              <strong>{currentSubscription.plan} {currentSubscription.duration ?? ""} plan active</strong>
              <span>Renewal {currentSubscription.renewalDate} / {currentSubscription.paymentProvider ?? "Manual"} / {currentSubscription.transactionReference ?? "No reference"}</span>
            </div>
          </div>
        </Section>
      )}
      <div className="data-grid">
        {subscriptionPlans.map((plan) => (
          <article className="entity-card" key={plan.id}>
            <span className="pill success-pill">{plan.duration}</span>
            <h3>{plan.name}</h3>
            <p>{plan.maxGroups} group / {Number.isFinite(plan.maxMembers) ? `${plan.maxMembers} members` : "Unlimited members"}</p>
            <strong>{currency.format(plan.amount)}</strong>
            <div className="tag-list">
              {plan.features.map((feature) => <span key={feature}>{feature}</span>)}
            </div>
            <button type="button" className="primary-button" onClick={() => subscribe(plan)} disabled={Boolean(paymentPlanId)}>
              {paymentPlanId === plan.id ? "Opening Razorpay..." : plan.amount === 0 ? "Current Free Plan" : "Pay & Subscribe"}
            </button>
          </article>
        ))}
      </div>
    </Page>
  );
}

function SetupPage({ state, setState, actor, selectedGroup, initialSetupTab = "group", initialFinancialTab = "approvers", setConfirmDialog, setNotification, migrationLoading, setMigrationLoading }) {
  useEffect(() => { ensureLatestTenantData(); }, []);
  const setupLocation = useLocation();
  const group = selectedGroup ?? state.groups[0];
  const blankIfUnset = (value) => value === null || value === undefined ? "" : value;
  const optionalNumber = (value) => value === "" || value === null || value === undefined ? null : Number(value);
  const [activeSetupTab, setActiveSetupTab] = useState(initialSetupTab);
  const [financialTab, setFinancialTab] = useState(initialFinancialTab);
  const now = new Date();
  const [periodPicker, setPeriodPicker] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear()
  });
  const [groupValues, setGroupValues] = useState({
    interestType: group?.interestType ?? "Reducing",
    interestRate: blankIfUnset(group?.interestRate),
    monthlySaving: blankIfUnset(group?.monthlySaving),
    maximumLoanLimit: blankIfUnset(group?.maximumLoanLimit),
    penaltyAmount: blankIfUnset(group?.penaltyAfterDueDateAmount ?? group?.penaltyAmount),
    loanInterestStartMode: group?.loanInterestStartMode ?? "disbursement",
    loanTenureMonths: blankIfUnset(group?.loanTenureMonths),
    loanDueDay: group?.loanDueDay ?? 1,
    approvers: group?.approvers ?? [],
    admins: group?.admins ?? state.members.filter((member) => member.memberRole === roles.GROUP_ADMIN || member.role === roles.GROUP_ADMIN).map((member) => member.fullName)
  });
  const [selectedMemberId, setSelectedMemberId] = useState(state.members[0]?.id ?? "");
  const selectedMember = state.members.find((member) => String(member.id) === String(selectedMemberId));
  const [memberSetupValues, setMemberSetupValues] = useState({
    fullName: selectedMember?.fullName ?? "",
    email: selectedMember?.email ?? "",
    mobile: selectedMember?.mobile ?? "",
    username: selectedMember?.username ?? "",
    aadhaar: selectedMember?.aadhaar ?? "",
    pan: selectedMember?.pan ?? "",
    address: selectedMember?.address ?? "",
    interestRate: blankIfUnset(selectedMember?.interestRate),
    interestType: selectedMember?.interestType || group?.interestType || "Reducing",
    maximumLoanLimit: blankIfUnset(selectedMember?.maximumLoanLimit ?? selectedMember?.loanLimit),
    monthlySaving: blankIfUnset(selectedMember?.monthlySaving ?? selectedMember?.customSavingAmount),
    loanTenureMonths: blankIfUnset(selectedMember?.loanTenureMonths),
    status: selectedMember?.inactiveDate && selectedMember.inactiveDate <= toIsoDateValue() ? "Inactive" : selectedMember?.status ?? "Active",
    inactiveDate: selectedMember?.inactiveDate ?? ""
  });
  const [legacyErrors, setLegacyErrors] = useState({});
  const [legacyGroupMigration, setLegacyGroupMigration] = useState({
    migrationDate: toIsoDateValue(),
    openingBankBalance: "",
    openingGroupGain: "",
    remarks: ""
  });
  const [legacyExpenseLines, setLegacyExpenseLines] = useState([{ category: "Opening expense", amount: "", remarks: "" }]);
  const legacyExpenseTotal = legacyExpenseLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const isLegacyGroupExpense = false;
  const [shareCalculator, setShareCalculator] = useState({
    remainingMoney: "",
    outstandingLoan: "",
    perMemberSaving: "",
    numberOfMembers: state.members?.length ? String(state.members.length) : "",
    totalMonths: "",
    groupStartDate: "",
    groupLastDate: ""
  });
  const [shareCalculatorCalculated, setShareCalculatorCalculated] = useState(false);
  const numberOrZero = (value) => Number(value || 0);
  const calculateInclusiveMonths = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    return Math.max(0, ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1);
  };
  const memberCountForShare = Math.max(0, Math.floor(Number(shareCalculator.numberOfMembers || 0)));
  const shareTotalGroupValue = numberOrZero(shareCalculator.remainingMoney) + numberOrZero(shareCalculator.outstandingLoan);
  const calculatorMonths = Math.max(0, Number(shareCalculator.totalMonths || 0) || calculateInclusiveMonths(shareCalculator.groupStartDate, shareCalculator.groupLastDate));
  const expectedMemberSaving = numberOrZero(shareCalculator.perMemberSaving) * calculatorMonths;
  const expectedTotalSavings = memberCountForShare * numberOrZero(shareCalculator.perMemberSaving) * calculatorMonths;
  const estimatedGroupGain = shareTotalGroupValue - expectedTotalSavings;
  const estimatedPerMemberGain = memberCountForShare > 0 ? estimatedGroupGain / memberCountForShare : 0;
  const estimatedPerMemberShare = expectedMemberSaving + estimatedPerMemberGain;

  function updateLegacyExpenseLine(index, key, value) {
    setLegacyExpenseLines((current) => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, [key]: value } : line
    ));
  }

  function addLegacyExpenseLine() {
    setLegacyExpenseLines((current) => [...current, { category: "Opening expense", amount: "", remarks: "" }]);
  }

  function removeLegacyExpenseLine(index) {
    setLegacyExpenseLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index));
  }

  useEffect(() => {
    setActiveSetupTab(initialSetupTab);
    setFinancialTab(initialFinancialTab);
  }, [initialSetupTab, initialFinancialTab]);

  useEffect(() => {
    if (!state.members.find((member) => String(member.id) === String(selectedMemberId))) {
      setSelectedMemberId(state.members[0]?.id ?? "");
    }
  }, [state.members, selectedMemberId]);

  useEffect(() => {
    if (!state.legacyMigration?.memberId && state.members[0]?.id) {
      setState((current) => ({
        ...current,
        legacyMigration: { ...current.legacyMigration, memberId: state.members[0].id }
      }));
    }
  }, [state.members, state.legacyMigration?.memberId, setState]);

  useEffect(() => {
    setMemberSetupValues({
      fullName: selectedMember?.fullName ?? "",
      email: selectedMember?.email ?? "",
      mobile: selectedMember?.mobile ?? "",
      username: selectedMember?.username ?? "",
      aadhaar: selectedMember?.aadhaar ?? "",
      pan: selectedMember?.pan ?? "",
      address: selectedMember?.address ?? "",
      interestRate: blankIfUnset(selectedMember?.interestRate),
      interestType: selectedMember?.interestType || group?.interestType || "Reducing",
      maximumLoanLimit: blankIfUnset(selectedMember?.maximumLoanLimit ?? selectedMember?.loanLimit),
      monthlySaving: blankIfUnset(selectedMember?.monthlySaving ?? selectedMember?.customSavingAmount),
      loanTenureMonths: blankIfUnset(selectedMember?.loanTenureMonths),
      status: selectedMember?.inactiveDate && selectedMember.inactiveDate <= toIsoDateValue() ? "Inactive" : selectedMember?.status ?? "Active",
      inactiveDate: selectedMember?.inactiveDate ?? ""
    });
  }, [selectedMember]);

  const periodData = Array.isArray(state.periods) ? state.periods : [];
  const recentLegacyMigrations = (state.transactions || [])
      .filter((transaction) => transaction.transactionType === "Migrated")
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.transactionDate,
        memberId: transaction.memberId,
        joinedDate: transaction.transactionDate,
        exitDate: "",
        saving: Number(transaction.allocation?.savings ?? transaction.amount ?? 0),
        loan: Math.abs(Number(transaction.allocation?.principal ?? 0)),
        interest: Math.abs(Number(transaction.allocation?.interest ?? 0)),
        penalty: Math.abs(Number(transaction.allocation?.penalty ?? 0)),
        status: transaction.approvalStatus,
        remarks: transaction.remarks ?? ""
      }))
    .filter((row) => isWithinPastDays(row.date, 60) || isPendingFinancialStatus(row.status))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 20);
  const recentLegacyGroupOpenings = (state.legacyGroupOpenings || [])
    .filter((row) => isWithinPastDays(row.migration_date ?? row.migrationDate, 60) || isPendingFinancialStatus(row.approval_status ?? row.approvalStatus))
    .sort((a, b) => String(b.migration_date ?? b.migrationDate).localeCompare(String(a.migration_date ?? a.migrationDate)))
    .slice(0, 10);
  const pendingSetupRows = (state.pendingSetupChanges || [])
    .filter((change) => String(change.groupId ?? change.group_id) === String(group?.id))
    .filter((change) => String(change.status || "").toLowerCase() === "pending")
    .map((change) => {
      const pendingApprovers = (state.approvals || [])
        .filter((approval) => approval.batchId === change.batchId && approval.status === "Pending")
        .map((approval) => approval.approverName || approval.level)
        .filter(Boolean);
      return {
        ...change,
        pendingWith: pendingApprovers.length ? pendingApprovers.join(", ") : "No pending approver"
      };
    });

  useEffect(() => {
    // Period setup starts closed. Users must explicitly open a month/year.
  }, [periodData]);

  function saveGroupSetup(event) {
    event.preventDefault();
    if (!group) return;
    if (!hasActiveAdminMember(state.members || [], groupValues.admins)) {
      setNotification({ type: "error", message: "At least one active member must be selected as group admin." });
      return;
    }
    setConfirmDialog({
      title: "Confirm changes",
      message: "Are you sure you want to save these changes?",
      onConfirm: async () => {
        setConfirmDialog(null);
        if (!repository.isConfigured()) {
          setNotification({ type: "error", message: "Cloud sync is not configured. Enable secure storage to save group setup." });
          setTimeout(() => setNotification(null), 4000);
          return;
        }

        try {
          const payload = {
            interestType: groupValues.interestType,
            interestRate: optionalNumber(groupValues.interestRate),
            monthlySaving: optionalNumber(groupValues.monthlySaving),
            loanTenureMonths: optionalNumber(groupValues.loanTenureMonths),
            loanDueDay: Number(groupValues.loanDueDay || 1),
            maximumLoanLimit: optionalNumber(groupValues.maximumLoanLimit),
            penaltyAmount: optionalNumber(groupValues.penaltyAmount),
            penaltyAfterDueDateAmount: optionalNumber(groupValues.penaltyAmount),
            loanEligibilityRules: { monthlySaving: optionalNumber(groupValues.monthlySaving) },
            financialYear: groupValues.financialYear,
            approvers: groupValues.approvers,
            admins: groupValues.admins
          };
          const notificationPayload = {
            interestType: payload.interestType,
            interestRate: payload.interestRate,
            monthlySaving: payload.monthlySaving,
            loanTenureMonths: payload.loanTenureMonths,
            loanDueDay: payload.loanDueDay,
            maximumLoanLimit: payload.maximumLoanLimit,
            penaltyAmount: payload.penaltyAmount,
            approvers: payload.approvers,
            admins: payload.admins
          };
          const changeSummary = describeChanges(group, notificationPayload, {
            interestType: "Interest type",
            interestRate: "Interest rate monthly",
            monthlySaving: "Monthly saving",
            loanTenureMonths: "Loan tenure",
            loanDueDay: "Repayment due date",
            maximumLoanLimit: "Loan limit",
            penaltyAmount: "Penalty amount after due date",
            approvers: "Approvers",
            admins: "Admins"
          });
          const approvalRecords = createConfiguredApprovalRecords({
            state,
            action: "Approve group setup change",
            requester: actor?.name ?? "Admin",
            amount: 0,
            referenceId: group.id,
            referenceType: "group_setup",
            details: changeSummary
          });

          if (approvalRecords.length > 0) {
            const persistedApprovals = await repository.createApprovalRequests({ groupId: group.id, approvals: approvalRecords });
            const approvalsToStore = persistedApprovals.length ? persistedApprovals : approvalRecords;
            const pendingChange = {
              id: makeId("setupchg"),
              batchId: approvalRecords[0].batchId,
              groupId: group.id,
              setupType: "group",
              targetId: group.id,
              targetName: group.name,
              payload,
              oldValue: group,
              changeSummary,
              status: "Pending",
              createdAt: new Date().toISOString()
            };
            const persistedPendingChange = await repository.createPendingSetupChange(pendingChange);
            setState((current) => audit({
              state: addGroupNotification({
                ...current,
                approvals: [...approvalsToStore, ...(current.approvals || [])],
                pendingSetupChanges: [persistedPendingChange, ...(current.pendingSetupChanges || [])]
              }, {
                title: "Group setup approval requested",
                body: `${actor?.name ?? "Admin"} requested group setup changes. ${changeSummary}`,
                type: "info"
              }),
              actor,
              action: "request",
              tableName: "setup_changes",
              recordId: persistedPendingChange.id,
              oldValue: group,
              newValue: payload
            }));
            setNotification({ type: "success", message: "Setup change sent for approval." });
            setTimeout(() => setNotification(null), 3000);
            return;
          }

          const updated = await repository.updateGroup(group.id, payload);

          setState((current) => audit({
            state: addGroupNotification({
              ...current,
              groups: current.groups.map((item) => item.id === group.id ? { ...item, ...updated, ...payload, approvers: payload.approvers, admins: payload.admins } : item)
            }, {
              title: "Group setup changed",
              body: `${actor?.name ?? "Admin"} updated group setup. ${changeSummary}`,
              type: "info"
            }),
            actor,
            action: "update",
            tableName: "groups",
            recordId: group.id,
            oldValue: group,
            newValue: payload
          }));

          setNotification({ type: "success", message: "Changes saved successfully!" });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          console.error("Group update failed", error);
          setNotification({ type: 'error', message: `Unable to persist group changes: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => { setConfirmDialog(null); }
    });
  }

  function saveMemberSetup(event) {
    event.preventDefault();
    if (!selectedMember) return;
    const nextMembersForAdminCheck = (state.members || []).map((member) =>
      String(member.id) === String(selectedMember.id)
        ? {
            ...member,
            status: memberSetupValues.status,
            inactiveDate: memberSetupValues.status === "Inactive" ? (memberSetupValues.inactiveDate || toIsoDateValue()) : ""
          }
        : member
    );
    if (!hasActiveAdminMember(nextMembersForAdminCheck, groupValues.admins)) {
      setNotification({ type: "error", message: "At least one active member must remain group admin." });
      return;
    }
    setConfirmDialog({
      title: "Confirm changes",
      message: "Are you sure you want to save these changes?",
      onConfirm: async () => {
        setConfirmDialog(null);
        if (!repository.isConfigured()) {
          setNotification({ type: 'error', message: 'Cloud sync is not configured. Enable secure storage to save member setup.' });
          setTimeout(() => setNotification(null), 4000);
          return;
        }

        try {
          const payload = {
            fullName: memberSetupValues.fullName,
            email: memberSetupValues.email,
            mobile: memberSetupValues.mobile,
            ...(selectedMember?.username ? {} : { username: memberSetupValues.username }),
            address: memberSetupValues.address,
            aadhaar: memberSetupValues.aadhaar,
            pan: memberSetupValues.pan,
            interestType: memberSetupValues.interestType,
            interestRate: optionalNumber(memberSetupValues.interestRate),
            monthlySaving: optionalNumber(memberSetupValues.monthlySaving),
            maximumLoanLimit: optionalNumber(memberSetupValues.maximumLoanLimit),
            loanTenureMonths: optionalNumber(memberSetupValues.loanTenureMonths),
            active: memberSetupValues.status !== "Inactive",
            inactive_date: memberSetupValues.status === "Inactive" ? (memberSetupValues.inactiveDate || toIsoDateValue()) : null
          };

          const notificationPayload = {
            fullName: payload.fullName,
            email: payload.email,
            mobile: payload.mobile,
            username: selectedMember?.username,
            interestType: payload.interestType,
            interestRate: payload.interestRate,
            monthlySaving: payload.monthlySaving,
            maximumLoanLimit: payload.maximumLoanLimit,
            loanTenureMonths: payload.loanTenureMonths
          };
          const changeSummary = describeChanges(selectedMember, notificationPayload, {
            fullName: "Name",
            email: "Email",
            mobile: "Mobile",
            interestType: "Interest type",
            interestRate: "Interest rate monthly",
            monthlySaving: "Monthly saving",
            maximumLoanLimit: "Loan limit",
            loanTenureMonths: "Loan tenure"
          });
          const approvalRecords = createConfiguredApprovalRecords({
            state,
            action: "Approve member setup change",
            requester: actor?.name ?? "Admin",
            amount: 0,
            referenceId: selectedMember.id,
            referenceType: "member_setup",
            details: changeSummary
          });

          if (approvalRecords.length > 0) {
            const persistedApprovals = await repository.createApprovalRequests({ groupId: selectedMember.groupId ?? group?.id, approvals: approvalRecords });
            const approvalsToStore = persistedApprovals.length ? persistedApprovals : approvalRecords;
            const pendingChange = {
              id: makeId("setupchg"),
              batchId: approvalRecords[0].batchId,
              groupId: selectedMember.groupId ?? group?.id,
              setupType: "member",
              targetId: selectedMember.id,
              targetName: selectedMember.fullName,
              payload,
              oldValue: selectedMember,
              changeSummary,
              status: "Pending",
              createdAt: new Date().toISOString()
            };
            const persistedPendingChange = await repository.createPendingSetupChange(pendingChange);
            setState((current) => audit({
              state: addGroupNotification({
                ...current,
                approvals: [...approvalsToStore, ...(current.approvals || [])],
                pendingSetupChanges: [persistedPendingChange, ...(current.pendingSetupChanges || [])]
              }, {
                title: "Member setup approval requested",
                body: `${actor?.name ?? "Admin"} requested setup changes for ${selectedMember.fullName}. ${changeSummary}`,
                type: "info"
              }),
              actor,
              action: "request",
              tableName: "setup_changes",
              recordId: persistedPendingChange.id,
              oldValue: selectedMember,
              newValue: payload
            }));
            setNotification({ type: "success", message: "Member setup change sent for approval." });
            setTimeout(() => setNotification(null), 3000);
            return;
          }

          const updated = await repository.updateMember(selectedMember.id, payload);

          setState((current) => audit({
            state: addGroupNotification({
              ...current,
              members: current.members.map((member) => member.id === selectedMember.id ? { ...member, ...updated, interestType: payload.interestType } : member)
            }, {
              title: "Member setup changed",
              body: `${actor?.name ?? "Admin"} updated setup for ${selectedMember.fullName}. ${changeSummary}`,
              type: "info"
            }),
            actor,
            action: "update",
            tableName: "group_members",
            recordId: selectedMember.id,
            oldValue: selectedMember,
            newValue: memberSetupValues
          }));

          setNotification({ type: "success", message: "Changes saved successfully!" });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          console.error("Member update failed", error);
          setNotification({ type: 'error', message: `Unable to persist member changes: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => { setConfirmDialog(null); }
    });
  }

  function toggleField(id, keyName) {
    setState((current) => audit({
      state: {
        ...current,
        configurableFields: current.configurableFields.map((field) =>
          field.id === id || `${field.screen}-${field.field}` === id ? { ...field, [keyName]: !field[keyName] } : field
        )
      },
      actor,
      action: "update",
      tableName: "configurable_fields",
      recordId: id
    }));
  }

  function toggleApprover(memberName) {
    setGroupValues((current) => {
      const exists = current.approvers.includes(memberName);
      return {
        ...current,
        approvers: exists
          ? current.approvers.filter((name) => name !== memberName)
          : [...current.approvers, memberName]
      };
    });
  }

  function toggleAdmin(memberName) {
    setGroupValues((current) => {
      const exists = current.admins.includes(memberName);
      const nextAdmins = exists
        ? current.admins.filter((name) => name !== memberName)
        : [...current.admins, memberName];
      if (!hasActiveAdminMember(state.members || [], nextAdmins)) {
        setNotification({ type: "error", message: "At least one active member must be admin." });
        return current;
      }
      return {
        ...current,
        admins: nextAdmins
      };
    });
  }

  function openFinancialPeriod(periodOrId) {
    const targetPeriod = typeof periodOrId === "string"
      ? periodData.find((period) => period.id === periodOrId)
      : periodOrId;
    if (!targetPeriod) return;
    const reopening = targetPeriod.status === periodStatuses.CLOSED;
    setConfirmDialog({
      title: reopening ? "Reopen period" : "Confirm period change",
      message: reopening
        ? `Reopen ${targetPeriod.name}? This will close any other open period and allow entries in this month.`
        : "Are you sure you want to activate this period?",
      onConfirm: async () => {
        let openedPeriod = targetPeriod;
        if (repository.isConfigured() && isUuid(group?.id)) {
          try {
            openedPeriod = await repository.openAccountingPeriod(group.id, targetPeriod);
          } catch (error) {
            setConfirmDialog(null);
            setNotification({ type: "error", message: `Unable to open period: ${error.message}` });
            setTimeout(() => setNotification(null), 5000);
            return;
          }
        }
        setState((current) => audit({
          state: {
            ...current,
            periods: openPeriod(
              current.periods.some((period) => period.id === openedPeriod.id)
                ? current.periods.map((period) => period.id === openedPeriod.id ? { ...period, ...openedPeriod } : period)
                : [...current.periods, openedPeriod],
              openedPeriod.id
            )
          },
          actor,
          action: "open_period",
          tableName: "periods",
          recordId: openedPeriod.id
        }));
        setConfirmDialog(null);
        setNotification({ type: "success", message: "Period activated successfully!" });
        setTimeout(() => setNotification(null), 3000);
      },
      onCancel: () => {
        setConfirmDialog(null);
      }
    });
  }

  function closeFinancialPeriod(periodId) {
    setConfirmDialog({
      title: "Confirm period close",
      message: "Are you sure you want to close this period? This will make it read-only.",
      onConfirm: async () => {
        let closedPeriod = null;
        if (repository.isConfigured() && isUuid(periodId)) {
          try {
            closedPeriod = await repository.closeAccountingPeriod(periodId);
          } catch (error) {
            setConfirmDialog(null);
            setNotification({ type: "error", message: `Unable to close period: ${error.message}` });
            setTimeout(() => setNotification(null), 5000);
            return;
          }
        }
        setState((current) => audit({
          state: {
            ...current,
            periods: current.periods.map((period) =>
              period.id === periodId
                ? { ...period, ...(closedPeriod ?? {}), status: periodStatuses.CLOSED }
                : period
            )
          },
          actor,
          action: "close_period",
          tableName: "periods",
          recordId: periodId
        }));
        setConfirmDialog(null);
        setNotification({ type: "success", message: "Period closed successfully!" });
        setTimeout(() => setNotification(null), 3000);
      },
      onCancel: () => {
        setConfirmDialog(null);
      }
    });
  }

  function openSelectedMonthPeriod() {
    const draft = getMonthPeriodDraft(periodPicker.year, periodPicker.month);
    const existing = periodData.find((period) =>
      String(period.name) === draft.name
      || (period.startDate === draft.startDate && period.endDate === draft.endDate)
    );
    openFinancialPeriod(existing ?? draft);
  }

  async function saveLegacyGroupOpening() {
    if (!group?.id) {
      setNotification({ type: "error", message: "Create/select a group before saving group legacy opening." });
      return;
    }
    if (!legacyGroupMigration.migrationDate) {
      setLegacyErrors((current) => ({ ...current, groupMigrationDate: "Migration date is required." }));
      return;
    }
    const validLegacyExpenseLines = legacyExpenseLines
      .map((line) => ({ ...line, amount: Number(line.amount || 0), category: line.category.trim() || "Opening expense", remarks: line.remarks.trim() }))
      .filter((line) => line.amount > 0);
    const openingGroupExpense = validLegacyExpenseLines.reduce((sum, line) => sum + line.amount, 0);
    setConfirmDialog({
      title: "Save group legacy opening",
      message: "Save group-level opening balance/gain/expense once for this group?",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
          const approvalStatus = hasGroupApprovers ? "Pending" : "Completed";
          let saved = {
            id: makeId("lgo"),
            group_id: group.id,
            migration_date: legacyGroupMigration.migrationDate,
            opening_bank_balance: Number(legacyGroupMigration.openingBankBalance || 0),
            opening_group_expense: openingGroupExpense,
            opening_group_gain: Number(legacyGroupMigration.openingGroupGain || 0),
            approval_status: approvalStatus,
            remarks: legacyGroupMigration.remarks || ""
          };
          if (repository.isConfigured()) {
            saved = await repository.saveLegacyGroupOpening({
              groupId: group.id,
              migrationDate: legacyGroupMigration.migrationDate,
              openingBankBalance: legacyGroupMigration.openingBankBalance,
              openingGroupExpense,
              openingGroupGain: legacyGroupMigration.openingGroupGain,
              approvalStatus,
              remarks: legacyGroupMigration.remarks
            });
          }
          const approvalRecord = hasGroupApprovers
            ? createConfiguredApprovalRecords({
                state,
                action: "Legacy group opening",
                requester: actor?.name ?? "Admin",
                amount: Number(legacyGroupMigration.openingBankBalance || 0) + Number(legacyGroupMigration.openingGroupGain || 0) + openingGroupExpense,
                referenceId: saved.legacy_group_opening_id ?? saved.id,
                referenceType: "legacy_group_opening",
                details: `Opening balance ${currency.format(Number(legacyGroupMigration.openingBankBalance || 0))}; gain ${currency.format(Number(legacyGroupMigration.openingGroupGain || 0))}; expense ${currency.format(openingGroupExpense)}`
              })
            : [];
          const persistedApprovals = approvalRecord.length && repository.isConfigured()
            ? await repository.createApprovalRequests({ groupId: group.id, approvals: approvalRecord })
            : approvalRecord;
          setState((current) => audit({
            state: {
              ...current,
              legacyGroupOpenings: [
                saved,
                ...(current.legacyGroupOpenings || []).filter((row) => String(row.group_id ?? row.groupId) !== String(group.id))
              ],
              approvals: [...persistedApprovals, ...(current.approvals || [])],
              notifications: hasGroupApprovers
                ? [
                    { id: makeId("ntf"), groupId: group.id, title: "Legacy group opening approval requested", body: `Group opening values are waiting for approval.`, type: "info", createdAt: new Date().toISOString() },
                    ...(current.notifications || [])
                  ]
                : current.notifications
            },
            actor,
            action: "save_group_legacy_opening",
            tableName: "legacy_group_opening",
            recordId: saved.legacy_group_opening_id ?? saved.id,
            newValue: saved
          }));
          setNotification({ type: "success", message: hasGroupApprovers ? "Group-level legacy opening sent for approval." : "Group-level legacy opening saved." });
        } catch (error) {
          setNotification({ type: "error", message: `Unable to save group legacy opening: ${error.message}`, details: serializeError(error) });
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  const activePeriod = getOpenPeriod(periodData);
  const focusedSetupRoute = setupLocation.pathname.startsWith("/setup/") && setupLocation.pathname !== "/setup/financial";
  const setupTabs = [
    { key: "group", label: "Group", description: "Defaults", icon: Settings },
    { key: "member", label: "Member", description: "Profiles", icon: Users },
    { key: "financial", label: "Finance", description: "Controls", icon: SlidersHorizontal }
  ];
  const financialTabs = [
    { key: "approvers", label: "Approvers", description: "Workflow", icon: ShieldCheck },
    { key: "roles", label: "Roles", description: "Admins", icon: Users },
    { key: "loan", label: "Loans", description: "Interest", icon: IndianRupee },
    { key: "period", label: "Periods", description: "Month close", icon: CalendarCheck },
    { key: "calculator", label: "Calculator", description: "Shares", icon: Calculator }
  ];

  return (
    <>
      <Page title="Setup" subtitle="Configure group, member, financial and approval settings from one screen" action={null}>
        {!group && (
          <Section title="Create group first">
            <p className="section-note">Use Groups to create the basic group name and primary contact, then return here for detailed setup.</p>
          </Section>
        )}

      <div className={focusedSetupRoute ? "setup-shell setup-shell-focused" : "setup-shell"}>
      {!focusedSetupRoute && <div className="setup-rail" aria-label="Setup sections">
        {setupTabs.map((tab) => {
          const Icon = tab.icon;
          return (
          <button
            type="button"
            key={tab.key}
            className={tab.key === activeSetupTab ? "setup-nav-button active" : "setup-nav-button"}
            onClick={() => setActiveSetupTab(tab.key)}
          >
            <Icon size={18} />
            <span>
              <strong>{tab.label}</strong>
              <small>{tab.description}</small>
            </span>
          </button>
          );
        })}
      </div>}
      <div className="setup-content">

      {activeSetupTab === "group" && (
        <FormCard title="Group setup" onSubmit={saveGroupSetup}>
          <SelectField
            label="Interest type"
            value={groupValues.interestType}
            onChange={(value) => setGroupValues({ ...groupValues, interestType: value })}
            options={["Reducing", "Flat"]}
          />
          <div className="section-note" style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '6px', borderLeft: '4px solid #3b82f6' }}>
            <strong>Interest Type Explanation:</strong>
            <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: '8px' }}><strong>Reducing:</strong> {interestTypeDescriptions['Reducing']}</div>
              <div><strong>Flat:</strong> {interestTypeDescriptions['Flat']}</div>
            </div>
          </div>
          <Field
            label="Interest rate (% monthly)"
            type="number"
            value={groupValues.interestRate}
            onChange={(value) => setGroupValues({ ...groupValues, interestRate: value })}
          />
          <Field
            label="Savings amount"
            type="number"
            value={groupValues.monthlySaving}
            onChange={(value) => setGroupValues({ ...groupValues, monthlySaving: value })}
          />
          <Field
            label="Loan limit"
            type="number"
            value={groupValues.maximumLoanLimit}
            onChange={(value) => setGroupValues({ ...groupValues, maximumLoanLimit: value })}
          />
          <Field
            label="Penalty amount after due date"
            type="number"
            value={groupValues.penaltyAmount}
            onChange={(value) => setGroupValues({ ...groupValues, penaltyAmount: value })}
          />
          <Field
            label="Loan tenure (months)"
            type="number"
            value={groupValues.loanTenureMonths}
            onChange={(value) => setGroupValues({ ...groupValues, loanTenureMonths: value })}
          />
          <Field
            label="Repayment due date"
            type="number"
            value={groupValues.loanDueDay}
            onChange={(value) => setGroupValues({ ...groupValues, loanDueDay: value })}
          />
          <p className="section-note">Set the group financial defaults used for loan and savings calculations.</p>
          <p className="section-note">Penalty amount is optional. Blank value is treated as ₹0. Minimum principal due is derived from loan tenure: original loan principal divided by tenure months. Member tenure overrides group tenure. Blank or 0 tenure means no minimum principal restriction.</p>
          <p className="section-note">Loan tenure 0 or blank means there is no fixed payback time limit.</p>
          <p className="section-note">Repayment due date defaults to 1, meaning the first date of each month. Use day 1 to 28.</p>
        </FormCard>
      )}

      {activeSetupTab === "member" && (
        <FormCard title="Member setup" onSubmit={saveMemberSetup}>
          <SelectField
            label="Select member"
            value={selectedMemberId}
            onChange={(value) => setSelectedMemberId(value)}
            options={state.members.map((member) => ({ label: member.fullName, value: member.id }))}
          />
          <label className="checkbox-item" style={{ marginBottom: "16px" }}>
              <input
              type="checkbox"
              checked={memberSetupValues.status === "Active"}
              onChange={(e) => setMemberSetupValues({
                ...memberSetupValues,
                status: e.target.checked ? "Active" : "Inactive",
                inactiveDate: e.target.checked ? "" : (memberSetupValues.inactiveDate || toIsoDateValue())
              })}
            />
            Active member
          </label>
          {memberSetupValues.status === "Inactive" && (
            <Field
              label="Inactive / exit date"
              type="date"
              value={memberSetupValues.inactiveDate}
              onChange={(value) => setMemberSetupValues({ ...memberSetupValues, inactiveDate: value, status: value && value <= toIsoDateValue() ? "Inactive" : memberSetupValues.status })}
            />
          )}
          <Field
            label="Full name"
            value={memberSetupValues.fullName}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, fullName: value })}
          />
          <Field
            label="Aadhaar"
            value={memberSetupValues.aadhaar}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, aadhaar: value })}
          />
          <Field
            label="PAN"
            value={memberSetupValues.pan}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, pan: value })}
          />
          <Field
            label="Address"
            value={memberSetupValues.address}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, address: value })}
          />
          <Field
            label="Email"
            type="email"
            value={memberSetupValues.email}
            onChange={(value) => setMemberSetupValues((current) => ({ ...current, email: value }))}
          />
          <Field
            label="Mobile"
            type="tel"
            value={memberSetupValues.mobile}
            onChange={(value) => setMemberSetupValues((current) => ({ ...current, mobile: value }))}
          />
          <Field
            label="Username"
            value={selectedMember?.username ?? ""}
            onChange={(value) => {
              if (!selectedMember?.username) setMemberSetupValues({ ...memberSetupValues, username: value });
            }}
            disabled={Boolean(selectedMember?.username)}
          />
          <SelectField
            label="Interest type"
            value={memberSetupValues.interestType}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, interestType: value })}
            options={["Reducing", "Flat"]}
          />
          <div className="section-note" style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '6px', borderLeft: '4px solid #3b82f6' }}>
            <strong>Interest Type Explanation:</strong>
            <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: '8px' }}><strong>Reducing:</strong> {interestTypeDescriptions['Reducing']}</div>
              <div><strong>Flat:</strong> {interestTypeDescriptions['Flat']}</div>
            </div>
          </div>
          <Field
            label="Interest rate (% monthly)"
            type="number"
            value={memberSetupValues.interestRate}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, interestRate: value })}
          />
          <Field
            label="Monthly savings amount"
            type="number"
            value={memberSetupValues.monthlySaving}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, monthlySaving: value })}
          />
          <Field
            label="Maximum loan limit"
            type="number"
            value={memberSetupValues.maximumLoanLimit}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, maximumLoanLimit: value })}
          />
          <Field
            label="Loan tenure (months)"
            type="number"
            value={memberSetupValues.loanTenureMonths}
            onChange={(value) => setMemberSetupValues({ ...memberSetupValues, loanTenureMonths: value })}
          />
          <p className="section-note">Leave blank to use group defaults. Enter 0 only when this member should intentionally override the group value with zero.</p>
          <p className="section-note">Loan tenure blank uses group setup. Loan tenure 0 means there is no fixed payback time limit for this member.</p>
        </FormCard>
      )}

      {activeSetupTab === "financial" && (
        <>
          {!focusedSetupRoute && <div className="setup-submenu" aria-label="Financial setup sections">
            {financialTabs.map((tab) => {
              const Icon = tab.icon;
              return (
              <button
                type="button"
                key={tab.key}
                className={tab.key === financialTab ? "setup-submenu-button active" : "setup-submenu-button"}
                onClick={() => setFinancialTab(tab.key)}
              >
                <Icon size={17} />
                <span>
                  <strong>{tab.label}</strong>
                  <small>{tab.description}</small>
                </span>
              </button>
              );
            })}
          </div>}

          {financialTab === "approvers" && (
            <FormCard title="Approver setup" onSubmit={saveGroupSetup}>
              <p className="section-note">Select members who will act as approvers for group workflows.</p>
              <div className="checkbox-list">
                {state.members.map((member) => (
                  <label key={member.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={groupValues.approvers.includes(member.fullName)}
                      onChange={() => toggleApprover(member.fullName)}
                    />
                    {member.fullName}
                  </label>
                ))}
              </div>
            </FormCard>
          )}

          {financialTab === "roles" && (
            <FormCard title="Admin setup" onSubmit={saveGroupSetup}>
              <p className="section-note">Select one or more members who should be group admins.</p>
              <div className="checkbox-list">
                {state.members.map((member) => (
                  <label key={member.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={groupValues.admins.includes(member.fullName) || member.memberRole === roles.GROUP_ADMIN || member.role === roles.GROUP_ADMIN}
                      onChange={() => toggleAdmin(member.fullName)}
                    />
                    {member.fullName}
                  </label>
                ))}
              </div>
            </FormCard>
          )}

          {financialTab === "loan" && (
            <FormCard title="Loan setup" onSubmit={saveGroupSetup}>
              <p className="section-note">Choose how loan interest should start being calculated.</p>
              <label className="checkbox-item" style={{ display: 'block', marginBottom: '12px' }}>
                <input
                  type="radio"
                  name="loanInterestStartMode"
                  value="disbursement"
                  checked={groupValues.loanInterestStartMode === "disbursement"}
                  onChange={() => setGroupValues({ ...groupValues, loanInterestStartMode: "disbursement" })}
                />
                Start calculating interest from loan disbursement date.
              </label>
              <label className="checkbox-item" style={{ display: 'block' }}>
                <input
                  type="radio"
                  name="loanInterestStartMode"
                  value="fullMonth"
                  checked={groupValues.loanInterestStartMode === "fullMonth"}
                  onChange={() => setGroupValues({ ...groupValues, loanInterestStartMode: "fullMonth" })}
                />
                Calculate loan interest for the full month.
              </label>
              <p className="section-note">This setting affects how loan interest is computed when a loan is disbursed in the middle of a month.</p>
            </FormCard>
          )}

          {financialTab === "period" && (
            <Section title="Period setup">
              <p className="section-note">Select which month's records are currently open for transactions. Only the selected month will accept payments.</p>
              <div className="period-control-panel">
                <SelectField
                  label="Month to open"
                  value={String(periodPicker.month)}
                  onChange={(value) => setPeriodPicker((current) => ({ ...current, month: Number(value) }))}
                  options={Array.from({ length: 12 }, (_, index) => ({
                    label: new Date(2026, index, 1).toLocaleString("default", { month: "long" }),
                    value: String(index + 1)
                  }))}
                />
                <Field
                  label="Year"
                  type="number"
                  value={periodPicker.year}
                  onChange={(value) => setPeriodPicker((current) => ({ ...current, year: Number(value) }))}
                />
                <button type="button" className="primary-button" onClick={openSelectedMonthPeriod}>
                  Open selected period
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!activePeriod}
                  onClick={() => activePeriod && closeFinancialPeriod(activePeriod.id)}
                >
                  Close current open period
                </button>
              </div>
              <div style={{ backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "6px", padding: "12px", marginBottom: "18px", color: "var(--muted)", fontSize: "0.9rem" }}>
                <strong>ℹ️ Auto-transition:</strong> On the first day of each month, the system will automatically close the previous month and open the current month. You can reopen any past month if needed for corrections.
              </div>
              <div className="period-list">
                {periodData && periodData.length > 0 ? (
                  [...periodData].sort((a, b) => new Date(b.startDate) - new Date(a.startDate)).map((period) => {
                    const monthYear = formatPeriodName(period.startDate) || period.name;
                    const isActive = activePeriod?.id === period.id;
                    const isClosed = period.status === periodStatuses.CLOSED;
                    return (
                      <article key={period.id} className={`entity-card compact-card ${isActive ? 'active-period' : ''}`}>
                        <span className="pill">{period.status}</span>
                        <h3>{monthYear}</h3>
                        {isActive && <p style={{ color: "var(--success)", fontWeight: "700" }}>✓ Currently Active</p>}
                        <div className="button-row">
                    {isActive ? (
                      <>
                        <button
                          type="button"
                          className="primary-button"
                          disabled
                        >
                          Active Period
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => closeFinancialPeriod(period.id)}
                        >
                          Close period
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => openFinancialPeriod(period.id)}
                        >
                          Set as Active
                        </button>
                        {!isClosed && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => closeFinancialPeriod(period.id)}
                          >
                            Close period
                          </button>
                        )}
                      </>
                    )}
                    {isClosed && (
                      <button 
                        type="button" 
                        className="secondary-button"
                        onClick={() => openFinancialPeriod(period.id)}
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="section-note" style={{ backgroundColor: "#fef2f2", padding: "12px", borderRadius: "6px", color: "#991b1b" }}>Periods not loaded. Reload the page.</p>
                )}
              </div>
            </Section>
          )}

          {financialTab === "calculator" && (
            <div className="calculator-grid">
              <Section title="Member share calculator">
                <p className="section-note">Use this for quick estimation only. Fields can be left blank and will be treated as 0. It does not save anything.</p>
                <div className="form-grid">
                  <Field
                    label="Remaining money in account"
                    type="number"
                    value={shareCalculator.remainingMoney}
                    onChange={(value) => {
                      setShareCalculatorCalculated(false);
                      setShareCalculator((current) => ({ ...current, remainingMoney: value }));
                    }}
                  />
                  <Field
                    label="Outstanding loan"
                    type="number"
                    value={shareCalculator.outstandingLoan}
                    onChange={(value) => {
                      setShareCalculatorCalculated(false);
                      setShareCalculator((current) => ({ ...current, outstandingLoan: value }));
                    }}
                  />
                  <Field
                    label="Per member monthly saving"
                    type="number"
                    value={shareCalculator.perMemberSaving}
                    onChange={(value) => {
                      setShareCalculatorCalculated(false);
                      setShareCalculator((current) => ({ ...current, perMemberSaving: value }));
                    }}
                  />
                  <Field
                    label="Number of members"
                    type="number"
                    value={shareCalculator.numberOfMembers}
                    onChange={(value) => {
                      setShareCalculatorCalculated(false);
                      setShareCalculator((current) => ({ ...current, numberOfMembers: value }));
                    }}
                  />
                  <Field
                    label="Total months"
                    type="number"
                    value={shareCalculator.totalMonths}
                    onChange={(value) => {
                      setShareCalculatorCalculated(false);
                      setShareCalculator((current) => ({ ...current, totalMonths: value }));
                    }}
                  />
                  <Field
                    label="Group start date"
                    type="date"
                    value={shareCalculator.groupStartDate}
                    onChange={(value) => {
                      setShareCalculatorCalculated(false);
                      setShareCalculator((current) => ({ ...current, groupStartDate: value }));
                    }}
                  />
                  <Field
                    label="Group last date"
                    type="date"
                    value={shareCalculator.groupLastDate}
                    onChange={(value) => {
                      setShareCalculatorCalculated(false);
                      setShareCalculator((current) => ({ ...current, groupLastDate: value }));
                    }}
                  />
                </div>
                <div className="button-row" style={{ marginTop: 18 }}>
                  <button type="button" className="primary-button" onClick={() => setShareCalculatorCalculated(true)}>
                    Calculate
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setShareCalculatorCalculated(false);
                      setShareCalculator({
                        remainingMoney: "",
                        outstandingLoan: "",
                        perMemberSaving: "",
                        numberOfMembers: state.members?.length ? String(state.members.length) : "",
                        totalMonths: "",
                        groupStartDate: "",
                        groupLastDate: ""
                      });
                    }}
                  >
                    Reset
                  </button>
                </div>
                {shareCalculatorCalculated && (
                  <>
                    <p className="section-note" style={{ marginTop: 18 }}>
                      Total savings used: {currency.format(expectedTotalSavings)} ({memberCountForShare || 0} members x {currency.format(numberOrZero(shareCalculator.perMemberSaving))} x {calculatorMonths} months)
                    </p>
                    <MetricGrid
                      metrics={[
                        metric("Total amount", currency.format(shareTotalGroupValue), WalletCards, ["Remaining account money + outstanding loan"]),
                        metric("Per member share", currency.format(estimatedPerMemberShare), Users, ["(Group gain / members) + per member saved amount"]),
                        metric("Group gain", currency.format(estimatedGroupGain), WalletCards, ["Total amount - total savings of all members"]),
                        metric("Per member gain", currency.format(estimatedPerMemberGain), IndianRupee, ["Group gain divided by members"]),
                        metric("Check total", currency.format(estimatedPerMemberShare * memberCountForShare), CheckCircle2, ["Per member share x members"])
                      ]}
                    />
                  </>
                )}
              </Section>
            </div>
          )}

          {financialTab === "legacy" && (
            <FormCard title="Legacy migration" hideSubmit onSubmit={(e) => e.preventDefault()}>
              <Section title="Group-level legacy opening">
                <p className="section-note">Enter these values once per group. Do not repeat bank balance or group expense for every member.</p>
                <div className="form-grid">
                  <Field
                    label="Migration date"
                    required
                    type="date"
                    value={legacyGroupMigration.migrationDate}
                    onChange={(value) => setLegacyGroupMigration((current) => ({ ...current, migrationDate: value }))}
                    error={legacyErrors.groupMigrationDate}
                  />
                  <Field
                    label="Opening bank/account balance"
                    type="number"
                    value={legacyGroupMigration.openingBankBalance}
                    onChange={(value) => setLegacyGroupMigration((current) => ({ ...current, openingBankBalance: value }))}
                  />
                  <Field
                    label="Old group gain/income"
                    type="number"
                    value={legacyGroupMigration.openingGroupGain}
                    onChange={(value) => setLegacyGroupMigration((current) => ({ ...current, openingGroupGain: value }))}
                  />
                  <Field
                    label="Remarks"
                    value={legacyGroupMigration.remarks}
                    onChange={(value) => setLegacyGroupMigration((current) => ({ ...current, remarks: value }))}
                  />
                </div>
                <div className="expense-split-editor">
                  <div className="expense-split-header">
                    <strong>Old group expense split lines</strong>
                    <span>Total: {currency.format(legacyExpenseTotal)}</span>
                  </div>
                  <p className="section-note">Optional. Add old group expense once here, not inside each member migration.</p>
                  {legacyExpenseLines.map((line, index) => (
                    <div className="expense-line-row" key={`legacy-expense-line-${index}`}>
                      <Field label="Category" value={line.category} onChange={(value) => updateLegacyExpenseLine(index, "category", value)} />
                      <Field label="Amount" type="number" value={line.amount} onChange={(value) => updateLegacyExpenseLine(index, "amount", value)} />
                      <Field label="Comment" value={line.remarks} onChange={(value) => updateLegacyExpenseLine(index, "remarks", value)} />
                      <button type="button" className="secondary-button" onClick={() => removeLegacyExpenseLine(index)} disabled={legacyExpenseLines.length === 1}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="secondary-button" onClick={addLegacyExpenseLine}>Add expense line</button>
                </div>
                <button type="button" className="primary-button" onClick={saveLegacyGroupOpening}>Save group opening</button>
              </Section>
              <p className="section-note">Migrate historical member balances from before using this system. Member migration asks only member-level values.</p>
              <SelectField
                label="Select member"
                required
                value={state.legacyMigration?.memberId ?? ""}
                onChange={(value) => {
                  setLegacyErrors({});
                  setState((current) => ({ ...current, legacyMigration: { ...current.legacyMigration, memberId: value } }));
                }}
                options={state.members.map((member) => ({ label: member.fullName, value: member.id }))}
              />
              {state.legacyMigration?.memberId && (
                <>
                  <Field
                    label={isLegacyGroupExpense ? "Expense date" : "Joined date"}
                    required
                    type="date"
                    value={state.legacyMigration?.joinedDate ?? ""}
                    onChange={(value) => setState((current) => ({ ...current, legacyMigration: { ...current.legacyMigration, joinedDate: value } }))}
                    error={legacyErrors.joinedDate}
                  />
                  {!isLegacyGroupExpense && (
                    <>
                  <Field
                    label="Exit date (if applicable)"
                    type="date"
                    value={state.legacyMigration?.exitDate ?? ""}
                    onChange={(value) => setState((current) => ({ ...current, legacyMigration: { ...current.legacyMigration, exitDate: value } }))}
                  />
                  <Field
                    label="Saving or share amount"
                    required
                    type="number"
                    value={state.legacyMigration?.totalSaving ?? ""}
                    onChange={(value) => setState((current) => ({ ...current, legacyMigration: { ...current.legacyMigration, totalSaving: value } }))}
                    error={legacyErrors.totalSaving}
                  />
                  <Field
                    label="Pending loan amount"
                    required
                    type="number"
                    value={state.legacyMigration?.pendingLoan ?? ""}
                    onChange={(value) => setState((current) => ({ ...current, legacyMigration: { ...current.legacyMigration, pendingLoan: value } }))}
                    error={legacyErrors.pendingLoan}
                  />
                  <Field
                    label="Pending interest amount"
                    required
                    type="number"
                    value={state.legacyMigration?.interestAmount ?? ""}
                    onChange={(value) => setState((current) => ({ ...current, legacyMigration: { ...current.legacyMigration, interestAmount: value } }))}
                    error={legacyErrors.interestAmount}
                  />
                  <Field
                    label="Pending penalty amount"
                    required
                    type="number"
                    value={state.legacyMigration?.penaltyAmount ?? ""}
                    onChange={(value) => setState((current) => ({ ...current, legacyMigration: { ...current.legacyMigration, penaltyAmount: value } }))}
                    error={legacyErrors.penaltyAmount}
                  />
                  <p className="section-note">Group bank balance, old group gain, and old group expense are captured once in Group-level legacy opening above.</p>
                    </>
                  )}
                  {isLegacyGroupExpense && (
                  <div className="expense-split-editor">
                    <div className="expense-split-header">
                      <strong>Old group expense split lines</strong>
                      <span>Total: {currency.format(legacyExpenseTotal)}</span>
                    </div>
                    <p className="section-note">Use this only for old expenses from your register before starting this app.</p>
                    {legacyExpenseLines.map((line, index) => (
                      <div className="expense-line-row" key={`legacy-expense-line-${index}`}>
                        <Field label="Category" value={line.category} onChange={(value) => updateLegacyExpenseLine(index, "category", value)} />
                        <Field label="Amount" type="number" value={line.amount} onChange={(value) => updateLegacyExpenseLine(index, "amount", value)} />
                        <Field label="Comment" value={line.remarks} onChange={(value) => updateLegacyExpenseLine(index, "remarks", value)} />
                        <button type="button" className="secondary-button" onClick={() => removeLegacyExpenseLine(index)} disabled={legacyExpenseLines.length === 1}>Remove</button>
                      </div>
                    ))}
                    <button type="button" className="secondary-button" onClick={addLegacyExpenseLine}>Add expense line</button>
                  </div>
                  )}
                  <button type="button" className="primary-button" onClick={async () => {
                    const validLegacyExpenseLines = [];
                    if (isLegacyGroupExpense) {
                      const nextErrors = {};
                      if (!state.legacyMigration?.joinedDate) nextErrors.joinedDate = "Expense date is required.";
                      if (validLegacyExpenseLines.length === 0) nextErrors.groupExpenseAmount = "Add at least one old group expense line.";
                      setLegacyErrors(nextErrors);
                      if (Object.keys(nextErrors).length > 0) {
                        setNotification({ type: "error", message: "Add expense date and at least one expense split line." });
                        return;
                      }
                      const periodResult = canPostTransaction(state.periods || [], state.legacyMigration.joinedDate);
                      if (!periodResult.allowed) {
                        setLegacyErrors((current) => ({ ...current, joinedDate: periodResult.reason }));
                        setNotification({ type: "error", message: periodResult.reason });
                        return;
                      }
                      const activeMembers = state.members.filter((member) => member.status === "Active");
                      if (activeMembers.length === 0) {
                        setNotification({ type: "error", message: "Create at least one active member before migrating group expense." });
                        return;
                      }
                      const groupExpenseTotal = validLegacyExpenseLines.reduce((sum, line) => sum + line.amount, 0);
                      setConfirmDialog({
                        title: "Migrate legacy group expense",
                        message: `Migrate old group expense of ${currency.format(groupExpenseTotal)} and split it across active members?`,
                        onConfirm: async () => {
                          setConfirmDialog(null);
                          setMigrationLoading(true);
                          try {
                            const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
                            const approvalStatus = hasGroupApprovers ? "Pending" : "Completed";
                            let migrationExpense = {
                              id: makeId("exp"),
                              groupId: state.groups[0]?.id,
                              periodId: periodResult.period?.id,
                              expenseNumber: makeId("EXP"),
                              transactionDate: state.legacyMigration.joinedDate,
                              expenseDate: state.legacyMigration.joinedDate,
                              amount: groupExpenseTotal,
                              approvalStatus,
                              expenseType: "Migrated Group Expense",
                              category: validLegacyExpenseLines[0]?.category ?? "Opening expense",
                              remarks: validLegacyExpenseLines.map((line) => line.remarks).filter(Boolean).join("; ") || "Migrated opening group expense",
                              lines: validLegacyExpenseLines
                            };
                            const migrationExpenseAdjustments = [];
                            if (repository.isConfigured()) {
                              migrationExpense = await repository.createGroupExpense({
                                groupId: state.groups[0]?.id,
                                periodId: periodResult.period?.id,
                                expenseDate: state.legacyMigration.joinedDate,
                                amount: groupExpenseTotal,
                                approvalStatus,
                                expenseType: "Migrated Group Expense",
                                category: validLegacyExpenseLines[0]?.category ?? "Opening expense",
                                remarks: validLegacyExpenseLines.map((line) => line.remarks).filter(Boolean).join("; ") || "Migrated opening group expense",
                                lines: validLegacyExpenseLines
                              });
                            }
                            let remainingExpenseShare = groupExpenseTotal;
                            for (let index = 0; index < activeMembers.length; index += 1) {
                              const expenseMember = activeMembers[index];
                              const shareAmount = index === activeMembers.length - 1
                                ? Number(remainingExpenseShare.toFixed(2))
                                : Number((groupExpenseTotal / activeMembers.length).toFixed(2));
                              remainingExpenseShare -= shareAmount;
                              if (repository.isConfigured()) {
                                const adjustment = await repository.createTransaction({
                                  groupId: state.groups[0]?.id,
                                  memberId: expenseMember.id,
                                  periodId: periodResult.period?.id ?? null,
                                  transactionDate: state.legacyMigration.joinedDate,
                                  amount: -Math.abs(shareAmount),
                                  transactionType: "Group Expense Share",
                                  approvalStatus,
                                  remarks: `Expense share for expense ${migrationExpense.id}`,
                                  allocation: { savings: -Math.abs(shareAmount), excess: 0 }
                                });
                                migrationExpenseAdjustments.push({ ...adjustment, parentExpenseId: migrationExpense.id });
                              } else {
                                migrationExpenseAdjustments.push({
                                  id: makeId("txn"),
                                  groupId: state.groups[0]?.id,
                                  memberId: expenseMember.id,
                                  periodId: periodResult.period?.id ?? null,
                                  transactionDate: state.legacyMigration.joinedDate,
                                  amount: -Math.abs(shareAmount),
                                  transactionType: "Group Expense Share",
                                  approvalStatus,
                                  parentExpenseId: migrationExpense.id,
                                  remarks: `Expense share for expense ${migrationExpense.id}`,
                                  allocation: { savings: -Math.abs(shareAmount), excess: 0 }
                                });
                              }
                            }
                            const expenseApprovalRecord = hasGroupApprovers
                              ? createConfiguredApprovalRecords({
                                  state,
                                  action: "Migrated group expense",
                                  requester: actor?.name ?? "Admin",
                                  amount: groupExpenseTotal,
                                  referenceId: migrationExpense.id,
                                  referenceType: "expense"
                                })
                              : [];
                            const persistedExpenseApprovals = expenseApprovalRecord.length && repository.isConfigured()
                              ? await repository.createApprovalRequests({ groupId: state.groups[0]?.id, approvals: expenseApprovalRecord })
                              : expenseApprovalRecord;
                            setState((current) => audit({
                              state: {
                                ...current,
                                expenses: [migrationExpense, ...(current.expenses || [])],
                                transactions: [...migrationExpenseAdjustments, ...current.transactions],
                                approvals: [...persistedExpenseApprovals, ...current.approvals],
                                legacyMigration: { ...current.legacyMigration, memberId: "" },
                                notifications: hasGroupApprovers
                                  ? [
                                      { id: makeId("ntf"), groupId: state.groups[0]?.id, title: "Migration expense approval requested", body: `Old group expense ${currency.format(groupExpenseTotal)} is waiting for approval.`, type: "info", createdAt: new Date().toISOString() },
                                      ...current.notifications
                                    ]
                                  : current.notifications
                              },
                              actor,
                              action: "migrate_group_expense",
                              tableName: "group_expense_header",
                              recordId: migrationExpense.id,
                              newValue: migrationExpense
                            }));
                            setLegacyExpenseLines([{ category: "Opening expense", amount: "", remarks: "" }]);
                            setMigrationLoading(false);
                            setNotification({ type: "success", message: hasGroupApprovers ? "Legacy group expense submitted for approval." : "Legacy group expense migrated." });
                          } catch (error) {
                            setMigrationLoading(false);
                            setNotification({ type: "error", message: `Unable to migrate legacy group expense: ${error.message}`, details: serializeError(error) });
                          }
                        },
                        onCancel: () => setConfirmDialog(null)
                      });
                      return;
                    }
                    const result = validate(legacyMigrationSchema, state.legacyMigration);
                    setLegacyErrors(result.errors);
                    if (!result.data) {
                      setNotification({ type: "error", message: "Complete the required legacy migration fields before saving." });
                      setTimeout(() => setNotification(null), 4000);
                      return;
                    }

                    const periodResult = canPostTransaction(state.periods || [], state.legacyMigration.joinedDate);
                    if (!periodResult.allowed) {
                      setLegacyErrors((current) => ({ ...current, joinedDate: periodResult.reason }));
                      setNotification({ type: "error", message: periodResult.reason });
                      setTimeout(() => setNotification(null), 4000);
                      return;
                    }

                    const memberId = state.legacyMigration.memberId;
                    const selectedMember = state.members.find((member) => String(member.id) === String(memberId));
                    if (!selectedMember) {
                      setLegacyErrors({ memberId: "Select a valid member" });
                      return;
                    }
                    const legacyExitDate = state.legacyMigration.exitDate || "";
                    const shouldMarkInactive = Boolean(legacyExitDate && legacyExitDate < toIsoDateValue());

                    const interestTotal = Number(state.legacyMigration.interestAmount ?? 0);
                    const penaltyTotal = Number(state.legacyMigration.penaltyAmount ?? 0);
                    const groupExpenseTotal = 0;
                    const hasGroupBankBalance = false;
                    const derivedOpeningSurplus = calculateDerivedOpeningSurplus({
                      state,
                      currentSaving: Number(state.legacyMigration.totalSaving || 0),
                      currentLoan: Number(state.legacyMigration.pendingLoan || 0),
                      groupBankBalance: 0,
                      groupExpense: groupExpenseTotal
                    });
                    const distributeAmount = hasGroupBankBalance ? Math.max(0, derivedOpeningSurplus) : 0;
                    const activeMembers = state.members.filter((member) => member.status === "Active");
                    const surplusRows = buildOpeningShareRatioRows({
                      members: activeMembers,
                      state,
                      currentMemberId: memberId,
                      currentSaving: Number(state.legacyMigration.totalSaving || 0),
                      amount: distributeAmount
                    });
                    const expenseRows = buildOpeningShareRatioRows({
                      members: activeMembers,
                      state,
                      currentMemberId: memberId,
                      currentSaving: Number(state.legacyMigration.totalSaving || 0),
                      amount: groupExpenseTotal
                    });
                    const allocations = Object.fromEntries(surplusRows.map((row) => [row.member.id, row.amount]));

                    const loan = state.loans.find((loan) => loanBelongsToMember(loan, selectedMember) && isOutstandingLoan(loan));
                    const patchLoan = loan ? {
                      ...loan,
                      principalOutstanding: loan.principalOutstanding + Number(state.legacyMigration.pendingLoan ?? 0),
                      interestOutstanding: loan.interestOutstanding + interestTotal,
                      penaltyOutstanding: loan.penaltyOutstanding + penaltyTotal
                    } : null;

                    setConfirmDialog({
                      title: 'Migrate legacy member data',
                      message: 'Apply this migration to the member and update outstanding balance fields?',
                      onConfirm: async () => {
                        setMigrationLoading(true);
                        try {
                          const totalMigrationSavings = Number(state.legacyMigration.totalSaving ?? 0);
                          const hasGroupApprovers = getConfiguredApprovalRecipients(state).length > 0;
                          const approvalStatus = hasGroupApprovers ? "Pending" : "Completed";
                          const updates = {
                            date_joined: state.legacyMigration.joinedDate ?? undefined,
                            savings: totalMigrationSavings,
                            loan_outstanding: state.legacyMigration.pendingLoan,
                            inactiveDate: shouldMarkInactive ? legacyExitDate : selectedMember.inactiveDate,
                            status: shouldMarkInactive ? "Inactive" : selectedMember.status
                          };

                          const migrationTransaction = {
                            id: makeId('txn'),
                            transactionDate: state.legacyMigration.joinedDate ?? new Date().toISOString().slice(0, 10),
                            memberId,
                            memberName: selectedMember.fullName,
                            amount: totalMigrationSavings,
                            transactionType: 'Migrated',
                            approvalStatus,
                            allocation: {
                              savings: totalMigrationSavings,
                              principal: Number(state.legacyMigration.pendingLoan ?? 0),
                              interest: interestTotal,
                              penalty: penaltyTotal,
                              excess: 0
                            }
                          };
                          let migrationExpense = groupExpenseTotal > 0 ? {
                            id: makeId("exp"),
                            groupId: state.groups[0]?.id,
                            periodId: periodResult.period?.id,
                            expenseNumber: makeId("EXP"),
                            transactionDate: state.legacyMigration.joinedDate ?? new Date().toISOString().slice(0, 10),
                            expenseDate: state.legacyMigration.joinedDate ?? new Date().toISOString().slice(0, 10),
                            amount: groupExpenseTotal,
                            approvalStatus,
                            expenseType: "Migrated Group Expense",
                            category: validLegacyExpenseLines[0]?.category ?? "Opening expense",
                            remarks: validLegacyExpenseLines.map((line) => line.remarks).filter(Boolean).join("; ") || "Migrated opening group expense",
                            lines: validLegacyExpenseLines
                          } : null;
                          const migrationExpenseAdjustments = [];
                          const migrationSurplusDistributions = [];
                          let persistedLegacyImport = null;

                          if (repository.isConfigured()) {
                            if (shouldMarkInactive) {
                              await repository.updateMember(memberId, {
                                active: false,
                                inactiveDate: legacyExitDate,
                                exitDate: legacyExitDate
                              });
                            }
                            // Persist one legacy import row; the service converts it into ledger lines.
                            try {
                              const persistedMigration = await repository.createLegacyImport({
                                groupId: state.groups[0]?.id,
                                memberId,
                                periodId: periodResult.period?.id,
                                joinedDate: state.legacyMigration.joinedDate,
                                exitDate: state.legacyMigration.exitDate,
                                totalSaving: Number(state.legacyMigration.totalSaving ?? 0),
                                pendingLoan: Number(state.legacyMigration.pendingLoan ?? 0),
                                interestAmount: Number(state.legacyMigration.interestAmount ?? 0),
                                penaltyAmount: Number(state.legacyMigration.penaltyAmount ?? 0),
                                legacyBankBalance: 0,
                                approvalStatus,
                                rawPayload: state.legacyMigration,
                                createdBy: actor?.id
                              });
                              persistedLegacyImport = persistedMigration;
                              if (persistedMigration?.transaction?.id) {
                                migrationTransaction.id = persistedMigration.transaction.id;
                              }
                            } catch (importErr) {
                              console.warn('Failed to persist legacy import row', importErr);
                              // fallback: preserve locally so user doesn't lose data
                              setState((s) => ({
                                ...s,
                                legacyImports: [
                                  ...(s.legacyImports || []),
                                  {
                                    id: makeId('local-imp'),
                                    group_id: state.groups[0]?.id,
                                    member_id: memberId,
                                    joined_date: state.legacyMigration.joinedDate,
                                    exit_date: state.legacyMigration.exitDate,
                                    total_saving: totalMigrationSavings,
                                    pending_loan: Number(state.legacyMigration.pendingLoan ?? 0),
                                    interest_amount: Number(state.legacyMigration.interestAmount ?? 0),
                                    penalty_amount: Number(state.legacyMigration.penaltyAmount ?? 0),
                                    legacy_bank_balance: 0,
                                    excess_amount: 0,
                                    raw_payload: state.legacyMigration,
                                    processed: false,
                                    created_by: actor?.id,
                                    created_at: new Date().toISOString(),
                                    _local: true
                                  }
                                ]
                              }));
                              setNotification({ type: 'warning', message: 'Saved migration locally. Online save failed.' });
                            }
                            if (migrationExpense) {
                              migrationExpense = await repository.createGroupExpense({
                                groupId: state.groups[0]?.id,
                                periodId: periodResult.period?.id,
                                expenseDate: state.legacyMigration.joinedDate,
                                amount: groupExpenseTotal,
                                approvalStatus,
                                expenseType: "Migrated Group Expense",
                                category: validLegacyExpenseLines[0]?.category ?? "Opening expense",
                                remarks: validLegacyExpenseLines.map((line) => line.remarks).filter(Boolean).join("; ") || "Migrated opening group expense",
                                lines: validLegacyExpenseLines
                              });
                              for (const expenseRow of expenseRows) {
                                const expenseMember = expenseRow.member;
                                const shareAmount = expenseRow.amount;
                                const adjustment = await repository.createTransaction({
                                  groupId: state.groups[0]?.id,
                                  memberId: expenseMember.id,
                                  periodId: periodResult.period?.id ?? null,
                                  transactionDate: state.legacyMigration.joinedDate,
                                  amount: -Math.abs(shareAmount),
                                  transactionType: "Group Expense Share",
                                  approvalStatus,
                                  remarks: `Expense share for expense ${migrationExpense.id}`,
                                  allocation: { savings: -Math.abs(shareAmount), excess: 0 }
                                });
                                migrationExpenseAdjustments.push({ ...adjustment, parentExpenseId: migrationExpense.id });
                              }
                            }
                            if (distributeAmount > 0) {
                              for (const surplusRow of surplusRows) {
                                const distribution = await repository.createTransaction({
                                  groupId: state.groups[0]?.id,
                                  memberId: surplusRow.member.id,
                                  periodId: periodResult.period?.id ?? null,
                                  transactionDate: state.legacyMigration.joinedDate,
                                  amount: surplusRow.amount,
                                  transactionType: "Migrated Gain Distribution",
                                  approvalStatus,
                                  remarks: "Opening surplus distributed by opening share ratio",
                                  allocation: { savings: 0, excess: surplusRow.amount }
                                });
                                migrationSurplusDistributions.push(distribution);
                              }
                            }
                          }

                          if (migrationExpense && migrationExpenseAdjustments.length === 0) {
                            for (const expenseRow of expenseRows) {
                              const expenseMember = expenseRow.member;
                              const shareAmount = expenseRow.amount;
                              migrationExpenseAdjustments.push({
                                id: makeId("txn"),
                                groupId: state.groups[0]?.id,
                                memberId: expenseMember.id,
                                periodId: periodResult.period?.id ?? null,
                                transactionDate: state.legacyMigration.joinedDate,
                                amount: -Math.abs(shareAmount),
                                transactionType: "Group Expense Share",
                                approvalStatus,
                                parentExpenseId: migrationExpense.id,
                                remarks: `Expense share for expense ${migrationExpense.id}`,
                                allocation: { savings: -Math.abs(shareAmount), excess: 0 }
                              });
                            }
                          }
                          if (distributeAmount > 0 && migrationSurplusDistributions.length === 0) {
                            surplusRows.forEach((surplusRow) => {
                              migrationSurplusDistributions.push({
                                id: makeId("txn"),
                                groupId: state.groups[0]?.id,
                                memberId: surplusRow.member.id,
                                periodId: periodResult.period?.id ?? null,
                                transactionDate: state.legacyMigration.joinedDate,
                                amount: surplusRow.amount,
                                transactionType: "Migrated Gain Distribution",
                                approvalStatus,
                                remarks: "Opening surplus distributed by opening share ratio",
                                allocation: { savings: 0, excess: surplusRow.amount }
                              });
                            });
                          }

                          const migrationApprovalRecord = hasGroupApprovers
                            ? createConfiguredApprovalRecords({
                                state,
                                action: "Legacy migration",
                                requester: selectedMember.fullName,
                                amount: totalMigrationSavings,
                                referenceId: migrationTransaction.id,
                                referenceType: "transaction"
                              })
                            : [];
                          const persistedMigrationApprovals = migrationApprovalRecord.length && repository.isConfigured()
                            ? await repository.createApprovalRequests({ groupId: state.groups[0]?.id, approvals: migrationApprovalRecord })
                            : migrationApprovalRecord;
                          const expenseApprovalRecord = hasGroupApprovers && migrationExpense
                            ? createConfiguredApprovalRecords({
                                state,
                                action: "Migrated group expense",
                                requester: selectedMember.fullName,
                                amount: groupExpenseTotal,
                                referenceId: migrationExpense.id,
                                referenceType: "expense"
                              })
                            : [];
                          const persistedExpenseApprovals = expenseApprovalRecord.length && repository.isConfigured()
                            ? await repository.createApprovalRequests({ groupId: state.groups[0]?.id, approvals: expenseApprovalRecord })
                            : expenseApprovalRecord;
                          const allMigrationApprovals = [...persistedMigrationApprovals, ...persistedExpenseApprovals];

                          setState((current) => {
                            if (hasGroupApprovers) {
                              return audit({
                                state: {
                                  ...current,
                                  members: shouldMarkInactive
                                    ? current.members.map((member) => String(member.id) === String(memberId)
                                      ? { ...member, status: "Inactive", inactiveDate: legacyExitDate, exitDate: legacyExitDate }
                                      : member)
                                    : current.members,
                                  approvals: [...allMigrationApprovals, ...current.approvals],
                                  transactions: [...migrationSurplusDistributions, ...migrationExpenseAdjustments, ...current.transactions, migrationTransaction],
                                  expenses: migrationExpense ? [migrationExpense, ...(current.expenses || [])] : (current.expenses || []),
                                  legacyImports: persistedLegacyImport ? [persistedLegacyImport, ...(current.legacyImports || [])] : (current.legacyImports || []),
                                  legacyMigration: {},
                                  notifications: [
                                    { id: makeId("ntf"), groupId: state.groups[0]?.id, title: "Migration approval requested", body: `${selectedMember.fullName} migration is waiting for approval.`, type: "info", createdAt: new Date().toISOString() },
                                    ...current.notifications
                                  ]
                                },
                                actor,
                                action: 'submit_migration',
                                tableName: 'legacy_data',
                                recordId: memberId,
                                newValue: state.legacyMigration
                              });
                            }

                            const updatedMembers = current.members.map((member) => {
                              const savingsAdd = member.id === memberId ? totalMigrationSavings : 0;
                              const distribution = allocations[member.id] ?? 0;
                              return {
                                ...member,
                                status: member.id === memberId && shouldMarkInactive ? "Inactive" : member.status,
                                inactiveDate: member.id === memberId && shouldMarkInactive ? legacyExitDate : member.inactiveDate,
                                exitDate: member.id === memberId && shouldMarkInactive ? legacyExitDate : member.exitDate,
                                savings: Number(member.savings || 0) + savingsAdd + distribution,
                                loanOutstanding: member.id === memberId
                                  ? Number(member.loanOutstanding || 0) + Number(state.legacyMigration.pendingLoan ?? 0)
                                  : member.loanOutstanding,
                                shares: Number(member.shares || 0) + distribution
                              };
                            });
                            const updatedLoans = patchLoan
                              ? current.loans.map((loan) => loan.id === patchLoan.id ? patchLoan : loan)
                              : (Number(state.legacyMigration.pendingLoan || 0) > 0
                                ? [
                                    ...current.loans,
                                    {
                                      id: makeId('loan'),
                                      memberId,
                                      memberName: selectedMember.fullName,
                                      amount: Number(state.legacyMigration.pendingLoan || 0),
                                      principalOutstanding: Number(state.legacyMigration.pendingLoan || 0),
                                      interestOutstanding: interestTotal,
                                      penaltyOutstanding: penaltyTotal,
                                      rate: 0,
                                      status: 'Active',
                                      reason: 'Legacy migration balance',
                                      durationMonths: 0,
                                      startDate: state.legacyMigration.joinedDate ?? new Date().toISOString().slice(0, 10)
                                    }
                                  ]
                                : current.loans);
                            const updatedTransactions = [...current.transactions, migrationTransaction];
                            const allUpdatedTransactions = [...migrationSurplusDistributions, ...migrationExpenseAdjustments, ...updatedTransactions];

                            return audit({
                              state: {
                                ...current,
                                members: updatedMembers,
                                loans: updatedLoans,
                                transactions: allUpdatedTransactions,
                                expenses: migrationExpense ? [migrationExpense, ...(current.expenses || [])] : (current.expenses || []),
                                legacyImports: persistedLegacyImport ? [persistedLegacyImport, ...(current.legacyImports || [])] : (current.legacyImports || []),
                                legacyMigration: {}
                              },
                              actor,
                              action: 'migrate',
                              tableName: 'group_members',
                              recordId: memberId,
                              newValue: state.legacyMigration
                            });
                          });

                          setMigrationLoading(false);
                          setConfirmDialog(null);
                          setLegacyExpenseLines([{ category: "Opening expense", amount: "", remarks: "" }]);
                          setNotification({ type: 'success', message: hasGroupApprovers ? 'Legacy migration submitted for approval.' : 'Legacy migration applied. Data has been saved successfully.' });
                          setTimeout(() => setNotification(null), 6000);
                        } catch (error) {
                          console.error('Migration persist failed', error);
                          setMigrationLoading(false);
                          setNotification({ type: 'error', message: `Unable to apply legacy migration: ${error.message}. Please check the console for details.` });
                          setTimeout(() => setNotification(null), 8000);
                        }
                      },
                      onCancel: () => {
                        if (!migrationLoading) {
                          setConfirmDialog(null);
                          setNotification({ type: 'info', message: 'Legacy migration cancelled.' });
                          setTimeout(() => setNotification(null), 3000);
                        }
                      }
                    });
                  }}>
                    Migrate member data
                  </button>
                  <Section title="Last 60 days migrated transactions">
                    <Table
                      headers={["Date", "Member", "Joined", "Exit", "Saving", "Pending loan", "Interest", "Penalty", "Status", "Remarks"]}
                      rows={recentLegacyMigrations.map((row) => {
                        const member = state.members.find((item) => String(item.id) === String(row.memberId));
                        return [
                          row.date ?? "",
                          member?.fullName ?? row.memberId ?? "",
                          row.joinedDate ?? "",
                          row.exitDate ?? "",
                          currency.format(row.saving || 0),
                          currency.format(row.loan || 0),
                          currency.format(row.interest || 0),
                          currency.format(row.penalty || 0),
                          row.status ?? "",
                          row.remarks ?? ""
                        ];
                      })}
                    />
                    {recentLegacyMigrations.length === 0 && <p className="section-note">No migrated transactions in the last 60 days.</p>}
                  </Section>
                  <Section title="Group-level legacy opening history">
                    <Table
                      headers={["Migration date", "Opening bank balance", "Old group gain", "Old group expense", "Status", "Pending with", "Remarks"]}
                      rows={recentLegacyGroupOpenings.map((row) => [
                        row.migration_date ?? row.migrationDate ?? "",
                        currency.format(row.opening_bank_balance ?? row.openingBankBalance ?? 0),
                        currency.format(row.opening_group_gain ?? row.openingGroupGain ?? 0),
                        currency.format(row.opening_group_expense ?? row.openingGroupExpense ?? 0),
                        statusWithPendingApprover({ id: row.legacy_group_opening_id ?? row.id, approvalStatus: row.approval_status ?? row.approvalStatus }, state.approvals, "legacy_group_opening"),
                        (state.approvals || [])
                          .filter((approval) => String(approval.referenceId) === String(row.legacy_group_opening_id ?? row.id) && approval.referenceType === "legacy_group_opening" && approval.status === "Pending")
                          .map((approval) => approval.approverName || approval.level)
                          .join(", ") || "-",
                        row.remarks ?? ""
                      ])}
                    />
                    {recentLegacyGroupOpenings.length === 0 && <p className="section-note">No group-level legacy opening records in the last 60 days.</p>}
                  </Section>
                </>
              )}
            </FormCard>
          )}
        </>
      )}
      </div>
      </div>
      {financialTab !== "calculator" && (
        <Section title="Pending setup approvals">
          <Table
            headers={["Setup", "Change", "Status", "Pending with", "Requested"]}
            rows={pendingSetupRows.map((change) => [
              `${getSetupChangeTypeLabel(change.setupType)} / ${change.targetName || ""}`,
              change.changeSummary || "",
              change.status || "Pending",
              change.pendingWith,
              change.createdAt ? new Date(change.createdAt).toLocaleString("en-IN") : ""
            ])}
          />
          {pendingSetupRows.length === 0 && <p className="section-note">No setup changes are pending approval.</p>}
        </Section>
      )}
    </Page>
    </>
  );
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
  
  const openPeriod = getOpenPeriod(periodsData);
  const isGroupExpense = values.memberId === GROUP_EXPENSE_MEMBER_ID;
  let member = isGroupExpense ? null : state.members.find((item) => String(item.id) === String(values.memberId));
  const memberActiveLoans = state.loans
    .filter((item) => loanBelongsToMember(item, member) && (item.principalOutstanding || 0) > 0)
    .sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")));
  const loan = memberActiveLoans[0];
  const totalPrincipalOutstanding = memberActiveLoans.reduce((sum, item) => sum + Number(item.principalOutstanding || 0), 0);
  const interestDueDetails = member ? calculateMemberLoanInterestDueDetails(member, state, new Date(values.transactionDate || new Date())) : [];
  const calculatedInterestDue = interestDueDetails.reduce((sum, row) => sum + Number(row.calculated || 0), 0);
  const totalInterestOutstanding = interestDueDetails.reduce((sum, row) => sum + Number(row.due || 0), 0);
  const maxInterestDue = totalInterestOutstanding;
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
    interestOutstanding: totalInterestOutstanding,
    penaltyOutstanding: totalPenaltyOutstanding
  });
  
  const allocation = editableAllocation || defaultAllocation;
  const expenseLineTotal = expenseLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  
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
    const allocationTotal = Object.values(allocation).reduce((sum, val) => sum + val, 0);
    const collectedAmount = Number(values.amount) || 0;
    if (allocationTotal > collectedAmount + 0.01) {
      setAllocationErrors({ total: `Split total (${currency.format(allocationTotal)}) cannot be more than amount collected (${currency.format(collectedAmount)}).` });
      return false;
    }
    if (Number(allocation.interest || 0) > maxInterestDue + 0.01) {
      setAllocationErrors({ total: `Interest cannot be more than calculated due ${currency.format(maxInterestDue)}.` });
      return false;
    }
    if (Number(allocation.principal || 0) > maxPrincipalDue + 0.01) {
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
        setState((current) => ({ ...tenantData }));
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
        setState((current) => ({ ...tenantData }));

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
            setTimeout(() => setNotification(null), 3000);
            return;
          }

          const createdTransaction = await repository.createTransaction({
            groupId: effectiveGroupId,
            memberId: effectiveMemberId,
            periodId: effectivePeriod?.id ?? null,
            transactionDate: result.data.transactionDate,
            amount: Number(result.data.amount),
            transactionType: 'Savings Collection',
            approvalStatus: hasGroupApprovers ? 'Pending' : 'Completed',
            createdBy: actor.id,
            allocation: allocation
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
                  { id: makeId("ntf"), groupId: state.groups[0]?.id, title: "Transaction approval requested", body: `${actor.name} submitted ${currency.format(result.data.amount)} for approval.`, type: "info", createdAt: new Date().toISOString() },
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
                setEditableAllocation({ ...allocation });
              }}
            >
              Edit allocation
            </button>
          </div>
        )}
        
        <div className="allocation" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {Object.entries(allocation).map(([keyName, value]) => (
            <div key={keyName} style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', textTransform: 'capitalize' }}>
                {keyName}
              </label>
              {keyName === "interest" && <small className="section-note">Max calculated: {currency.format(maxInterestDue)}</small>}
              {keyName === "principal" && <small className="section-note">Outstanding: {currency.format(maxPrincipalDue)}</small>}
              {keyName === "savings" && <small className="section-note">Remaining this month: {currency.format(remainingMonthlySavingDue)}</small>}
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
          ))}
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
    disputes: (state.disputes || []).filter((row) => String(row.group_id ?? row.groupId) === groupId)
  };
}

function isPendingFinancialStatus(status) {
  return String(status ?? "").toUpperCase() === "PENDING";
}

function isWithinPastDays(dateValue, days = 60) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return date >= cutoff && date <= today;
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
  return getCompletedTransactions(transactions)
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
          setState((current) => audit({
            state: {
              ...current,
              transactions: [created, ...current.transactions],
              approvals: [...persistedApprovals, ...current.approvals],
              notifications: hasGroupApprovers
                ? [
                    { id: makeId("ntf"), groupId: state.groups[0]?.id, recipientMemberIds: approvalRecord.map((approval) => approval.approverId), title: "Adjustment approval requested", body: `${actor.name} submitted ${currency.format(adjustmentAmount)} adjustment for approval.`, type: "info", createdAt: new Date().toISOString() },
                    ...current.notifications
                  ]
                : current.notifications
            },
            actor,
            action: "adjust",
            tableName: "member_transaction_header",
            recordId: created.id,
            newValue: created
          }));
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
  const belongsToActiveGroup = (transaction) =>
    String(transaction.groupId ?? "") === String(activeGroupId)
    || activeMemberIds.has(String(transaction.memberId));
  const reversibleTransactions = state.transactions.filter((item) =>
    belongsToActiveGroup(item)
    && isCompletedFinancialStatus(item.approvalStatus)
    && item.reversedFlag !== "Y"
    && item.adjustmentFlag !== "Y"
    && !item.transactionNumber?.startsWith("REV")
    && !item.transactionNumber?.startsWith("ADJ")
    && correctionBlockReason(state.transactions, item, "reversal") === ""
  );
  const [values, setValues] = useState({
    transactionId: reversibleTransactions[0]?.id ?? "",
    reversalDate: toIsoDateValue(),
    reason: ""
  });
  const [errors, setErrors] = useState({});
  const reversalRows = state.transactions
    .filter((item) => item.reversedFlag === "Y" || item.transactionNumber?.startsWith("REV"))
    .filter((item) => isPendingOrRecentCompleted(item, "transactionDate", 60));
  const selectedTransaction = reversibleTransactions.find((item) => String(item.id) === String(values.transactionId));
  const selectedMember = state.members.find((item) => String(item.id) === String(selectedTransaction?.memberId));
  const blockedOriginal = state.transactions.find((item) => String(item.id) === String(values.transactionId));
  const selectedBlockReason = correctionBlockReason(state.transactions, blockedOriginal, "reversal");

  function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!selectedTransaction) nextErrors.transactionId = "Select the wrong transaction.";
    if (selectedBlockReason) nextErrors.transactionId = selectedBlockReason;
    if (selectedMember && !isMemberActive(selectedMember)) nextErrors.transactionId = "Inactive members cannot have new reversal transactions.";
    if (!values.reason.trim()) nextErrors.reason = "Add a reason for audit history.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setConfirmDialog({
      title: "Create reversal",
      message: `Reverse the full transaction ${selectedTransaction.transactionNumber ?? selectedTransaction.id}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const hasGroupApprovers = getApprovalRecipients(state).length > 0;
          const created = await repository.reverseTransaction({
            ...selectedTransaction,
            transactionDate: values.reversalDate,
            approvalStatus: hasGroupApprovers ? "Pending" : "Completed",
            remarks: values.reason.trim()
          });
          const approvalRecord = hasGroupApprovers
            ? createApprovalRecords({
                state,
                action: "Transaction reversal",
                requester: actor.name,
                amount: Math.abs(Number(selectedTransaction.amount || 0)),
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
                    { id: makeId("ntf"), groupId: state.groups[0]?.id, recipientMemberIds: approvalRecord.map((approval) => approval.approverId), title: "Reversal approval requested", body: `${actor.name} submitted reversal for approval.`, type: "info", createdAt: new Date().toISOString() },
                    ...current.notifications
                  ]
                : current.notifications
            },
            actor,
            action: "reverse",
            tableName: "member_transaction_header",
            recordId: created.id,
            newValue: created
          }));
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
          <SelectField
            label="Wrong transaction"
            value={values.transactionId}
            onChange={(transactionId) => {
              setValues({ ...values, transactionId });
              setErrors({});
            }}
            options={reversibleTransactions.map((item) => {
              const member = state.members.find((entry) => String(entry.id) === String(item.memberId));
              return {
                label: `${item.transactionDate} / ${member?.fullName ?? "Member"} / ${currency.format(item.amount)} / ${item.transactionNumber ?? item.id}`,
                value: item.id
              };
            })}
            error={errors.transactionId}
          />
          <Field label="Reversal date" type="date" value={values.reversalDate} onChange={(reversalDate) => setValues({ ...values, reversalDate })} />
          <Field label="Reason" value={values.reason} onChange={(reason) => setValues({ ...values, reason })} error={errors.reason} />
        </FormCard>
        <Section title="Reversal preview">
          <div className="status-row">
            <div>
              <strong>Original amount</strong>
              <p>{currency.format(selectedTransaction?.amount ?? 0)}</p>
            </div>
            <div>
              <strong>Reversal entry</strong>
              <p>{currency.format(-Math.abs(Number(selectedTransaction?.amount ?? 0)))}</p>
            </div>
          </div>
          <div className="status-row">
            <div>
              <strong>Member</strong>
              <p>{selectedMember?.fullName ?? "Select transaction"}</p>
            </div>
            <div>
              <strong>Parent transaction</strong>
              <p>{selectedTransaction?.transactionNumber ?? selectedTransaction?.id ?? "-"}</p>
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
    ? calculatePendingDues(state, actor, false)
        .filter((row) => String(row.memberId) === String(selectedMember.id))
        .reduce((sum, row) => sum + Number(row.penaltyDue || 0), 0)
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

function AuditHistory({ state }) {
  const rows = (state.auditLogs || []).filter((log) => isWithinPastDays(log.timestamp, 60) || !log.timestamp);
  return (
    <Page title="Audit History" subtitle="Recorded creates, adjustments, reversals and protected financial changes for the last 60 days" action={null}>
      <Table
        headers={["When", "Actor", "Action", "Table", "Record", "Old value", "New value"]}
        rows={rows.map((log) => [
          log.timestamp ? new Date(log.timestamp).toLocaleString("en-IN") : "",
          log.actor,
          log.action,
          log.tableName,
          log.recordId,
          formatHistoryValue(log.oldValue),
          formatHistoryValue(log.newValue)
        ])}
      />
    </Page>
  );
}

function ShareDistributionHistory({ state }) {
  return (
    <Page title="Share Distribution History" subtitle="Frozen event-based profit shares for eligible active members" action={null}>
      <Table
        headers={["Date", "Member", "Source", "Amount", "Earning transaction"]}
        rows={(state.shareDistributions || []).map((row) => {
          const member = state.members.find((entry) => String(entry.id) === String(row.member_id ?? row.memberId));
          return [
            row.distribution_date ?? row.distributionDate,
            member?.fullName ?? row.member_id,
            row.source_type ?? row.sourceType,
            currency.format(row.distribution_amount ?? row.distributionAmount ?? 0),
            row.earning_trx_id ?? row.earningTrxId
          ];
        })}
      />
      <Section title="Share adjustments">
        <Table
          headers={["Member", "Amount", "Reason", "Reference"]}
          rows={(state.shareAdjustments || []).map((row) => {
            const member = state.members.find((entry) => String(entry.id) === String(row.member_id ?? row.memberId));
            return [
              member?.fullName ?? row.member_id,
              currency.format(row.amount ?? 0),
              row.reason ?? "",
              row.source_reference ?? row.sourceReference ?? ""
            ];
          })}
        />
      </Section>
    </Page>
  );
}

function ContactSupport({ state, setState, actor, setNotification }) {
  const [values, setValues] = useState({
    issue: "",
    contactNumber: actor?.mobile ?? "",
    attachmentName: "",
    attachmentData: ""
  });
  const group = state.groups[0];

  async function submit(event) {
    event.preventDefault();
    if (!values.issue.trim() || !values.contactNumber.trim()) {
      setNotification({ type: "error", message: "Issue and contact number are required." });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    try {
      const createdDispute = await repository.createDispute({
        groupId: group?.id,
        memberId: actor?.memberId,
        groupName: group?.name ?? "",
        memberName: actor?.name ?? actor?.email ?? "",
        contactNumber: values.contactNumber,
        issue: values.issue,
        attachmentName: values.attachmentName,
        attachmentData: values.attachmentData
      });
      setState((current) => ({ ...current, disputes: [createdDispute, ...(current.disputes || [])] }));
      setNotification({ type: "success", message: "Dispute request saved for product owner review." });
      setValues({ issue: "", contactNumber: actor?.mobile ?? "", attachmentName: "", attachmentData: "" });
    } catch (error) {
      setNotification({ type: "error", message: `Unable to save dispute: ${error.message}`, details: serializeError(error) });
    }
  }

  return (
    <Page title="Contact" subtitle="Raise app-related disputes with group and member context" action={null}>
      <FormCard title="New dispute request" onSubmit={submit}>
        <Field label="Group" value={group?.name ?? ""} onChange={() => {}} />
        <Field label="Member" value={actor?.name ?? actor?.email ?? ""} onChange={() => {}} />
        <Field label="Issue" value={values.issue} onChange={(issue) => setValues({ ...values, issue })} />
        <Field label="Contact number" value={values.contactNumber} onChange={(contactNumber) => setValues({ ...values, contactNumber })} />
        <label className="field">
          <span>Attachment optional</span>
          <input type="file" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              setValues({ ...values, attachmentName: "", attachmentData: "" });
              return;
            }
            const reader = new FileReader();
            reader.onload = () => setValues((current) => ({ ...current, attachmentName: file.name, attachmentData: String(reader.result || "") }));
            reader.readAsDataURL(file);
          }} />
        </label>
      </FormCard>
      <Section title="Your dispute conversations">
        <div className="chat-list">
          {(state.disputes || []).length === 0 ? (
            <p className="section-note">No disputes raised for this group.</p>
          ) : (state.disputes || []).map((dispute) => (
            <article className="chat-window" key={dispute.dispute_id ?? dispute.id}>
              <div className="chat-meta">
                <strong>{dispute.group_name || state.groups[0]?.name || "Group"}</strong>
                <span className="pill">{dispute.status}</span>
              </div>
              <div className="chat-bubble chat-sent">
                <small>You sent</small>
                <p>{dispute.issue}</p>
              </div>
              {dispute.owner_reply ? (
                <div className="chat-bubble chat-reply">
                  <small>Support replied</small>
                  <p>{dispute.owner_reply}</p>
                </div>
              ) : (
                <div className="chat-bubble chat-waiting">
                  <small>Support</small>
                  <p>Waiting for reply.</p>
                </div>
              )}
              {dispute.attachment_name && <p className="section-note">Attachment: {dispute.attachment_name}</p>}
            </article>
          ))}
        </div>
      </Section>
    </Page>
  );
}

function buildFinanceAgentContext(state, actor) {
  const period = getDashboardPeriod(state);
  const group = state.groups?.[0] ?? {};
  const groupSummary = calculateGroupFinanceSummary(state, period);
  const isMemberOnly = actor?.role === roles.MEMBER;
  const visibleMembers = isMemberOnly
    ? [getCurrentMember(state, actor)].filter(Boolean)
    : (state.members || []);
  const memberSummaries = visibleMembers.map((member) => {
    const summary = calculateMemberFinanceSummary(member, state, period, actor);
    return {
      id: member.id,
      name: member.fullName,
      status: member.status,
      savings: summary.savings,
      shareAmount: summary.shareAmount,
      sharePercent: summary.sharePercent,
      gain: summary.gain,
      expense: summary.expense,
      loanOutstanding: summary.outstanding,
      nextDueAmount: summary.nextDueAmount,
      interestDue: summary.interestDue,
      monthlySavings: summary.monthlySavings,
      monthlyPrincipal: summary.monthlyPrincipal,
      monthlyInterest: summary.monthlyInterest,
      monthlyPenalty: summary.monthlyPenalty,
      activeLoans: summary.memberActiveLoans.length
    };
  });

  return {
    group: {
      id: group.id,
      name: group.name,
      code: group.code,
      role: actor?.role,
      period: {
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate
      }
    },
    fieldRules: financeFieldDictionary,
    groupSummary: {
      totalSavings: groupSummary.totalSavings,
      monthlyCollections: groupSummary.monthlyCollections,
      monthlySavings: groupSummary.monthlySavings,
      monthlyPrincipal: groupSummary.monthlyPrincipal,
      monthlyInterest: groupSummary.monthlyInterest,
      monthlyPenalty: groupSummary.monthlyPenalty,
      monthlyWithdrawn: groupSummary.monthlyWithdrawn,
      totalActiveLoan: groupSummary.totalActiveLoan,
      totalExpenses: groupSummary.totalExpenses,
      totalWithdrawn: groupSummary.totalWithdrawn,
      groupGain: groupSummary.groupGain,
      collectedGain: groupSummary.collectedGain,
      remainingBalance: groupSummary.remainingBalance,
      activeLoanCount: groupSummary.activeLoans.length,
      legacyOpening: groupSummary.legacyOpening
    },
    memberSummaries,
    pendingDues: calculatePendingDues(state, actor, isMemberOnly).map((row) => ({
      memberName: row.memberName,
      periodName: row.periodName,
      dueDate: row.dueDate,
      savingDue: row.savingDue,
      principalDue: row.principalDue,
      outstandingPrincipal: row.outstandingPrincipal,
      interestDue: row.interestDue,
      penaltyDue: row.penaltyDue,
      totalDue: row.totalDue
    })),
    recentTransactions: getCompletedTransactions(state.transactions || [])
      .slice(-20)
      .map((transaction) => ({
        date: transaction.transactionDate,
        memberName: transaction.memberName,
        type: transaction.transactionType,
        amount: transaction.amount,
        allocation: transaction.allocation
      }))
  };
}

function FinanceAgent({ state, actor, setNotification }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Ask me about savings, loans, pending dues, migrated balances, group gain, remaining balance, or why a dashboard number is showing."
    }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function askAgent(event) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;

    const nextMessages = [...messages, { role: "user", content: trimmedQuestion }];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);

    try {
      const response = await repository.askFinanceAgent({
        question: trimmedQuestion,
        messages: nextMessages,
        context: buildFinanceAgentContext(state, actor)
      });
      setMessages((current) => [...current, { role: "assistant", content: response.answer || "No answer returned." }]);
    } catch (error) {
      const message = `Unable to reach AI Agent: ${error.message}`;
      setMessages((current) => [...current, { role: "assistant", content: message }]);
      setNotification?.({ type: "error", message, details: serializeError(error) });
    } finally {
      setLoading(false);
    }
  }

  const sampleQuestions = [
    "Why is remaining balance different from total savings?",
    "Which members have pending dues?",
    "Explain migrated savings, interest and penalty in this group.",
    "How is group gain calculated?"
  ];

  return (
    <Page title="AI Agent" subtitle="Read-only finance assistant for dashboard formulas, dues, savings and loans" action={null}>
      <Section title="Finance Assistant">
        <div className="chat-window ai-agent-window">
          <div className="chat-meta">
            <strong>Context</strong>
            <span className="pill">Read-only</span>
          </div>
          <div className="chat-list">
            {messages.map((message, index) => (
              <div className={`chat-bubble ${message.role === "user" ? "chat-sent" : "chat-reply"}`} key={`${message.role}-${index}`}>
                <small>{message.role === "user" ? "You" : "AI Agent"}</small>
                <p>{message.content}</p>
              </div>
            ))}
            {loading && (
              <div className="chat-bubble chat-waiting">
                <small>AI Agent</small>
                <p>Thinking through the finance context...</p>
              </div>
            )}
          </div>
          <form className="ai-agent-form" onSubmit={askAgent}>
            <label className="field ai-agent-input">
              <span>Ask a question</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                placeholder="Example: Why is loan repaid showing different from principal collected?"
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading || !question.trim()}>
              {loading ? "Asking..." : "Ask AI Agent"}
            </button>
          </form>
        </div>
      </Section>
      <Section title="Suggested questions">
        <div className="chip-row">
          {sampleQuestions.map((item) => (
            <button key={item} type="button" className="secondary-button" onClick={() => setQuestion(item)}>
              {item}
            </button>
          ))}
        </div>
      </Section>
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
  const dueRows = calculatePendingDues(state, actor, memberOnly);
  function removeDue(rowId) {
    if (memberOnly) return;
    setState((current) => ({
      ...current,
      dismissedPendingDues: Array.from(new Set([...(current.dismissedPendingDues || []), rowId]))
    }));
    setNotification({ type: "success", message: "Pending due record removed from this list." });
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
      const body = rows.map((row) =>
        `${row.periodName}: Saving ${currency.format(row.savingDue)}, principal due ${currency.format(row.principalDue ?? row.outstandingPrincipal)}, interest ${currency.format(row.interestDue)}, penalty ${currency.format(row.penaltyDue)}, total ${currency.format(row.totalDue)}, due ${new Date(row.dueDate).toLocaleDateString("en-IN")}`
      ).join(" | ");
      return {
        id: makeId("ntf"),
        groupId: state.groups[0]?.id,
        memberId,
        title: `Payment due: ${currency.format(total)}`,
        body: `${body}. Next due date: ${new Date(latestDue).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
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
      action={!memberOnly ? <button type="button" className="secondary-button" onClick={notifyMembers}>Notify members</button> : null}
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
  const memberSummary = selectedMember ? calculateMemberFinanceSummary(selectedMember, state, getDashboardPeriod(state), actor) : null;
  const availableShare = Math.max(0, Number(memberSummary?.shareAmount || 0) - Number(memberSummary?.outstanding || 0));
  const remainingAccountBalance = Math.max(0, calculateGroupFinanceSummary(state).remainingBalance);
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

function Loans({ state, setState, actor, setConfirmDialog, setNotification }) {
  useEffect(() => { ensureLatestTenantData(); }, []);
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
      setValues((current) => ({ ...current, memberId: activeWithdrawalMembers[0]?.id ?? "" }));
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

    const remainingBalance = Math.max(0, calculateGroupFinanceSummary(state).remainingBalance);
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
  const visibleApprovals = (state.approvals || []).filter((approval) =>
    adminLikeApproverView
    || (approval.status === "Pending" && isApprovalAssignedToActor(approval, actor, actorMembers))
  );

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
            nextState = {
              ...nextState,
              transactions: nextState.transactions.map((item) =>
                String(item.id) === String(target.referenceId) ? { ...item, approvalStatus: "Completed" } : item
              )
            };
            if (transaction) {
              nextState = {
                ...nextState,
                members: nextState.members.map((member) => String(member.id) === String(transaction.memberId)
                  ? {
                      ...member,
                      savings: Number(member.savings || 0) + Number(transaction.allocation?.savings || 0),
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
      <div className="approval-list">
        {visibleApprovals.map((approval) => {
          const batch = approvalBatchFor(approval, state.approvals);
          const pendingBatch = batch.filter((item) => item.status === "Pending");
          const pendingWith = formatPendingApproverNames(pendingBatch);
          const allApproved = batch.length > 0 && batch.every((item) => item.status === "Approved");
          const assignedToActor = isApprovalAssignedToActor(approval, actor, actorMembers);
          const canDecide = approval.status === "Pending" && (adminLikeApproverView || assignedToActor);
          return (
            <article className="entity-card compact-card" key={approval.id}>
              <span className="pill">{allApproved ? "Completed" : approval.status}</span>
              <h3>{approval.action}</h3>
              <p>{approval.requester} / Pending with {pendingWith} / {approval.amount ? currency.format(approval.amount) : "No amount"}</p>
              {approval.status === "Approved" && !allApproved && <p className="section-note">This approver has approved. Waiting for: {pendingWith}</p>}
              {approval.details && <p className="section-note">{approval.details}</p>}
              <div className="button-row">
                <button type="button" disabled={!canDecide} onClick={() => decide(approval.id, "Approved")}>Approve</button>
                <button type="button" disabled={!canDecide} onClick={() => decide(approval.id, "Rejected")}>Reject</button>
                <button type="button" disabled={!canDecide} onClick={() => decide(approval.id, "Returned")}>Return</button>
              </div>
            </article>
          );
        })}
        {visibleApprovals.length === 0 && <p className="section-note">No approvals assigned to your login.</p>}
      </div>
    </Page>
  );
}

function getOldestReportDate(state) {
  const candidateDates = [
    ...(getCompletedTransactions(state.transactions || []) || []).map((item) => item.transactionDate || item.createdAt),
    ...(getCompletedTransactions(state.expenses || []) || []).map((item) => item.transactionDate || item.expenseDate || item.createdAt),
    ...(state.loans || []).map((item) => item.startDate || item.distributionDate || item.requestDate || item.createdAt),
    ...(state.withdrawalRequests || []).map((item) => item.requestDate || item.createdAt),
    ...(state.legacyImports || []).map((item) => item.migration_date || item.migrationDate || item.joined_date || item.joinedDate || item.created_at || item.createdAt),
    ...(state.legacyGroupOpenings || []).map((item) => item.migration_date || item.migrationDate || item.opening_date || item.openingDate || item.created_at || item.createdAt),
    ...(state.shareDistributions || []).map((item) => item.distribution_date || item.distributionDate || item.created_at || item.createdAt),
    ...(state.shareAdjustments || []).map((item) => item.adjustment_date || item.adjustmentDate || item.created_at || item.createdAt)
  ].filter(Boolean).map((value) => String(value).slice(0, 10)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

  return candidateDates.sort()[0] || toIsoDateValue();
}

function Reports({ state, actor, setNotification }) {
  const todayIso = toIsoDateValue();
  const oldestReportDate = getOldestReportDate(state);
  const [draftEndDate, setDraftEndDate] = useState(todayIso);
  const [reportRange, setReportRange] = useState({ startDate: oldestReportDate, endDate: todayIso });
  const snapshotState = getStateTillDate(state, reportRange.endDate);
  const rangeTransactions = getCompletedTransactions(snapshotState.transactions || [])
    .filter((transaction) => isIsoDateInRange(transaction.transactionDate, reportRange.startDate, reportRange.endDate));
  const rangeExpenses = getCompletedTransactions(snapshotState.expenses || [])
    .filter((expense) => isIsoDateInRange(expense.transactionDate || expense.expenseDate || expense.createdAt, reportRange.startDate, reportRange.endDate));
  const rangeLoans = (snapshotState.loans || []).filter((loan) =>
    isIsoDateInRange(loan.startDate || loan.distributionDate || loan.requestDate || loan.createdAt, reportRange.startDate, reportRange.endDate)
  );
  const groupCollectedInRange = rangeTransactions.reduce((sum, transaction) => {
    if (transaction.transactionType === "Withdrawal") {
      return sum - Math.abs(Number(transaction.amount || transaction.allocation?.savings || 0));
    }
    return sum
      + Number(transaction.allocation?.savings || 0)
      + Number(transaction.allocation?.excess || 0)
      + Number(transaction.allocation?.principal || 0)
      + Number(transaction.allocation?.interest || 0)
      + Number(transaction.allocation?.penalty || 0);
  }, 0);
  const groupGainInRange = rangeTransactions.reduce((sum, transaction) => {
    if (isMigratedOpeningTransaction(transaction) || transaction.transactionType === "Withdrawal") return sum;
    return sum
      + Number(transaction.allocation?.interest || 0)
      + Number(transaction.allocation?.penalty || 0)
      + Number(transaction.allocation?.charges || 0);
  }, 0);
  const groupExpensesInRange = rangeExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const groupWithdrawnInRange = rangeTransactions
    .filter((transaction) => transaction.transactionType === "Withdrawal")
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || transaction.allocation?.savings || 0)), 0);
  const groupSavingsInRange = rangeTransactions.reduce((sum, transaction) => {
    if (transaction.transactionType === "Group Expense Share") return sum;
    return sum + Number(transaction.allocation?.savings || 0) + Number(transaction.allocation?.excess || 0);
  }, 0);
  const groupPrincipalRepaidInRange = rangeTransactions.reduce((sum, transaction) => sum + Number(transaction.allocation?.principal || 0), 0);
  const groupLoanDisbursedInRange = rangeLoans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
  const groupLoanBalanceInRange = Math.max(0, groupLoanDisbursedInRange - groupPrincipalRepaidInRange);
  const groupRemainingInRange = groupSavingsInRange + groupPrincipalRepaidInRange + groupGainInRange - groupExpensesInRange - groupWithdrawnInRange - groupLoanBalanceInRange;
  const pendingDues = calculatePendingDues(snapshotState, actor, false);
  const pendingDuesByMember = pendingDues.reduce((map, row) => {
    const memberId = String(row.memberId);
    const existing = map.get(memberId) || [];
    existing.push(row);
    map.set(memberId, existing);
    return map;
  }, new Map());

  const memberSummaries = (snapshotState.members || []).map((member) => {
    const memberTransactions = rangeTransactions
      .filter((transaction) => String(transaction.memberId) === String(member.id));
    const memberLoansInRange = rangeLoans.filter((loan) => loanBelongsToMember(loan, member));
    const collectedInRange = memberTransactions.reduce((sum, transaction) => {
      if (transaction.transactionType === "Withdrawal") {
        return sum - Math.abs(Number(transaction.amount || transaction.allocation?.savings || 0));
      }
      return sum
        + Number(transaction.allocation?.savings || 0)
        + Number(transaction.allocation?.excess || 0)
        + Number(transaction.allocation?.principal || 0)
        + Number(transaction.allocation?.interest || 0)
        + Number(transaction.allocation?.penalty || 0);
    }, 0);
    const gainInRange = memberTransactions.reduce((sum, transaction) => {
      if (isMigratedOpeningTransaction(transaction) || transaction.transactionType === "Withdrawal") return sum;
      return sum
        + Number(transaction.allocation?.interest || 0)
        + Number(transaction.allocation?.penalty || 0)
        + Number(transaction.allocation?.charges || 0);
    }, 0);
    const expenseInRange = Math.abs(memberTransactions
      .filter((transaction) => transaction.transactionType === "Group Expense Share")
      .reduce((sum, transaction) => sum + Number(transaction.allocation?.savings ?? transaction.amount ?? 0), 0));
    const withdrawnInRange = memberTransactions
      .filter((transaction) => transaction.transactionType === "Withdrawal")
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || transaction.allocation?.savings || 0)), 0);
    const savingsInRange = memberTransactions.reduce((sum, transaction) => {
      if (transaction.transactionType === "Group Expense Share") return sum;
      return sum + Number(transaction.allocation?.savings || 0) + Number(transaction.allocation?.excess || 0);
    }, 0);
    const principalRepaidInRange = memberTransactions.reduce((sum, transaction) => sum + Number(transaction.allocation?.principal || 0), 0);
    const loanDisbursedInRange = memberLoansInRange.reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
    const principalOutstanding = Math.max(0, loanDisbursedInRange - principalRepaidInRange);
    const interestDue = memberLoansInRange.reduce((sum, loan) => sum + Number(loan.interestOutstanding || 0), 0);
    const penaltyDue = memberLoansInRange.reduce((sum, loan) => sum + Number(loan.penaltyOutstanding || 0), 0);
    const shareAmountInRange = savingsInRange + gainInRange - expenseInRange - withdrawnInRange;
    const hasRangeActivity = memberTransactions.length > 0 || memberLoansInRange.length > 0;
    const memberPendingDues = (pendingDuesByMember.get(String(member.id)) || [])
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const nextDue = memberPendingDues[0] || null;

    return {
      member,
      collectedInRange,
      savingsInRange,
      gainInRange,
      expenseInRange,
      shareAmountInRange,
      withdrawnInRange,
      activeLoanCount: memberLoansInRange.length,
      principalOutstanding,
      interestDue,
      penaltyDue,
      nextEmiAmount: Number(nextDue?.totalDue || 0),
      nextDueDate: nextDue ? String(nextDue.dueDate || "").slice(0, 10) : "-",
      hasRangeActivity
    };
  }).filter((row) => row.hasRangeActivity);
  const groupShareAmount = memberSummaries.reduce((sum, row) => sum + Number(row.shareAmountInRange || 0), 0);
  const groupInterestDue = memberSummaries.reduce((sum, row) => sum + Number(row.interestDue || 0), 0);
  const groupPenaltyDue = memberSummaries.reduce((sum, row) => sum + Number(row.penaltyDue || 0), 0);
  const memberRows = memberSummaries.map((row) => [
    row.member.fullName,
    row.member.username || "-",
    row.member.status || "-",
    currency.format(row.collectedInRange),
    currency.format(row.savingsInRange),
    currency.format(row.gainInRange),
    currency.format(row.expenseInRange),
    currency.format(row.shareAmountInRange),
    row.activeLoanCount,
    currency.format(row.principalOutstanding),
    currency.format(row.interestDue),
    currency.format(row.penaltyDue),
    currency.format(row.nextEmiAmount),
    row.nextDueDate,
    currency.format(row.principalOutstanding + row.interestDue + row.penaltyDue),
    currency.format(row.withdrawnInRange)
  ]);
  const groupHeaders = ["Group", "Members with activity", "Collected", "Savings", "Income/Gain", "Expenses", "Remaining", "Loans disbursed", "Principal outstanding", "Interest due", "Penalty due", "Total share", "Withdrawn"];
  const groupRows = [[
    snapshotState.groups?.[0]?.name || "Group",
    memberSummaries.length,
    currency.format(groupCollectedInRange),
    currency.format(groupSavingsInRange),
    currency.format(groupGainInRange),
    currency.format(groupExpensesInRange),
    currency.format(groupRemainingInRange),
    rangeLoans.length,
    currency.format(groupLoanBalanceInRange),
    currency.format(groupInterestDue),
    currency.format(groupPenaltyDue),
    currency.format(groupShareAmount),
    currency.format(groupWithdrawnInRange)
  ]];
  const memberHeaders = ["Member", "Username", "Status", "Collected", "Savings", "Income/Gain", "Expense", "Share amount", "Loans", "Principal outstanding", "Interest due", "Penalty due", "Next EMI amount", "Next due date", "Total loan balance", "Withdrawn"];
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
            const nextStartDate = reportRange.startDate || oldestReportDate;
            const nextEndDate = draftEndDate || todayIso;
            setReportRange({
              startDate: nextStartDate <= nextEndDate ? nextStartDate : nextEndDate,
              endDate: nextStartDate <= nextEndDate ? nextEndDate : nextStartDate
            });
          }}
        >
          <Field label="Report till date" type="date" value={draftEndDate} onChange={setDraftEndDate} />
          <button className="primary-button" type="submit">Generate report</button>
        </form>
        <p className="section-note">Showing values from {reportRange.startDate} to {reportRange.endDate}.</p>
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

function isIsoDateInRange(dateValue, startDate, endDate) {
  if (!dateValue) return false;
  const value = String(dateValue).slice(0, 10);
  return value >= startDate && value <= endDate;
}

function formatReportTablesText({ title, sections }) {
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

function getStateTillDate(state, tillDate) {
  const onOrBefore = (dateValue) => !dateValue || String(dateValue).slice(0, 10) <= tillDate;
  return {
    ...state,
    transactions: (state.transactions || []).filter((item) => onOrBefore(item.transactionDate || item.createdAt)),
    expenses: (state.expenses || []).filter((item) => onOrBefore(item.transactionDate || item.expenseDate || item.createdAt)),
    loans: (state.loans || []).filter((item) => onOrBefore(item.startDate || item.distributionDate || item.requestDate || item.createdAt)),
    withdrawalRequests: (state.withdrawalRequests || []).filter((item) => onOrBefore(item.requestDate || item.createdAt)),
    legacyImports: (state.legacyImports || []).filter((item) => onOrBefore(item.migration_date || item.migrationDate || item.joined_date || item.joinedDate || item.created_at || item.createdAt)),
    legacyGroupOpenings: (state.legacyGroupOpenings || []).filter((item) => onOrBefore(item.migration_date || item.migrationDate || item.opening_date || item.openingDate || item.created_at || item.createdAt)),
    shareDistributions: (state.shareDistributions || []).filter((item) => onOrBefore(item.distribution_date || item.distributionDate || item.created_at || item.createdAt)),
    shareAdjustments: (state.shareAdjustments || []).filter((item) => onOrBefore(item.adjustment_date || item.adjustmentDate || item.created_at || item.createdAt))
  };
}

function getReportDateWindow(months = 3) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setMonth(from.getMonth() - Number(months || 3));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function getCurrentMonthWindow() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function isDateInWindow(dateValue, from, to) {
  const date = new Date(dateValue);
  return !Number.isNaN(date.getTime()) && date >= from && date <= to;
}

function summarizeMemberCollectionRows(state, from, to, includeLoanColumns = false, periodLabel = "") {
  const memberById = Object.fromEntries((state.members || []).map((member) => [String(member.id), member]));
  const rowByMemberId = new Map();

  (state.members || []).forEach((member) => {
    rowByMemberId.set(String(member.id), {
      "Member name": member.fullName,
      "Username": member.username,
      "Amount collected this month": 0,
      "Saving this month": 0,
      "Principle collected this month": 0,
      "Interest collected": 0,
      "Penalty": 0,
      ...(includeLoanColumns ? {
        "Loan outstanding": 0,
        "Loan repayments": 0
      } : {}),
      ...(periodLabel ? { "Report period": periodLabel } : {})
    });
  });

  getCompletedTransactions(state.transactions || [])
    .filter((transaction) => isDateInWindow(transaction.transactionDate, from, to))
    .filter((transaction) => memberById[String(transaction.memberId)])
    .forEach((transaction) => {
      const member = memberById[String(transaction.memberId)];
      const row = rowByMemberId.get(String(member.id));
      const savings = isMigratedOpeningTransaction(transaction) ? 0 : Number(transaction.allocation?.savings || 0) + Number(transaction.allocation?.excess || 0);
      const principal = isMigratedOpeningTransaction(transaction) ? 0 : Number(transaction.allocation?.principal || 0);
      const interest = isMigratedOpeningTransaction(transaction) ? 0 : Number(transaction.allocation?.interest || 0);
      const penalty = isMigratedOpeningTransaction(transaction) ? 0 : Number(transaction.allocation?.penalty || 0);
      row["Amount collected this month"] += savings + principal + interest + penalty;
      row["Saving this month"] += savings;
      row["Principle collected this month"] += principal;
      row["Interest collected"] += interest;
      row["Penalty"] += penalty;
      if (includeLoanColumns) row["Loan repayments"] += principal + interest + penalty;
    });

  if (includeLoanColumns) {
    (state.loans || []).forEach((loan) => {
      const row = rowByMemberId.get(String(loan.memberId));
      if (!row) return;
      row["Loan outstanding"] += calculateLoanOutstandingWithDues(loan, state);
    });
  }

  return Array.from(rowByMemberId.values()).filter((row) =>
    Number(row["Amount collected this month"] || 0) !== 0
    || Number(row["Loan outstanding"] || 0) !== 0
  );
}

function buildMonthlyCollectionReportRows(state) {
  const { from, to } = getCurrentMonthWindow();
  return summarizeMemberCollectionRows(state, from, to, false);
}

function buildDetailedLedgerReportRows(state, months = 3) {
  const { from, to } = getReportDateWindow(months);
  return summarizeMemberCollectionRows(state, from, to, false, `Last ${months} months till today`);
}

function buildMemberShareLedgerRows(state, months = 3) {
  const { from, to } = getReportDateWindow(months);
  return summarizeMemberCollectionRows(state, from, to, true, `Last ${months} months till today`);
}

function buildMigrationBackupReportRows(state) {
  return (state.members || []).map((member) => {
    const summary = calculateMemberFinanceSummary(member, state);
    const memberLoans = (state.loans || []).filter((loan) => loanBelongsToMember(loan, member));
    return {
      "Member name": member.fullName,
      "Username": member.username,
      "Share amount hold by the member excluding principle amount": summary.savings + summary.gain - summary.expense,
      "Outsatnding principle loan amount": memberLoans.reduce((sum, loan) => sum + calculateDerivedLoanPrincipalOutstanding(loan, state), 0),
      "Interest pending to be paid": memberLoans.reduce((sum, loan) => sum + Number(loan.interestOutstanding || 0), 0),
      "Penalty pending to be paid": memberLoans.reduce((sum, loan) => sum + Number(loan.penaltyOutstanding || 0), 0)
    };
  });
}

function SettingsPage({ state, setState, actor, setConfirmDialog, setNotification }) {
  function toggle(id, keyName) {
    setState((current) => audit({
      state: {
        ...current,
        configurableFields: current.configurableFields.map((field) =>
          field.id === id || `${field.screen}-${field.field}` === id ? { ...field, [keyName]: !field[keyName] } : field
        )
      },
      actor,
      action: "update",
      tableName: "configurable_fields",
      recordId: id
    }));
  }

  return (
    <Page title="Settings" subtitle="No-code field control for each group" action={null}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {["Screen", "Field", "Mandatory", "Hidden", "Editable", "Read only"].map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {state.configurableFields.map((field) => {
              const id = field.id ?? `${field.screen}-${field.field}`;
              return (
                <tr key={id}>
                  <td>{field.screen}</td>
                  <td>{field.field}</td>
                  {["mandatory", "hidden", "editable", "readOnly"].map((keyName) => (
                    <td key={keyName}>
                      <label className="switch">
                        <input type="checkbox" checked={field[keyName]} onChange={() => toggle(id, keyName)} />
                        <span>{field[keyName] ? "Yes" : "No"}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Section title="Audit log">
        <Table
          headers={["When", "Actor", "Action", "Table", "Record", "Old value", "New value"]}
          rows={(state.auditLogs || []).filter((log) => isWithinPastDays(log.timestamp, 60) || !log.timestamp).map((log) => [
            new Date(log.timestamp).toLocaleString("en-IN"),
            log.actor,
            log.action,
            log.tableName,
            log.recordId,
            formatHistoryValue(log.oldValue),
            formatHistoryValue(log.newValue)
          ])}
        />
      </Section>
    </Page>
  );
}

function NotificationList({ notifications }) {
  if (!notifications?.length) {
    return <p className="section-note">No notifications yet.</p>;
  }
  return (
    <div className="notification-list">
      {notifications.map((notification) => (
        <div className={`notification ${notification.type}`} key={notification.id}>
          <strong>{notification.title || notification.message || "Notification"}</strong>
          <span>{notification.body || notification.details || ""}</span>
        </div>
      ))}
    </div>
  );
}

function Page({ title, subtitle, action, children }) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h2>{bilingual(title)}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="page-actions">
          {action}
          <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

function MetricGrid({ metrics }) {
  const renderDetail = (detail, index) => {
    if (typeof detail !== "string") return <span key={index}>{detail}</span>;
    const separatorIndex = detail.indexOf(":");
    if (separatorIndex <= 0) return <span key={index} className="metric-subfield full">{detail}</span>;
    const label = detail.slice(0, separatorIndex).trim();
    const value = detail.slice(separatorIndex + 1).trim();
    return (
      <span key={`${label}-${index}`} className="metric-subfield">
        <span>{label}</span>
        <strong>{value || "-"}</strong>
      </span>
    );
  };

  return (
    <div className="metric-grid">
      {metrics.map((item) => {
        const metricItem = Array.isArray(item)
          ? { label: item[0], value: item[1], Icon: item[2], details: item[3] || [] }
          : item;
        const Icon = metricItem.Icon;
        return (
        <article className="metric-card" key={metricItem.label}>
          <Icon size={21} />
          <span>{bilingual(metricItem.label)}</span>
          <strong>{metricItem.value}</strong>
          {metricItem.details?.length > 0 && (
            <div className="metric-detail">{metricItem.details.map(renderDetail)}</div>
          )}
        </article>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="section">
      <h3>{bilingual(title)}</h3>
      {children}
    </section>
  );
}

function FormCard({ title, onSubmit, children, hideSubmit }) {
  return (
    <section className="section">
      <h3>{bilingual(title)}</h3>
      <form className="form-grid" onSubmit={onSubmit}>
        {children}
        {!hideSubmit && <button className="primary-button" type="submit">Save</button>}
      </form>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", error, required = false, disabled = false }) {
  return (
    <label className="field">
      <span>{bilingual(label)}{required ? " *" : " (Optional)"}</span>
      <input
        type={type}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onWheel={(event) => {
          if (type === "number") event.currentTarget.blur();
        }}
      />
      {error && <small>{error}</small>}
    </label>
  );
}

function SelectField({ label, value, onChange, options, error, required = false }) {
  return (
    <label className="field">
      <span>{bilingual(label)}{required ? " *" : " (Optional)"}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const item = typeof option === "string" ? { label: option, value: option } : option;
          return <option key={item.value} value={item.value}>{item.label}</option>;
        })}
      </select>
      {error && <small>{error}</small>}
    </label>
  );
}

function ComboField({ label, value, onChange, options = [], error, required = false, placeholder = "" }) {
  const [inputText, setInputText] = useState("");
  const optionsByLabel = useMemo(() => {
    const map = new Map();
    options.forEach((opt) => map.set(String(opt.label), opt.value));
    return map;
  }, [options]);

  useEffect(() => {
    const match = options.find((o) => String(o.value) === String(value));
    setInputText(match ? match.label : "");
  }, [value, options]);

  function handleChange(ev) {
    const txt = ev.target.value;
    setInputText(txt);
    // Do not immediately clear selection while typing; keep textual input.
  }

  function commitSelection(txt) {
    if (!txt) {
      onChange("");
      return;
    }
    const q = String(txt).toLowerCase();
    const found = options.find((o) => String(o.label).toLowerCase().includes(q) || String(o.code || "").toLowerCase().includes(q));
    if (found) onChange(found.value);
    else onChange("");
  }

  function handleBlur() {
    commitSelection(inputText);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitSelection(inputText);
    }
  }

  const datalistId = `combo-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label className="field">
      <span>{bilingual(label)}{required ? " *" : " (Optional)"}</span>
      <input list={datalistId} value={inputText} placeholder={placeholder} onChange={handleChange} onBlur={handleBlur} onKeyDown={handleKeyDown} />
      <datalist id={datalistId}>
        {options.map((option) => (
          <option key={option.value} value={option.label} />
        ))}
      </datalist>
      {error && <small>{error}</small>}
    </label>
  );
}

function ToggleCell({ field, id, keyName, onToggle }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={Boolean(field[keyName])} onChange={() => onToggle(id, keyName)} />
      <span>{field[keyName] ? "Yes" : "No"}</span>
    </label>
  );
}

function Table({ headers, rows }) {
  const cellTitle = (cell) => {
    if (cell === null || cell === undefined) return "";
    if (typeof cell === "string" || typeof cell === "number") return String(cell);
    return "";
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{bilingual(header)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="empty-table-cell" colSpan={headers.length}>No records yet</td></tr>
          ) : rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => <td key={`${rowIndex}-${index}`} title={cellTitle(cell)}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function flatten(value, prefix = "") {
  return Object.entries(value).reduce((result, [keyName, innerValue]) => {
    const nextKey = prefix ? `${prefix}.${keyName}` : keyName;
    if (innerValue && typeof innerValue === "object" && !Array.isArray(innerValue)) {
      return { ...result, ...flatten(innerValue, nextKey) };
    }
    return { ...result, [nextKey]: Array.isArray(innerValue) ? innerValue.join(" | ") : innerValue };
  }, {});
}

function MemberSavings({ state, actor, setConfirmDialog, setNotification }) {
  const member = getCurrentMember(state, actor) ?? { fullName: "Member", savings: 0, shares: 0 };
  const summary = calculateMemberFinanceSummary(member, state, getDashboardPeriod(state), actor);
  return (
    <Page title="My Savings" subtitle="Your savings and share information" action={null}>
      <div className="data-grid">
        <article className="entity-card">
          <h3>Total Savings</h3>
          <p className="metric-value">{currency.format(summary.savings)}</p>
        </article>
        <article className="entity-card">
          <h3>Share Amount</h3>
          <p className="metric-value">{currency.format(summary.shareAmount)}</p>
          <p className="section-note">{summary.sharePercent ?? 0}% of active-period distribution</p>
        </article>
      </div>
    </Page>
  );
}

function MemberLoans({ state, actor, setConfirmDialog, setNotification }) {
  const member = getCurrentMember(state, actor);
  const memberLoans = state.loans.filter((loan) => loanBelongsToMember(loan, member));
  return (
    <Page title="My Loans" subtitle="Your active and past loans" action={null}>
      {memberLoans.length === 0 ? (
        <Section title="No loans">
          <p className="section-note">You don't have any active loans. Once approved, your loans will appear here.</p>
        </Section>
      ) : (
        <Section title="Your Loans">
          <div className="data-grid">
            {memberLoans.map((loan) => (
              <article className="entity-card" key={loan.id}>
                <h3>{loan.reason}</h3>
                <p>Amount: {currency.format(loan.amount)}</p>
                <p>Outstanding: {currency.format(calculateLoanOutstandingWithDues(loan, state))}</p>
                <p>Status: {loan.status}</p>
              </article>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}

function MemberNotifications({ state, setState, actor, setConfirmDialog, setNotification }) {
  useEffect(() => {
    if (!(state.notifications || []).some((notification) => !notification.read)) return;
    const visibleIds = new Set((state.notifications || []).map((notification) => String(notification.id)));
    setState((current) => ({
      ...current,
      notifications: (current.notifications || []).map((notification) =>
        visibleIds.has(String(notification.id)) ? { ...notification, read: true } : notification
      )
    }));
  }, []);

  return (
    <Page title="Notifications" subtitle="Your messages and alerts" action={null}>
      <Section title="Recent Notifications">
        {state.notifications.length === 0 ? (
          <p className="section-note">No notifications yet.</p>
        ) : (
          <div className="notification-list">
            {state.notifications.map((notif) => (
              <div key={notif.id} className={`notification-item ${notif.type}`}>
                <strong>{notif.title}</strong>
                <p>{notif.body}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}

function MemberProfile({ state, setState, actor, setConfirmDialog, setNotification }) {
  const navigate = useNavigate();
  const member = (state.members || []).find((item) =>
    String(item.id) === String(actor?.memberId)
    || (item.email && actor?.email && item.email.toLowerCase() === actor.email.toLowerCase())
  );
  const profile = member ?? {
    fullName: actor?.name || actor?.email || "Member",
    mobile: actor?.mobile || "",
    email: actor?.email || "",
    address: "",
    status: actor?.role || "Active",
    profilePhoto: actor?.profilePhoto || ""
  };
  const profilePhoto = profile.profilePhoto || actor?.profilePhoto || "";

  function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotification({ type: "error", message: "Please upload an image file." });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const photoData = String(reader.result || "");
      setState((current) => ({
        ...current,
        session: {
          ...current.session,
          user: { ...current.session.user, profilePhoto: photoData }
        },
        members: (current.members || []).map((item) =>
          String(item.id) === String(member?.id)
            || (item.email && actor?.email && item.email.toLowerCase() === actor.email.toLowerCase())
            ? { ...item, profilePhoto: photoData }
            : item
        )
      }));
      try {
        if (repository.isConfigured()) {
          await repository.updateProfilePhoto(photoData);
        }
        setNotification({ type: "success", message: "Profile photo updated." });
      } catch (error) {
        setNotification({ type: "warning", message: "Photo updated on this device. Apply the profile photo database update to save it online.", details: serializeError(error) });
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <Page title="My Profile" subtitle="Your account information" action={null}>
      <Section title="Profile Information">
        <div className="profile-info profile-info-card">
          <ProfilePhoto photo={profilePhoto} name={profile.fullName} large />
          <div>
            <p><strong>Name:</strong> {profile.fullName}</p>
            <p><strong>Mobile:</strong> {profile.mobile || "Not provided"}</p>
            <p><strong>Email:</strong> {profile.email || "Not provided"}</p>
            <p><strong>Address:</strong> {profile.address || "Not provided"}</p>
            <p><strong>Status:</strong> {profile.status}</p>
          </div>
        </div>
        <div className="button-row">
          <label className="secondary-button upload-button">
            <Camera size={16} />
            <span>Upload photo</span>
            <input type="file" accept="image/*" onChange={uploadPhoto} />
          </label>
          <button type="button" className="secondary-button" onClick={() => navigate("/select-group")}>
            Switch group
          </button>
        </div>
      </Section>
    </Page>
  );
}

function ProfilePhoto({ photo, name, large = false }) {
  const initial = String(name || "U").trim().charAt(0).toUpperCase() || "U";
  return (
    <span className={`profile-photo ${large ? "profile-photo-large" : ""}`}>
      {photo ? <img src={photo} alt="" /> : <span>{initial}</span>}
    </span>
  );
}

export default App;
