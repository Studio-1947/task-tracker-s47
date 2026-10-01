CREATE TABLE "offices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL UNIQUE,
  "timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL UNIQUE,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL UNIQUE,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "team_members" ("team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE cascade, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade, PRIMARY KEY("team_id", "user_id"));--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "client_id" uuid REFERENCES "clients"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "office_id" uuid REFERENCES "offices"("id") ON DELETE set null;--> statement-breakpoint
CREATE TABLE "workspace_teams" ("workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade, "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE restrict, PRIMARY KEY("workspace_id", "team_id"));
