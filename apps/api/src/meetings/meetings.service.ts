import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  BOARD_STATUS_TO_TASK_STATUS,
  Role,
  TASK_STATUS_TO_BOARD_STATUS,
  type BoardItem,
  type BoardItemStatus,
  type BoardMemberSummary,
  type BoardMood,
  type BoardNote,
  type BoardProgress,
  type BoardProjectRef,
  type BoardProjectSummary,
  type BoardTeamSummary,
  type CreateBoardItemInput,
  type CreateBoardNoteInput,
  type MeetingBoardDetail,
  type MeetingProjectOption,
  type MeetingSlot,
  type MeetingWeekSummary,
  type MoodLevel,
  type ReorderBoardItemsInput,
  type SetMoodInput,
  type TaskStatus,
  type TaskSize,
  type UpdateBoardItemInput,
  type UpdateBoardNoteInput,
  type UpdateMeetingBoardInput,
  type UserRef,
} from '@task-tracker/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import {
  meetingBoardItems,
  meetingBoardMoods,
  meetingBoardNotes,
  meetingBoards,
  projects,
  taskAssignees,
  teamMembers as orgTeamMembers,
  teams as orgTeams,
  tasks,
  users,
  workspaceMembers,
  workspaces,
  type MeetingBoardItemRow,
  type MeetingBoardMoodRow,
  type MeetingBoardNoteRow,
  type MeetingBoardRow,
  type ProjectRow,
} from '../database/schema';
import { TasksService } from '../tasks/tasks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type Actor = { id: string; role: string };

/** The live state of a card's mirror task, read back alongside the board. */
type MirrorTask = {
  id: string;
  ref: string;
  status: TaskStatus;
  title: string;
  description: string | null;
  size: TaskSize;
  assigneeIds: string[];
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Monday of the week containing `dateStr` (weeks run Mon-Sun; Sat/Sun fold back to that Monday). */
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date');
  // getDay(): 0=Sun … 6=Sat. Sunday belongs to the week that started 6 days earlier.
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return ymd(d);
}

/** The Monday `weeks` weeks either side of `weekStart`. */
function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return ymd(d);
}

/** The five working days Mon-Fri of the week starting at `weekStart`. */
export function workingDays(weekStart: string): string[] {
  const base = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return ymd(d);
  });
}

function emptyProgress(): BoardProgress {
  return { total: 0, done: 0, inProgress: 0, pending: 0, percent: 0 };
}

