import type { ConversationSummary } from '@task-tracker/shared';
import { linkify, LINK_ON_ACCENT, LINK_ON_SURFACE } from '../../lib/linkify';

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Compact timestamp for the conversation list (time today, weekday this week, else date). */
export function formatConvTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(iso);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Day separator label for the message thread. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

const GROUP_COLORS = ['bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length]!;
}

/** Square-ish avatar for group / project conversations. */
export function GroupAvatar({ conv, size = 'md' }: { conv: ConversationSummary; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-xs';
  const isProject = conv.type === 'PROJECT';
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-xl font-semibold text-white ${dim} ${colorFor(conv.id)}`}
      title={conv.title}
    >
      {isProject ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M4 5a2 2 0 0 1 2-2h5l2 3h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        </svg>
      ) : (
        (conv.title[0] ?? '#').toUpperCase()
      )}
    </span>
  );
}

/** Small online/offline dot for DIRECT conversations. */
export function PresenceDot({ online, className = '' }: { online: boolean; className?: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#1e1e1e] ${
        online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
      } ${className}`}
      title={online ? 'Online' : 'Offline'}
    />
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Render message text with @mentions highlighted and bare URLs made clickable.
 * Mentions are inserted as the member's full name (which may contain spaces), so
 * match against the known member names — longest first — and only fall back to a
 * bare "@word" run. Everything that isn't a mention goes through linkify.
 *
 * `onAccent` = this text sits on the gradient "my message" bubble, which needs
 * light link/mention colours rather than the default indigo.
 */
export function renderBody(
  body: string,
  memberNames: string[] = [],
  onAccent = false,
): React.ReactNode {
  const names = [...memberNames].sort((a, b) => b.length - a.length).map(escapeRe);
  const pattern = names.length
    ? new RegExp(`(@(?:${names.join('|')})|@[\\w.\\-]+)`, 'g')
    : /(@[\w.\-]+)/g;
  return body.split(pattern).map((part, i) =>
    part.startsWith('@') ? (
      <span
        key={i}
        className={`rounded px-0.5 font-medium ${
          onAccent
            ? 'bg-white/25 text-white'
            : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
        }`}
      >
        {part}
      </span>
    ) : (
      <span key={i}>
        {linkify(part, { keyPrefix: `m${i}-`, className: onAccent ? LINK_ON_ACCENT : LINK_ON_SURFACE })}
      </span>
    ),
  );
}
