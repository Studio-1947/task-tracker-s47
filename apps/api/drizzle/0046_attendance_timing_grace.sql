ALTER TABLE "organisation_policies" ALTER COLUMN "late_grace_minutes" SET DEFAULT 10;
--> statement-breakpoint
UPDATE "organisation_policies" SET "late_grace_minutes" = 10 WHERE "late_grace_minutes" = 15;
