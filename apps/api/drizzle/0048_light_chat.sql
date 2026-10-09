CREATE TABLE "comp_off_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"earned_days" numeric(5, 1) NOT NULL,
	"status" "leave_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comp_off_user_date_uq" UNIQUE("user_id","work_date")
);
--> statement-breakpoint
ALTER TABLE "organisation_policies" ALTER COLUMN "late_grace_minutes" SET DEFAULT 10;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "automatic_half_day_leave_id" uuid;--> statement-breakpoint
ALTER TABLE "comp_off_requests" ADD CONSTRAINT "comp_off_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_off_requests" ADD CONSTRAINT "comp_off_requests_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comp_off_status_idx" ON "comp_off_requests" USING btree ("status");--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_automatic_half_day_leave_id_leave_requests_id_fk" FOREIGN KEY ("automatic_half_day_leave_id") REFERENCES "public"."leave_requests"("id") ON DELETE set null ON UPDATE no action;