CREATE TYPE "public"."task_size" AS ENUM('SMALL', 'MEDIUM', 'LARGE');--> statement-breakpoint
CREATE TABLE "org_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"subject_id" uuid,
	"before_value" jsonb,
	"after_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "org_top" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reports_to_id" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "parent_team_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "size" "task_size" DEFAULT 'SMALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_changes" ADD CONSTRAINT "org_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_reports_to_id_users_id_fk" FOREIGN KEY ("reports_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_parent_team_id_teams_id_fk" FOREIGN KEY ("parent_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;