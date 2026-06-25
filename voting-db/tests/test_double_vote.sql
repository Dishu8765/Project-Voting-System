-- ============================================================
-- voting-db/tests/test_double_vote.sql
-- Tests that the nullifier_hash UNIQUE constraint prevents
-- a voter from casting more than one vote.
--
-- Run with:
--   psql -d voting_db -f voting-db/tests/test_double_vote.sql
--
-- Prerequisites: schema.sql and seed.sql must be applied first.
-- ============================================================

DO $$
DECLARE
  v_nullifier TEXT := 'test_nullifier_' || gen_random_uuid()::TEXT;
  v_voter_id  UUID := 'c3000000-0000-0000-0000-000000000001';
  v_cand_id   UUID := 'd4000000-0000-0000-0000-000000000001';
  v_elec_id   UUID := 'b2000000-0000-0000-0000-000000000001';
  v_tx_hash   TEXT := '0xtest000000000000000000000000000000000000000000000000000000000001';
BEGIN
  -- Insert the first vote — should succeed
  INSERT INTO votes (voter_id, candidate_id, election_id, nullifier_hash, blockchain_tx_hash)
  VALUES (v_voter_id, v_cand_id, v_elec_id, v_nullifier, v_tx_hash);

  RAISE NOTICE 'First vote inserted successfully (expected).';

  -- Attempt to insert a second vote with the same nullifier_hash
  BEGIN
    INSERT INTO votes (voter_id, candidate_id, election_id, nullifier_hash, blockchain_tx_hash)
    VALUES (v_voter_id, v_cand_id, v_elec_id, v_nullifier, '0xtest_second_tx_hash');

    -- If we reach here the constraint did NOT fire — this is a failure
    RAISE WARNING 'FAIL: Second vote with duplicate nullifier_hash was accepted. Double-vote prevention is broken.';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS: Second vote with duplicate nullifier_hash was correctly rejected (unique_violation).';
  END;

  -- Clean up the test vote so the test is non-destructive
  DELETE FROM votes WHERE nullifier_hash = v_nullifier;
  RAISE NOTICE 'Test vote cleaned up.';

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'TEST ERROR: % — %', SQLSTATE, SQLERRM;
END $$;
