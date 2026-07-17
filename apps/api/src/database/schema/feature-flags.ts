import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Global kill-switches / maintenance toggles controlled from the super-dev console.
 * Keyed by a stable string (e.g. "maintenance_mode"). Rows are created on first
 * write; unknown keys are treated as disabled.
 */
export const featureFlags = pgTable('feature_flags', {
  key: varchar('key', { length: 80 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: varchar('description', { length: 255 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FeatureFlagRow = typeof featureFlags.$inferSelect;
export type NewFeatureFlagRow = typeof featureFlags.$inferInsert;
