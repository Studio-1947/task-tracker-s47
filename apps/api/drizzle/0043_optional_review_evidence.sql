-- A written delivery note may document a physical/offline review without an attachment.
ALTER TABLE "task_submissions" ALTER COLUMN "evidence_attachment_id" DROP NOT NULL;
