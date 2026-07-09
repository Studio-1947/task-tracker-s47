import { Link } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { Avatar } from './Avatar';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';

/** Desktop-only top header: global search, notifications placeholder, current user. */
export function Topbar() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 hidden items-center gap-4 border-b border-slate-100 bg-white/80 px-6 py-3 backdrop-blur-md md:flex dark:border-slate-800/40 dark:bg-[#121212]/80">
      <div className="w-full max-w-md">
        <GlobalSearch bindShortcut />
      </div>
      <div className="flex-1" />
      <ThemeToggle />
      <button
        type="button"
        aria-label="Notifications"
        title="Notifications (coming soon)"
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-850 dark:hover:text-slate-300 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </button>
      {user ? (
        <Link
          to="/settings"
          className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-slate-50 dark:hover:bg-slate-850 transition-all border border-transparent hover:border-slate-200/50 dark:hover:border-slate-800/40"
          title="Profile settings"
        >
          <Avatar user={user} size="md" />
          <span className="text-left hidden lg:inline">
            <span className="block text-sm font-semibold leading-tight text-slate-700 dark:text-slate-200">{user.name}</span>
            <span className="block text-xs leading-tight text-slate-400 dark:text-slate-500 mt-0.5">
              {user.designation ?? (user.role === 'ADMIN' ? 'Admin' : 'Member')}
            </span>
          </span>
        </Link>
      ) : null}
    </header>
  );
}
