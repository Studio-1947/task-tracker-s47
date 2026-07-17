import { useEffect, useRef, useState } from 'react';
import type { UserRef } from '@task-tracker/shared';
import { Avatar } from './Avatar';
import { AvatarStack } from './AvatarStack';

interface Props {
  members: UserRef[];
  selected: UserRef[];
  /** Fires with the full next set of assignee ids (the API replaces the set wholesale). */
  onChange: (assigneeIds: string[]) => void;
  disabled?: boolean;
  /** Avatar-stack-only trigger, for tight rows like the subtask list. */
  compact?: boolean;
}

/**
 * Multi-select assignee dropdown. A task can carry any number of assignees
 * (task_assignees is M2M), so this replaces the old single <select>.
 */
export function AssigneePicker({ members, selected, onChange, disabled, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIds = new Set(selected.map((u) => u.id));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Reset the search box each time the menu closes.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const toggle = (id: string) => {
    const next = selectedIds.has(id) ? [...selectedIds].filter((x) => x !== id) : [...selectedIds, id];
    onChange(next);
  };

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? members.filter(
        (m) => m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle),
      )
    : members;

  const summary =
    selected.length === 0
      ? 'Unassigned'
      : selected.length === 1
        ? (selected[0]?.name ?? '')
        : `${selected.length} assignees`;

  return (
    <div ref={rootRef} className="relative">
      {compact ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={`Assignees: ${summary}`}
          onClick={() => setOpen((o) => !o)}
          className="flex shrink-0 items-center rounded-full p-0.5 transition-colors hover:bg-slate-150 disabled:opacity-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          {selected.length ? (
            <AvatarStack users={selected} max={3} />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 disabled:opacity-50 dark:border-slate-800 dark:bg-[#252525] cursor-pointer"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected.length ? <AvatarStack users={selected} max={3} /> : null}
            <span
              className={`truncate text-sm font-semibold normal-case tracking-normal ${
                selected.length
                  ? 'text-slate-700 dark:text-white'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {summary}
            </span>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={`shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {open ? (
        <div className="absolute right-0 z-40 mt-1.5 w-60 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#1e1e1e] dark:shadow-black/40">
          <div className="p-2">
            <input
              autoFocus
              aria-label="Search members"
              placeholder="Search members…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 dark:border-slate-800 dark:bg-[#252525] dark:text-white"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto px-1.5 pb-1.5">
            {visible.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">
                No members found.
              </li>
            ) : null}
            {visible.map((m) => {
              const on = selectedIds.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                  >
                    <Avatar user={m} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold normal-case tracking-normal text-slate-700 dark:text-slate-200">
                      {m.name}
                    </span>
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        on
                          ? 'border-indigo-500 bg-indigo-500 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {on ? (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold normal-case tracking-normal text-slate-500 transition-colors hover:bg-slate-50 hover:text-red-600 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-red-400 cursor-pointer"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
