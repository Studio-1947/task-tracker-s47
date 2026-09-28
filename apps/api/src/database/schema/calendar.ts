import { check, date, index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const calendarSettings = pgTable('calendar_settings', {
  id: integer('id').primaryKey().default(1),
  timezone: varchar('timezone', { length: 80 }).notNull().default('Asia/Kolkata'),
  workdays: integer('workdays').array().notNull().default(sql`ARRAY[1,2,3,4,5]::integer[]`),
  startMinute: integer('start_minute').notNull().default(600),
  endMinute: integer('end_minute').notNull().default(1140),
  unpaidBreakMinutes: integer('unpaid_break_minutes').notNull().default(60),
  effectiveFrom: date('effective_from').notNull().default(sql`CURRENT_DATE`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('calendar_settings_singleton', sql`${t.id} = 1`)]);

export const calendarExceptions = pgTable('calendar_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 12 }).notNull(),
  workingMinutes: integer('working_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('calendar_exceptions_date_uq').on(t.date),
  index('calendar_exceptions_date_idx').on(t.date),
  check('calendar_exceptions_kind_check', sql`${t.kind} IN ('HOLIDAY','HALF_DAY','WORKING_DAY')`),
]);
