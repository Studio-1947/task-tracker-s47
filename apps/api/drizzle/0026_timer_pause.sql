ALTER TABLE "task_time_entries" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_time_entries" ADD COLUMN IF NOT EXISTS "paused_ms" integer DEFAULT 0 NOT NULL;
