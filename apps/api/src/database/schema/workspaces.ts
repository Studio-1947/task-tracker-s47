import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  /** Secondary tagline shown under the name on the workspace card. */
  subtitle: varchar('subtitle', { length: 200 }),
  description: varchar('description', { length: 2000 }),
  color: varchar('color', { length: 7 }),
  /** Storage key of the small square logo, e.g. "avatars/<uuid>.png"; served via /api/files. */
  logoKey: varchar('logo_key', { length: 255 }),
  isArchived: boolean('is_archived').notNull().default(false),
  createdById: uuid('created_by_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;

/** Join table: User <-> Workspace (many-to-many). PRD §5. */
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Workspace-scoped role (PRD §9 "Team manager") — distinct from the global `users.role`. */
    role: varchar('role', { length: 10 }).notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    check('workspace_members_role_check', sql`${t.role} IN ('MEMBER', 'MANAGER')`),
  ],
);

export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMemberRow = typeof workspaceMembers.$inferInsert;
