import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { Avatar } from './Avatar';
import { GlobalSearch } from './GlobalSearch';
import { Topbar } from './Topbar';
import { Button } from './ui';
import { ThemeToggle } from './ThemeToggle';

const nav = [
  {
    to: '/',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    to: '/workspaces',
    label: 'Workspaces',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    to: '/users',
    label: 'Users',
    adminOnly: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('tt.sidebar-collapsed') === 'true');
  const items = nav.filter((n) => !n.adminOnly || isAdmin);

  const toggleSidebar = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('tt.sidebar-collapsed', String(next));
      return next;
    });
  };

  const NavItems = ({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) => (
    <>
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          title={collapsed ? n.label : undefined}
          className={({ isActive }) =>
            `flex items-center transition-all duration-150 ${
              collapsed
                ? 'justify-center rounded-xl w-10 h-10 mx-auto text-sm font-medium'
                : 'gap-3 rounded-lg px-4 py-3 text-sm font-medium border-l-2'
            } ${
              isActive
                ? collapsed
                  ? 'bg-indigo-50/50 text-indigo-705 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 font-semibold'
                  : 'bg-indigo-50/50 text-indigo-700 border-l-2 border-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-500 font-semibold'
                : collapsed
                  ? 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/30 hover:text-slate-900 dark:hover:text-slate-200'
                  : 'text-slate-650 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/30 border-l-2 border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`
          }
        >
          {n.icon}
          {!collapsed && n.label}
        </NavLink>
      ))}
    </>
  );

  const UserFooter = ({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) => (
    <div className="border-t border-slate-100 p-4 dark:border-slate-800/50">
      <div className={`mb-3 flex items-center gap-3 px-1.5 text-sm ${collapsed ? 'justify-center px-0' : ''}`}>
        {user ? <Avatar user={user} size="sm" className={collapsed ? 'ring-2 ring-slate-100 dark:ring-slate-800/40' : ''} /> : null}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-700 dark:text-slate-200">{user?.name}</div>
            <div className="truncate text-xs text-slate-450 dark:text-slate-500 mt-0.5">
              {user?.designation ?? (user?.role === 'ADMIN' ? 'Admin' : 'Member')}
            </div>
          </div>
        )}
      </div>
      {!collapsed ? (
        <>
          <NavLink
            to="/settings"
            onClick={onNavigate}
            className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/30 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </NavLink>
          <Button variant="ghost" className="w-full text-xs font-semibold py-2" onClick={() => void logout()}>
            Sign out
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <NavLink
            to="/settings"
            title="Settings"
            onClick={onNavigate}
            className="flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/30 transition-colors w-10 h-10 mx-auto"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </NavLink>
          <button
            type="button"
            title="Sign out"
            onClick={() => void logout()}
            className="flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/30 transition-colors w-10 h-10 mx-auto"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 md:hidden dark:border-slate-800/40 dark:bg-[#121212]/90 backdrop-blur-md sticky top-0 z-30">
        <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-800 dark:text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-650 dark:text-indigo-500">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          Task Tracker
        </span>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Search"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850"
            onClick={() => setMobileSearchOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileOpen ? 'true' : 'false'}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850"
            onClick={() => setMobileOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile full-screen search overlay */}
      {mobileSearchOpen ? (
        <div className="fixed inset-0 z-50 bg-white p-4 md:hidden dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <GlobalSearch autoFocus onNavigated={() => setMobileSearchOpen(false)} />
            </div>
            <button
              type="button"
              aria-label="Close search"
              className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
              onClick={() => setMobileSearchOpen(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile slide-in drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="flex-1 bg-slate-900/30 backdrop-blur-xs animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <div className="flex w-64 flex-col bg-white shadow-2xl animate-slide-in-left dark:bg-[#1a1a1a] dark:shadow-none">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/50">
              <span className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-650 dark:text-indigo-500">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                Task Tracker
              </span>
              <button
                type="button"
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                onClick={() => setMobileOpen(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 space-y-1.5 px-3 py-4">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </nav>
            <UserFooter onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className={`hidden flex-col border-r border-slate-100 bg-[#fbfcfd] md:flex dark:border-slate-800/40 dark:bg-[#161616] transition-all duration-350 shrink-0 ${collapsed ? 'w-18' : 'w-60'}`}>
        <div className={`px-4 py-5 text-xl font-bold tracking-tight text-slate-800 dark:text-white flex items-center justify-between gap-2.5 ${collapsed ? 'flex-col items-center justify-center gap-4' : ''}`}>
          {!collapsed && (
            <span className="flex items-center gap-2.5 min-w-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-650 dark:text-indigo-500 shrink-0">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span className="truncate">Task Tracker</span>
            </span>
          )}
          {collapsed && (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-600 dark:text-indigo-500 mx-auto shrink-0">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-350 cursor-pointer hidden md:block"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {collapsed ? (
                <path d="M5 12h14M12 5l7 7-7 7" />
              ) : (
                <path d="M19 12H5M12 19l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-1.5 px-3 py-2">
          <NavItems collapsed={collapsed} />
        </nav>
        <UserFooter collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
