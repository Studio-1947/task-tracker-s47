ALTER TABLE "meeting_board_items" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "meeting_board_items" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "meeting_board_items" ADD COLUMN "rolled_over" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_board_items" ADD CONSTRAINT "meeting_board_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_board_items" ADD CONSTRAINT "meeting_board_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_items_project_idx" ON "meeting_board_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "meeting_items_task_idx" ON "meeting_board_items" USING btree ("task_id");