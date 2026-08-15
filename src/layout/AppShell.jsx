import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Bell, X, LogOut, BookOpen, Home, ArrowRightLeft, Settings, User, MoreHorizontal } from 'lucide-react';
import { useAppStore } from '../store';
import { visibleMenu } from '../services/permissions';

/**
 * Main application shell/container
 * Handles authentication state, session restoration, and layout
 */
function AppShell({ children, signOut, role }) {
  const navigate = useNavigate();
  const location = useLocation();
  const latestPathname = useRef(location.pathname);

  // Zustand store
  const {
    session,
    booting,
    appError,
    selectedGroupId,
    mobileNavOpen,
    setMobileNavOpen,
    notifications,
    showProfileMenu,
    setShowProfileMenu
  } = useAppStore();

  useEffect(() => {
    latestPathname.current = location.pathname;
  }, [location.pathname]);

  // Handle native back button (Capacitor)
  useEffect(() => {
    const capacitor = typeof window !== 'undefined' ? window.Capacitor : null;
    const isNative = Boolean(capacitor?.isNativePlatform?.() || (capacitor?.platform && capacitor.platform !== 'web'));
    const app = capacitor?.App;
    if (!isNative || !app?.addListener) return undefined;

    const handleBack = (event) => {
      const currentPath = latestPathname.current;
      if (currentPath === '/' || currentPath === '/select-group') {
        return;
      }
      event?.preventDefault?.();
      navigate(-1);
    };

    const listener = app.addListener('backButton', handleBack);
    return () => listener?.remove?.();
  }, [navigate]);

  // Only show app shell if not booting
  if (booting) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <p className="eyebrow">Bachat Gat SaaS</p>
          <h1>Loading secure session</h1>
          <p>Connecting securely and loading your data.</p>
        </section>
      </main>
    );
  }

  if (appError) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <p className="eyebrow">Bachat Gat SaaS</p>
          <h1>Production connection error</h1>
          <p>{appError}</p>
        </section>
      </main>
    );
  }

  // If not signed in, don't show shell - let PublicSite handle it
  if (!session.signedIn) {
    return children;
  }

  // Signed in - show full app shell
  return (
    <div className="app-shell">
      <Sidebar signOut={signOut} role={role} />
      <main className="main">
        <Header />
        {mobileNavOpen && (
          <button className="scrim" type="button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}>
            <X size={24} />
          </button>
        )}
        {children}
      </main>
      <BottomNav />
      <NotificationOverlay />
      <ConfirmDialogOverlay />
    </div>
  );
}

export default AppShell;

function Sidebar({ signOut, role }) {
  const {
    session,
    mobileNavOpen,
    setMobileNavOpen,
    showProfileMenu,
    setShowProfileMenu,
    getSelectedGroup
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  const selectedGroup = getSelectedGroup();
  const menuItems = visibleMenu(role);

  return (
    <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">BG</div>
        <div className="brand-copy">
          <strong>
            {selectedGroup?.name ?? 'No group selected'}
            {selectedGroup?.code && <small className="brand-code">{selectedGroup.code}</small>}
          </strong>
        </div>
      </div>

      <nav className="nav-list" aria-label="Main navigation">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => (isActive || location.pathname.startsWith(item.path) ? 'active' : '')}
            onClick={() => setMobileNavOpen(false)}
          >
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <a className="sidebar-guide-link" href="/guide" onClick={() => setMobileNavOpen(false)}>
        <BookOpen size={18} />
        <span>User Guide</span>
      </a>

      <div className="sidebar-card profile-card">
        <div className="profile-row">
          <button
            type="button"
            className="profile-button"
            onClick={() => setShowProfileMenu((open) => !open)}
          >
            <span className="profile-summary">
              <span>
                <span>{session.user?.name || session.user?.email || 'Profile'}</span>
                <strong>{session.user?.role}</strong>
              </span>
            </span>
          </button>
          <button
            type="button"
            className="profile-logout"
            onClick={() => signOut?.()}
            aria-label="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function Header() {
  const { notifications, selectedGroupId, getSelectedGroup } = useAppStore();
  const navigate = useNavigate();
  const selectedGroup = getSelectedGroup();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: 'inherit',
                fontWeight: 700,
                letterSpacing: '0.02em',
                textShadow: '1px 1px 0 rgba(0,0,0,0.12), 2px 2px 0 rgba(0,0,0,0.08)',
                color: 'var(--text)'
              }}
            >
              प्रगती Finance Console
            </h1>
            <div className="group-header" style={{ marginTop: '8px' }}>
              <span>{selectedGroup?.name ?? 'No group selected'}</span>
              {selectedGroup?.code && <small className="brand-code">{selectedGroup.code}</small>}
            </div>
          </div>
        </div>
      </div>
      <div className="topbar-right">
        <button
          className="icon-button notification-top-right"
          type="button"
          aria-label="Notifications"
          onClick={() => navigate('/notifications')}
        >
          <Bell size={16} />
          {(notifications || []).filter((item) => !item.read).length > 0 && (
            <span className="notification-badge">
              {Math.min(99, (notifications || []).filter((item) => !item.read).length)}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function BottomNav() {
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? 'active' : '';

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <NavLink to="/home" className={`bottom-nav-item ${isActive('/home')}`}>
        <Home size={20} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/transactions-hub" className={`bottom-nav-item ${isActive('/transactions-hub')}`}>
        <ArrowRightLeft size={20} />
        <span>Transactions</span>
      </NavLink>
      <NavLink to="/setup-hub" className={`bottom-nav-item ${isActive('/setup-hub')}`}>
        <Settings size={20} />
        <span>Setup</span>
      </NavLink>
      <NavLink to="/profile" className={`bottom-nav-item ${isActive('/profile')}`}>
        <User size={20} />
        <span>Profile</span>
      </NavLink>
      <NavLink to="/more" className={`bottom-nav-item ${isActive('/more')}`}>
        <MoreHorizontal size={20} />
        <span>More</span>
      </NavLink>
    </nav>
  );
}

function NotificationOverlay() {
  const { notification, setNotification, showNotificationDetails, setShowNotificationDetails } = useAppStore();

  if (!notification) return null;

  return (
    <div
      className={`notification toast ${notification.type}`}
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        left: 'auto',
        zIndex: 1000,
        width: 'min(520px, calc(100vw - 32px))',
        maxWidth: 'calc(100vw - 32px)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ marginRight: 12 }}>{notification.message}</strong>
        {notification.details && (
          <button
            className="link-button"
            type="button"
            onClick={() => setShowNotificationDetails(!showNotificationDetails)}
          >
            {showNotificationDetails ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>
      {showNotificationDetails && notification.details && (
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
          {notification.details}
        </pre>
      )}
    </div>
  );
}

function ConfirmDialogOverlay() {
  const { confirmDialog } = useAppStore();

  if (!confirmDialog) return null;

  return (
    <div className="modal-overlay" onClick={() => confirmDialog.onCancel()}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{confirmDialog.title}</h3>
        <p>{confirmDialog.message}</p>
        <div className="modal-buttons">
          <button type="button" className="secondary-button" onClick={() => confirmDialog.onCancel()}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={() => confirmDialog.onConfirm()}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
