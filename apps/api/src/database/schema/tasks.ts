import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { attachmentKindEnum, priorityEnum, taskStatusEnum, taskSizeEnum } from './enums';
import { projects } from './projects';
import { users } from './users';
import { workspaces } from './workspaces';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Owning project. Immutable after creation (keeps per-project numbering coherent). */
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Parent task, when this is a subtask. Single level only (a subtask can't itself have subtasks). */
    parentTaskId: uuid('parent_task_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
    /** Per-project sequential number backing the human-readable ref (e.g. 12 in WEB-12). */
    number: integer('number').notNull(),
    title: varchar('title', { length: 1000 }).notNull(),
    description: text('description'),
    acceptanceCriteria: text('acceptance_criteria'),
    childScope: varchar('child_scope', { length: 12 }).notNull().default('REQUIRED'),
    status: taskStatusEnum('status').notNull().default('TODO'),
    priority: priorityEnum('priority').notNull().default('MEDIUM'),
    size: taskSizeEnum('size').notNull().default('SMALL'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    originalDueDate: timestamp('original_due_date', { withTimezone: true }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    baselineEstimateMinutes: integer('baseline_estimate_minutes'),
    currentEstimateMinutes: integer('current_estimate_minutes'),
    remainingEstimateMinutes: integer('remaining_estimate_minutes'),
    /** Set when status transitions to DONE, cleared when it leaves DONE (weekly completion analytics). */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tasks_project_number_uq').on(t.projectId, t.number),
    index('tasks_completed_at_idx').on(t.completedAt),
    index('tasks_parent_task_idx').on(t.parentTaskId),
    index('tasks_owner_idx').on(t.ownerId),
    index('tasks_reviewer_idx').on(t.reviewerId),
    check('tasks_baseline_estimate_nonnegative', sql`${t.baselineEstimateMinutes} IS NULL OR ${t.baselineEstimateMinutes} >= 0`),
    check('tasks_current_estimate_nonnegative', sql`${t.currentEstimateMinutes} IS NULL OR ${t.currentEstimateMinutes} >= 0`),
    check('tasks_remaining_estimate_nonnegative', sql`${t.remainingEstimateMinutes} IS NULL OR ${t.remainingEstimateMinutes} >= 0`),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;

/** Join table: Task <-> User (multiple assignees, PRD §9.3 decided M2M). */
export const taskAssignees = pgTable(
  'task_assignees',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const labels = pgTable('labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 60 }).notNull(),
  color: varchar('color', { length: 7 }),
});

export const taskLabels = pgTable(
  'task_labels',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

/**
 * An attachment is either an uploaded FILE (storage_key/mime_type/size_bytes set)
 * or an external LINK (url set) — never both. The CHECK constraint below is what
 * actually enforces that, since the per-kind columns must be nullable to coexist.
 */
export const taskAttachments = pgTable(
  'task_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: attachmentKindEnum('kind').notNull().default('FILE'),
    /** FILE: original client filename (display/download only, never used on disk). LINK: display title. */
    fileName: varchar('file_name', { length: 255 }).notNull(),
    /** FILE only — server-generated key under UPLOAD_DIR, e.g. "attachments/<uuid>.png". */
    storageKey: varchar('storage_key', { length: 255 }).unique(),
    mimeType: varchar('mime_type', { length: 100 }),
    sizeBytes: integer('size_bytes'),
    /** LINK only — always http(s), validated before insert. */
    url: varchar('url', { length: 2000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'task_attachments_kind_shape',
      sql`(${t.kind} = 'FILE' AND ${t.storageKey} IS NOT NULL AND ${t.mimeType} IS NOT NULL AND ${t.sizeBytes} IS NOT NULL AND ${t.url} IS NULL)
       OR (${t.kind} = 'LINK' AND ${t.url} IS NOT NULL AND ${t.storageKey} IS NULL AND ${t.mimeType} IS NULL AND ${t.sizeBytes} IS NULL)`,
    ),
  ],
);

export type TaskAttachmentRow = typeof taskAttachments.$inferSelect;

export const taskSubmissions = pgTable(
  'task_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    submitterId: uuid('submitter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    evidenceAttachmentId: uuid('evidence_attachment_id').notNull().references(() => taskAttachments.id, { onDelete: 'restrict' }),
    note: text('note').notNull(),
    status: varchar('status', { length: 12 }).notNull().default('PENDING'),
    reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    reviewNote: text('review_note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    index('task_submissions_task_idx').on(t.taskId),
    uniqueIndex('task_submissions_one_pending_uq').on(t.taskId).where(sql`${t.status} = 'PENDING'`),
    check('task_submissions_status_check', sql`${t.status} IN ('PENDING', 'ACCEPTED', 'RETURNED')`),
  ],
);

export const taskComments = pgTable('task_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const taskTimeEntries = pgTable(
  'task_time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    category: varchar('category', { length: 20 }).notNull().default('EXECUTION'),
    note: text('note'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    isPaused: boolean('is_paused').notNull().default(false),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    /** Total closed pause time so far (ms); the open pause, if any, starts at pausedAt. */
    pausedMs: integer('paused_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('task_time_entries_task_idx').on(t.taskId),
    index('task_time_entries_user_idx').on(t.userId),
    uniqueIndex('task_time_entries_one_running_timer_uq').on(t.userId).where(sql`${t.endedAt} IS NULL`),
    check('task_time_entries_category_check', sql`${t.category} IN ('EXECUTION', 'REVIEW', 'REWORK')`),
  ],
);

export const taskEstimateRevisions = pgTable('task_estimate_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  previousEstimateMinutes: integer('previous_estimate_minutes').notNull(),
  revisedEstimateMinutes: integer('revised_estimate_minutes').notNull(),
  reason: text('reason').notNull(),
  classification: varchar('classification', { length: 24 }).notNull(),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('task_estimate_revisions_task_idx').on(t.taskId)]);

export const taskReopenings = pgTable('task_reopenings', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reopenedAt: timestamp('reopened_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('task_reopenings_task_idx').on(t.taskId)]);

export const reviewerDelegations = pgTable('reviewer_delegations', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  delegatorId: uuid('delegator_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  delegateId: uuid('delegate_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }).notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('reviewer_delegations_task_effective_idx').on(t.taskId, t.effectiveFrom, t.effectiveTo)]);

export const capacityAllocations = pgTable('capacity_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  allocatedMinutes: integer('allocated_minutes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('capacity_allocations_workspace_period_idx').on(t.workspaceId, t.periodStart, t.periodEnd)]);

/** Time a person has set aside (meetings, training…) that reduces planned-work capacity. */
export const reservedTimeBlocks = pgTable('reserved_time_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 12 }).notNull().default('MEETING'),
  title: varchar('title', { length: 200 }).notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  createdById: uuid('created_by_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('reserved_time_blocks_user_range_idx').on(t.userId, t.startsAt, t.endsAt),
  check('reserved_time_blocks_kind_check', sql`${t.kind} IN ('MEETING', 'TRAINING', 'OTHER')`),
  check('reserved_time_blocks_range_check', sql`${t.endsAt} > ${t.startsAt}`),
]);

export type TaskTimeEntryRow = typeof taskTimeEntries.$inferSelect;

export const taskBlockers = pgTable(
  'task_blockers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    unblockerUserId: uuid('unblocker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    blockedAt: timestamp('blocked_at', { withTimezone: true }).notNull().defaultNow(),
    unblockedAt: timestamp('unblocked_at', { withTimezone: true }),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
  },
  (t) => [index('task_blockers_task_idx').on(t.taskId)],
);

export type TaskBlockerRow = typeof taskBlockers.$inferSelect;

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    predecessorTaskId: uuid('predecessor_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    successorTaskId: uuid('successor_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    isBlocking: boolean('is_blocking').notNull().default(true),
  },
  (t) => [
    uniqueIndex('task_dependencies_pair_uq').on(t.predecessorTaskId, t.successorTaskId),
    check('task_dependencies_no_self_ref', sql`${t.predecessorTaskId} <> ${t.successorTaskId}`),
  ],
);

export type TaskDependencyRow = typeof taskDependencies.$inferSelect;


