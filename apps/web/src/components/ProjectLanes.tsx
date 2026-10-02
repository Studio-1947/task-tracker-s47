import { useState } from 'react';
import {
  MEETING_SLOTS,
  MEETING_SLOT_LABELS,
  type BoardItem,
  type BoardProjectSummary,
  type MeetingBoardDetail,
  type MeetingSlot,
} from '@task-tracker/shared';
import { Avatar } from './Avatar';
import { BoardCardComposer } from './BoardCardComposer';
import { BoardItemCard } from './BoardItemCard';
import { ProgressBar } from './ProgressBar';
import { EmptyState } from './ui';

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const weekdayShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const monthDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * The week seen by project rather than by person: one lane per project, Mon-Fri
 * across the top, so a lead can read "where did Website actually go this week"
 * without mentally re-sorting everyone's cards. Unfiled work sits in its own lane
 * at the bottom — visible on purpose, since that's the work that never made it
 * into the tracker.
 */
export function ProjectLanes({
  board,
  rows,
  items,
  isAdmin,
  currentUserId,
  canWrite,
  onOpen,
  onCreated,
  onError,
  onDragStart,
  onDropOnProject,
}: {
  board: MeetingBoardDetail;
  rows: BoardProjectSummary[];
  items: BoardItem[];
  isAdmin: boolean;
  currentUserId?: string;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onCreated: (item: BoardItem) => void;
  onError: (m: string | null) => void;
  onDragStart: (id: string | null) => void;
  onDropOnProject: (projectId: string | null, day: string, slot: MeetingSlot) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No project work on the board yet"
        hint="File a card under a project and it shows up here — and as a task in that project."
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
              Project
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

          {rows.map((row) => {
            const projectId = row.project?.id ?? null;
            const lane = items.filter((i) => (i.project?.id ?? null) === projectId);
            const owners = [...new Map(lane.map((i) => [i.user.id, i.user])).values()];
            const color = row.project?.color ?? '#64748b';

            return (
              <div
                key={projectId ?? 'unfiled'}
                className="flex border-b border-slate-100 last:border-b-0 dark:border-[#2a2a2a]"
              >
                {/* pinned project identity and roll-up */}
                <div className="sticky left-0 z-10 w-44 shrink-0 border-r border-slate-100 bg-white px-3 py-3 sm:w-52 dark:border-[#2a2a2a] dark:bg-[#1c1c1c]">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.project ? color : 'transparent', boxShadow: row.project ? undefined : `inset 0 0 0 1.5px ${color}` }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-white">
                        {row.project?.name ?? 'No project'}
                      </p>
                      <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">
                        {row.project ? row.project.workspaceName : 'Not mirrored into the tracker'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2">
                    <ProgressBar progress={row.progress} size="sm" showLabel={false} />
                    <p className="mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      {row.progress.done}/{row.progress.total} done · {row.progress.percent}%
                    </p>
                  </div>

                  {owners.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {owners.slice(0, 5).map((u) => (
                        <Avatar key={u.id} user={u} size="sm" />
                      ))}
                      {owners.length > 5 ? (
                        <span className="self-center text-[10px] text-slate-400 dark:text-slate-500">
                          +{owners.length - 5}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {board.days.map((d) => (
                  <div
                    key={d}
                    className={`flex-1 space-y-1.5 border-r border-slate-50 p-1.5 last:border-r-0 dark:border-[#232323] ${
                      d === today ? 'bg-indigo-50/25 dark:bg-indigo-950/10' : ''
                    }`}
                  >
                    {(MEETING_SLOTS as MeetingSlot[]).map((slot) => (
                      <ProjectLaneCell
                        key={slot}
                        board={board}
                        projectId={projectId}
                        day={d}
                        slot={slot}
                        items={lane
                          .filter((i) => i.dayDate === d && i.slot === slot)
                          .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))}
                        isAdmin={isAdmin}
                        currentUserId={currentUserId}
                        canWrite={canWrite}
                        onOpen={onOpen}
                        onCreated={onCreated}
                        onError={onError}
                        onDragStart={onDragStart}
                        onDropOnProject={onDropOnProject}
                      />
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <p className="px-1 text-[11px] text-slate-400 dark:text-slate-500">
        Dropping a card in another lane re-files it under that project and opens a fresh task there —
        the task it came from stays put, with its history.
      </p>
    </div>
  );
}

/** One project's (day, half) cell inside the lane grid. */
function ProjectLaneCell({
  board,
  projectId,
  day,
  slot,
  items,
  isAdmin,
  currentUserId,
  canWrite,
  onOpen,
  onCreated,
  onError,
  onDragStart,
  onDropOnProject,
}: {
  board: MeetingBoardDetail;
  projectId: string | null;
  day: string;
  slot: MeetingSlot;
  items: BoardItem[];
  isAdmin: boolean;
  currentUserId?: string;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onCreated: (item: BoardItem) => void;
  onError: (m: string | null) => void;
  onDragStart: (id: string | null) => void;
  onDropOnProject: (projectId: string | null, day: string, slot: MeetingSlot) => void;
}) {
  const [over, setOver] = useState(false);

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
        onDropOnProject(projectId, day, slot);
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
        {items.map((item) => {
          const canEdit = isAdmin || (item.user.id === currentUserId && !board.isLocked);
          return (
            <BoardItemCard
              key={`${item.id}-${item.dayDate}`}
              item={item}
              compact
              draggable={canEdit}
              canToggle={canEdit}
              onOpen={() => onOpen(item.id)}
              onError={onError}
              onDragStart={onDragStart}
            />
          );
        })}
      </div>

      {canWrite && projectId ? (
        <BoardCardComposer
          boardId={board.id}
          dayDate={day}
          slot={slot}
          defaultProjectId={projectId ?? ''}
          lockProject
          size="sm"
          onError={onError}
          onCreated={onCreated}
        />
      ) : null}
    </div>
  );
}
