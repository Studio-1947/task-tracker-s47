ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "org_top" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Anyone already at the top of a chart with people under them stays visible.
UPDATE "users" u SET "org_top" = true WHERE u."reports_to_id" IS NULL AND EXISTS (SELECT 1 FROM "users" c WHERE c."reports_to_id" = u."id");
