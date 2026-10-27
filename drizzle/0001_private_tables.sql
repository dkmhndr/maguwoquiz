-- No browser database access: deny public roles, even if the Supabase API sees these tables.
DO $$
DECLARE table_name text;
DECLARE role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['bq_participants', 'bq_invitation_tokens', 'bq_sessions', 'bq_questions', 'bq_answer_options', 'bq_gifts', 'bq_games', 'bq_rounds', 'bq_submissions', 'bq_gift_allocations', 'bq_rate_limits'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
