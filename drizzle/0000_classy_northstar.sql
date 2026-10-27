CREATE TABLE "bq_gift_allocations" (
	"gift_id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"round_id" text,
	"source" text NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "bq_one_gift_per_recipient" UNIQUE("game_id","recipient_id"),
	CONSTRAINT "bq_one_award_per_round" UNIQUE("round_id"),
	CONSTRAINT "bq_allocation_source" CHECK (("bq_gift_allocations"."source" = 'round' and "bq_gift_allocations"."round_id" is not null) or ("bq_gift_allocations"."source" = 'gacha' and "bq_gift_allocations"."round_id" is null))
);
--> statement-breakpoint
CREATE TABLE "bq_games" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"question_order" jsonb,
	"current_round" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "bq_single_event" CHECK ("bq_games"."id" = 'main'),
	CONSTRAINT "bq_game_status" CHECK ("bq_games"."status" in ('lobby', 'question_active', 'round_closed', 'result_revealed', 'final_gacha', 'game_complete')),
	CONSTRAINT "bq_round_number" CHECK ("bq_games"."current_round" between 0 and 21),
	CONSTRAINT "bq_question_order_length" CHECK ("bq_games"."question_order" is null or jsonb_array_length("bq_games"."question_order") = 21)
);
--> statement-breakpoint
CREATE TABLE "bq_gifts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "bq_gifts_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE "bq_invitation_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bq_invitation_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bq_answer_options" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"is_correct" boolean NOT NULL,
	CONSTRAINT "bq_option_question_pair" UNIQUE("id","question_id"),
	CONSTRAINT "bq_option_position" UNIQUE("question_id","position"),
	CONSTRAINT "bq_option_position_range" CHECK ("bq_answer_options"."position" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "bq_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bq_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "bq_questions_author_id_unique" UNIQUE("author_id"),
	CONSTRAINT "bq_question_author_pair" UNIQUE("id","author_id")
);
--> statement-breakpoint
CREATE TABLE "bq_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bq_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"question_id" text NOT NULL,
	"number" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"revealed_at" timestamp with time zone,
	"winner_id" text,
	CONSTRAINT "bq_round_number_unique" UNIQUE("game_id","number"),
	CONSTRAINT "bq_question_once" UNIQUE("game_id","question_id"),
	CONSTRAINT "bq_round_question_game" UNIQUE("id","question_id","game_id"),
	CONSTRAINT "bq_valid_round_number" CHECK ("bq_rounds"."number" between 1 and 21),
	CONSTRAINT "bq_valid_deadline" CHECK ("bq_rounds"."deadline" > "bq_rounds"."started_at")
);
--> statement-breakpoint
CREATE TABLE "bq_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"participant_id" text,
	"invitation_id" text,
	"host_version" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bq_session_identity" CHECK (("bq_sessions"."role" = 'participant' and "bq_sessions"."participant_id" is not null and "bq_sessions"."invitation_id" is not null and "bq_sessions"."host_version" is null) or ("bq_sessions"."role" = 'host' and "bq_sessions"."participant_id" is null and "bq_sessions"."invitation_id" is null and "bq_sessions"."host_version" is not null))
);
--> statement-breakpoint
CREATE TABLE "bq_submissions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bq_submissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"round_id" text NOT NULL,
	"question_id" text NOT NULL,
	"game_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"option_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "bq_one_submission" UNIQUE("round_id","participant_id")
);
--> statement-breakpoint
ALTER TABLE "bq_gift_allocations" ADD CONSTRAINT "bq_gift_allocations_gift_id_bq_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."bq_gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_gift_allocations" ADD CONSTRAINT "bq_gift_allocations_game_id_bq_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."bq_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_gift_allocations" ADD CONSTRAINT "bq_gift_allocations_recipient_id_bq_participants_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."bq_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_gift_allocations" ADD CONSTRAINT "bq_gift_allocations_round_id_bq_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."bq_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_gifts" ADD CONSTRAINT "bq_gifts_owner_id_bq_participants_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."bq_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_invitation_tokens" ADD CONSTRAINT "bq_invitation_tokens_participant_id_bq_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."bq_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_answer_options" ADD CONSTRAINT "bq_answer_options_question_id_bq_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."bq_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_questions" ADD CONSTRAINT "bq_questions_author_id_bq_participants_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."bq_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_rounds" ADD CONSTRAINT "bq_rounds_game_id_bq_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."bq_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_rounds" ADD CONSTRAINT "bq_rounds_question_id_bq_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."bq_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_rounds" ADD CONSTRAINT "bq_rounds_winner_id_bq_participants_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."bq_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_sessions" ADD CONSTRAINT "bq_sessions_participant_id_bq_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."bq_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_sessions" ADD CONSTRAINT "bq_sessions_invitation_id_bq_invitation_tokens_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."bq_invitation_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_submissions" ADD CONSTRAINT "bq_submissions_participant_id_bq_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."bq_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_submissions" ADD CONSTRAINT "bq_submission_round" FOREIGN KEY ("round_id","question_id","game_id") REFERENCES "public"."bq_rounds"("id","question_id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bq_submissions" ADD CONSTRAINT "bq_submission_option" FOREIGN KEY ("option_id","question_id") REFERENCES "public"."bq_answer_options"("id","question_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bq_one_live_invitation" ON "bq_invitation_tokens" USING btree ("participant_id") WHERE "bq_invitation_tokens"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "bq_one_correct_option" ON "bq_answer_options" USING btree ("question_id") WHERE "bq_answer_options"."is_correct";--> statement-breakpoint
CREATE UNIQUE INDEX "bq_one_active_round" ON "bq_rounds" USING btree ("game_id") WHERE "bq_rounds"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "bq_sessions_expiry" ON "bq_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "bq_sessions_participant" ON "bq_sessions" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "bq_submission_order" ON "bq_submissions" USING btree ("round_id","received_at","id");