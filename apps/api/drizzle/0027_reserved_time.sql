CREATE TABLE IF NOT EXISTS "reserved_time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(12) DEFAULT 'MEETING' NOT NULL,
	"title" varchar(200) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reserved_time_blocks_kind_check" CHECK ("reserved_time_blocks"."kind" IN ('MEETING', 'TRAINING', 'OTHER')),
	CONSTRAINT "reserved_time_blocks_range_check" CHECK ("reserved_time_blocks"."ends_at" > "reserved_time_blocks"."starts_at")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reserved_time_blocks" ADD CONSTRAINT "reserved_time_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reserved_time_blocks" ADD CONSTRAINT "reserved_time_blocks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reserved_time_blocks_user_range_idx" ON "reserved_time_blocks" USING btree ("user_id","starts_at","ends_at");
