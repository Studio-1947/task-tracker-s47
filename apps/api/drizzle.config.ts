import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolve } from 'node:path';

// Load the repo-root .env for CLI (drizzle-kit generate/migrate/studio).
config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://tasktracker:change-me-in-prod@localhost:5432/task_tracker',
  },
  verbose: true,
  strict: true,
});
