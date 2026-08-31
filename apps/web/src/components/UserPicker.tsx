import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';

export type PickableUser = {
  id: string;
  name: string;
  email: string;
  avatarKey: string | null;
};

/**
 * Type-to-search person picker.
 *
 * A plain `<select>` makes you scan the whole team by eye, which stops working
 * somewhere around a dozen people and offers no way to just type a name. This is
 * a combobox: the text you type filters on both name and email, arrow keys and
 * Enter drive it from the keyboard, and the selection is still a single id so it
 * drops straight into the existing "add member" call.
 */
export function UserPicker({
  users,
  value,
  onChange,
  placeholder = 'Search people by name or email…',
  disabled = false,
  emptyHint = 'Everyone is already a member.',
}: {
  users: PickableUser[];
  /** Id of the selected person, or '' for none. */
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Shown when there is nobody left to pick at all. */
  emptyHint?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = users.find((u) => u.id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  // Keep the highlight on a row that still exists as the query narrows.
  useEffect(() => setHighlight(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (user: PickableUser) => {
    onChange(user.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (matches.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => (h + step + matches.length) % matches.length);
      return;
    }
    if (e.key === 'Enter') {
      if (!open) return;
      const pick = matches[highlight];
      if (pick) {
        e.preventDefault();
        choose(pick);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (open) setOpen(false);
      else if (value) clear();
    }
  };

  if (users.length === 0) {
    return (
      <div className="flex-1 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
        {emptyHint}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.2-3.2" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search people to add"
          disabled={disabled}
          // With somebody chosen, the field shows their name until you type again.
          value={open || !selected ? query : selected.name}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-[#252525] dark:text-white dark:placeholder-slate-500"
        />

        {value || query ? (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-[#1f1f1f]"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-slate-400 dark:text-slate-500">
              No one matches “{query.trim()}”.
            </li>
          ) : (
            matches.map((u, i) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={u.id === value}
                  // pointerdown fires before the input's blur, so the click lands.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    choose(u);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
                    i === highlight ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''
                  }`}
                >
                  <Avatar user={u} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {u.name}
                    </span>
                    <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                      {u.email}
                    </span>
                  </span>
                  {u.id === value ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 text-indigo-600 dark:text-indigo-400">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
