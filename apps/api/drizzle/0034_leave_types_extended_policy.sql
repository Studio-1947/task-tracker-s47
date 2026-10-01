DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'leave_types' AND column_name = 'approval_required') = 'boolean' THEN
    ALTER TABLE "leave_types" ALTER COLUMN "approval_required" DROP DEFAULT;
    ALTER TABLE "leave_types" ALTER COLUMN "approval_required" SET DATA TYPE varchar(32)
      USING CASE WHEN "approval_required" THEN 'MANAGER_APPROVAL' ELSE 'NO_APPROVAL' END;
    ALTER TABLE "leave_types" ALTER COLUMN "approval_required" SET DEFAULT 'MANAGER_APPROVAL';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "carry_forward_policy" varchar(32) DEFAULT 'LAPSE_AFTER_YEAR' NOT NULL;