/** Roll up a set of cards. `percent` counts DONE only, so the number never overstates completion. */
function progressOf(items: { status: BoardItemStatus }[]): BoardProgress {
  const p = emptyProgress();
  for (const it of items) {
    p.total += 1;
    if (it.status === 'DONE') p.done += 1;
    else if (it.status === 'IN_PROGRESS') p.inProgress += 1;
    else p.pending += 1;
  }
  p.percent = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
  return p;
}

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly tasks: TasksService,
    private readonly workspaces: WorkspacesService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ── helpers ───────────────────────────────────────────────────────────── */

  private isAdmin(actor: Actor): boolean {
    return actor.role === Role.ADMIN;
  }

  private async userRefs(ids: string[]): Promise<Map<string, UserRef>> {
    const map = new Map<string, UserRef>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return map;
    const rows = await this.db
      .select({ id: users.id, name: users.name, email: users.email, avatarKey: users.avatarKey })
      .from(users)
      .where(inArray(users.id, unique));
    for (const r of rows) map.set(r.id, r);
    return map;
  }

  private refOrUnknown(map: Map<string, UserRef>, id: string): UserRef {
    return map.get(id) ?? { id, name: 'Unknown', email: '', avatarKey: null };
  }

  /** Projects referenced by a set of cards, with the workspace name for the picker label. */
  private async projectRefs(ids: (string | null)[]): Promise<Map<string, BoardProjectRef>> {
    const map = new Map<string, BoardProjectRef>();
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return map;
    const rows = await this.db
      .select({
        id: projects.id,
        workspaceId: projects.workspaceId,
        workspaceName: workspaces.name,
        name: projects.name,
        color: projects.color,
        taskPrefix: projects.taskPrefix,
      })
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(inArray(projects.id, unique));
    for (const r of rows) map.set(r.id, r);
    return map;
  }

  /** Live ref + status of the mirror tasks behind a set of cards. */
  private async mirrorTasks(ids: (string | null)[]): Promise<Map<string, MirrorTask>> {
    const map = new Map<string, MirrorTask>();
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return map;
    const rows = await this.db
      .select({
        id: tasks.id,
        number: tasks.number,
        status: tasks.status,
        title: tasks.title,
        description: tasks.description,
        size: tasks.size,
        prefix: projects.taskPrefix,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(inArray(tasks.id, unique));
    const assigneeRows = await this.db
      .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(inArray(taskAssignees.taskId, unique));
    const assigneeIds = new Map<string, string[]>();
    for (const row of assigneeRows)
      assigneeIds.set(row.taskId, [...(assigneeIds.get(row.taskId) ?? []), row.userId]);
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        ref: `${r.prefix}-${r.number}`,
        status: r.status as TaskStatus,
        title: r.title,
        description: r.description,
        size: r.size as TaskSize,
        assigneeIds: assigneeIds.get(r.id) ?? [],
      });
    }
    return map;
  }

  private toItem(
    row: MeetingBoardItemRow,
    refs: Map<string, UserRef>,
    commentCount: number,
    projectRefs: Map<string, BoardProjectRef> = new Map(),
    mirrors: Map<string, MirrorTask> = new Map(),
  ): BoardItem {
    const mirror = row.taskId ? mirrors.get(row.taskId) : undefined;
    return {
      id: row.id,
      boardId: row.boardId,
      user: this.refOrUnknown(refs, row.userId),
      assignees: mirror?.assigneeIds.map((id) => this.refOrUnknown(refs, id)) ?? [],
      dayDate: row.dayDate,
      slot: row.slot as MeetingSlot,
      title: row.title,
      note: row.note,
      status: row.status as BoardItemStatus,
      position: row.position,
      project: row.projectId ? (projectRefs.get(row.projectId) ?? null) : null,
      taskId: row.taskId,
      taskRef: mirror?.ref ?? null,
      size: mirror?.size ?? null,
      // Only the synthetic clones in `carryOver` ever carry a source day.
      carriedFrom: null,
      rolledOver: row.rolledOver,
      commentCount,
      createdBy: row.createdById ? this.refOrUnknown(refs, row.createdById) : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toNote(row: MeetingBoardNoteRow, refs: Map<string, UserRef>): BoardNote {
    return {
      id: row.id,
      boardId: row.boardId,
      itemId: row.itemId,
      kind: row.kind === 'BRIEFING' ? 'BRIEFING' : 'NOTE',
      author: this.refOrUnknown(refs, row.authorId),
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toMood(row: MeetingBoardMoodRow, refs: Map<string, UserRef>): BoardMood {
    return {
      user: this.refOrUnknown(refs, row.userId),
      mood: row.mood as MoodLevel,
      note: row.note,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async loadBoardOrThrow(boardId: string): Promise<MeetingBoardRow> {
    const [row] = await this.db
      .select()
      .from(meetingBoards)
      .where(eq(meetingBoards.id, boardId))
      .limit(1);
    if (!row) throw new NotFoundException('Meeting board not found');
    return row;
  }

  /**
   * Members may only touch their own content, and only while the week is open.
   * Admins bypass both rules (they run the meeting and clean up after it).
   */
  private assertCanMutate(actor: Actor, board: MeetingBoardRow, ownerId: string): void {
    if (this.isAdmin(actor)) return;
    if (board.isLocked) throw new ForbiddenException('This week is locked');
    if (ownerId !== actor.id) throw new ForbiddenException('You can only change your own entries');
  }

  private assertDayInWeek(board: MeetingBoardRow, dayDate: string): void {
    if (!workingDays(board.weekStart).includes(dayDate)) {
      throw new BadRequestException('Day must be a working day (Mon-Fri) inside this week');
    }
  }

  /** Next free position within a cell, so new cards land at the bottom. */
  private async nextPosition(boardId: string, dayDate: string, slot: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${meetingBoardItems.position})` })
      .from(meetingBoardItems)
      .where(
        and(
          eq(meetingBoardItems.boardId, boardId),
          eq(meetingBoardItems.dayDate, dayDate),
          eq(meetingBoardItems.slot, slot),
        ),
      );
    return (row?.max ?? -1) + 1;
  }

  /* ── boards ────────────────────────────────────────────────────────────── */

  /**
   * Fetch (or lazily create) the board for the week containing `dateStr`.
   * Creation is idempotent — a unique index on week_start makes the race safe.
   */
  async getOrCreateBoard(actor: Actor, dateStr?: string): Promise<MeetingBoardDetail> {
    const weekStart = mondayOf(dateStr ?? ymd(new Date()));

    let [board] = await this.db
      .select()
      .from(meetingBoards)
      .where(eq(meetingBoards.weekStart, weekStart))
      .limit(1);

    if (!board) {
      const [created] = await this.db
        .insert(meetingBoards)
        .values({ weekStart, createdById: actor.id })
        .onConflictDoNothing({ target: meetingBoards.weekStart })
        .returning();
      // Exactly one caller wins the insert, so the roll-over below runs once.
      if (created) await this.rollOverUnfinished(created);
      board =
        created ??
        (
          await this.db
            .select()
            .from(meetingBoards)
            .where(eq(meetingBoards.weekStart, weekStart))
            .limit(1)
        )[0];
    }
    if (!board) throw new NotFoundException('Meeting board not found');

    return this.buildDetail(board);
  }

  /**
   * Seed a freshly created board with whatever was still open on last week's,
   * landed on the Monday in the same half of the day. Restricted to the *current*
   * week: browsing forward shouldn't pre-fill a week that hasn't started, and
   * opening some week from months ago shouldn't retro-fit history.
   */
  private async rollOverUnfinished(board: MeetingBoardRow): Promise<void> {
    if (board.weekStart !== mondayOf(ymd(new Date()))) return;

    const [previous] = await this.db
      .select({ id: meetingBoards.id })
      .from(meetingBoards)
      .where(eq(meetingBoards.weekStart, shiftWeek(board.weekStart, -1)))
      .limit(1);
    if (!previous) return;

    const open = await this.db
      .select()
      .from(meetingBoardItems)
      .where(and(eq(meetingBoardItems.boardId, previous.id), ne(meetingBoardItems.status, 'DONE')))
      .orderBy(asc(meetingBoardItems.dayDate), asc(meetingBoardItems.position));
    if (open.length === 0) return;

    // Positions restart per half, since every rolled card lands on the Monday.
    const nextPos: Record<string, number> = { FIRST: 0, SECOND: 0 };
    await this.db.insert(meetingBoardItems).values(
      open.map((row) => ({
        boardId: board.id,
        userId: row.userId,
        dayDate: board.weekStart,
        slot: row.slot,
        title: row.title,
        note: row.note,
        status: row.status,
        position: nextPos[row.slot]++,
        projectId: row.projectId,
        // The mirror task carries on too — it is the same piece of work.
        taskId: row.taskId,
        rolledOver: true,
        createdById: row.createdById,
      })),
    );
  }

  /**
   * Clone every still-open card onto each later working day, up to today. The
   * clones are read-only stand-ins sharing the stored card's id, so ticking one
   * off updates the single underlying card and it drops off every day at once.
   */
  private carryOverFor(items: BoardItem[], days: string[]): BoardItem[] {
    const today = ymd(new Date());
    const first = days[0];
    const last = days[days.length - 1];
    if (!first || !last || today < first) return [];
    // A week in the past has fully elapsed, so unfinished work trails to Friday.
    const horizon = today < last ? today : last;

    const out: BoardItem[] = [];
    for (const item of items) {
      if (item.status === 'DONE') continue;
      for (const day of days) {
        if (day <= item.dayDate || day > horizon) continue;
        out.push({ ...item, dayDate: day, carriedFrom: item.dayDate });
      }
    }
    return out;
  }

  /**
   * Pull each mirrored card back in line with its task. Someone moving a task on
   * the workspace board is the same event as ticking the card, so the board
   * shows it without anybody re-entering it here. Only the card is written —
   * IN_REVIEW folds to IN_PROGRESS on the card and the task keeps its own state.
   */
  private async reconcileWithMirrors(
    rows: MeetingBoardItemRow[],
    mirrors: Map<string, MirrorTask>,
  ): Promise<MeetingBoardItemRow[]> {
    const drifted = rows.filter((row) => {
      const mirror = row.taskId ? mirrors.get(row.taskId) : undefined;
      return (
        mirror &&
        (TASK_STATUS_TO_BOARD_STATUS[mirror.status] !== row.status ||
          mirror.title !== row.title ||
          mirror.description !== row.note)
      );
    });
    if (drifted.length === 0) return rows;

    const now = new Date();
    const patched = new Map<string, MeetingBoardItemRow>();
    await this.db.transaction(async (tx) => {
      for (const row of drifted) {
        const mirror = mirrors.get(row.taskId as string)!;
        const status = TASK_STATUS_TO_BOARD_STATUS[mirror.status];
        const completedAt = status === 'DONE' ? (row.completedAt ?? now) : null;
        await tx
          .update(meetingBoardItems)
          .set({
            status,
            title: mirror.title,
            note: mirror.description,
            completedAt,
            updatedAt: now,
          })
          .where(eq(meetingBoardItems.id, row.id));
        patched.set(row.id, {
          ...row,
          status,
          title: mirror.title,
          note: mirror.description,
          completedAt,
          updatedAt: now,
        });
      }
    });
    return rows.map((row) => patched.get(row.id) ?? row);
  }

  private async buildDetail(board: MeetingBoardRow): Promise<MeetingBoardDetail> {
    const [rawItemRows, noteRows, moodRows] = await Promise.all([
      this.db
        .select()
        .from(meetingBoardItems)
        .where(eq(meetingBoardItems.boardId, board.id))
        .orderBy(
          asc(meetingBoardItems.dayDate),
          asc(meetingBoardItems.position),
          asc(meetingBoardItems.createdAt),
        ),
      this.db
        .select()
        .from(meetingBoardNotes)
        .where(and(eq(meetingBoardNotes.boardId, board.id), isNull(meetingBoardNotes.itemId)))
        .orderBy(asc(meetingBoardNotes.createdAt)),
      this.db.select().from(meetingBoardMoods).where(eq(meetingBoardMoods.boardId, board.id)),
    ]);

    // Whatever moved on the workspace board since the last read wins on the card.
    const mirrors = await this.mirrorTasks(rawItemRows.map((i) => i.taskId));
    const itemRows = await this.reconcileWithMirrors(rawItemRows, mirrors);

    // Comment counts for every card in one grouped query rather than N of them.
    const countRows = itemRows.length
      ? await this.db
          .select({ itemId: meetingBoardNotes.itemId, count: sql<number>`count(*)::int` })
          .from(meetingBoardNotes)
          .where(
            and(
              eq(meetingBoardNotes.boardId, board.id),
              inArray(
                meetingBoardNotes.itemId,
                itemRows.map((i) => i.id),
              ),
            ),
          )
          .groupBy(meetingBoardNotes.itemId)
      : [];
    const counts = new Map<string, number>();
    for (const c of countRows) if (c.itemId) counts.set(c.itemId, c.count);

    const [refs, projectRefs] = await Promise.all([
      this.userRefs([
        ...itemRows.flatMap((i) => [i.userId, i.createdById ?? '']),
        ...noteRows.map((n) => n.authorId),
        ...moodRows.map((m) => m.userId),
        ...[...mirrors.values()].flatMap((mirror) => mirror.assigneeIds),
      ]),
      this.projectRefs(itemRows.map((i) => i.projectId)),
    ]);

    const items = itemRows.map((r) =>
      this.toItem(r, refs, counts.get(r.id) ?? 0, projectRefs, mirrors),
    );
    const notes = noteRows.map((r) => this.toNote(r, refs));
    const moodByUser = new Map(moodRows.map((m) => [m.userId, this.toMood(m, refs)]));

    // A member shows up on the board if they own or are assigned to a card, or
    // checked in a mood. A tagged card contributes to each assignee's personal
    // planning lane while remaining a single card in the team-wide totals.
    const memberIds = [
      ...new Set([
        ...items.flatMap((item) => [
          item.user.id,
          ...item.assignees.map((assignee) => assignee.id),
        ]),
        ...moodRows.map((m) => m.userId),
      ]),
    ];
    const members: BoardMemberSummary[] = memberIds
      .map((uid) => {
        const mine = items.filter(
          (item) => item.user.id === uid || item.assignees.some((assignee) => assignee.id === uid),
        );
        return {
          user: this.refOrUnknown(refs, uid),
          mood: moodByUser.get(uid) ?? null,
          progress: progressOf(mine),
          firstHalf: progressOf(mine.filter((i) => i.slot === 'FIRST')),
          secondHalf: progressOf(mine.filter((i) => i.slot === 'SECOND')),
        };
      })
      .sort((a, b) => a.user.name.localeCompare(b.user.name));

    // One row per project that has work this week, busiest first, unfiled last.
    const byProject = new Map<string, BoardItem[]>();
    for (const item of items) {
      const key = item.project?.id ?? '';
      byProject.set(key, [...(byProject.get(key) ?? []), item]);
    }
    const projectSummaries: BoardProjectSummary[] = [...byProject.entries()]
      .map(([key, group]) => ({
        project: key === '' ? null : (group[0]?.project ?? null),
        progress: progressOf(group),
        memberCount: new Set(
          group.flatMap((item) => [item.user.id, ...item.assignees.map((assignee) => assignee.id)]),
        ).size,
      }))
      .sort(
        (a, b) =>
          (a.project ? 0 : 1) - (b.project ? 0 : 1) ||
          b.progress.total - a.progress.total ||
          (a.project?.name ?? '').localeCompare(b.project?.name ?? ''),
      );

    const teamSummaries = await this.teamSummaries(items, memberIds);

    const days = workingDays(board.weekStart);
    return {
      id: board.id,
      weekStart: board.weekStart,
      weekEnd: days[days.length - 1] as string,
      days,
      title: board.title,
      agenda: board.agenda,
      isLocked: board.isLocked,
      items,
      carryOver: this.carryOverFor(items, days),
      notes,
      members,
      projects: projectSummaries,
      teams: teamSummaries,
      progress: progressOf(items),
      createdAt: board.createdAt.toISOString(),
    };
  }

  /**
   * Roll the week's cards up per organisation team. Membership is the team's members plus its manager, active people
   * only. A card counts once per team that owns or is tagged on it.
   */
  private async teamSummaries(
    items: BoardItem[],
    boardMemberIds: string[],
  ): Promise<BoardTeamSummary[]> {
    const [teamRows, links, active] = await Promise.all([
      this.db
        .select({ id: orgTeams.id, name: orgTeams.name, managerId: orgTeams.managerId })
        .from(orgTeams)
        .where(eq(orgTeams.isArchived, false)),
      this.db
        .select({ teamId: orgTeamMembers.teamId, userId: orgTeamMembers.userId })
        .from(orgTeamMembers),
      this.db.select({ id: users.id }).from(users).where(eq(users.isActive, true)),
    ]);
    const activeIds = new Set(active.map((u) => u.id));
    const peopleOf = new Map<string, Set<string>>();
    for (const t of teamRows) {
      const set = new Set(
        links.filter((l) => l.teamId === t.id && activeIds.has(l.userId)).map((l) => l.userId),
      );
      if (t.managerId && activeIds.has(t.managerId)) set.add(t.managerId);
      peopleOf.set(t.id, set);
    }
    const touches = (item: BoardItem, people: Set<string>) =>
      people.has(item.user.id) || item.assignees.some((a) => people.has(a.id));
    const withCards = new Set(boardMemberIds);

    const out: BoardTeamSummary[] = teamRows
      .filter((t) => (peopleOf.get(t.id)?.size ?? 0) > 0)
      .map((t) => {
        const people = peopleOf.get(t.id)!;
        const mine = items.filter((i) => touches(i, people));
        const active = [...people].filter((id) =>
          items.some((i) => i.user.id === id || i.assignees.some((a) => a.id === id)),
        );
        return {
          team: { id: t.id, name: t.name },
          managerId: t.managerId && activeIds.has(t.managerId) ? t.managerId : null,
          peopleCount: people.size,
          memberIds: active,
          idleCount: people.size - active.length,
          progress: progressOf(mine),
        };
      })
      .sort((a, b) => (a.team?.name ?? '').localeCompare(b.team?.name ?? ''));

    // People who have cards but sit in no team.
    const inSomeTeam = new Set([...peopleOf.values()].flatMap((s) => [...s]));
    const loose = [...withCards].filter(
      (id) =>
        !inSomeTeam.has(id) &&
        items.some((i) => i.user.id === id || i.assignees.some((a) => a.id === id)),
    );
    if (loose.length) {
      const looseSet = new Set(loose);
      out.push({
        team: null,
        managerId: null,
        peopleCount: loose.length,
        memberIds: loose,
        idleCount: 0,
        progress: progressOf(items.filter((i) => touches(i, looseSet))),
      });
    }
    return out;
  }

  /**
   * Recent weeks for the switcher / admin history, newest first.
   *
   * Boards are created just by opening a week, so paging forward through empty
   * weeks would otherwise litter the history with 0% rows. Only weeks somebody
   * actually put something into — a card, a mood, a note, a title or an agenda —
   * are returned.
   */
  async listWeeks(limit = 12): Promise<MeetingWeekSummary[]> {
    const capped = Math.min(Math.max(limit, 1), 52);
    // Over-fetch, because the empty weeks are filtered out below.
    const boards = await this.db
      .select()
      .from(meetingBoards)
      .orderBy(desc(meetingBoards.weekStart))
      .limit(capped * 4);
    if (boards.length === 0) return [];

    const ids = boards.map((b) => b.id);
    const [rows, moodRows, noteRows] = await Promise.all([
      this.db
        .select({
          boardId: meetingBoardItems.boardId,
          status: meetingBoardItems.status,
          userId: meetingBoardItems.userId,
        })
        .from(meetingBoardItems)
        .where(inArray(meetingBoardItems.boardId, ids)),
      this.db
        .select({ boardId: meetingBoardMoods.boardId, userId: meetingBoardMoods.userId })
        .from(meetingBoardMoods)
        .where(inArray(meetingBoardMoods.boardId, ids)),
      this.db
        .select({ boardId: meetingBoardNotes.boardId })
        .from(meetingBoardNotes)
        .where(inArray(meetingBoardNotes.boardId, ids)),
    ]);

    return boards
      .map((b) => {
        const mine = rows.filter((r) => r.boardId === b.id);
        const moods = moodRows.filter((m) => m.boardId === b.id);
        const hasContent =
          mine.length > 0 ||
          moods.length > 0 ||
          noteRows.some((n) => n.boardId === b.id) ||
          Boolean(b.title) ||
          Boolean(b.agenda);
        if (!hasContent) return null;
        return {
          id: b.id,
          weekStart: b.weekStart,
          title: b.title,
          isLocked: b.isLocked,
          progress: progressOf(mine.map((r) => ({ status: r.status as BoardItemStatus }))),
          // Anyone with a card OR a mood check-in counts as taking part that week.
          memberCount: new Set([...mine.map((r) => r.userId), ...moods.map((m) => m.userId)]).size,
        };
      })
      .filter((w): w is MeetingWeekSummary => w !== null)
      .slice(0, capped);
  }

  /** Admin-only: rename the week, edit the agenda, or lock it once the meeting is over. */
  async updateBoard(boardId: string, input: UpdateMeetingBoardInput): Promise<MeetingBoardDetail> {
    const board = await this.loadBoardOrThrow(boardId);
    const [updated] = await this.db
      .update(meetingBoards)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.agenda !== undefined ? { agenda: input.agenda } : {}),
        ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
        updatedAt: new Date(),
      })
      .where(eq(meetingBoards.id, board.id))
      .returning();
    return this.buildDetail(updated ?? board);
  }

  /* ── projects & their mirror tasks ─────────────────────────────────────── */

  /**
   * Every project the caller may file a card under, ready for the picker. Access
   * mirrors the rest of the app: admins see everything, members see the projects
   * of the workspaces they belong to. Archived rows are left out — you shouldn't
   * be able to open new work against something that has been retired.
   */
  async listProjectOptions(actor: Actor): Promise<MeetingProjectOption[]> {
    const columns = {
      id: projects.id,
      name: projects.name,
      color: projects.color,
      taskPrefix: projects.taskPrefix,
      workspaceId: projects.workspaceId,
      workspaceName: workspaces.name,
    };
    const visible = and(eq(projects.isArchived, false), eq(workspaces.isArchived, false));

    if (this.isAdmin(actor)) {
      return this.db
        .select(columns)
        .from(projects)
        .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
        .where(visible)
        .orderBy(asc(workspaces.name), asc(projects.name));
    }
    return this.db
      .select(columns)
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, projects.workspaceId),
          eq(workspaceMembers.userId, actor.id),
        ),
      )
      .where(visible)
      .orderBy(asc(workspaces.name), asc(projects.name));
  }

  /** Throws unless `projectId` exists and the actor can reach its workspace. */
  private async loadProjectForActor(projectId: string, actor: Actor): Promise<ProjectRow> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw new NotFoundException('Project not found');
    await this.workspaces.assertCanAccess(project.workspaceId, actor);
    return project;
  }

  /**
   * Create the workspace task that mirrors a card. The owner is assigned only
   * when they are actually a member of that workspace — filing a card for someone
   * outside it still belongs on the board, it just can't name them on the task.
   */
  private async createMirrorTask(
    actor: Actor,
    project: ProjectRow,
    card: {
      title: string;
      note: string | null;
      status: BoardItemStatus;
      userId: string;
      assigneeIds?: string[];
      dueDate?: string;
      size?: import('@task-tracker/shared').TaskSize;
    },
  ): Promise<string> {
    const requested = [...new Set(card.assigneeIds ?? [card.userId])];
    const allowed = await Promise.all(
      requested.map((id) => this.workspaces.isMember(project.workspaceId, id)),
    );
    if (allowed.some((member) => !member))
      throw new BadRequestException(
        'Tagged people must be members of the selected project workspace',
      );
    const task = await this.tasks.create(project.workspaceId, actor, {
      projectId: project.id,
      title: card.title,
      size: card.size ?? 'SMALL',
      ...(card.dueDate ? { dueDate: card.dueDate } : {}),
      ...(card.note ? { description: card.note } : {}),
      status: BOARD_STATUS_TO_TASK_STATUS[card.status],
      ...(requested.length ? { assigneeIds: requested } : {}),
    });
    return task.id;
  }

  /**
   * Push a card's edits onto its mirror task. Best-effort by design: the board is
   * the surface the team is standing in front of, so a hiccup syncing the task
   * must not fail their edit. The next board read reconciles whatever drifted.
   */
  private async syncMirrorTask(
    actor: Actor,
    taskId: string,
    workspaceId: string,
    patch: {
      title?: string;
      note?: string | null;
      status?: BoardItemStatus;
      userId?: string;
      assigneeIds?: string[];
    },
  ): Promise<void> {
    const requested =
      patch.assigneeIds ?? (patch.userId === undefined ? undefined : [patch.userId]);
    if (requested) {
      const allowed = await Promise.all(
        [...new Set(requested)].map((id) => this.workspaces.isMember(workspaceId, id)),
      );
      if (allowed.some((member) => !member))
        throw new BadRequestException(
          'Tagged people must be members of the selected project workspace',
        );
    }
    const body = {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.note !== undefined ? { description: patch.note } : {}),
      ...(patch.status !== undefined ? { status: BOARD_STATUS_TO_TASK_STATUS[patch.status] } : {}),
      ...(requested !== undefined ? { assigneeIds: [...new Set(requested)] } : {}),
    };
    if (Object.keys(body).length === 0) return;
    try {
      await this.tasks.update(taskId, actor, body);
    } catch (err) {
      this.logger.warn(
        `Could not sync meeting card onto task ${taskId}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  }

  /* ── cards ─────────────────────────────────────────────────────────────── */

  async createItem(actor: Actor, boardId: string, input: CreateBoardItemInput): Promise<BoardItem> {
    const board = await this.loadBoardOrThrow(boardId);
    const ownerId = input.userId ?? actor.id;
    this.assertCanMutate(actor, board, ownerId);
    this.assertDayInWeek(board, input.dayDate);

    if (ownerId !== actor.id) {
      const [owner] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, ownerId))
        .limit(1);
      if (!owner) throw new NotFoundException('User not found');
    }

    // Resolved before anything is written, so a project the caller can't reach is
    // rejected outright instead of leaving an unmirrored card behind.
    const project = input.projectId ? await this.loadProjectForActor(input.projectId, actor) : null;

    const position = await this.nextPosition(board.id, input.dayDate, input.slot);
    const status = (input.status ?? 'PENDING') as BoardItemStatus;
    const [inserted] = await this.db
      .insert(meetingBoardItems)
      .values({
        boardId: board.id,
        userId: ownerId,
        dayDate: input.dayDate,
        slot: input.slot,
        title: input.title,
        note: input.note ?? null,
        status,
        position,
        projectId: project?.id ?? null,
        createdById: actor.id,
        completedAt: status === 'DONE' ? new Date() : null,
      })
      .returning();
    if (!inserted) throw new NotFoundException('Could not create card');

    let row = inserted;
    if (project) {
      try {
        const taskId = await this.createMirrorTask(actor, project, {
          title: row.title,
          note: row.note,
          status,
          userId: ownerId,
          assigneeIds: input.assigneeIds,
          dueDate: input.dueDate,
          size: input.size,
        });
        const [linked] = await this.db
          .update(meetingBoardItems)
          .set({ taskId })
          .where(eq(meetingBoardItems.id, row.id))
          .returning();
        if (linked) row = linked;
      } catch (err) {
        // A card filed under a project exists to carry that task, so undo it
        // rather than leave a half-filed card for somebody to spot by hand.
        await this.db.delete(meetingBoardItems).where(eq(meetingBoardItems.id, row.id));
        throw err;
      }
    }

    const mirrors = await this.mirrorTasks([row.taskId]);
    const [refs, projectRefs] = await Promise.all([
      this.userRefs([
        row.userId,
        row.createdById ?? '',
        ...[...mirrors.values()].flatMap((mirror) => mirror.assigneeIds),
      ]),
      this.projectRefs([row.projectId]),
    ]);
    return this.toItem(row, refs, 0, projectRefs, mirrors);
  }

  private async loadItemOrThrow(
    itemId: string,
  ): Promise<{ item: MeetingBoardItemRow; board: MeetingBoardRow }> {
    const [row] = await this.db
      .select()
      .from(meetingBoardItems)
      .where(eq(meetingBoardItems.id, itemId))
      .limit(1);
    if (!row) throw new NotFoundException('Card not found');
    return { item: row, board: await this.loadBoardOrThrow(row.boardId) };
  }

  async updateItem(actor: Actor, itemId: string, input: UpdateBoardItemInput): Promise<BoardItem> {
    const { item, board } = await this.loadItemOrThrow(itemId);
    this.assertCanMutate(actor, board, item.userId);
    if (input.dayDate) this.assertDayInWeek(board, input.dayDate);
    // Handing a card to somebody else is an admin action.
    if (input.userId && input.userId !== item.userId && !this.isAdmin(actor)) {
      throw new ForbiddenException('Only an admin can reassign a card');
    }

    const nextStatus = (input.status ?? item.status) as BoardItemStatus;
    const becameDone = nextStatus === 'DONE' && item.status !== 'DONE';
    const leftDone = nextStatus !== 'DONE' && item.status === 'DONE';

    // Re-filing the card. A task can't change project once numbered, so moving to
    // a different project mints a fresh mirror and leaves the old task standing —
    // it already has its own comments and history in that workspace.
    const refiling = input.projectId !== undefined && input.projectId !== item.projectId;
    const nextProject =
      refiling && input.projectId ? await this.loadProjectForActor(input.projectId, actor) : null;
    let taskId = refiling ? null : item.taskId;
    if (nextProject) {
      taskId = await this.createMirrorTask(actor, nextProject, {
        title: input.title ?? item.title,
        note: input.note !== undefined ? input.note : item.note,
        status: nextStatus,
        userId: input.userId ?? item.userId,
        assigneeIds: input.assigneeIds,
      });
    }

    const [row] = await this.db
      .update(meetingBoardItems)
      .set({
        ...(input.userId !== undefined ? { userId: input.userId } : {}),
        ...(input.dayDate !== undefined ? { dayDate: input.dayDate } : {}),
        ...(input.slot !== undefined ? { slot: input.slot } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(refiling ? { projectId: input.projectId ?? null, taskId } : {}),
        ...(becameDone ? { completedAt: new Date() } : {}),
        ...(leftDone ? { completedAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(meetingBoardItems.id, itemId))
      .returning();
    if (!row) throw new NotFoundException('Card not found');

    // Carry the edit onto the mirror task the card already had. A brand-new
    // mirror was minted from the same values above, so it needs no second pass.
    if (!refiling && row.taskId && row.projectId) {
      const [project] = await this.db
        .select({ workspaceId: projects.workspaceId })
        .from(projects)
        .where(eq(projects.id, row.projectId))
        .limit(1);
      if (project) {
        await this.syncMirrorTask(actor, row.taskId, project.workspaceId, {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.status !== undefined ? { status: input.status as BoardItemStatus } : {}),
          ...(input.userId !== undefined ? { userId: input.userId } : {}),
          ...(input.assigneeIds !== undefined ? { assigneeIds: input.assigneeIds } : {}),
        });
      }
    }

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(meetingBoardNotes)
      .where(eq(meetingBoardNotes.itemId, itemId));
    const mirrors = await this.mirrorTasks([row.taskId]);
    const [refs, projectRefs] = await Promise.all([
      this.userRefs([
        row.userId,
        row.createdById ?? '',
        ...[...mirrors.values()].flatMap((mirror) => mirror.assigneeIds),
      ]),
      this.projectRefs([row.projectId]),
    ]);
    return this.toItem(row, refs, countRow?.count ?? 0, projectRefs, mirrors);
  }

  /**
   * Removes the card from the week. Any mirror task is deliberately left alone —
   * it lives in the workspace with its own comments and audit trail, and taking a
   * line off this week's board is not a decision to delete the work.
   */
  async deleteItem(actor: Actor, itemId: string): Promise<{ id: string }> {
    const { item, board } = await this.loadItemOrThrow(itemId);
    if (!this.isAdmin(actor)) {
      if (board.isLocked) throw new ForbiddenException('This week is locked');
      if (item.createdById !== actor.id) {
        throw new ForbiddenException('Only the card creator can remove this card');
      }
    }
    await this.db.delete(meetingBoardItems).where(eq(meetingBoardItems.id, itemId));
    return { id: itemId };
  }

  /** Applies a whole drag-and-drop result in one transaction. */
  async reorderItems(
    actor: Actor,
    boardId: string,
    input: ReorderBoardItemsInput,
  ): Promise<MeetingBoardDetail> {
    const board = await this.loadBoardOrThrow(boardId);
    const ids = input.items.map((i) => i.id);
    const rows = await this.db
      .select()
      .from(meetingBoardItems)
      .where(and(eq(meetingBoardItems.boardId, board.id), inArray(meetingBoardItems.id, ids)));
    if (rows.length !== ids.length) throw new NotFoundException('Some cards are not on this board');

    for (const row of rows) this.assertCanMutate(actor, board, row.userId);
    for (const move of input.items) this.assertDayInWeek(board, move.dayDate);

    await this.db.transaction(async (tx) => {
      for (const move of input.items) {
        await tx
          .update(meetingBoardItems)
          .set({
            dayDate: move.dayDate,
            slot: move.slot,
            position: move.position,
            updatedAt: new Date(),
          })
          .where(eq(meetingBoardItems.id, move.id));
      }
    });

    return this.buildDetail(board);
  }

  /* ── mood check-in ─────────────────────────────────────────────────────── */

  /** Upsert the caller's mood for the week. One row per member per board. */
  async setMood(actor: Actor, boardId: string, input: SetMoodInput): Promise<BoardMood> {
    const board = await this.loadBoardOrThrow(boardId);
    this.assertCanMutate(actor, board, actor.id);

    const [row] = await this.db
      .insert(meetingBoardMoods)
      .values({ boardId: board.id, userId: actor.id, mood: input.mood, note: input.note ?? null })
      .onConflictDoUpdate({
        target: [meetingBoardMoods.boardId, meetingBoardMoods.userId],
        set: { mood: input.mood, note: input.note ?? null, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw new NotFoundException('Could not save mood');

    const refs = await this.userRefs([row.userId]);
    return this.toMood(row, refs);
  }

  /* ── notes & comments ──────────────────────────────────────────────────── */

  /** Comments on one card, oldest first. */
  async listItemNotes(itemId: string): Promise<BoardNote[]> {
    const rows = await this.db
      .select()
      .from(meetingBoardNotes)
      .where(eq(meetingBoardNotes.itemId, itemId))
      .orderBy(asc(meetingBoardNotes.createdAt));
    const refs = await this.userRefs(rows.map((r) => r.authorId));
    return rows.map((r) => this.toNote(r, refs));
  }

  async createNote(actor: Actor, boardId: string, input: CreateBoardNoteInput): Promise<BoardNote> {
    const board = await this.loadBoardOrThrow(boardId);
    // Anyone on the team may comment; a locked week is closed to all but admins.
    if (!this.isAdmin(actor) && board.isLocked) throw new ForbiddenException('This week is locked');

    if (input.itemId) {
      const [item] = await this.db
        .select({ id: meetingBoardItems.id, boardId: meetingBoardItems.boardId })
        .from(meetingBoardItems)
        .where(eq(meetingBoardItems.id, input.itemId))
        .limit(1);
      if (!item || item.boardId !== board.id) {
        throw new NotFoundException('Card not found on this board');
      }
    }

    const [row] = await this.db
      .insert(meetingBoardNotes)
      .values({
        boardId: board.id,
        itemId: input.itemId ?? null,
        authorId: actor.id,
        // Card discussion is always a note; briefings only belong to the week.
        kind: input.itemId ? 'NOTE' : (input.kind ?? 'NOTE'),
        body: input.body,
      })
      .returning();
    if (!row) throw new NotFoundException('Could not save note');

    const refs = await this.userRefs([row.authorId]);
    if (input.mentionIds && input.mentionIds.length > 0) {
      for (const targetId of input.mentionIds) {
        await this.notifications
          .createNotification(
            targetId,
            actor.id,
            'TASK_COMMENT',
            'Mention in meeting notes',
            `${refs.get(actor.id)?.name ?? 'Someone'} mentioned you in a meeting note.`,
            { boardId: board.id, itemId: input.itemId },
          )
          .catch((err) => this.logger.warn(`Could not notify user ${targetId}: ${err}`));
      }
    }

    return this.toNote(row, refs);
  }

  private async loadNoteOrThrow(noteId: string): Promise<MeetingBoardNoteRow> {
    const [row] = await this.db
      .select()
      .from(meetingBoardNotes)
      .where(eq(meetingBoardNotes.id, noteId))
      .limit(1);
    if (!row) throw new NotFoundException('Note not found');
    return row;
  }

  /** Only the author may edit their own words — admins can delete but not rewrite. */
  async updateNote(actor: Actor, noteId: string, input: UpdateBoardNoteInput): Promise<BoardNote> {
    const note = await this.loadNoteOrThrow(noteId);
    if (note.authorId !== actor.id)
      throw new ForbiddenException('You can only edit your own notes');

    const [row] = await this.db
      .update(meetingBoardNotes)
      .set({ body: input.body, updatedAt: new Date() })
      .where(eq(meetingBoardNotes.id, noteId))
      .returning();
    if (!row) throw new NotFoundException('Note not found');

    const refs = await this.userRefs([row.authorId]);
    return this.toNote(row, refs);
  }

  async deleteNote(actor: Actor, noteId: string): Promise<{ id: string }> {
    const note = await this.loadNoteOrThrow(noteId);
    if (note.authorId !== actor.id && !this.isAdmin(actor)) {
      throw new ForbiddenException('You can only delete your own notes');
    }
    await this.db.delete(meetingBoardNotes).where(eq(meetingBoardNotes.id, noteId));
    return { id: noteId };
  }
}
