ALTER TYPE "public"."notification_type" ADD VALUE 'REPORT_SHARED';--> statement-breakpoint
CREATE TABLE "report_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_type" varchar(24) NOT NULL,
	"report_date" varchar(10) NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"markdown" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recipient_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_by_id" uuid NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"distributed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_generated_by_id_users_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_snapshots_workspace_created_idx" ON "report_snapshots" USING btree ("workspace_id","created_at");
