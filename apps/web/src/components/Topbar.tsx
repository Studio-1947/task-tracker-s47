import { Link } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { Avatar } from './Avatar';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';
import { NotificationCenter } from './NotificationCenter';

/** Desktop-only top header: global search, notifications, current user. */
export function Topbar() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 hidden items-center gap-4 border-b border-slate-100 bg-white/80 px-6 py-3 backdrop-blur-md md:flex dark:border-slate-800/40 dark:bg-[#121212]/80">
      <div className="w-full max-w-md">
        <GlobalSearch bindShortcut />
      </div>
      <div className="flex-1" />
      <ThemeToggle />
      <NotificationCenter />

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
