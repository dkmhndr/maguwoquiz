DO $$
BEGIN
  PERFORM 1 FROM "bq_games" WHERE "id" = 'main' FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "bq_games" WHERE "question_order" IS NOT NULL OR "current_round" <> 0 OR "status" <> 'lobby')
    OR EXISTS (SELECT 1 FROM "bq_rounds") OR EXISTS (SELECT 1 FROM "bq_gift_allocations") THEN
    RAISE EXCEPTION 'Cannot remove participants from an initialized or started game';
  END IF;
  IF EXISTS (SELECT 1 FROM "bq_participants" WHERE "id" = 'p19' AND "name" <> 'Syauqy')
    OR (EXISTS (SELECT 1 FROM "bq_participants") AND NOT EXISTS (SELECT 1 FROM "bq_participants" WHERE "id" = 'p02' AND "name" = 'Farid Inawan')) THEN
    RAISE EXCEPTION 'Participant IDs do not match the expected names';
  END IF;
END $$;--> statement-breakpoint
DELETE FROM "bq_sessions" WHERE "participant_id" = 'p19' OR "invitation_id" IN (SELECT "id" FROM "bq_invitation_tokens" WHERE "participant_id" = 'p19');--> statement-breakpoint
DELETE FROM "bq_invitation_tokens" WHERE "participant_id" = 'p19';--> statement-breakpoint
DELETE FROM "bq_answer_options" WHERE "question_id" IN (SELECT "id" FROM "bq_questions" WHERE "author_id" = 'p19');--> statement-breakpoint
DELETE FROM "bq_questions" WHERE "author_id" = 'p19';--> statement-breakpoint
DELETE FROM "bq_gifts" WHERE "owner_id" = 'p19';--> statement-breakpoint
DELETE FROM "bq_participants" WHERE "id" = 'p19';--> statement-breakpoint
ALTER TABLE "bq_games" DROP CONSTRAINT "bq_round_number";--> statement-breakpoint
ALTER TABLE "bq_games" DROP CONSTRAINT "bq_question_order_length";--> statement-breakpoint
ALTER TABLE "bq_rounds" DROP CONSTRAINT "bq_valid_round_number";--> statement-breakpoint
ALTER TABLE "bq_games" ADD CONSTRAINT "bq_round_number" CHECK ("bq_games"."current_round" between 0 and 19);--> statement-breakpoint
ALTER TABLE "bq_games" ADD CONSTRAINT "bq_question_order_length" CHECK ("bq_games"."question_order" is null or jsonb_array_length("bq_games"."question_order") = 19);--> statement-breakpoint
ALTER TABLE "bq_rounds" ADD CONSTRAINT "bq_valid_round_number" CHECK ("bq_rounds"."number" between 1 and 19);
