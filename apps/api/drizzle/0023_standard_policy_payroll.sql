CREATE TABLE IF NOT EXISTS "organisation_policies" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "timezone" varchar(80) DEFAULT 'Asia/Kolkata' NOT NULL,
  "reminder_channels" jsonb DEFAULT '["IN_APP","PUSH"]'::jsonb NOT NULL,
  "reminder_recipients" jsonb DEFAULT '["OWNER","REVIEWER","MANAGER"]'::jsonb NOT NULL,
  "deadline_lead_minutes" integer DEFAULT 120 NOT NULL,
  "review_target_minutes" integer DEFAULT 480 NOT NULL,
  "update_threshold_minutes" integer DEFAULT 960 NOT NULL,
  "earned_leave_monthly" numeric(5,2) DEFAULT 1 NOT NULL,
  "casual_leave_monthly" numeric(5,2) DEFAULT 1 NOT NULL,
  "paid_leave_names" jsonb DEFAULT '["Earned Leave","Casual Leave","Sick Leave"]'::jsonb NOT NULL,
  "half_day_enabled" boolean DEFAULT true NOT NULL,
  "late_grace_minutes" integer DEFAULT 15 NOT NULL,
  "unresolved_correction_treatment" varchar(16) DEFAULT 'EXCLUDE' NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organisation_policies_singleton" CHECK ("id" = 1)
);
INSERT INTO "organisation_policies" ("id", "effective_from") VALUES (1, CURRENT_DATE) ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "payroll_statements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "month" varchar(7) NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "policy_version" integer NOT NULL,
  "scheduled_minutes" integer NOT NULL,
  "worked_minutes" integer NOT NULL,
  "paid_leave_minutes" integer NOT NULL,
  "payable_minutes" integer NOT NULL,
  "payable_percentage" numeric(7,2),
  "status" varchar(12) DEFAULT 'DRAFT' NOT NULL CHECK ("status" IN ('DRAFT','REVIEWED','APPROVED')),
  "prepared_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reviewed_by_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
  "approved_by_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
  "reviewed_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "reopened_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payroll_statements_user_month_version_uq" UNIQUE ("user_id", "month", "version")
);
CREATE INDEX IF NOT EXISTS "payroll_statements_month_status_idx" ON "payroll_statements" ("month", "status");
