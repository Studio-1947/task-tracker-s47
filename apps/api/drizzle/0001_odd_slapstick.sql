ALTER TABLE "users" ADD COLUMN "avatar_key" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "designation" varchar(120);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");--> statement-breakpoint
UPDATE tasks t SET completed_at = sub.latest
FROM (
  SELECT task_id, MAX(created_at) AS latest
  FROM audit_logs
  WHERE action = 'STATUS_CHANGED' AND after_value = '"DONE"'::jsonb
  GROUP BY task_id
) sub
WHERE t.id = sub.task_id AND t.status = 'DONE';--> statement-breakpoint
UPDATE tasks SET completed_at = updated_at WHERE status = 'DONE' AND completed_at IS NULL;
