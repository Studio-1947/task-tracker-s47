import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { useChatBridge, useConversations } from '../hooks/useChat';
import { Avatar } from './Avatar';
import { GlobalSearch } from './GlobalSearch';
import { Topbar } from './Topbar';
import { Button } from './ui';
import { ThemeToggle } from './ThemeToggle';
import { NotificationCenter } from './NotificationCenter';

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
    to: '/chat',
    label: 'Chat',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    to: '/attendance',
    label: 'Attendance',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M9 16l2 2 4-4" />
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
  // Live realtime chat connection (kept open app-wide so unread badges update).
  useChatBridge();
  const { data: conversations } = useConversations();
  const chatUnread = (conversations ?? []).reduce((n, c) => n + c.unreadCount, 0);
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
          <span className="relative flex items-center">
            {n.icon}
            {n.to === '/chat' && chatUnread > 0 && collapsed ? (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-indigo-600" />
            ) : null}
          </span>
          {!collapsed && n.label}
          {n.to === '/chat' && chatUnread > 0 && !collapsed ? (
            <span className="ml-auto rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {chatUnread > 99 ? '99+' : chatUnread}
            </span>
          ) : null}
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
          <svg width="20" height="20" viewBox="0 0 683 680" fill="none" className="shrink-0">
            <path d="M332.195 0.11376C423.313 -2.19948 509.656 30.8293 575.866 93.4175C641.945 155.876 679.634 240.441 681.956 331.175C684.279 421.908 651.238 508.145 588.385 574.075C525.66 640.003 440.996 677.53 349.875 679.844C258.757 682.158 172.414 649.128 106.204 586.54C40.124 524.079 2.43767 439.514 0.114657 348.782C-2.20845 258.047 30.8312 171.813 93.685 105.883C156.409 39.9537 241.204 2.42702 332.195 0.11376ZM365.621 231.187C356.845 229.003 347.553 228.104 338.132 228.362C328.71 228.618 319.417 230.289 310.771 232.601L306.253 59.4888C248.82 66.4288 196.806 90.4615 155.377 126.446L281.343 245.71C265.727 255.606 252.691 269.359 243.529 285.422L117.562 166.16C83.7474 209.213 62.4516 262.417 58.3217 319.866L231.912 315.369C229.717 324.236 228.815 333.489 229.073 342.871C229.331 352.252 231.01 361.377 233.332 370.117L59.7416 374.615C66.8401 431.933 91.1042 483.854 126.984 525.108L246.496 399.547C256.434 415.098 270.244 428.077 286.376 437.203L166.865 562.635C210.1 596.435 263.404 617.642 320.965 621.753L316.449 448.64C325.225 450.826 334.517 451.724 343.94 451.468C353.36 451.21 362.653 449.54 371.301 447.226L375.819 620.339C433.252 613.4 485.264 589.239 526.693 553.381L400.727 434.117C416.343 424.221 429.379 410.471 438.543 394.406L564.509 513.67C598.324 470.617 619.617 417.41 623.748 359.963L450.159 364.461C452.353 355.594 453.256 346.34 452.997 336.958C452.739 327.577 451.062 318.452 448.738 309.712L622.329 305.214C615.231 247.896 591.096 195.974 555.086 154.72L435.575 280.283C425.636 264.732 411.826 251.752 395.694 242.626L515.206 117.064H515.335C472.098 83.3928 418.795 62.0585 361.104 57.9458L365.621 231.187ZM338.8 252.894C387.071 251.736 427.21 289.65 428.5 337.843C429.663 386.038 391.588 426.136 343.317 427.292C295.048 428.449 254.91 390.535 253.62 342.34C252.457 294.147 290.531 254.05 338.8 252.894Z" fill="#FF0000"/>
          </svg>
          Studio 1947
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
          <NotificationCenter />
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
                <svg width="20" height="20" viewBox="0 0 683 680" fill="none" className="shrink-0">
                  <path d="M332.195 0.11376C423.313 -2.19948 509.656 30.8293 575.866 93.4175C641.945 155.876 679.634 240.441 681.956 331.175C684.279 421.908 651.238 508.145 588.385 574.075C525.66 640.003 440.996 677.53 349.875 679.844C258.757 682.158 172.414 649.128 106.204 586.54C40.124 524.079 2.43767 439.514 0.114657 348.782C-2.20845 258.047 30.8312 171.813 93.685 105.883C156.409 39.9537 241.204 2.42702 332.195 0.11376ZM365.621 231.187C356.845 229.003 347.553 228.104 338.132 228.362C328.71 228.618 319.417 230.289 310.771 232.601L306.253 59.4888C248.82 66.4288 196.806 90.4615 155.377 126.446L281.343 245.71C265.727 255.606 252.691 269.359 243.529 285.422L117.562 166.16C83.7474 209.213 62.4516 262.417 58.3217 319.866L231.912 315.369C229.717 324.236 228.815 333.489 229.073 342.871C229.331 352.252 231.01 361.377 233.332 370.117L59.7416 374.615C66.8401 431.933 91.1042 483.854 126.984 525.108L246.496 399.547C256.434 415.098 270.244 428.077 286.376 437.203L166.865 562.635C210.1 596.435 263.404 617.642 320.965 621.753L316.449 448.64C325.225 450.826 334.517 451.724 343.94 451.468C353.36 451.21 362.653 449.54 371.301 447.226L375.819 620.339C433.252 613.4 485.264 589.239 526.693 553.381L400.727 434.117C416.343 424.221 429.379 410.471 438.543 394.406L564.509 513.67C598.324 470.617 619.617 417.41 623.748 359.963L450.159 364.461C452.353 355.594 453.256 346.34 452.997 336.958C452.739 327.577 451.062 318.452 448.738 309.712L622.329 305.214C615.231 247.896 591.096 195.974 555.086 154.72L435.575 280.283C425.636 264.732 411.826 251.752 395.694 242.626L515.206 117.064H515.335C472.098 83.3928 418.795 62.0585 361.104 57.9458L365.621 231.187ZM338.8 252.894C387.071 251.736 427.21 289.65 428.5 337.843C429.663 386.038 391.588 426.136 343.317 427.292C295.048 428.449 254.91 390.535 253.62 342.34C252.457 294.147 290.531 254.05 338.8 252.894Z" fill="#FF0000"/>
                </svg>
                Studio 1947
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
      <aside className={`hidden h-screen sticky top-0 flex-col border-r border-slate-100 bg-[#fbfcfd] md:flex dark:border-slate-800/40 dark:bg-[#161616] transition-all duration-350 shrink-0 ${collapsed ? 'w-18' : 'w-60'}`}>
        <div className={`px-4 py-5 text-xl font-bold tracking-tight text-slate-800 dark:text-white flex items-center justify-between gap-2.5 ${collapsed ? 'flex-col items-center justify-center gap-4' : ''}`}>
          {!collapsed && (
            <span className="flex items-center gap-2.5 min-w-0">
              <svg width="22" height="22" viewBox="0 0 683 680" fill="none" className="shrink-0">
                <path d="M332.195 0.11376C423.313 -2.19948 509.656 30.8293 575.866 93.4175C641.945 155.876 679.634 240.441 681.956 331.175C684.279 421.908 651.238 508.145 588.385 574.075C525.66 640.003 440.996 677.53 349.875 679.844C258.757 682.158 172.414 649.128 106.204 586.54C40.124 524.079 2.43767 439.514 0.114657 348.782C-2.20845 258.047 30.8312 171.813 93.685 105.883C156.409 39.9537 241.204 2.42702 332.195 0.11376ZM365.621 231.187C356.845 229.003 347.553 228.104 338.132 228.362C328.71 228.618 319.417 230.289 310.771 232.601L306.253 59.4888C248.82 66.4288 196.806 90.4615 155.377 126.446L281.343 245.71C265.727 255.606 252.691 269.359 243.529 285.422L117.562 166.16C83.7474 209.213 62.4516 262.417 58.3217 319.866L231.912 315.369C229.717 324.236 228.815 333.489 229.073 342.871C229.331 352.252 231.01 361.377 233.332 370.117L59.7416 374.615C66.8401 431.933 91.1042 483.854 126.984 525.108L246.496 399.547C256.434 415.098 270.244 428.077 286.376 437.203L166.865 562.635C210.1 596.435 263.404 617.642 320.965 621.753L316.449 448.64C325.225 450.826 334.517 451.724 343.94 451.468C353.36 451.21 362.653 449.54 371.301 447.226L375.819 620.339C433.252 613.4 485.264 589.239 526.693 553.381L400.727 434.117C416.343 424.221 429.379 410.471 438.543 394.406L564.509 513.67C598.324 470.617 619.617 417.41 623.748 359.963L450.159 364.461C452.353 355.594 453.256 346.34 452.997 336.958C452.739 327.577 451.062 318.452 448.738 309.712L622.329 305.214C615.231 247.896 591.096 195.974 555.086 154.72L435.575 280.283C425.636 264.732 411.826 251.752 395.694 242.626L515.206 117.064H515.335C472.098 83.3928 418.795 62.0585 361.104 57.9458L365.621 231.187ZM338.8 252.894C387.071 251.736 427.21 289.65 428.5 337.843C429.663 386.038 391.588 426.136 343.317 427.292C295.048 428.449 254.91 390.535 253.62 342.34C252.457 294.147 290.531 254.05 338.8 252.894Z" fill="#FF0000"/>
              </svg>
              <span className="truncate">Studio 1947</span>
            </span>
          )}
          {collapsed && (
            <svg width="22" height="22" viewBox="0 0 683 680" fill="none" className="mx-auto shrink-0">
              <path d="M332.195 0.11376C423.313 -2.19948 509.656 30.8293 575.866 93.4175C641.945 155.876 679.634 240.441 681.956 331.175C684.279 421.908 651.238 508.145 588.385 574.075C525.66 640.003 440.996 677.53 349.875 679.844C258.757 682.158 172.414 649.128 106.204 586.54C40.124 524.079 2.43767 439.514 0.114657 348.782C-2.20845 258.047 30.8312 171.813 93.685 105.883C156.409 39.9537 241.204 2.42702 332.195 0.11376ZM365.621 231.187C356.845 229.003 347.553 228.104 338.132 228.362C328.71 228.618 319.417 230.289 310.771 232.601L306.253 59.4888C248.82 66.4288 196.806 90.4615 155.377 126.446L281.343 245.71C265.727 255.606 252.691 269.359 243.529 285.422L117.562 166.16C83.7474 209.213 62.4516 262.417 58.3217 319.866L231.912 315.369C229.717 324.236 228.815 333.489 229.073 342.871C229.331 352.252 231.01 361.377 233.332 370.117L59.7416 374.615C66.8401 431.933 91.1042 483.854 126.984 525.108L246.496 399.547C256.434 415.098 270.244 428.077 286.376 437.203L166.865 562.635C210.1 596.435 263.404 617.642 320.965 621.753L316.449 448.64C325.225 450.826 334.517 451.724 343.94 451.468C353.36 451.21 362.653 449.54 371.301 447.226L375.819 620.339C433.252 613.4 485.264 589.239 526.693 553.381L400.727 434.117C416.343 424.221 429.379 410.471 438.543 394.406L564.509 513.67C598.324 470.617 619.617 417.41 623.748 359.963L450.159 364.461C452.353 355.594 453.256 346.34 452.997 336.958C452.739 327.577 451.062 318.452 448.738 309.712L622.329 305.214C615.231 247.896 591.096 195.974 555.086 154.72L435.575 280.283C425.636 264.732 411.826 251.752 395.694 242.626L515.206 117.064H515.335C472.098 83.3928 418.795 62.0585 361.104 57.9458L365.621 231.187ZM338.8 252.894C387.071 251.736 427.21 289.65 428.5 337.843C429.663 386.038 391.588 426.136 343.317 427.292C295.048 428.449 254.91 390.535 253.62 342.34C252.457 294.147 290.531 254.05 338.8 252.894Z" fill="#FF0000"/>
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
        <nav className="flex-1 overflow-y-auto space-y-1.5 px-3 py-2">
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
