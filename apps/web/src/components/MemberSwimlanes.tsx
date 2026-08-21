import { useState } from 'react';
import {
  MEETING_SLOTS,
  MEETING_SLOT_LABELS,
  MOOD_META,
  type BoardItem,
  type BoardMemberSummary,
  type MeetingBoardDetail,
  type MeetingSlot,
} from '@task-tracker/shared';
import { useCreateBoardItem } from '../hooks/useMeetings';
import { ApiRequestError } from '../lib/api';
import { Avatar } from './Avatar';
import { BoardItemCard } from './BoardItemCard';
import { ProgressBar } from './ProgressBar';
import { EmptyState } from './ui';

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const weekdayShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const monthDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * The admin's-eye view of the week: names pinned down the left, Mon-Fri across
 * the top, and every person's cards sitting in their own day/half cell. The grid
 * scrolls horizontally on narrow screens with the name column stuck in place, so
 * it survives both a phone and a team of thirty.
 */
export function MemberSwimlanes({
  board,
  rows,
  items,
  isAdmin,
  currentUserId,
  canWrite,
  onOpen,
  onError,
  onDragStart,
  onDropOnMember,
}: {
  board: MeetingBoardDetail;
  rows: BoardMemberSummary[];
  items: BoardItem[];
  isAdmin: boolean;
  currentUserId?: string;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onError: (m: string | null) => void;
  onDragStart: (id: string | null) => void;
  onDropOnMember: (userId: string, day: string, slot: MeetingSlot) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nobody on the board yet"
        hint="Add a card or check in your mood and rows will appear here."
      />
    );
  }

  const today = ymd(new Date());

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-[#2a2a2a]">
        <div className="min-w-[54rem]">
          {/* day header */}
          <div className="flex border-b border-slate-100 bg-slate-50/60 dark:border-[#2a2a2a] dark:bg-[#161616]">
            <div className="sticky left-0 z-20 w-44 shrink-0 border-r border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:w-52 dark:border-[#2a2a2a] dark:bg-[#161616] dark:text-slate-500">
              Member
            </div>
            {board.days.map((d) => (
              <div
                key={d}
                className={`flex-1 px-2 py-2.5 text-center ${
                  d === today ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <div className="text-[11px] font-bold uppercase tracking-wide">{weekdayShort(d)}</div>
                <div className="text-[10px] opacity-70">{monthDay(d)}</div>
              </div>
            ))}
          </div>

          {/* one swimlane per member */}
          {rows.map((m) => (
            <div key={m.user.id} className="flex border-b border-slate-100 last:border-b-0 dark:border-[#2a2a2a]">
              {/* pinned identity, mood and progress */}
              <div className="sticky left-0 z-10 w-44 shrink-0 border-r border-slate-100 bg-white px-3 py-3 sm:w-52 dark:border-[#2a2a2a] dark:bg-[#1c1c1c]">
                <div className="flex items-center gap-2">
                  <Avatar user={m.user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-white">
                      {m.user.name}
                      {m.user.id === currentUserId ? (
                        <span className="ml-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">(you)</span>
                      ) : null}
                    </p>
                    {m.mood ? (
                      <p
                        className="truncate text-[10px] font-semibold"
                        style={{ color: MOOD_META[m.mood.mood].color }}
                        title={m.mood.note ?? undefined}
                      >
                        {MOOD_META[m.mood.mood].emoji} {MOOD_META[m.mood.mood].label}
                      </p>
                    ) : (
                      <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">No check-in</p>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <ProgressBar progress={m.progress} size="sm" showLabel={false} />
                  <p className="mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {m.progress.total === 0 ? (
                      <span className="text-amber-600 dark:text-amber-450">Nothing planned</span>
                    ) : (
                      <>
                        {m.progress.done}/{m.progress.total} done · {m.progress.percent}%
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* one cell per day, each split into the two halves */}
              {board.days.map((d) => (
                <div
                  key={d}
                  className={`flex-1 space-y-1.5 border-r border-slate-50 p-1.5 last:border-r-0 dark:border-[#232323] ${
                    d === today ? 'bg-indigo-50/25 dark:bg-indigo-950/10' : ''
                  }`}
                >
                  {(MEETING_SLOTS as MeetingSlot[]).map((slot) => (
                    <SwimlaneCell
                      key={slot}
                      board={board}
                      member={m}
                      day={d}
                      slot={slot}
                      items={items
                        .filter((i) => i.user.id === m.user.id && i.dayDate === d && i.slot === slot)
                        .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))}
                      isAdmin={isAdmin}
                      currentUserId={currentUserId}
                      canWrite={canWrite}
                      onOpen={onOpen}
                      onError={onError}
                      onDragStart={onDragStart}
                      onDropOnMember={onDropOnMember}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <p className="px-1 text-[11px] text-slate-400 dark:text-slate-500">
        {isAdmin
          ? 'Drag a card to another day, half or person. Scroll sideways to see the full week.'
          : 'Drag your own cards to another day or half. Scroll sideways to see the full week.'}
      </p>
    </div>
  );
}

/** One member's (day, half) cell inside the swimlane grid. */
function SwimlaneCell({
  board,
  member,
  day,
  slot,
  items,
  isAdmin,
  currentUserId,
  canWrite,
  onOpen,
  onError,
  onDragStart,
  onDropOnMember,
}: {
  board: MeetingBoardDetail;
  member: BoardMemberSummary;
  day: string;
  slot: MeetingSlot;
  items: BoardItem[];
  isAdmin: boolean;
  currentUserId?: string;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onError: (m: string | null) => void;
  onDragStart: (id: string | null) => void;
  onDropOnMember: (userId: string, day: string, slot: MeetingSlot) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [over, setOver] = useState(false);
  const createItem = useCreateBoardItem();

  const isMine = member.user.id === currentUserId;
  // You fill your own lane; an admin can also plan on somebody else's behalf.
  const canAdd = canWrite && (isMine || isAdmin);
  const canEdit = isAdmin || (isMine && !board.isLocked);

  const submit = () => {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    onError(null);
    // Cleared up front so a blur landing before the POST resolves can't double-submit.
    setDraft('');
    createItem
      .mutateAsync({
        boardId: board.id,
        input: { dayDate: day, slot, title, ...(isMine ? {} : { userId: member.user.id }) },
      })
      .catch((e: unknown) => onError(e instanceof ApiRequestError ? e.message : 'Could not add the card'));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDropOnMember(member.user.id, day, slot);
      }}
      className={`min-h-[3.5rem] rounded-lg border border-dashed p-1 transition ${
        over
          ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/25'
          : 'border-slate-200/70 dark:border-[#282828]'
      }`}
    >
      <div className="flex items-center gap-1 px-0.5 pb-1">
        <span className={`h-1.5 w-1.5 rounded-full ${slot === 'FIRST' ? 'bg-indigo-400' : 'bg-violet-400'}`} />
        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-600">
          {MEETING_SLOT_LABELS[slot]}
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item) => (
          <BoardItemCard
            key={item.id}
            item={item}
            compact
            draggable={canEdit}
            canToggle={canEdit}
            onOpen={() => onOpen(item.id)}
            onError={onError}
            onDragStart={onDragStart}
          />
        ))}
      </div>

      {canAdd ? (
        adding ? (
          <textarea
            autoFocus
            rows={2}
            value={draft}
            placeholder={isMine ? 'What are you working on?' : `Add for ${member.user.name.split(' ')[0]}…`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              submit();
              setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
            className="mt-1 w-full resize-none rounded border border-indigo-400 bg-white px-1.5 py-1 text-[11px] outline-none dark:border-indigo-500 dark:bg-[#1a1a1a] dark:text-white dark:placeholder-slate-500"
          />
        ) : (
          <button
            type="button"
            aria-label={`Add a card for ${member.user.name}`}
            onClick={() => setAdding(true)}
            className="mt-1 w-full rounded py-0.5 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-50 hover:text-indigo-600 dark:text-slate-600 dark:hover:bg-[#232323] dark:hover:text-indigo-400"
          >
            + Add
          </button>
        )
      ) : null}
    </div>
  );
}
