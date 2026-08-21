CREATE TYPE "public"."board_item_status" AS ENUM('PENDING', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."meeting_slot" AS ENUM('FIRST', 'SECOND');--> statement-breakpoint
CREATE TYPE "public"."mood_level" AS ENUM('GREAT', 'GOOD', 'OKAY', 'LOW', 'BLOCKED');--> statement-breakpoint
CREATE TABLE "meeting_board_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day_date" date NOT NULL,
	"slot" "meeting_slot" NOT NULL,
	"title" varchar(200) NOT NULL,
	"note" varchar(2000),
	"status" "board_item_status" DEFAULT 'PENDING' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_board_moods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mood" "mood_level" NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_moods_board_user_uq" UNIQUE("board_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_board_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"item_id" uuid,
	"author_id" uuid NOT NULL,
	"body" varchar(4000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"title" varchar(120),
	"agenda" text,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_boards_week_uq" UNIQUE("week_start")
);
--> statement-breakpoint
ALTER TABLE "meeting_board_items" ADD CONSTRAINT "meeting_board_items_board_id_meeting_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."meeting_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_board_items" ADD CONSTRAINT "meeting_board_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_board_items" ADD CONSTRAINT "meeting_board_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_board_moods" ADD CONSTRAINT "meeting_board_moods_board_id_meeting_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."meeting_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_board_moods" ADD CONSTRAINT "meeting_board_moods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_board_notes" ADD CONSTRAINT "meeting_board_notes_board_id_meeting_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."meeting_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_board_notes" ADD CONSTRAINT "meeting_board_notes_item_id_meeting_board_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."meeting_board_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_board_notes" ADD CONSTRAINT "meeting_board_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_boards" ADD CONSTRAINT "meeting_boards_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_items_board_idx" ON "meeting_board_items" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "meeting_items_board_user_idx" ON "meeting_board_items" USING btree ("board_id","user_id");--> statement-breakpoint
CREATE INDEX "meeting_items_cell_idx" ON "meeting_board_items" USING btree ("board_id","day_date","slot");--> statement-breakpoint
CREATE INDEX "meeting_notes_board_idx" ON "meeting_board_notes" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "meeting_notes_item_idx" ON "meeting_board_notes" USING btree ("item_id");