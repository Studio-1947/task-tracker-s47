ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'OWNER_CHANGED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'REVIEWER_CHANGED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'ESTIMATE_CHANGED';

ALTER TABLE "tasks" ADD COLUMN "original_due_date" timestamp with time zone;
ALTER TABLE "tasks" ADD COLUMN "owner_id" uuid;
ALTER TABLE "tasks" ADD COLUMN "reviewer_id" uuid;
ALTER TABLE "tasks" ADD COLUMN "baseline_estimate_minutes" integer;
ALTER TABLE "tasks" ADD COLUMN "current_estimate_minutes" integer;
ALTER TABLE "tasks" ADD COLUMN "remaining_estimate_minutes" integer;

UPDATE "tasks" SET "original_due_date" = "due_date" WHERE "due_date" IS NOT NULL;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_baseline_estimate_nonnegative" CHECK ("baseline_estimate_minutes" IS NULL OR "baseline_estimate_minutes" >= 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_current_estimate_nonnegative" CHECK ("current_estimate_minutes" IS NULL OR "current_estimate_minutes" >= 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_remaining_estimate_nonnegative" CHECK ("remaining_estimate_minutes" IS NULL OR "remaining_estimate_minutes" >= 0);
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_id");
CREATE INDEX "tasks_reviewer_idx" ON "tasks" USING btree ("reviewer_id");
