import { Avatar, type AvatarUser } from './Avatar';

/** Overflow bubble dimensions, kept in step with Avatar's own size classes. */
const BUBBLE = {
  sm: 'h-6 w-6 text-[9px]',
  md: 'h-9 w-9 text-[11px]',
} as const;

/**
 * Overlapping assignee avatars, with a "+N" bubble once the list runs past `max`.
 * The ring colour matches the card/drawer surfaces so the overlap reads as a stack.
 */
export function AvatarStack({
  users,
  size = 'sm',
  max = 3,
  className = '',
  emptyLabel,
}: {
  users: AvatarUser[];
  size?: keyof typeof BUBBLE;
  max?: number;
  className?: string;
  /** Rendered in place of the stack when there are no assignees. */
  emptyLabel?: string;
}) {
  if (users.length === 0) {
    return emptyLabel ? (
      <span className={`text-[11px] font-semibold text-slate-400 dark:text-slate-500 ${className}`}>
        {emptyLabel}
      </span>
    ) : null;
  }

  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;

  return (
    <span
      className={`inline-flex shrink-0 items-center ${className}`}
      title={users.map((u) => u.name).join(', ')}
    >
      {shown.map((u) => (
        <Avatar
          key={u.id}
          user={u}
          size={size}
          className="-ml-1.5 ring-2 ring-white first:ml-0 dark:ring-[#1e1e1e]"
        />
      ))}
      {overflow > 0 ? (
        <span
          className={`-ml-1.5 inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 ring-2 ring-white dark:bg-slate-700 dark:text-slate-200 dark:ring-[#1e1e1e] ${BUBBLE[size]}`}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
