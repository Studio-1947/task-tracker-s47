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

  return (
    <div className="flex min-h-full">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-4 text-lg font-semibold text-slate-800">Task Tracker</div>
        <nav className="flex-1 space-y-1 px-3">
          {nav
            .filter((n) => !n.adminOnly || isAdmin)
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 px-2 text-sm">
            <div className="font-medium text-slate-700">{user?.name}</div>
            <div className="text-xs text-slate-400">{user?.role}</div>
          </div>
          <Button variant="ghost" className="w-full" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
