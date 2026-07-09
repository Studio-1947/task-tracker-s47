import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchResults } from '@task-tracker/shared';
import { useGlobalSearch } from '../hooks/useSearch';
import { statusClasses, statusLabel } from '../lib/format';
import { Avatar } from './Avatar';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

type FlatItem =
  | { kind: 'task'; item: SearchResults['tasks'][number] }
  | { kind: 'workspace'; item: SearchResults['workspaces'][number] }
  | { kind: 'user'; item: NonNullable<SearchResults['users']>[number] };

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Global search input with a grouped results dropdown.
 * `bindShortcut` registers the global ⌘K / Ctrl+K focus handler (desktop topbar
 * instance only, so the mobile overlay doesn't double-register).
 */
export function GlobalSearch({
  bindShortcut = false,
  autoFocus = false,
  onNavigated,
}: {
  bindShortcut?: boolean;
  autoFocus?: boolean;
  onNavigated?: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(raw, 250);
  const { data, isFetching } = useGlobalSearch(q);

  const flat = useMemo<FlatItem[]>(() => {
    if (!data) return [];
    return [
      ...data.tasks.map((item) => ({ kind: 'task', item }) as FlatItem),
      ...data.workspaces.map((item) => ({ kind: 'workspace', item }) as FlatItem),
      ...(data.users ?? []).map((item) => ({ kind: 'user', item }) as FlatItem),
    ];
  }, [data]);

  useEffect(() => setActive(0), [data]);

  // Global ⌘K / Ctrl+K focus shortcut.
  useEffect(() => {
    if (!bindShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindShortcut]);

  // Close on click outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (entry: FlatItem) => {
    if (entry.kind === 'task') navigate(`/workspaces/${entry.item.workspaceId}?task=${entry.item.id}`);
    else if (entry.kind === 'workspace') navigate(`/workspaces/${entry.item.id}`);
    else navigate('/users');
    setRaw('');
    setOpen(false);
    inputRef.current?.blur();
    onNavigated?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = flat[active];
      if (entry) go(entry);
    }
  };

  const showDropdown = open && q.trim().length >= 2;
  const hasResults = flat.length > 0;
  // Index offsets of each group within the flattened list (for highlight state).
  const taskOffset = 0;
  const wsOffset = data?.tasks.length ?? 0;
  const userOffset = wsOffset + (data?.workspaces.length ?? 0);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          aria-label="Search tasks, workspaces and users"
          placeholder="Search…"
          autoFocus={autoFocus}
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-14 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 lg:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </div>

      {showDropdown ? (
        <div
          id="global-search-results"
          className="absolute top-full z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {!hasResults ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              {isFetching ? 'Searching…' : 'No results found.'}
            </p>
          ) : (
            <div className="py-2">
              {data && data.tasks.length > 0 ? (
                <SearchGroup label="Tasks">
                  {data.tasks.map((t, i) => (
                    <ResultRow
                      key={t.id}
                      active={active === taskOffset + i}
                      onSelect={() => go({ kind: 'task', item: t })}
                      onHover={() => setActive(taskOffset + i)}
                    >
                      <span className="w-16 shrink-0 font-mono text-xs text-slate-400">{t.ref}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{t.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses[t.status]}`}>
                        {statusLabel(t.status)}
                      </span>
                    </ResultRow>
                  ))}
                </SearchGroup>
              ) : null}

              {data && data.workspaces.length > 0 ? (
                <SearchGroup label="Workspaces">
                  {data.workspaces.map((w, i) => (
                    <ResultRow
                      key={w.id}
                      active={active === wsOffset + i}
                      onSelect={() => go({ kind: 'workspace', item: w })}
                      onHover={() => setActive(wsOffset + i)}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: w.color ?? '#6366f1' }} />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{w.name}</span>
                      <span className="shrink-0 font-mono text-xs text-slate-400">{w.taskPrefix}</span>
                    </ResultRow>
                  ))}
                </SearchGroup>
              ) : null}

              {data?.users && data.users.length > 0 ? (
                <SearchGroup label="Users">
                  {data.users.map((u, i) => (
                    <ResultRow
                      key={u.id}
                      active={active === userOffset + i}
                      onSelect={() => go({ kind: 'user', item: u })}
                      onHover={() => setActive(userOffset + i)}
                    >
                      <Avatar user={u} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{u.name}</span>
                      <span className="shrink-0 truncate text-xs text-slate-400">{u.email}</span>
                    </ResultRow>
                  ))}
                </SearchGroup>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SearchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1">
      <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      {children}
    </div>
  );
}

function ResultRow({
  active,
  onSelect,
  onHover,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
      onMouseEnter={onHover}
      // mousedown fires before the outside-click closer removes the row.
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
