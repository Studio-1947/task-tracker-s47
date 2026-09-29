import { check, date, index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

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

export const calendarVersions = pgTable('calendar_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  timezone: varchar('timezone', { length: 80 }).notNull(),
  workdays: integer('workdays').array().notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
  unpaidBreakMinutes: integer('unpaid_break_minutes').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  changeReason: text('change_reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('calendar_versions_effective_idx').on(t.effectiveFrom)]);

export const scheduleGroups = pgTable('schedule_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  timezone: varchar('timezone', { length: 80 }).notNull().default('Asia/Kolkata'),
  workdays: integer('workdays').array().notNull().default(sql`ARRAY[1,2,3,4,5]::integer[]`),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
  unpaidBreakMinutes: integer('unpaid_break_minutes').notNull().default(0),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('schedule_groups_effective_idx').on(t.effectiveFrom, t.effectiveTo)]);

export const scheduleGroupAssignments = pgTable('schedule_group_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleGroupId: uuid('schedule_group_id').notNull().references(() => scheduleGroups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('schedule_group_assignments_user_effective_idx').on(t.userId, t.effectiveFrom, t.effectiveTo)]);
