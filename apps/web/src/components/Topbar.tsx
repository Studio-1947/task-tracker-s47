import { Link } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { Avatar } from './Avatar';
import { GlobalSearch } from './GlobalSearch';

/** Desktop-only top header: global search, notifications placeholder, current user. */
export function Topbar() {
  const { user } = useAuth();

  return (
    <header className="hidden items-center gap-4 border-b border-slate-200 bg-white px-6 py-2.5 md:flex">
      <div className="w-full max-w-md">
        <GlobalSearch bindShortcut />
      </div>
      <div className="flex-1" />
      <button
        type="button"
        aria-label="Notifications"
        title="Notifications (coming soon)"
        className="rounded-md p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </button>
      {user ? (
        <Link
          to="/settings"
          className="flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-slate-50"
          title="Profile settings"
        >
          <Avatar user={user} size="md" />
          <span className="text-left">
            <span className="block text-sm font-medium leading-tight text-slate-700">{user.name}</span>
            <span className="block text-xs leading-tight text-slate-400">
              {user.designation ?? (user.role === 'ADMIN' ? 'Admin' : 'Member')}
            </span>
          </span>
        </Link>
      ) : null}
    </header>
  );
}
