ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reports_to_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_reports_to_id_users_id_fk" FOREIGN KEY ("reports_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_not_own_manager" CHECK ("reports_to_id" IS NULL OR "reports_to_id" <> "id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_changes" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
 "kind" varchar(32) NOT NULL,
 "subject_id" uuid,
 "before_value" jsonb,
 "after_value" jsonb,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_changes_created_idx" ON "org_changes" ("created_at");
