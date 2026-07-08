import { index, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditActionEnum } from './enums';
import { tasks } from './tasks';
import { users } from './users';
import { workspaces } from './workspaces';

/**
 * Immutable audit log — one row per mutating action (PRD §3.5 / §7).
 * No updatedAt / soft-delete: rows are append-only.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    /** The actor who performed the action. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: auditActionEnum('action').notNull(),
    beforeValue: jsonb('before_value'),
    afterValue: jsonb('after_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_workspace_created_idx').on(t.workspaceId, t.createdAt),
    index('audit_logs_task_created_idx').on(t.taskId, t.createdAt),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
