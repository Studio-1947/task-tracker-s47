import { boolean, index, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { notificationTypeEnum } from './enums';
import { users } from './users';

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
