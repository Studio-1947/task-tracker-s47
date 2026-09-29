-- Hand-trimmed like 0019 (see docs/STUDIO-1947-IMPROVEMENT-CHECKLIST.md and the
-- superdev-console memory note): drizzle-kit generated a much larger diff because
-- 0020-0023 have no matching snapshot files in apps/api/drizzle/meta/, so it
-- diffed against the stale 0019 snapshot and tried to recreate objects that
-- already exist live (task_blockers, task_dependencies, task_time_entries,
-- attendance_corrections, organisation_policies, payroll_statements,
-- calendar_versions, schedule_groups, and 8 audit_action enum values). Verified
-- against the live DB before trimming. Only the genuinely new delta remains:
-- reviewer delegation with effective dates (A01), persisted capacity allocation
-- (P01), reminder dispatch idempotency (N01), and schedule-group assignment (C01).
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'REVIEW_DELEGATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CAPACITY_ALLOCATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CAPACITY_ALLOCATION_REMOVED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'SCHEDULE_GROUP_ASSIGNED';--> statement-breakpoint
CREATE TABLE "capacity_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid,
	"user_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"allocated_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewer_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"delegator_id" uuid NOT NULL,
	"delegate_id" uuid NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"user_id" uuid NOT NULL,
	"reminder_type" varchar(32) NOT NULL,
	"dispatch_key" varchar(180) NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_group_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capacity_allocations" ADD CONSTRAINT "capacity_allocations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_allocations" ADD CONSTRAINT "capacity_allocations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_allocations" ADD CONSTRAINT "capacity_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_delegations" ADD CONSTRAINT "reviewer_delegations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_delegations" ADD CONSTRAINT "reviewer_delegations_delegator_id_users_id_fk" FOREIGN KEY ("delegator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_delegations" ADD CONSTRAINT "reviewer_delegations_delegate_id_users_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_dispatches" ADD CONSTRAINT "reminder_dispatches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_group_assignments" ADD CONSTRAINT "schedule_group_assignments_schedule_group_id_schedule_groups_id_fk" FOREIGN KEY ("schedule_group_id") REFERENCES "public"."schedule_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_group_assignments" ADD CONSTRAINT "schedule_group_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capacity_allocations_workspace_period_idx" ON "capacity_allocations" USING btree ("workspace_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "reviewer_delegations_task_effective_idx" ON "reviewer_delegations" USING btree ("task_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_dispatches_key_uq" ON "reminder_dispatches" USING btree ("dispatch_key");--> statement-breakpoint
CREATE INDEX "schedule_group_assignments_user_effective_idx" ON "schedule_group_assignments" USING btree ("user_id","effective_from","effective_to");
