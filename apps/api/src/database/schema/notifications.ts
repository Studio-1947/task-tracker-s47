import { boolean, index, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { notificationTypeEnum } from './enums';
import { users } from './users';
import { workspaces } from './workspaces';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .references(() => users.id, { onDelete: 'set null' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    data: jsonb('data'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_id_idx').on(t.userId),
    index('notifications_created_at_idx').on(t.createdAt),
  ]
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;

/** Immutable manager-reviewed Wednesday/Friday report snapshots. */
export const reportSnapshots = pgTable('report_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  reportType: varchar('report_type', { length: 24 }).notNull(),
  reportDate: varchar('report_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('DRAFT'),
  markdown: text('markdown').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  recipientIds: jsonb('recipient_ids').$type<string[]>().notNull().default([]),
  generatedById: uuid('generated_by_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'restrict' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  distributedAt: timestamp('distributed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('report_snapshots_workspace_created_idx').on(t.workspaceId, t.createdAt)]);

export const reminderDispatches = pgTable('reminder_dispatches', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id'),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reminderType: varchar('reminder_type', { length: 32 }).notNull(),
  dispatchKey: varchar('dispatch_key', { length: 180 }).notNull(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('reminder_dispatches_key_uq').on(t.dispatchKey)]);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    keys: jsonb('keys').notNull(), // contains auth and p256dh keys
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('push_subscriptions_user_id_idx').on(t.userId),
  ]
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
