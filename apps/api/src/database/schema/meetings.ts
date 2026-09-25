import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { projects } from './projects';
import { tasks } from './tasks';
import { boardItemStatusEnum, meetingSlotEnum, moodLevelEnum } from './enums';

/**
 * One weekly meeting board, keyed by the Monday of its ISO week. Created lazily
 * the first time anyone opens that week, so there is no "start the meeting" step.
 */
export const meetingBoards = pgTable(
  'meeting_boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Monday of the week this board covers. */
    weekStart: date('week_start').notNull(),
    title: varchar('title', { length: 120 }),
    /** Free-form agenda / minutes header for the week. */
    agenda: text('agenda'),
    /** Locked weeks are read-only for members; admins can still edit. */
    isLocked: boolean('is_locked').notNull().default(false),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('meeting_boards_week_uq').on(t.weekStart)],
);

export type MeetingBoardRow = typeof meetingBoards.$inferSelect;
export type NewMeetingBoardRow = typeof meetingBoards.$inferInsert;

/**
 * A card owned by one member, placed in a (day, half) cell of the board.
 * `position` orders cards within a cell; `completedAt` is stamped on the
 * PENDING/IN_PROGRESS → DONE transition so progress history is auditable.
 *
 * A card may be filed under a project, in which case it is mirrored by a real
 * task in that project (`taskId`) so meeting work lands in the workspace board
 * too. Both references are `set null` rather than `cascade`: archiving a project
 * or deleting the mirror task should quietly unfile the card, never erase the
 * week's history.
 */
export const meetingBoardItems = pgTable(
  'meeting_board_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => meetingBoards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Working day inside the board's week (Mon–Fri). */
    dayDate: date('day_date').notNull(),
    slot: meetingSlotEnum('slot').notNull(),
    title: varchar('title', { length: 1000 }).notNull(),
    note: varchar('note', { length: 2000 }),
    status: boardItemStatusEnum('status').notNull().default('PENDING'),
    position: integer('position').notNull().default(0),
    /** Project this card belongs to, or null for unfiled work. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** The mirror task in the project's workspace, created when the card is filed. */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    /**
     * Set when the card was rolled onto this board from the previous week because
     * it was still open on Friday. Purely informational — the copy is its own card.
     */
    rolledOver: boolean('rolled_over').notNull().default(false),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meeting_items_board_idx').on(t.boardId),
    index('meeting_items_board_user_idx').on(t.boardId, t.userId),
    index('meeting_items_cell_idx').on(t.boardId, t.dayDate, t.slot),
    index('meeting_items_project_idx').on(t.projectId),
    index('meeting_items_task_idx').on(t.taskId),
  ],
);

export type MeetingBoardItemRow = typeof meetingBoardItems.$inferSelect;
export type NewMeetingBoardItemRow = typeof meetingBoardItems.$inferInsert;

/** One mood check-in per member per week. */
export const meetingBoardMoods = pgTable(
  'meeting_board_moods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => meetingBoards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mood: moodLevelEnum('mood').notNull(),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('meeting_moods_board_user_uq').on(t.boardId, t.userId)],
);

export type MeetingBoardMoodRow = typeof meetingBoardMoods.$inferSelect;

/**
 * Notes on the board. A null `itemId` is a board-level meeting note (minutes,
 * decisions); a set `itemId` makes the row a comment on that card.
 */
export const meetingBoardNotes = pgTable(
  'meeting_board_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => meetingBoards.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').references(() => meetingBoardItems.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: varchar('body', { length: 4000 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meeting_notes_board_idx').on(t.boardId),
    index('meeting_notes_item_idx').on(t.itemId),
  ],
);

export type MeetingBoardNoteRow = typeof meetingBoardNotes.$inferSelect;
