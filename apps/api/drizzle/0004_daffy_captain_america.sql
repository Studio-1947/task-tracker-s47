CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(2000),
	"color" varchar(7),
	"task_prefix" varchar(6) NOT NULL,
	"task_seq" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_workspace_idx" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
-- Backfill: give every existing workspace a default "General" project that
-- inherits the workspace's prefix + counter so existing task refs stay identical.
INSERT INTO "projects" ("id", "workspace_id", "name", "color", "task_prefix", "task_seq", "created_by_id", "created_at", "updated_at")
SELECT gen_random_uuid(), w."id", 'General', w."color", w."task_prefix", w."task_seq", w."created_by_id", now(), now()
FROM "workspaces" w;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "project_id" uuid;--> statement-breakpoint
-- Each workspace has exactly one project (the General one) at this point.
UPDATE "tasks" t SET "project_id" = p."id" FROM "projects" p WHERE p."workspace_id" = t."workspace_id";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX "tasks_workspace_number_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_project_number_uq" ON "tasks" USING btree ("project_id","number");--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "task_prefix";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "task_seq";
