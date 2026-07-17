CREATE TYPE "public"."attachment_kind" AS ENUM('FILE', 'LINK');--> statement-breakpoint
ALTER TABLE "task_attachments" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_attachments" ALTER COLUMN "mime_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_attachments" ALTER COLUMN "size_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN "kind" "attachment_kind" DEFAULT 'FILE' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD COLUMN "url" varchar(2000);--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_kind_shape" CHECK (("task_attachments"."kind" = 'FILE' AND "task_attachments"."storage_key" IS NOT NULL AND "task_attachments"."mime_type" IS NOT NULL AND "task_attachments"."size_bytes" IS NOT NULL AND "task_attachments"."url" IS NULL)
       OR ("task_attachments"."kind" = 'LINK' AND "task_attachments"."url" IS NOT NULL AND "task_attachments"."storage_key" IS NULL AND "task_attachments"."mime_type" IS NULL AND "task_attachments"."size_bytes" IS NULL));