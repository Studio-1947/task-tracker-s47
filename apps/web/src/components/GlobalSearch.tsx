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
  | { kind: 'project'; item: SearchResults['projects'][number] }
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
      ...data.projects.map((item) => ({ kind: 'project', item }) as FlatItem),
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
    else if (entry.kind === 'project') navigate(`/workspaces/${entry.item.workspaceId}?project=${entry.item.id}`);
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
  const projectOffset = wsOffset + (data?.workspaces.length ?? 0);
  const userOffset = projectOffset + (data?.projects.length ?? 0);

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
          className="w-full rounded-lg border border-slate-200 bg-white/80 py-2.5 pl-9.5 pr-14 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-[#1a1a1a]/85 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20 transition-all"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-[#252525] px-1.5 py-0.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 lg:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </div>

      {showDropdown ? (
        <div
          id="global-search-results"
          className="absolute top-full z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-2xl border border-slate-150/60 dark:border-[#1e293b]/30 bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-md shadow-2xl dark:shadow-none"
        >
          {!hasResults ? (
            <p className="px-4 py-6 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
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
                      <span className="w-16 shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500">{t.ref}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{t.title}</span>
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
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{w.name}</span>
                    </ResultRow>
                  ))}
                </SearchGroup>
              ) : null}

              {data && data.projects.length > 0 ? (
                <SearchGroup label="Projects">
                  {data.projects.map((p, i) => (
                    <ResultRow
                      key={p.id}
                      active={active === projectOffset + i}
                      onSelect={() => go({ kind: 'project', item: p })}
                      onHover={() => setActive(projectOffset + i)}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? '#6366f1' }} />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                        {p.name}
                        <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">{p.workspaceName}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500">{p.taskPrefix}</span>
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
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{u.name}</span>
                      <span className="shrink-0 truncate text-xs text-slate-400 dark:text-slate-500">{u.email}</span>
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
    <div className="px-2 pb-1.5">
      <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-550">{label}</p>
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
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer ${active ? 'bg-indigo-50/70 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 font-medium' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/20 text-slate-600 dark:text-slate-350'}`}
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
