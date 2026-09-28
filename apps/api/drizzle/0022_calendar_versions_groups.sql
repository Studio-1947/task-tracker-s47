CREATE TABLE IF NOT EXISTS "calendar_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "timezone" varchar(80) NOT NULL,
  "workdays" integer[] NOT NULL,
  "start_minute" integer NOT NULL,
  "end_minute" integer NOT NULL,
  "unpaid_break_minutes" integer NOT NULL,
  "effective_from" date NOT NULL,
  "change_reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "calendar_versions_effective_idx" ON "calendar_versions" ("effective_from");

CREATE TABLE IF NOT EXISTS "schedule_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "timezone" varchar(80) DEFAULT 'Asia/Kolkata' NOT NULL,
  "workdays" integer[] DEFAULT ARRAY[1,2,3,4,5]::integer[] NOT NULL,
  "start_minute" integer NOT NULL,
  "end_minute" integer NOT NULL,
  "unpaid_break_minutes" integer DEFAULT 0 NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "schedule_groups_effective_idx" ON "schedule_groups" ("effective_from", "effective_to");
