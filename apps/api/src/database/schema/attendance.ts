import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { leaveStatusEnum } from './enums';

/**
 * Admin-managed leave types (Casual, Paid, Sick, …). `defaultBalance` is the
 * company-wide allotment for the type; a per-user override lives in
 * `leaveBalances`. Soft-deleted (isActive=false) so historical requests keep
 * their type.
 */
export const leaveTypes = pgTable('leave_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 60 }).notNull(),
  color: varchar('color', { length: 7 }),
  /** Company-wide default number of days for this type. */
  defaultBalance: integer('default_balance').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LeaveTypeRow = typeof leaveTypes.$inferSelect;
export type NewLeaveTypeRow = typeof leaveTypes.$inferInsert;

/** Per-user override of a leave type's allotment. Absent row => use the type default. */
export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'cascade' }),
    allotted: integer('allotted').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('leave_balances_user_type_uq').on(t.userId, t.leaveTypeId)],
);

export type LeaveBalanceRow = typeof leaveBalances.$inferSelect;
export type NewLeaveBalanceRow = typeof leaveBalances.$inferInsert;

/**
 * A leave request. `days` is materialised at creation (0.5 for a half-day, else
 * inclusive calendar days) so balance usage can be aggregated cheaply.
 */
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'restrict' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** True => half-day (single day). */
    halfDay: boolean('half_day').notNull().default(false),
    days: numeric('days', { precision: 5, scale: 1 }).notNull(),
    reason: varchar('reason', { length: 1000 }),
    status: leaveStatusEnum('status').notNull().default('PENDING'),
    reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: varchar('review_note', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('leave_requests_user_idx').on(t.userId),
    index('leave_requests_status_idx').on(t.status),
  ],
);

export type LeaveRequestRow = typeof leaveRequests.$inferSelect;
export type NewLeaveRequestRow = typeof leaveRequests.$inferInsert;

/**
 * One check-in/check-out per user per day. Location (lat/lng/accuracy) is
 * captured best-effort from the browser at each punch and visible to admins.
 */
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    checkInAt: timestamp('check_in_at', { withTimezone: true }).notNull(),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    checkInLat: doublePrecision('check_in_lat'),
    checkInLng: doublePrecision('check_in_lng'),
    checkInAccuracy: doublePrecision('check_in_accuracy'),
    checkOutLat: doublePrecision('check_out_lat'),
    checkOutLng: doublePrecision('check_out_lng'),
    checkOutAccuracy: doublePrecision('check_out_accuracy'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('attendance_user_date_uq').on(t.userId, t.workDate),
    index('attendance_date_idx').on(t.workDate),
  ],
);

export type AttendanceRow = typeof attendanceRecords.$inferSelect;
export type NewAttendanceRow = typeof attendanceRecords.$inferInsert;
