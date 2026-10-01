ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" varchar(32) DEFAULT 'UNSPECIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "applicable_gender" varchar(32) DEFAULT 'ALL' NOT NULL;
