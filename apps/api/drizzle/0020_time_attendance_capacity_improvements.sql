ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_CREATED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'TIME_ENTRY_UPDATED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_REQUESTED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_DECIDED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'TASK_BLOCKED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'TASK_UNBLOCKED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'DEPENDENCY_ADDED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'DEPENDENCY_REMOVED';

CREATE TABLE IF NOT EXISTS "task_time_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "work_date" date NOT NULL,
  "duration_minutes" integer NOT NULL,
  "category" varchar(20) DEFAULT 'EXECUTION' NOT NULL CHECK ("category" IN ('EXECUTION', 'REVIEW', 'REWORK')),
  "note" text,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "is_paused" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "task_time_entries_task_idx" ON "task_time_entries" ("task_id");
CREATE INDEX IF NOT EXISTS "task_time_entries_user_idx" ON "task_time_entries" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_time_entries_one_running_timer_uq" ON "task_time_entries" ("user_id") WHERE "ended_at" IS NULL;

CREATE TABLE IF NOT EXISTS "attendance_corrections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attendance_record_id" uuid REFERENCES "public"."attendance_records"("id") ON DELETE SET NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "work_date" date NOT NULL,
  "proposed_check_in_at" timestamp with time zone NOT NULL,
  "proposed_check_out_at" timestamp with time zone NOT NULL,
  "reason" text NOT NULL,
  "status" varchar(12) DEFAULT 'PENDING' NOT NULL CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
  "reviewer_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "review_note" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "attendance_corrections_user_idx" ON "attendance_corrections" ("user_id");
CREATE INDEX IF NOT EXISTS "attendance_corrections_status_idx" ON "attendance_corrections" ("status");

CREATE TABLE IF NOT EXISTS "task_blockers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "unblocker_user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE RESTRICT,
  "blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "unblocked_at" timestamp with time zone,
  "next_follow_up_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "task_blockers_task_idx" ON "task_blockers" ("task_id");

CREATE TABLE IF NOT EXISTS "task_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "predecessor_task_id" uuid NOT NULL REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
  "successor_task_id" uuid NOT NULL REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
  "is_blocking" boolean DEFAULT true NOT NULL,
  CONSTRAINT "task_dependencies_no_self_ref" CHECK ("predecessor_task_id" <> "successor_task_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "task_dependencies_pair_uq" ON "task_dependencies" ("predecessor_task_id", "successor_task_id");
