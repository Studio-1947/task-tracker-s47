import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  MEETING_SLOTS,
  MEETING_SLOT_LABELS,
  MOOD_LEVELS,
  MOOD_META,
  type BoardItem,
  type BoardMemberSummary,
  type BoardProgress,
  type BoardProjectSummary,
  type MeetingBoardDetail,
  type MeetingSlot,
  type MoodLevel,
  type UserRef,
} from '@task-tracker/shared';
import { useAuth } from '../stores/auth';
import { useUsers } from '../hooks/useUsers';
import {
  useCreateBoardNote,
  useDeleteBoardNote,
  useMeetingBoard,
  useMeetingWeeks,
  useReorderBoardItems,
  useSetMood,
  useUpdateBoardItem,
  useUpdateBoardNote,
  useUpdateMeetingBoard,
} from '../hooks/useMeetings';
import { apiBlob, ApiRequestError } from '../lib/api';
import { linkify } from '../lib/linkify';
import { Avatar } from '../components/Avatar';
import { AssigneePicker } from '../components/AssigneePicker';
import { TextLinkButton } from '../components/TextLinkButton';
import { BoardCardComposer } from '../components/BoardCardComposer';
import { BoardItemCard } from '../components/BoardItemCard';
import { BoardProjectChip } from '../components/BoardProjectChip';
import { MeetingItemDrawer } from '../components/MeetingItemDrawer';
import { MeetingTaskDrawer } from '../components/MeetingTaskDrawer';
import { MemberSwimlanes } from '../components/MemberSwimlanes';
import { ProgressBar } from '../components/ProgressBar';
import { ProjectLanes } from '../components/ProjectLanes';
import { Button, Card, EmptyState, ErrorState, Spinner } from '../components/ui';

