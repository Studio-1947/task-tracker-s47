CREATE TABLE "project_blocked_users" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"blocked_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_blocked_users_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_submissions" ALTER COLUMN "evidence_attachment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "lifecycle" varchar(16) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_board_notes" ADD COLUMN "kind" varchar(16) DEFAULT 'NOTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_blocked_users" ADD CONSTRAINT "project_blocked_users_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_blocked_users" ADD CONSTRAINT "project_blocked_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_blocked_users" ADD CONSTRAINT "project_blocked_users_blocked_by_id_users_id_fk" FOREIGN KEY ("blocked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;