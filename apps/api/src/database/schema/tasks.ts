import {
  boolean,
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
import { priorityEnum, taskStatusEnum } from './enums';
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
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('TODO'),
    priority: priorityEnum('priority').notNull().default('MEDIUM'),
    dueDate: timestamp('due_date', { withTimezone: true }),
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

export const taskAttachments = pgTable('task_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  uploaderId: uuid('uploader_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  /** Original client filename — display/download only, never used on disk. */
  fileName: varchar('file_name', { length: 255 }).notNull(),
  /** Server-generated key under UPLOAD_DIR, e.g. "attachments/<uuid>.png". */
  storageKey: varchar('storage_key', { length: 255 }).notNull().unique(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TaskAttachmentRow = typeof taskAttachments.$inferSelect;

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