/* ── date helpers (local time, matching the API's week maths) ── */
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function mondayOf(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

function shiftWeeks(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return ymd(d);
}

const weekdayShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const weekdayLong = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
const dayNum = (d: string) => new Date(`${d}T00:00:00`).getDate();
const monthDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const emptyProgress = (): BoardProgress => ({ total: 0, done: 0, inProgress: 0, pending: 0, percent: 0 });

function rollUp(items: BoardItem[]): BoardProgress {
  const p = { total: 0, done: 0, inProgress: 0, pending: 0, percent: 0 };
  for (const i of items) {
    p.total += 1;
    if (i.status === 'DONE') p.done += 1;
    else if (i.status === 'IN_PROGRESS') p.inProgress += 1;
    else p.pending += 1;
  }
  p.percent = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
  return p;
}

type Tab = 'board' | 'team' | 'notes';
/**
 * 'day' = the week split into two half-bands; 'member' = one swimlane per person;
 * 'project' = one lane per project, with unfiled work called out at the bottom.
 */
type ViewMode = 'day' | 'member' | 'project';
/** 'all' | 'none' (unfiled work) | a project id. */
type ProjectFilter = string;

export function MeetingBoardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [tab, setTab] = useState<Tab>('board');
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<{ taskId: string; workspaceId: string } | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine' | 'selected'>('all');
  const [watchedMemberIds, setWatchedMemberIds] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('tt.meetings-view') as ViewMode | null) ?? 'day',
  );
  const [mobileDay, setMobileDay] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: board, isLoading, isError } = useMeetingBoard(weekStart);
  const { data: allUsers } = useUsers(isAdmin);
  const reorder = useReorderBoardItems(weekStart);
  const updateItem = useUpdateBoardItem();

  const thisWeek = mondayOf(new Date());
  const isCurrentWeek = weekStart === thisWeek;

  // Default the mobile day picker to today when the week contains it.
  useEffect(() => {
    if (!board) return;
    const today = ymd(new Date());
    setMobileDay((prev) => (prev && board.days.includes(prev) ? prev : board.days.includes(today) ? today : board.days[0] ?? null));
  }, [board?.id, board?.days.join(',')]);

  /**
   * Two lists on purpose. `visibleItems` is the real cards and is what every
   * roll-up counts; `displayItems` adds the server's carry-forward copies of
   * still-open work, which are only ever rendered — counting them would report
   * one unfinished card as four.
   */
  const membersToWatch = useMemo<UserRef[]>(() => {
    const people = isAdmin && allUsers
      ? allUsers.filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.name, email: u.email, avatarKey: u.avatarKey }))
      : board?.members.map((m) => m.user) ?? [];
    return [...people].sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers, board?.members, isAdmin]);

  const isAssignedTo = (item: BoardItem, userId: string) =>
    item.user.id === userId || item.assignees.some((assignee) => assignee.id === userId);

  const matches = (i: BoardItem) =>
    (ownerFilter === 'all' ||
      (ownerFilter === 'mine' && Boolean(user?.id && isAssignedTo(i, user.id))) ||
      (ownerFilter === 'selected' && watchedMemberIds.some((id) => isAssignedTo(i, id)))) &&
    (projectFilter === 'all' ||
      (projectFilter === 'none' ? i.project === null : i.project?.id === projectFilter));

  const visibleItems = useMemo(
    () => (board ? board.items.filter(matches) : []),
    [board, ownerFilter, projectFilter, user?.id, watchedMemberIds],
  );

  const displayItems = useMemo(
    () => (board ? [...visibleItems, ...board.carryOver.filter(matches)] : []),
    [board, visibleItems, ownerFilter, projectFilter, user?.id, watchedMemberIds],
  );

  /**
   * Lanes for the by-project view, recomputed from the filtered cards so the
   * percentages match what's actually on screen rather than the whole week.
   */
  const projectRows = useMemo<BoardProjectSummary[]>(() => {
    const groups = new Map<string, BoardItem[]>();
    for (const i of visibleItems) {
      const key = i.project?.id ?? '';
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    return [...groups.entries()]
      .map(([key, group]) => ({
        project: key === '' ? null : (group[0]?.project ?? null),
        progress: rollUp(group),
        memberCount: new Set(group.map((i) => i.user.id)).size,
      }))
      .sort(
        (a, b) =>
          (a.project ? 0 : 1) - (b.project ? 0 : 1) ||
          b.progress.total - a.progress.total ||
          (a.project?.name ?? '').localeCompare(b.project?.name ?? ''),
      );
  }, [visibleItems]);

  /** The project new cards inherit when one is filtered — 'all'/'none' mean unfiled. */
  const composerProjectId = projectFilter === 'all' || projectFilter === 'none' ? '' : projectFilter;

  const carriedCount = displayItems.length - visibleItems.length;

  const pickView = (v: ViewMode) => {
    setViewMode(v);
    localStorage.setItem('tt.meetings-view', v);
  };

  /**
   * Rows for the swimlane overview. Admins additionally see every active member —
   * including the ones with nothing planned, which is exactly the gap they're
   * looking for. Everyone else sees only people who actually put something up.
   */
  const swimlaneRows = useMemo<BoardMemberSummary[]>(() => {
    if (!board) return [];
    const rows = [...board.members];
    if (isAdmin && allUsers) {
      const present = new Set(rows.map((m) => m.user.id));
      for (const u of allUsers) {
        if (!u.isActive || present.has(u.id)) continue;
        rows.push({
          user: { id: u.id, name: u.name, email: u.email, avatarKey: u.avatarKey },
          mood: null,
          progress: emptyProgress(),
          firstHalf: emptyProgress(),
          secondHalf: emptyProgress(),
        });
      }
    }
    const filtered = ownerFilter === 'mine'
      ? rows.filter((m) => m.user.id === user?.id)
      : ownerFilter === 'selected'
        ? rows.filter((m) => watchedMemberIds.includes(m.user.id))
        : rows;
    // People with work planned float to the top; the empty rows collect underneath.
    return filtered.sort(
      (a, b) =>
        (b.progress.total > 0 ? 1 : 0) - (a.progress.total > 0 ? 1 : 0) ||
        a.user.name.localeCompare(b.user.name),
    );
  }, [board, allUsers, isAdmin, ownerFilter, user?.id, watchedMemberIds]);

  const openItem = board?.items.find((i) => i.id === openItemId) ?? null;
  const myMood = board?.members.find((m) => m.user.id === user?.id)?.mood ?? null;
  const canWrite = Boolean(board && (isAdmin || !board.isLocked));

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong');
    }
  };

  const cellItems = (day: string, slot: MeetingSlot) =>
    displayItems
      .filter((i) => i.dayDate === day && i.slot === slot)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));

  const onDropInCell = (day: string, slot: MeetingSlot) => {
    if (!board || !dragId) return;
    const dragged = board.items.find((i) => i.id === dragId);
    setDragId(null);
    if (!dragged || (dragged.dayDate === day && dragged.slot === slot)) return;
    // Count every card in the cell, not just the filtered ones, so positions stay unique.
    const occupied = board.items.filter((i) => i.dayDate === day && i.slot === slot).length;
    void run(() =>
      reorder.mutateAsync({
        boardId: board.id,
        input: { items: [{ id: dragged.id, dayDate: day, slot, position: occupied }] },
      }),
    );
  };

  /**
   * Drop inside the swimlane grid. Landing on another person's row hands the card
   * over — an admin-only move, so members just get a no-op on their own lanes.
   */
  const onDropOnMember = (userId: string, day: string, slot: MeetingSlot) => {
    if (!board || !dragId) return;
    const dragged = board.items.find((i) => i.id === dragId);
    setDragId(null);
    if (!dragged) return;
    const sameCell = dragged.dayDate === day && dragged.slot === slot;
    if (sameCell && dragged.user.id === userId) return;
    const occupied = board.items.filter((i) => i.dayDate === day && i.slot === slot).length;

    const alreadyAssigned = isAssignedTo(dragged, userId);
    if (dragged.user.id !== userId && !alreadyAssigned) {
      if (!isAdmin) return;
      void run(() =>
        updateItem.mutateAsync({
          itemId: dragged.id,
          patch: { userId, dayDate: day, slot, position: occupied },
        }),
      );
      return;
    }
    void run(() =>
      reorder.mutateAsync({
        boardId: board.id,
        input: { items: [{ id: dragged.id, dayDate: day, slot, position: occupied }] },
      }),
    );
  };

  /**
   * Drop inside the project lanes. Landing in a different lane re-files the card,
   * which mints a fresh task in that project — the old one is left where it is,
   * with whatever history it has already collected.
   */
  const onDropOnProject = (projectId: string | null, day: string, slot: MeetingSlot) => {
    if (!board || !dragId) return;
    const dragged = board.items.find((i) => i.id === dragId);
    setDragId(null);
    if (!dragged) return;
    const from = dragged.project?.id ?? null;
    if (dragged.dayDate === day && dragged.slot === slot && from === projectId) return;
    const occupied = board.items.filter((i) => i.dayDate === day && i.slot === slot).length;
    void run(() =>
      updateItem.mutateAsync({
        itemId: dragged.id,
        patch: {
          dayDate: day,
          slot,
          position: occupied,
          ...(from !== projectId ? { projectId } : {}),
        },
      }),
    );
  };

  if (isLoading) return <Spinner />;
  if (isError || !board) return <ErrorState message="Could not load this week's board." />;

  return (
    <div className="space-y-5">
      <WeekHeader
        board={board}
        isAdmin={isAdmin}
        isCurrentWeek={isCurrentWeek}
        onPrev={() => setWeekStart((w) => shiftWeeks(w, -1))}
        onNext={() => setWeekStart((w) => shiftWeeks(w, 1))}
        onToday={() => setWeekStart(thisWeek)}
        onError={setError}
      />

      {isAdmin ? <MeetingReportDownloads /> : null}

      {error ? <ErrorState message={error} /> : null}

      <MoodCheckIn board={board} current={myMood?.mood ?? null} note={myMood?.note ?? null} canWrite={canWrite} onError={setError} />

      {/* tabs */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl bg-slate-100/70 p-1 dark:bg-[#1e1e1e]">
        {([
          { key: 'board', label: 'Board' },
          { key: 'team', label: 'Team & Progress' },
          { key: 'notes', label: `Notes${board.notes.length ? ` (${board.notes.length})` : ''}` },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? 'bg-white text-slate-800 shadow-sm dark:bg-[#2a2a2a] dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'board' ? (
        <>
          {/* filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value as 'all' | 'mine' | 'selected')}
              aria-label="Choose whose cards to watch"
              className="rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-slate-600 outline-none transition focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-slate-300"
            >
              <option value="all">Everyone</option>
              <option value="mine">Just me</option>
              <option value="selected">Selected people</option>
            </select>
            {ownerFilter === 'selected' ? (
              <div className="min-w-52">
                <AssigneePicker
                  members={membersToWatch}
                  selected={membersToWatch.filter((member) => watchedMemberIds.includes(member.id))}
                  onChange={setWatchedMemberIds}
                  emptyLabel="Choose people"
                  pluralLabel="people selected"
                />
              </div>
            ) : null}
            <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-[#2d2d2d]">
              {([
                { key: 'day', label: 'By day' },
                { key: 'member', label: 'By member' },
                { key: 'project', label: 'By project' },
              ] as { key: ViewMode; label: string }[]).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => pickView(v.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === v.key
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {/* Only projects that actually have work this week, so the list stays short. */}
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
              className="rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-slate-600 outline-none transition focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-slate-300"
            >
              <option value="all">All projects</option>
              {board.projects
                .filter((p) => p.project)
                .map((p) => (
                  <option key={p.project!.id} value={p.project!.id}>
                    {p.project!.name}
                  </option>
                ))}
              <option value="none">No project</option>
            </select>

            <span className="text-xs text-slate-400 dark:text-slate-500">
              {visibleItems.length} card{visibleItems.length === 1 ? '' : 's'} this week
              {carriedCount > 0 ? ` · ${carriedCount} carried forward` : ''}
            </span>
          </div>

          {viewMode === 'day' ? (
            <>
          {/* mobile: one day at a time */}
          <div className="lg:hidden">
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
              {board.days.map((d) => {
                const count = displayItems.filter((i) => i.dayDate === d).length;
                const active = mobileDay === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setMobileDay(d)}
                    className={`flex min-w-[4.25rem] flex-col items-center rounded-xl border px-3 py-2 transition ${
                      active
                        ? 'border-indigo-500 bg-indigo-50/60 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/25 dark:text-indigo-400'
                        : 'border-slate-200 text-slate-500 dark:border-[#2d2d2d] dark:text-slate-400'
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{weekdayShort(d)}</span>
                    <span className="text-lg font-bold leading-tight">{dayNum(d)}</span>
                    <span className="text-[10px]">{count} card{count === 1 ? '' : 's'}</span>
                  </button>
                );
              })}
            </div>

            {mobileDay ? (
              <div className="space-y-4">
                {(MEETING_SLOTS as MeetingSlot[]).map((slot) => (
                  <HalfSection key={slot} slot={slot} progress={rollUp(visibleItems.filter((i) => i.dayDate === mobileDay && i.slot === slot))}>
                    <Cell
                      board={board}
                      day={mobileDay}
                      slot={slot}
                      items={cellItems(mobileDay, slot)}
                      canWrite={canWrite}
                      currentUserId={user?.id}
                      isAdmin={isAdmin}
                      draggable={false}
                      defaultProjectId={composerProjectId}
                      onOpen={setOpenItemId}
                      onError={setError}
                      onDragStart={setDragId}
                      onDrop={onDropInCell}
                    />
                  </HalfSection>
                ))}
              </div>
            ) : null}
          </div>

          {/* desktop: the full week, split into two half-bands */}
          <div className="hidden lg:block">
            <div className="mb-2 grid grid-cols-5 gap-3">
              {board.days.map((d) => {
                const isToday = d === ymd(new Date());
                return (
                  <div key={d} className="px-1 text-center">
                    <div
                      className={`text-xs font-bold uppercase tracking-wide ${
                        isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {weekdayLong(d)}
                    </div>
                    <div className={`text-[11px] ${isToday ? 'text-indigo-500 dark:text-indigo-400/80' : 'text-slate-400 dark:text-slate-500'}`}>
                      {monthDay(d)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-4">
              {(MEETING_SLOTS as MeetingSlot[]).map((slot) => (
                <HalfSection key={slot} slot={slot} progress={rollUp(visibleItems.filter((i) => i.slot === slot))}>
                  <div className="grid grid-cols-5 gap-3">
                    {board.days.map((d) => (
                      <Cell
                        key={`${d}-${slot}`}
                        board={board}
                        day={d}
                        slot={slot}
                        items={cellItems(d, slot)}
                        canWrite={canWrite}
                        currentUserId={user?.id}
                        isAdmin={isAdmin}
                        draggable
                        defaultProjectId={composerProjectId}
                        onOpen={setOpenItemId}
                        onError={setError}
                        onDragStart={setDragId}
                        onDrop={onDropInCell}
                      />
                    ))}
                  </div>
                </HalfSection>
              ))}
            </div>
          </div>
            </>
          ) : viewMode === 'member' ? (
            <MemberSwimlanes
              board={board}
              rows={swimlaneRows}
              items={displayItems}
              isAdmin={isAdmin}
              currentUserId={user?.id}
              canWrite={canWrite}
              defaultProjectId={composerProjectId}
              onOpen={setOpenItemId}
              onError={setError}
              onDragStart={setDragId}
              onDropOnMember={onDropOnMember}
            />
          ) : (
            <ProjectLanes
              board={board}
              rows={projectRows}
              items={displayItems}
              isAdmin={isAdmin}
              currentUserId={user?.id}
              canWrite={canWrite}
              onOpen={setOpenItemId}
              onError={setError}
              onDragStart={setDragId}
              onDropOnProject={onDropOnProject}
            />
          )}
        </>
      ) : null}

      {tab === 'team' ? <TeamPanel board={board} onPickWeek={setWeekStart} /> : null}

      {tab === 'notes' ? <NotesPanel board={board} isAdmin={isAdmin} canWrite={canWrite} onError={setError} /> : null}

      {openItem ? (
        <MeetingItemDrawer
          item={openItem}
          board={board}
          members={allUsers ?? []}
          onClose={() => setOpenItemId(null)}
          onOpenTaskDetail={(taskId, workspaceId) => setOpenTask({ taskId, workspaceId })}
        />
      ) : null}
      {openTask ? (
        <MeetingTaskDrawer
          workspaceId={openTask.workspaceId}
          taskId={openTask.taskId}
          onClose={() => setOpenTask(null)}
          onOpenTask={(taskId) => setOpenTask((current) => (current ? { ...current, taskId } : null))}
        />
      ) : null}
    </div>
  );
}

function MeetingReportDownloads() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const download = async (format: 'pdf' | 'csv') => {
    setLoading(format); setError(null);
    try {
      const blob = await apiBlob(`/meeting-boards/reports/monthly.${format}?month=${month}`);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `meeting-report-${month}.${format}`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof ApiRequestError ? e.message : 'Could not download the meeting report'); } finally { setLoading(null); }
  };
  return <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-455 dark:text-slate-400">Meeting reports</div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Monthly delivery, carry-over, team, and project analysis.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-slate-500 dark:text-slate-400"><span className="mb-1 block">Report month</span><input type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white" /></label><Button disabled={!month || loading !== null} onClick={() => void download('pdf')} className="px-3 py-2 text-xs">{loading === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}</Button><Button variant="ghost" disabled={!month || loading !== null} onClick={() => void download('csv')} className="px-3 py-2 text-xs">{loading === 'csv' ? 'Preparing CSV...' : 'Download CSV'}</Button></div>{error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}</Card>;
}

/* ── week header ─────────────────────────────────────────────────────────── */

function WeekHeader({
  board,
  isAdmin,
  isCurrentWeek,
  onPrev,
  onNext,
  onToday,
  onError,
}: {
  board: MeetingBoardDetail;
  isAdmin: boolean;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onError: (m: string | null) => void;
}) {
  const updateBoard = useUpdateMeetingBoard();
  const [title, setTitle] = useState(board.title ?? '');

  useEffect(() => setTitle(board.title ?? ''), [board.id, board.title]);

  const save = (patch: Parameters<typeof updateBoard.mutateAsync>[0]['patch']) => {
    onError(null);
    updateBoard.mutateAsync({ boardId: board.id, patch }).catch((e: unknown) => {
      onError(e instanceof ApiRequestError ? e.message : 'Could not update the board');
    });
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-slate-800 dark:text-white sm:text-xl">
              {monthDay(board.weekStart)} – {monthDay(board.weekEnd)}
            </h1>
            {isCurrentWeek ? (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400">
                This week
              </span>
            ) : null}
            {board.isLocked ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-[#252525] dark:text-slate-400">
                Locked
              </span>
            ) : null}
          </div>
          {isAdmin ? (
            <input
              value={title}
              placeholder="Name this week's meeting…"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const next = title.trim();
                if (next !== (board.title ?? '')) save({ title: next === '' ? null : next });
              }}
              className="mt-1 w-full max-w-sm rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-slate-500 outline-none transition hover:border-slate-200 focus:border-indigo-500 dark:text-slate-400 dark:hover:border-[#2d2d2d]"
            />
          ) : board.title ? (
            <p className="mt-1 px-2 text-sm text-slate-500 dark:text-slate-400">{board.title}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous week"
            onClick={onPrev}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 dark:border-[#2d2d2d] dark:text-slate-400 dark:hover:bg-[#222]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <Button variant="ghost" className="px-3 py-2 text-xs" onClick={onToday} disabled={isCurrentWeek}>
            Today
          </Button>
          <button
            type="button"
            aria-label="Next week"
            onClick={onNext}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 dark:border-[#2d2d2d] dark:text-slate-400 dark:hover:bg-[#222]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          {isAdmin ? (
            <Button
              variant="ghost"
              className="px-3 py-2 text-xs"
              onClick={() => save({ isLocked: !board.isLocked })}
              title={board.isLocked ? 'Reopen the week for the team' : 'Lock the week — members can no longer edit'}
            >
              {board.isLocked ? 'Unlock' : 'Lock'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Team progress</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {board.members.length} member{board.members.length === 1 ? '' : 's'}
          </span>
        </div>
        <ProgressBar progress={board.progress} size="lg" />
      </div>
    </Card>
  );
}

/* ── mood check-in ───────────────────────────────────────────────────────── */

function MoodCheckIn({
  board,
  current,
  note,
  canWrite,
  onError,
}: {
  board: MeetingBoardDetail;
  current: MoodLevel | null;
  note: string | null;
  canWrite: boolean;
  onError: (m: string | null) => void;
}) {
  const setMood = useSetMood();
  const [draft, setDraft] = useState(note ?? '');

  useEffect(() => setDraft(note ?? ''), [board.id, note]);

  const save = (mood: MoodLevel, moodNote: string | null) => {
    onError(null);
    setMood.mutateAsync({ boardId: board.id, input: { mood, note: moodNote } }).catch((e: unknown) => {
      onError(e instanceof ApiRequestError ? e.message : 'Could not save your mood');
    });
  };

  return (
    <Card className="p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        How is your week going?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(MOOD_LEVELS as MoodLevel[]).map((m) => {
          const meta = MOOD_META[m];
          const active = current === m;
          return (
            <button
              key={m}
              type="button"
              disabled={!canWrite}
              onClick={() => save(m, draft.trim() === '' ? null : draft.trim())}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active ? 'shadow-sm' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-[#2d2d2d] dark:text-slate-400 dark:hover:bg-[#222]'
              }`}
              style={active ? { borderColor: meta.color, color: meta.color, backgroundColor: `${meta.color}14` } : undefined}
            >
              <span className="text-base leading-none">{meta.emoji}</span>
              {meta.label}
            </button>
          );
        })}
      </div>
      {current ? (
        <input
          value={draft}
          disabled={!canWrite}
          placeholder="Add a line about why (optional)"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim();
            if (next !== (note ?? '')) save(current, next === '' ? null : next);
          }}
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white dark:placeholder-slate-500"
        />
      ) : null}
    </Card>
  );
}

/* ── board pieces ────────────────────────────────────────────────────────── */

function HalfSection({
  slot,
  progress,
  children,
}: {
  slot: MeetingSlot;
  progress: BoardProgress;
  children: ReactNode;
}) {
  const accent = slot === 'FIRST' ? 'bg-indigo-500' : 'bg-violet-500';
  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3 dark:border-[#2a2a2a] dark:bg-[#161616]">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
          {MEETING_SLOT_LABELS[slot]}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {progress.done}/{progress.total} done
        </span>
        <div className="ml-auto w-full min-w-[8rem] max-w-[14rem] sm:w-auto sm:flex-1">
          <ProgressBar progress={progress} size="sm" showLabel={false} />
        </div>
      </header>
      {children}
    </section>
  );
}

function Cell({
  board,
  day,
  slot,
  items,
  canWrite,
  currentUserId,
  isAdmin,
  draggable,
  defaultProjectId,
  onOpen,
  onError,
  onDragStart,
  onDrop,
}: {
  board: MeetingBoardDetail;
  day: string;
  slot: MeetingSlot;
  items: BoardItem[];
  canWrite: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  draggable: boolean;
  defaultProjectId: string;
  onOpen: (id: string) => void;
  onError: (m: string | null) => void;
  onDragStart: (id: string | null) => void;
  onDrop: (day: string, slot: MeetingSlot) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!draggable) return;
        e.preventDefault();
        setOver(false);
        onDrop(day, slot);
      }}
      className={`flex min-h-[6.5rem] flex-col gap-2 rounded-xl border p-2 transition ${
        over
          ? 'border-indigo-400 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/20'
          : 'border-slate-200/70 bg-white dark:border-[#2a2a2a] dark:bg-[#1c1c1c]'
      }`}
    >
      {/* the weekday label is in the grid header on desktop; repeat it on mobile */}
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden dark:text-slate-500">
        {weekdayLong(day)}
      </p>

      {/* A carry-forward copy shares its card's id, so the day disambiguates the key. */}
      {items.map((item) => {
        const mayEdit = isAdmin || (item.user.id === currentUserId && !board.isLocked);
        return (
          <BoardItemCard
            key={`${item.id}-${item.dayDate}`}
            item={item}
            draggable={draggable && mayEdit}
            canToggle={mayEdit}
            onOpen={() => onOpen(item.id)}
            onError={onError}
            onDragStart={onDragStart}
          />
        );
      })}

      {canWrite ? (
        <BoardCardComposer
          boardId={board.id}
          dayDate={day}
          slot={slot}
          defaultProjectId={defaultProjectId}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

/* ── team & progress ─────────────────────────────────────────────────────── */

function TeamPanel({ board, onPickWeek }: { board: MeetingBoardDetail; onPickWeek: (w: string) => void }) {
  const { data: weeks } = useMeetingWeeks(8);

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">Where the week went</h2>
        {board.projects.length === 0 ? (
          <EmptyState
            title="No cards on the board yet"
            hint="File cards under a project and the split shows up here."
          />
        ) : (
          <ul className="space-y-3.5">
            {board.projects.map((p) => (
              <li key={p.project?.id ?? 'unfiled'}>
                <div className="flex flex-wrap items-center gap-2">
                  {p.project ? (
                    <BoardProjectChip project={p.project} />
                  ) : (
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-[#2d2d2d] dark:text-slate-400">
                      No project
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {p.progress.done}/{p.progress.total} done · {p.memberCount} member
                    {p.memberCount === 1 ? '' : 's'}
                  </span>
                  <span className="ml-auto text-sm font-bold text-slate-600 dark:text-slate-300">
                    {p.progress.percent}%
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar progress={p.progress} size="sm" showLabel={false} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">Per-member progress</h2>
        {board.members.length === 0 ? (
          <EmptyState title="Nobody has added anything yet" hint="Cards and mood check-ins will show up here." />
        ) : (
          <ul className="space-y-4">
            {board.members.map((m) => {
              const mood = m.mood ? MOOD_META[m.mood.mood] : null;
              return (
                <li key={m.user.id} className="rounded-xl border border-slate-100 p-3 dark:border-[#2a2a2a]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Avatar user={m.user} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{m.user.name}</p>
                      {m.mood && mood ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: mood.color }}>
                          <span>{mood.emoji}</span>
                          <span className="font-semibold">{mood.label}</span>
                          {m.mood.note ? (
                            <span className="truncate text-slate-400 dark:text-slate-500">— {m.mood.note}</span>
                          ) : null}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">No mood check-in yet</p>
                      )}
                    </div>
                    <span className="text-lg font-bold text-slate-700 dark:text-slate-200">{m.progress.percent}%</span>
                  </div>

                  <div className="mt-3">
                    <ProgressBar progress={m.progress} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {([
                      { label: MEETING_SLOT_LABELS.FIRST, p: m.firstHalf },
                      { label: MEETING_SLOT_LABELS.SECOND, p: m.secondHalf },
                    ] as { label: string; p: BoardProgress }[]).map((h) => (
                      <div key={h.label}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {h.label} · {h.p.done}/{h.p.total}
                        </p>
                        <ProgressBar progress={h.p} size="sm" showLabel={false} />
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Recent weeks</h2>
        {!weeks || weeks.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No history yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {weeks.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onPickWeek(w.weekStart)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-[#222] ${
                    w.weekStart === board.weekStart
                      ? 'border-indigo-300 bg-indigo-50/40 dark:border-indigo-800 dark:bg-indigo-950/20'
                      : 'border-slate-100 dark:border-[#2a2a2a]'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Week of {monthDay(w.weekStart)}
                    </span>
                    {w.title ? <span className="truncate text-xs text-slate-400 dark:text-slate-500">{w.title}</span> : null}
                    <span className="ml-auto text-xs font-semibold text-slate-500 dark:text-slate-400">{w.progress.percent}%</span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar progress={w.progress} size="sm" showLabel={false} />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                    {w.memberCount} member{w.memberCount === 1 ? '' : 's'} · {w.progress.total} cards
                    {w.isLocked ? ' · locked' : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ── notes ───────────────────────────────────────────────────────────────── */

function NotesPanel({
  board,
  isAdmin,
  canWrite,
  onError,
}: {
  board: MeetingBoardDetail;
  isAdmin: boolean;
  canWrite: boolean;
  onError: (m: string | null) => void;
}) {
  const { user } = useAuth();
  const updateBoard = useUpdateMeetingBoard();
  const createNote = useCreateBoardNote();
  const updateNote = useUpdateBoardNote();
  const deleteNote = useDeleteBoardNote();

  const [agenda, setAgenda] = useState(board.agenda ?? '');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  useEffect(() => setAgenda(board.agenda ?? ''), [board.id, board.agenda]);

  const guard = (p: Promise<unknown>) => {
    onError(null);
    p.catch((e: unknown) => onError(e instanceof ApiRequestError ? e.message : 'Something went wrong'));
  };

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <h2 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Agenda</h2>
        {isAdmin ? (
          <div>
          <textarea
            value={agenda}
            rows={4}
            placeholder="What are we covering in this week's meeting?"
            onChange={(e) => setAgenda(e.target.value)}
            onBlur={() => {
              const next = agenda.trim();
              if (next !== (board.agenda ?? '')) {
                guard(updateBoard.mutateAsync({ boardId: board.id, patch: { agenda: next === '' ? null : next } }));
              }
            }}
            className="w-full resize-y rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white dark:placeholder-slate-500"
          />
          <div className="mt-2"><TextLinkButton value={agenda} onChange={setAgenda} /></div>
          </div>
        ) : board.agenda ? (
          <p className="whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-350">{linkify(board.agenda)}</p>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">No agenda set for this week.</p>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
          Meeting notes {board.notes.length ? `(${board.notes.length})` : ''}
        </h2>

        {board.notes.length === 0 ? (
          <p className="mb-4 text-sm text-slate-400 dark:text-slate-500">
            Nothing noted yet — decisions, blockers and follow-ups go here.
          </p>
        ) : (
          <ul className="mb-4 space-y-3.5">
            {board.notes.map((n) => {
              const mine = n.author.id === user?.id;
              return (
                <li key={n.id} className="flex gap-2.5">
                  <Avatar user={n.author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{n.author.name}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{stamp(n.createdAt)}</span>
                    </div>
                    {editingId === n.id ? (
                      <div className="mt-1.5">
                        <textarea
                          value={editingBody}
                          rows={3}
                          onChange={(e) => setEditingBody(e.target.value)}
                          className="w-full resize-y rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white"
                        />
                        <div className="mt-1.5 flex gap-2">
                          <Button
                            className="px-2.5 py-1 text-xs"
                            onClick={() => {
                              const body = editingBody.trim();
                              if (body) guard(updateNote.mutateAsync({ noteId: n.id, patch: { body } }));
                              setEditingId(null);
                            }}
                          >
                            Save
                          </Button>
                          <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-350">{linkify(n.body)}</p>
                    )}
                    {(mine || isAdmin) && editingId !== n.id ? (
                      <div className="mt-1 flex gap-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                        {mine ? (
                          <button
                            type="button"
                            className="hover:text-slate-700 dark:hover:text-slate-300"
                            onClick={() => {
                              setEditingId(n.id);
                              setEditingBody(n.body);
                            }}
                          >
                            Edit
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="hover:text-red-600 dark:hover:text-red-400"
                          onClick={() => guard(deleteNote.mutateAsync({ noteId: n.id }))}
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
        )}

        {canWrite ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              value={draft}
              rows={3}
              placeholder="Add a note or comment for the team…"
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 resize-y rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-white dark:placeholder-slate-500"
            />
            <TextLinkButton value={draft} onChange={setDraft} className="self-start sm:self-end" />
            <Button
              className="self-end px-4 py-2 text-xs sm:self-stretch"
              disabled={!draft.trim() || createNote.isPending}
              onClick={() => {
                const body = draft.trim();
                if (!body) return;
                guard(createNote.mutateAsync({ boardId: board.id, input: { body } }).then(() => setDraft('')));
              }}
            >
              Post
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">This week is locked — notes are read-only.</p>
        )}
      </Card>
    </div>
  );
}
