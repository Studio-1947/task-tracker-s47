import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: roleEnum('role').notNull().default('MEMBER'),
  /** Storage key of the profile picture, e.g. "avatars/<uuid>.png"; served via /api/files. */
  avatarKey: varchar('avatar_key', { length: 255 }),
  /** Job title shown under the name (e.g. "Executive Director"); admin-settable. */
  designation: varchar('designation', { length: 120 }),
  isActive: boolean('is_active').notNull().default(true),
  /**
   * Stamped when an admin *removes* the person rather than merely deactivating
   * them. Both end up inactive, but they mean different things: a deactivated
   * account is suspended and comes back intact, whereas a removed one has already
   * been stripped of its workspaces and task assignments. Null for both active
   * and suspended users; cleared again if the person is ever reinstated.
   */
  removedAt: timestamp('removed_at', { withTimezone: true }),
  /** Forces a password change on next login (temp-password onboarding, PRD §11.1). */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  /** Bumped on deactivation / forced logout to invalidate outstanding refresh tokens (PRD §3.7 / §11.2). */
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
