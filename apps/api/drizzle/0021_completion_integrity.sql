ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "acceptance_criteria" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "child_scope" varchar(12) DEFAULT 'REQUIRED' NOT NULL;
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_child_scope_check" CHECK ("child_scope" IN ('REQUIRED', 'OPTIONAL', 'CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "task_estimate_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "previous_estimate_minutes" integer NOT NULL,
  "revised_estimate_minutes" integer NOT NULL,
  "reason" text NOT NULL,
  "classification" varchar(24) NOT NULL,
  "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "task_estimate_revisions_task_idx" ON "task_estimate_revisions" ("task_id");

CREATE TABLE IF NOT EXISTS "task_reopenings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reopened_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "task_reopenings_task_idx" ON "task_reopenings" ("task_id");
