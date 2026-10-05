-- Distinguish team-facing weekly briefings from regular meeting notes and card comments.
ALTER TABLE "meeting_board_notes" ADD COLUMN IF NOT EXISTS "kind" varchar(16) DEFAULT 'NOTE' NOT NULL;
