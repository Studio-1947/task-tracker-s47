ALTER TABLE "leave_types" ADD COLUMN "approval_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "entitlement_unit" varchar(8) DEFAULT 'DAYS' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "wfh_entitlement_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "policy_notes" text;
