-- Project timeline state used to filter active, upcoming and past work.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "lifecycle" varchar(16) DEFAULT 'ACTIVE' NOT NULL;
