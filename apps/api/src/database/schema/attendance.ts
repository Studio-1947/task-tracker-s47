import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  text,
  varchar,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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

export const attendanceCorrections = pgTable(
  'attendance_corrections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attendanceRecordId: uuid('attendance_record_id').references(() => attendanceRecords.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    proposedCheckInAt: timestamp('proposed_check_in_at', { withTimezone: true }).notNull(),
    proposedCheckOutAt: timestamp('proposed_check_out_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 12 }).notNull().default('PENDING'),
    reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    reviewNote: text('review_note'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('attendance_corrections_user_idx').on(t.userId),
    index('attendance_corrections_status_idx').on(t.status),
  ],
);

export type AttendanceCorrectionRow = typeof attendanceCorrections.$inferSelect;
export type NewAttendanceCorrectionRow = typeof attendanceCorrections.$inferInsert;

export const organisationPolicies = pgTable('organisation_policies', {
  id: integer('id').primaryKey().default(1),
  version: integer('version').notNull().default(1),
  timezone: varchar('timezone', { length: 80 }).notNull().default('Asia/Kolkata'),
  reminderChannels: jsonb('reminder_channels').$type<string[]>().notNull().default(['IN_APP', 'PUSH']),
  reminderRecipients: jsonb('reminder_recipients').$type<string[]>().notNull().default(['OWNER', 'REVIEWER', 'MANAGER']),
  deadlineLeadMinutes: integer('deadline_lead_minutes').notNull().default(120),
  reviewTargetMinutes: integer('review_target_minutes').notNull().default(480),
  updateThresholdMinutes: integer('update_threshold_minutes').notNull().default(960),
  earnedLeaveMonthly: numeric('earned_leave_monthly', { precision: 5, scale: 2 }).notNull().default('1'),
  casualLeaveMonthly: numeric('casual_leave_monthly', { precision: 5, scale: 2 }).notNull().default('1'),
  paidLeaveNames: jsonb('paid_leave_names').$type<string[]>().notNull().default(['Earned Leave', 'Casual Leave', 'Sick Leave']),
  halfDayEnabled: boolean('half_day_enabled').notNull().default(true),
  lateGraceMinutes: integer('late_grace_minutes').notNull().default(15),
  unresolvedCorrectionTreatment: varchar('unresolved_correction_treatment', { length: 16 }).notNull().default('EXCLUDE'),
  effectiveFrom: date('effective_from').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('organisation_policies_singleton', sql`${t.id} = 1`)]);

export const payrollStatements = pgTable('payroll_statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  month: varchar('month', { length: 7 }).notNull(),
  version: integer('version').notNull().default(1),
  policyVersion: integer('policy_version').notNull(),
  scheduledMinutes: integer('scheduled_minutes').notNull(),
  workedMinutes: integer('worked_minutes').notNull(),
  paidLeaveMinutes: integer('paid_leave_minutes').notNull(),
  payableMinutes: integer('payable_minutes').notNull(),
  payablePercentage: numeric('payable_percentage', { precision: 7, scale: 2 }),
  status: varchar('status', { length: 12 }).notNull().default('DRAFT'),
  preparedById: uuid('prepared_by_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'restrict' }),
  approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'restrict' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  reopenedReason: text('reopened_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('payroll_statements_user_month_version_uq').on(t.userId, t.month, t.version),
  index('payroll_statements_month_status_idx').on(t.month, t.status),
]);

