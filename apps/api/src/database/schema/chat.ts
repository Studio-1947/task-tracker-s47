import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { conversationTypeEnum } from './enums';
import { projects } from './projects';
import { users } from './users';

/**
 * A chat conversation. Three kinds (see ConversationType):
 *  - DIRECT: 1:1 DM. `dmKey` = sorted "<minUserId>:<maxUserId>" makes get-or-create idempotent.
 *  - PROJECT: a project's group channel. `projectId` is unique so there's one per project;
 *    access is authorized against the parent workspace's membership (not conversation_members).
 *  - GROUP: an ad-hoc named group; membership is the explicit conversation_members rows.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: conversationTypeEnum('type').notNull(),
    /** Group title (GROUP only); DIRECT/PROJECT titles are derived at read time. */
    title: varchar('title', { length: 140 }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    /** Sorted "<minUserId>:<maxUserId>" for DIRECT conversations; null otherwise. */
    dmKey: varchar('dm_key', { length: 73 }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Denormalized timestamp of the latest message, for conversation-list ordering. */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_project_uq').on(t.projectId),
    uniqueIndex('conversations_dm_key_uq').on(t.dmKey),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;

/**
 * Membership of a conversation. For DIRECT/GROUP these rows ARE the access list;
 * for PROJECT they're created lazily just to persist per-user read state
 * (`lastReadAt`) — authorization comes from workspace membership.
 */
export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Group admin (can rename / add / remove members). */
    isAdmin: boolean('is_admin').notNull().default(false),
    /** Read-receipt / unread-count cursor: messages after this are unread. */
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversation_members_uq').on(t.conversationId, t.userId),
    index('conversation_members_user_idx').on(t.userId),
  ],
);

export type ConversationMemberRow = typeof conversationMembers.$inferSelect;
export type NewConversationMemberRow = typeof conversationMembers.$inferInsert;

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    parentMessageId: uuid('parent_message_id')
      .references((): any => messages.id, { onDelete: 'cascade' }),
    /** Null for attachment-only messages; cleared on soft-delete. */
    body: text('body'),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    /** Soft delete — the row stays so thread ordering/pagination is stable. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_created_idx').on(t.conversationId, t.createdAt)],
);

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  /** Server-generated key under UPLOAD_DIR, e.g. "attachments/<uuid>.png". */
  fileKey: varchar('file_key', { length: 255 }).notNull(),
  /** Original client filename — display/download only. */
  fileName: varchar('file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
});

export type MessageAttachmentRow = typeof messageAttachments.$inferSelect;

export const messageMentions = pgTable(
  'message_mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [index('message_mentions_user_idx').on(t.userId)],
);

export type MessageMentionRow = typeof messageMentions.$inferSelect;

export const messageReactions = pgTable(
  'message_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('message_reactions_uq').on(t.messageId, t.userId, t.emoji),
    index('message_reactions_message_idx').on(t.messageId),
  ],
);

export type MessageReactionRow = typeof messageReactions.$inferSelect;
export type NewMessageReactionRow = typeof messageReactions.$inferInsert;
