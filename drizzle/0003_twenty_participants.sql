ALTER TABLE "bq_games" DROP CONSTRAINT "bq_round_number";--> statement-breakpoint
ALTER TABLE "bq_games" DROP CONSTRAINT "bq_question_order_length";--> statement-breakpoint
ALTER TABLE "bq_rounds" DROP CONSTRAINT "bq_valid_round_number";--> statement-breakpoint
ALTER TABLE "bq_games" ADD CONSTRAINT "bq_round_number" CHECK ("bq_games"."current_round" between 0 and 20);--> statement-breakpoint
ALTER TABLE "bq_games" ADD CONSTRAINT "bq_question_order_length" CHECK ("bq_games"."question_order" is null or jsonb_array_length("bq_games"."question_order") = 20);--> statement-breakpoint
ALTER TABLE "bq_rounds" ADD CONSTRAINT "bq_valid_round_number" CHECK ("bq_rounds"."number" between 1 and 20);