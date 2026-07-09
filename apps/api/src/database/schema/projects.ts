import { boolean, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';

/**
 * A project groups tasks inside a workspace. Human-readable task refs (e.g.
 * WEB-12) are per-project: each project owns its own prefix + monotonic counter.
 * Access is inherited from the parent workspace's membership (no separate
 * project membership).
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 2000 }),
    color: varchar('color', { length: 7 }),
    /** Prefix for human-readable task IDs, e.g. "WEB" -> WEB-12. */
    taskPrefix: varchar('task_prefix', { length: 6 }).notNull(),
    /** Per-project monotonic counter backing the human-readable task IDs. */
    taskSeq: integer('task_seq').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('projects_workspace_idx').on(t.workspaceId)],
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
