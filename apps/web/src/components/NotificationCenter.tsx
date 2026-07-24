import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { Spinner } from './ui';
import {
  useNotifications,
  useNotificationsUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useVapidPublicKey,
  useSubscribePush,
  urlBase64ToUint8Array,
} from '../hooks/useNotifications';


export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(false);
  const [isSubscribingPush, setIsSubscribingPush] = useState<boolean>(false);
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: unreadData } = useNotificationsUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  const { data: notificationsData, isLoading } = useNotifications(1, 15);
  const notifications = notificationsData?.items ?? [];

  const { data: vapidData } = useVapidPublicKey();
  const subscribePushMutation = useSubscribePush();

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  // Check initial push subscription status
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsPushSubscribed(!!sub);
        }).catch(() => undefined);
      }).catch(() => undefined);
    }
  }, []);

  const handleEnablePush = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      alert('Push notifications are not supported in this browser environment.');
      return;
    }

    setIsSubscribingPush(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert('Notification permissions were denied.');
        setIsSubscribingPush(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const publicKey = vapidData?.publicKey;
      if (!publicKey) {
        throw new Error('VAPID public key not available from server.');
      }

      const convertedKey = urlBase64ToUint8Array(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as unknown as BufferSource,
        });
      }

      const jsonSub = sub.toJSON();
      await subscribePushMutation.mutateAsync({
        endpoint: jsonSub.endpoint,
        keys: {
          p256dh: jsonSub.keys?.p256dh ?? '',
          auth: jsonSub.keys?.auth ?? '',
        },
      });

      setIsPushSubscribed(true);
    } catch (err: any) {
      console.error('Failed to subscribe push notifications:', err);
      alert(`Could not enable push notifications: ${err.message || err}`);
    } finally {
      setIsSubscribingPush(false);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = async (n: any) => {
    if (!n.isRead) {
      await markReadMutation.mutateAsync(n.id);
    }
    setIsOpen(false);

    // If it has task data, redirect to the task in its workspace
    if (n.data?.taskId && n.data?.workspaceId) {
      navigate(`/workspaces/${n.data.workspaceId}?task=${n.data.taskId}`);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllReadMutation.mutateAsync();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        title="Notifications"
        className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-850 dark:hover:text-slate-350 transition-colors cursor-pointer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-[#121212] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-2xl border border-slate-100 bg-white shadow-xl dark:border-slate-800/40 dark:bg-[#181818] z-50 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800/50">
            <h3 className="text-sm font-bold text-slate-850 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllReadMutation.isPending}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-50 cursor-pointer"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Web Push Notification subscription bar */}
          <div className="bg-slate-50/70 dark:bg-slate-850/40 px-4 py-2 border-b border-slate-100 dark:border-slate-800/40 flex items-center justify-between text-xs">
            {isPushSubscribed ? (
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>PWA Device Push Active</span>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-slate-500 dark:text-slate-400">Device push alerts</span>
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={isSubscribingPush}
                  className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubscribingPush ? 'Enabling...' : 'Enable Push'}
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100/60 dark:divide-slate-800/40">
            {isLoading ? (
              <div className="py-8"><Spinner /></div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <div className="rounded-full bg-slate-50 dark:bg-slate-850 p-2.5 text-slate-350 dark:text-slate-650 mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">All caught up!</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">No notifications to show right now.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-all ${
                    !n.isRead ? 'bg-indigo-50/15 dark:bg-indigo-950/5' : ''
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {n.sender ? (
                      <Avatar user={n.sender} size="sm" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <path d="M9 17h6" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className={`text-xs font-bold truncate leading-tight ${!n.isRead ? 'text-slate-850 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-450 mt-1 leading-normal break-words line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-1.5 font-medium">
                      {formatTimeAgo(n.createdAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Simple absolute relative-time formatter since standard ones aren't guaranteed to exist
function formatTimeAgo(dateStr: string): string {
  try {
    const past = new Date(dateStr).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - past);

    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;

    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;

    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'recently';
  }
}
