import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Server-side error journal powering the super-dev "what is breaking" view.
 * Written best-effort by the global exception filter for 5xx / unhandled errors.
 * Deliberately has NO FK to users (userId is a loose reference) so recording an
 * error can never itself fail on a constraint.
 */
export const errorLogs = pgTable(
  'error_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    level: varchar('level', { length: 20 }).notNull().default('error'),
    statusCode: integer('status_code'),
    method: varchar('method', { length: 10 }),
    path: varchar('path', { length: 500 }),
    message: text('message').notNull(),
    stack: text('stack'),
    /** Actor at the time of the error, if the request was authenticated. */
    userId: uuid('user_id'),
    meta: jsonb('meta'),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('error_logs_created_idx').on(t.createdAt),
    index('error_logs_resolved_created_idx').on(t.resolved, t.createdAt),
  ],
);

export type ErrorLogRow = typeof errorLogs.$inferSelect;
export type NewErrorLogRow = typeof errorLogs.$inferInsert;
