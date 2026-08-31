import { useState } from 'react';
import type { MeetingSlot } from '@task-tracker/shared';
import { useCreateBoardItem } from '../hooks/useMeetings';
import { ApiRequestError } from '../lib/api';
import { BoardProjectSelect } from './BoardProjectSelect';

/**
 * The "+ Add" affordance shared by all three board views. Beyond the title it
 * carries the project the card is filed under, because that choice is what
 * mirrors the card into the workspace as a real task — asking for it later, in
 * the drawer, would mean most cards never get filed at all.
 */
export function BoardCardComposer({
  boardId,
  dayDate,
  slot,
  /** Owner of the new card. Omit for yourself; admins may plan for someone else. */
  ownerId,
  /** Pre-selected project, e.g. the active filter or the project lane you're in. */
  defaultProjectId = '',
  /** Fixes the project (the project lanes already answer the question). */
  lockProject = false,
  placeholder = 'What are you working on?',
  size = 'md',
  onError,
}: {
  boardId: string;
  dayDate: string;
  slot: MeetingSlot;
  ownerId?: string;
  defaultProjectId?: string;
  lockProject?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md';
  onError: (m: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const createItem = useCreateBoardItem();

  const close = () => {
    setAdding(false);
    setDraft('');
    setProjectId(defaultProjectId);
  };

  const submit = () => {
    const title = draft.trim();
    if (!title) return close();
    onError(null);
    // Cleared up front so a blur landing before the POST resolves can't double-submit.
    setDraft('');
    createItem
      .mutateAsync({
        boardId,
        input: {
          dayDate,
          slot,
          title,
          ...(ownerId ? { userId: ownerId } : {}),
          ...(projectId ? { projectId } : {}),
        },
      })
      .catch((e: unknown) =>
        onError(e instanceof ApiRequestError ? e.message : 'Could not add the card'),
      );
  };

  if (!adding) {
    return size === 'sm' ? (
      <button
        type="button"
        aria-label="Add a card"
        onClick={() => setAdding(true)}
        className="mt-1 w-full rounded py-0.5 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-50 hover:text-indigo-600 dark:text-slate-600 dark:hover:bg-[#232323] dark:hover:text-indigo-400"
      >
        + Add
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-[#2d2d2d] dark:text-slate-500 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add
      </button>
    );
  }

  return (
    // The project select sits inside the composer, so a click on it must not
    // count as the blur that submits the card.
    <div
      className="mt-1 space-y-1"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        submit();
        setAdding(false);
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
            setAdding(false);
          }
          if (e.key === 'Escape') close();
        }}
        className={`w-full resize-none rounded-lg border border-indigo-400 bg-white outline-none focus:ring-2 focus:ring-indigo-500/10 dark:border-indigo-500 dark:bg-[#1a1a1a] dark:text-white dark:placeholder-slate-500 ${
          size === 'sm' ? 'px-1.5 py-1 text-[11px]' : 'px-2 py-1.5 text-xs'
        }`}
      />
      {lockProject ? null : (
        <BoardProjectSelect
          value={projectId}
          onChange={setProjectId}
          size="sm"
          unfiledLabel="No project"
        />
      )}
    </div>
  );
}
