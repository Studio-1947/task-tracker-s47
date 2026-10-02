import { boolean, type AnyPgColumn, jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

/** Physical/HR location. It owns location-specific working rules, never delivery work. */
export const offices = pgTable('offices', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** External customer/account; it is not an access-control boundary. */
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull().unique(),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Internal people grouping. Teams can work across offices and workspaces. */
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  /** Accountable lead shown at the top of the team in the org tree. Does not grant workspace access by itself. */
  managerId: uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
  /** Parent team for the org tree; null = reports straight to the organisation. */
  parentTeamId: uuid('parent_team_id').references((): AnyPgColumn => teams.id, { onDelete: 'set null' }),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable('team_members', {
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.teamId, t.userId] })]);

/** Append-only record of who changed the org chart: reporting lines, team members, new people. */
export const orgChanges = pgTable('org_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  kind: varchar('kind', { length: 32 }).notNull(),
  subjectId: uuid('subject_id'),
  beforeValue: jsonb('before_value'),
  afterValue: jsonb('after_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
