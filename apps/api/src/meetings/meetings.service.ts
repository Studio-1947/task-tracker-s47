import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  Role,
  type BoardItem,
  type BoardItemStatus,
  type BoardMemberSummary,
  type BoardMood,
  type BoardNote,
  type BoardProgress,
  type CreateBoardItemInput,
  type CreateBoardNoteInput,
  type MeetingBoardDetail,
  type MeetingSlot,
  type MeetingWeekSummary,
  type MoodLevel,
  type ReorderBoardItemsInput,
  type SetMoodInput,
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
  users,
  type MeetingBoardItemRow,
  type MeetingBoardMoodRow,
  type MeetingBoardNoteRow,
  type MeetingBoardRow,
} from '../database/schema';

type Actor = { id: string; role: string };

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
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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

  private toItem(
    row: MeetingBoardItemRow,
    refs: Map<string, UserRef>,
    commentCount: number,
  ): BoardItem {
    return {
      id: row.id,
      boardId: row.boardId,
      user: this.refOrUnknown(refs, row.userId),
      dayDate: row.dayDate,
      slot: row.slot as MeetingSlot,
      title: row.title,
      note: row.note,
      status: row.status as BoardItemStatus,
      position: row.position,
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

  private async buildDetail(board: MeetingBoardRow): Promise<MeetingBoardDetail> {
    const [itemRows, noteRows, moodRows] = await Promise.all([
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

    const refs = await this.userRefs([
      ...itemRows.flatMap((i) => [i.userId, i.createdById ?? '']),
      ...noteRows.map((n) => n.authorId),
      ...moodRows.map((m) => m.userId),
    ]);

    const items = itemRows.map((r) => this.toItem(r, refs, counts.get(r.id) ?? 0));
    const notes = noteRows.map((r) => this.toNote(r, refs));
    const moodByUser = new Map(moodRows.map((m) => [m.userId, this.toMood(m, refs)]));

    // A member shows up on the board if they own a card or checked in a mood.
    const memberIds = [
      ...new Set([...itemRows.map((i) => i.userId), ...moodRows.map((m) => m.userId)]),
    ];
    const members: BoardMemberSummary[] = memberIds
      .map((uid) => {
        const mine = items.filter((i) => i.user.id === uid);
        return {
          user: this.refOrUnknown(refs, uid),
          mood: moodByUser.get(uid) ?? null,
          progress: progressOf(mine),
          firstHalf: progressOf(mine.filter((i) => i.slot === 'FIRST')),
          secondHalf: progressOf(mine.filter((i) => i.slot === 'SECOND')),
        };
      })
      .sort((a, b) => a.user.name.localeCompare(b.user.name));

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
      notes,
      members,
      progress: progressOf(items),
      createdAt: board.createdAt.toISOString(),
    };
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

    const position = await this.nextPosition(board.id, input.dayDate, input.slot);
    const status = (input.status ?? 'PENDING') as BoardItemStatus;
    const [row] = await this.db
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
        createdById: actor.id,
        completedAt: status === 'DONE' ? new Date() : null,
      })
      .returning();
    if (!row) throw new NotFoundException('Could not create card');

    const refs = await this.userRefs([row.userId, row.createdById ?? '']);
    return this.toItem(row, refs, 0);
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
        ...(becameDone ? { completedAt: new Date() } : {}),
        ...(leftDone ? { completedAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(meetingBoardItems.id, itemId))
      .returning();
    if (!row) throw new NotFoundException('Card not found');

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(meetingBoardNotes)
      .where(eq(meetingBoardNotes.itemId, itemId));
    const refs = await this.userRefs([row.userId, row.createdById ?? '']);
    return this.toItem(row, refs, countRow?.count ?? 0);
  }

  async deleteItem(actor: Actor, itemId: string): Promise<{ id: string }> {
    const { item, board } = await this.loadItemOrThrow(itemId);
    this.assertCanMutate(actor, board, item.userId);
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
        body: input.body,
      })
      .returning();
    if (!row) throw new NotFoundException('Could not save note');

    const refs = await this.userRefs([row.authorId]);
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
    if (note.authorId !== actor.id) throw new ForbiddenException('You can only edit your own notes');

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
