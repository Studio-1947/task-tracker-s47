ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "accrual_per_month" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "carry_forward_max" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "carry_forward_expiry_months" integer;--> statement-breakpoint
ALTER TABLE "organisation_policies" ADD COLUMN IF NOT EXISTS "max_concurrent_leave_percent" integer DEFAULT 100 NOT NULL;
