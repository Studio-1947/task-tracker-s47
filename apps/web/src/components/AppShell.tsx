import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { Button } from './ui';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/workspaces', label: 'Workspaces' },
  { to: '/users', label: 'Users', adminOnly: true },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = nav.filter((n) => !n.adminOnly || isAdmin);

  const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `block rounded-md px-3 py-2 text-sm font-medium ${
              isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
            }`
          }
        >
          {n.label}
        </NavLink>
      ))}
    </>
  );

  const UserFooter = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="border-t border-slate-200 p-3">
      <div className="mb-2 px-2 text-sm">
        <div className="font-medium text-slate-700">{user?.name}</div>
        <div className="text-xs text-slate-400">{user?.role}</div>
      </div>
      <NavLink
        to="/settings"
        onClick={onNavigate}
        className="mb-1 block rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        Change password
      </NavLink>
      <Button variant="ghost" className="w-full" onClick={() => void logout()}>
        Sign out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="text-lg font-semibold text-slate-800">Task Tracker</span>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={mobileOpen ? 'true' : 'false'}
          className="rounded-md border border-slate-300 p-2 text-slate-600"
          onClick={() => setMobileOpen(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {/* Mobile slide-in drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="flex-1 bg-slate-900/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="flex w-64 flex-col bg-white shadow-xl">
            <div className="px-5 py-4 text-lg font-semibold text-slate-800">Task Tracker</div>
            <nav className="flex-1 space-y-1 px-3">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </nav>
            <UserFooter onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="px-5 py-4 text-lg font-semibold text-slate-800">Task Tracker</div>
        <nav className="flex-1 space-y-1 px-3">
          <NavItems />
        </nav>
        <UserFooter />
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
