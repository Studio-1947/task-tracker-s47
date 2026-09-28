ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'REVIEWED';

CREATE TABLE "task_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "submitter_id" uuid NOT NULL,
  "evidence_attachment_id" uuid NOT NULL,
  "note" text NOT NULL,
  "status" varchar(12) DEFAULT 'PENDING' NOT NULL,
  "reviewer_id" uuid,
  "review_note" text,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  CONSTRAINT "task_submissions_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'RETURNED'))
);
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE restrict;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_evidence_attachment_id_task_attachments_id_fk" FOREIGN KEY ("evidence_attachment_id") REFERENCES "public"."task_attachments"("id") ON DELETE restrict;
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null;
CREATE INDEX "task_submissions_task_idx" ON "task_submissions" USING btree ("task_id");
CREATE UNIQUE INDEX "task_submissions_one_pending_uq" ON "task_submissions" USING btree ("task_id") WHERE "status" = 'PENDING';
