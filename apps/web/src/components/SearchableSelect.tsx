import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** Section heading the option is listed under, e.g. a workspace name. */
  group?: string;
  /** Small trailing text, e.g. a task prefix. Also searched. */
  hint?: string;
}

/**
 * Type-to-search select for long lists (projects, workspaces). A native
 * `<select>` cannot be searched and is unusable past a dozen entries, especially
 * on phones. Filters on label, hint and group; arrow keys, Enter and Escape work;
 * `emptyLabel` adds an explicit "none" choice with value ''.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  emptyLabel,
  placeholder = 'Search…',
  disabled,
  loading,
  size = 'md',
  className = '',
  ariaLabel,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter((o) => `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLowerCase().includes(q))
      : options;
    const list: SelectOption[] = emptyLabel !== undefined && !q ? [{ value: '', label: emptyLabel }, ...filtered] : filtered;
    return list;
  }, [options, query, emptyLabel]);

  useEffect(() => setHighlight(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const choose = (v: string) => {
    onChange(v);
    setQuery('');
    setOpen(false);
    // Focus deliberately stays on the input: a blur here would look like leaving the form to any parent that
    // submits on blur (the meeting board's card composer submits the card the moment focus leaves it).
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (rows.length) setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      if (open && rows[highlight]) {
        e.preventDefault();
        choose(rows[highlight]!.value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const pad = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-sm';
  const shown = open ? query : selected?.label ?? emptyLabel ?? '';

  // Group headings are shown only while browsing; a search result list stays flat and short.
  let lastGroup: string | undefined;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel ?? placeholder}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled || loading}
        placeholder={loading ? 'Loading…' : open ? placeholder : undefined}
        value={shown}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={`w-full rounded-lg border border-slate-200 bg-white/80 pr-7 outline-none transition focus:border-indigo-500 disabled:opacity-60 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white ${pad}`}
      />
      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M6 9l6 6 6-6" />
      </svg>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full min-w-[14rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-[#2d2d2d] dark:bg-[#1f1f1f]"
        >
          {rows.length === 0 ? <li className="px-3 py-2 text-xs text-slate-400">No matches for “{query}”.</li> : null}
          {rows.map((o, i) => {
            const heading = !query && o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group ?? lastGroup;
            return (
              <li key={`${o.value}:${i}`} role="presentation">
                {heading ? <div className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{heading}</div> : null}
                <div
                  role="option"
                  aria-selected={o.value === value}
                  data-index={i}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.value)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 ${
                    i === highlight ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                  } ${o.value === value ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}
                >
                  <span className="min-w-0 truncate">
                    {o.label}
                    {query && o.group ? <span className="ml-1.5 text-[11px] font-normal text-slate-400">· {o.group}</span> : null}
                  </span>
                  {o.hint ? <span className="shrink-0 font-mono text-[10px] text-slate-400">{o.hint}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
