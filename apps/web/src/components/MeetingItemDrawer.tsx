import { useEffect, useState } from 'react';
import {
  BOARD_ITEM_STATUSES,
  BOARD_ITEM_STATUS_LABELS,
  MEETING_SLOTS,
  MEETING_SLOT_LABELS,
  type BoardItem,
  type BoardItemStatus,
  type MeetingBoardDetail,
  type MeetingSlot,
  type UserSummary,
} from '@task-tracker/shared';
import {
  useCreateBoardNote,
  useDeleteBoardItem,
  useDeleteBoardNote,
  useItemNotes,
  useUpdateBoardItem,
  useUpdateBoardNote,
} from '../hooks/useMeetings';
import { useAuth } from '../stores/auth';
import { ApiRequestError } from '../lib/api';
import { Avatar } from './Avatar';
import { Button, ErrorState, Spinner } from './ui';

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

const timeAgo = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const STATUS_STYLES: Record<BoardItemStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-[#252525] dark:text-slate-350 dark:border-[#333]',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/25 dark:text-amber-400 dark:border-amber-900/40',
  DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-400 dark:border-emerald-900/40',
};

/**
 * Full detail for one board card: edit, move, reassign, and the comment thread.
 * Doubles as the mobile "move" affordance since drag-and-drop is desktop-only.
 */
