-- NOTE: drizzle-kit auto-generated a much larger diff here because migrations
-- 0015-0018 were applied without matching snapshot files in apps/api/drizzle/meta/
-- (a pre-existing gap — see docs/STUDIO-1947-IMPROVEMENT-CHECKLIST.md), so the
-- generator diffed against the stale 0014 snapshot and tried to recreate objects
-- that already exist in the live database. Hand-trimmed to the actual delta:
-- workspace-scoped roles (PRD §9 "Team manager") plus their audit action.
-- The full current schema is still correctly captured in 0019_snapshot.json,
-- so future `drizzle-kit generate` runs diff from here, not from 0014 again.
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'WORKSPACE_ROLE_CHANGED';--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "role" varchar(10) DEFAULT 'MEMBER' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" IN ('MEMBER', 'MANAGER'));
