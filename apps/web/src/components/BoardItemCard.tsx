import type { BoardItem, BoardItemStatus } from '@task-tracker/shared';
import { useUpdateBoardItem } from '../hooks/useMeetings';
import { ApiRequestError } from '../lib/api';
import { Avatar } from './Avatar';
import { BoardProjectChip } from './BoardProjectChip';

/** Clicking the status dot walks Pending -> In progress -> Done -> Pending. */
const NEXT_STATUS: Record<BoardItemStatus, BoardItemStatus> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'PENDING',
};

const weekdayShort = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

/**
 * A single card on the meeting board. Shared by the by-day cells, the by-member
 * swimlanes and the by-project lanes; `compact` drops the owner footer, which is
 * redundant wherever the row already names the person.
 *
 * A carried-forward copy (`item.carriedFrom`) is the same underlying card shown
 * again on a later day because it never got finished. It is dimmed and can't be
 * dragged — moving it would move the original off the day it was planned for —
 * but its status still toggles, since ticking yesterday's leftover off today is
 * exactly what the copy is there for.
 */
export function BoardItemCard({
  item,
  draggable,
  canToggle,
  compact = false,
  onOpen,
  onError,
  onDragStart,
}: {
  item: BoardItem;
  draggable: boolean;
  canToggle: boolean;
  compact?: boolean;
  onOpen: () => void;
  onError: (m: string | null) => void;
  onDragStart: (id: string | null) => void;
}) {
  const updateItem = useUpdateBoardItem();
  const carried = item.carriedFrom !== null;
  const accent =
    item.status === 'DONE'
      ? 'border-l-emerald-500'
      : item.status === 'IN_PROGRESS'
        ? 'border-l-amber-400'
        : 'border-l-slate-300 dark:border-l-[#3a3a3a]';

  const cycle = () => {
    onError(null);
    updateItem
      .mutateAsync({ itemId: item.id, patch: { status: NEXT_STATUS[item.status] } })
      .catch((e: unknown) => onError(e instanceof ApiRequestError ? e.message : 'Could not update the card'));
  };

  const meta = (
    <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
      {item.note ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-300 dark:text-slate-600">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      ) : null}
      {item.commentCount > 0 ? (
        <span className="flex items-center gap-0.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {item.commentCount}
        </span>
      ) : null}
    </span>
  );

  return (
    <div
      draggable={draggable && !carried}
      onDragStart={() => onDragStart(item.id)}
      onDragEnd={() => onDragStart(null)}
      className={`group rounded-lg border border-l-[3px] border-slate-200/80 bg-white shadow-sm transition hover:shadow-md dark:border-[#2d2d2d] dark:bg-[#212121] ${accent} ${
        compact ? 'p-1.5' : 'p-2'
      } ${draggable && !carried ? 'cursor-grab active:cursor-grabbing' : ''} ${
        carried ? 'border-dashed opacity-75' : ''
      }`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          disabled={!canToggle}
          onClick={cycle}
          title={canToggle ? 'Change status' : undefined}
          aria-label={`Status: ${item.status}`}
          className="mt-0.5 shrink-0 disabled:cursor-not-allowed"
        >
          {item.status === 'DONE' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-500">
              <circle cx="12" cy="12" r="10" className="opacity-30" />
              <path d="M8 12.5l2.5 2.5 5-5" />
            </svg>
          ) : item.status === 'IN_PROGRESS' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-500">
              <circle cx="12" cy="12" r="10" className="opacity-40" />
              <path d="M12 7v5l3 2" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-300 dark:text-slate-600">
              <circle cx="12" cy="12" r="10" />
            </svg>
          )}
        </button>

        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p
            className={`break-words text-xs font-medium leading-snug ${
              item.status === 'DONE'
                ? 'text-slate-400 line-through dark:text-slate-500'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {item.title}
          </p>
        </button>

        {/* In the swimlanes the row already says who owns this, so only the meta shows. */}
        {compact ? meta : null}
      </div>

      {(carried || item.rolledOver || item.project) && (
        <div className="mt-1 flex flex-wrap items-center gap-1 pl-5">
          {carried ? (
            <span
              title={`Still open from ${weekdayShort(item.carriedFrom as string)} — carried forward`}
              className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            >
              ↷ {weekdayShort(item.carriedFrom as string)}
            </span>
          ) : item.rolledOver ? (
            <span
              title="Rolled over from last week, still unfinished"
              className="inline-flex items-center rounded-full bg-orange-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-950/30 dark:text-orange-400"
            >
              ↷ Last week
            </span>
          ) : null}
          {item.project ? (
            <BoardProjectChip project={item.project} taskRef={item.taskRef} size="xs" />
          ) : null}
        </div>
      )}

      {compact ? null : (
        <button type="button" onClick={onOpen} className="mt-1.5 flex w-full items-center gap-1.5 pl-5 text-left">
          <Avatar user={item.user} size="sm" />
          <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">{item.user.name}</span>
          <span className="ml-auto">{meta}</span>
        </button>
      )}
    </div>
  );
}