export function MeetingItemDrawer({
  item,
  board,
  members,
  onClose,
}: {
  item: BoardItem;
  board: MeetingBoardDetail;
  members: UserSummary[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isOwner = item.user.id === user?.id;
  const canEdit = isAdmin || (isOwner && !board.isLocked);

  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note ?? '');
  const [draft, setDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: comments, isLoading: commentsLoading } = useItemNotes(item.id);
  const updateItem = useUpdateBoardItem();
  const deleteItem = useDeleteBoardItem();
  const createNote = useCreateBoardNote();
  const updateNote = useUpdateBoardNote();
  const deleteNote = useDeleteBoardNote();

  // Re-sync the local drafts when the drawer is pointed at a different card.
  useEffect(() => {
    setTitle(item.title);
    setNote(item.note ?? '');
  }, [item.id, item.title, item.note]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong');
    }
  };

  const patch = (p: Parameters<typeof updateItem.mutateAsync>[0]['patch']) =>
    run(() => updateItem.mutateAsync({ itemId: item.id, patch: p }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-[#090d16]/50 dark:bg-[#121212]/80 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />
      <div className="relative z-50 flex h-full w-[calc(100%-3rem)] sm:w-[32rem] max-w-lg flex-col overflow-y-auto border-l border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#181818] shadow-2xl animate-slide-in">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800/60 dark:bg-[#181818]/95">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <span>{dayLabel(item.dayDate)}</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span>{MEETING_SLOT_LABELS[item.slot]}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Avatar user={item.user} size="sm" />
              <span className="truncate text-sm font-medium text-slate-600 dark:text-slate-350">{item.user.name}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 px-5 py-5">
          {error ? <ErrorState message={error} /> : null}

          {/* title */}
          <div>
            <textarea
              value={title}
              disabled={!canEdit}
              rows={2}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const next = title.trim();
                if (!next) return setTitle(item.title);
                if (next !== item.title) void patch({ title: next });
              }}
              className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-lg font-semibold text-slate-800 outline-none transition hover:border-slate-200 focus:border-indigo-500 focus:bg-white disabled:hover:border-transparent dark:text-white dark:hover:border-[#2d2d2d] dark:focus:border-indigo-500 dark:focus:bg-[#1a1a1a]"
            />
          </div>

          {/* status */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Status</p>
            <div className="flex flex-wrap gap-2">
              {(BOARD_ITEM_STATUSES as BoardItemStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => void patch({ status: s })}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    item.status === s
                      ? STATUS_STYLES[s]
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-[#2d2d2d] dark:text-slate-400 dark:hover:bg-[#222]'
                  }`}
                >
                  {BOARD_ITEM_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            {item.completedAt ? (
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Completed {timeAgo(item.completedAt)}</p>
            ) : null}
          </div>

          {/* placement */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Day
              </label>
              <select
                value={item.dayDate}
                disabled={!canEdit}
                onChange={(e) => void patch({ dayDate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white"
              >
                {board.days.map((d) => (
                  <option key={d} value={d}>
                    {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Half
              </label>
              <select
                value={item.slot}
                disabled={!canEdit}
                onChange={(e) => void patch({ slot: e.target.value as MeetingSlot })}
                className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white"
              >
                {(MEETING_SLOTS as MeetingSlot[]).map((s) => (
                  <option key={s} value={s}>
                    {MEETING_SLOT_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* reassign — admin only */}
          {isAdmin ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Owner
              </label>
              <select
                value={item.user.id}
                onChange={(e) => void patch({ userId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* private note on the card */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Note
            </label>
            <textarea
              value={note}
              rows={3}
              disabled={!canEdit}
              placeholder="Context, blockers, links…"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                const next = note.trim();
                if (next !== (item.note ?? '')) void patch({ note: next === '' ? null : next });
              }}
              className="w-full resize-y rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white dark:placeholder-slate-500"
            />
          </div>

          {/* comments */}
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Comments {comments && comments.length > 0 ? `(${comments.length})` : ''}
            </p>

            {commentsLoading ? (
              <Spinner />
            ) : comments && comments.length > 0 ? (
              <ul className="mb-3 space-y-3">
                {comments.map((c) => {
                  const mine = c.author.id === user?.id;
                  return (
                    <li key={c.id} className="flex gap-2.5">
                      <Avatar user={c.author} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{c.author.name}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">{timeAgo(c.createdAt)}</span>
                        </div>
                        {editingNoteId === c.id ? (
                          <div className="mt-1.5">
                            <textarea
                              value={editingBody}
                              rows={2}
                              onChange={(e) => setEditingBody(e.target.value)}
                              className="w-full resize-y rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white"
                            />
                            <div className="mt-1.5 flex gap-2">
                              <Button
                                className="px-2.5 py-1 text-xs"
                                onClick={() =>
                                  void run(async () => {
                                    const body = editingBody.trim();
                                    if (body) await updateNote.mutateAsync({ noteId: c.id, patch: { body } });
                                    setEditingNoteId(null);
                                  })
                                }
                              >
                                Save
                              </Button>
                              <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setEditingNoteId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-350">
                            {c.body}
                          </p>
                        )}
                        {(mine || isAdmin) && editingNoteId !== c.id ? (
                          <div className="mt-1 flex gap-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                            {mine ? (
                              <button
                                type="button"
                                className="hover:text-slate-700 dark:hover:text-slate-300"
                                onClick={() => {
                                  setEditingNoteId(c.id);
                                  setEditingBody(c.body);
                                }}
                              >
                                Edit
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="hover:text-red-600 dark:hover:text-red-400"
                              onClick={() => void run(() => deleteNote.mutateAsync({ noteId: c.id, itemId: item.id }))}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No comments yet.</p>
            )}

            {isAdmin || !board.isLocked ? (
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  rows={2}
                  placeholder="Add a comment…"
                  onChange={(e) => setDraft(e.target.value)}
                  className="flex-1 resize-y rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white dark:placeholder-slate-500"
                />
                <Button
                  className="self-end px-3 py-2 text-xs"
                  disabled={!draft.trim() || createNote.isPending}
                  onClick={() =>
                    void run(async () => {
                      const body = draft.trim();
                      if (!body) return;
                      await createNote.mutateAsync({ boardId: board.id, input: { itemId: item.id, body } });
                      setDraft('');
                    })
                  }
                >
                  Post
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800/60">
            <Button
              variant="danger"
              className="w-full text-xs"
              disabled={deleteItem.isPending}
              onClick={() =>
                void run(async () => {
                  await deleteItem.mutateAsync(item.id);
                  onClose();
                })
              }
            >
              Delete card
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
