-- Repair the task-size schema for databases that received the organisation
-- migrations outside Drizzle's migration ledger.  The earlier 0039 migration
-- accidentally repeated already-applied organisation changes; this focused,
-- idempotent migration supplies only the missing task-size feature.
DO $$
BEGIN
  CREATE TYPE "public"."task_size" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "size" "task_size" DEFAULT 'SMALL' NOT NULL;
