# Implementation Plan: PostgreSQL Voting Schema

## Overview

Implement the PostgreSQL schema for the blockchain-secured voting system by creating three output files: `voting-db/schema.sql` (full DDL), `voting-db/seed.sql` (seed data), and `voting-db/README.md` (setup documentation). The tasks follow an incremental order — schema first, seed data second, documentation third — so each step can be applied and verified before the next begins.

## Tasks

- [x] 1. Create the `voting-db` directory and write `schema.sql`
  - Create the `voting-db/` directory at the project root (sibling to `voting-api/` and `voter-frontend/`)
  - Write `voting-db/schema.sql` containing the complete DDL from the design document in this order:
    1. `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`
    2. ENUM type definitions for `voter_status` and `election_status` wrapped in idempotent `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` blocks
    3. `CREATE TABLE IF NOT EXISTS constituencies` with UUID PK, `name TEXT NOT NULL UNIQUE`, `description TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
    4. `CREATE TABLE IF NOT EXISTS elections` with UUID PK, all required columns, `FOREIGN KEY (constituency_id) REFERENCES constituencies(id) ON DELETE RESTRICT`, and `CHECK (end_date > start_date)`
    5. `CREATE TABLE IF NOT EXISTS voters` with UUID PK, `email TEXT NOT NULL UNIQUE`, `fingerprint_hash TEXT NOT NULL`, `status voter_status NOT NULL DEFAULT 'REGISTERED'`
    6. `CREATE TABLE IF NOT EXISTS candidates` with UUID PK, `FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE RESTRICT`
    7. `CREATE TABLE IF NOT EXISTS votes` with UUID PK, three FKs all with `ON DELETE RESTRICT`, `nullifier_hash TEXT NOT NULL`, `UNIQUE (nullifier_hash)`, `blockchain_tx_hash TEXT NOT NULL`, `ip_address_hash TEXT`; NO column storing a plaintext vote choice
    8. `CREATE TABLE IF NOT EXISTS audit_log` with UUID PK, `action TEXT NOT NULL`, `actor_id TEXT` (nullable), `ip_address TEXT`, `timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `details JSONB`, `success BOOLEAN NOT NULL`
    9. All seven `CREATE INDEX IF NOT EXISTS` statements: `idx_votes_nullifier_hash` (UNIQUE), `idx_voters_fingerprint_hash`, `idx_audit_log_timestamp`, `idx_votes_election_id`, `idx_candidates_election_id`, `idx_elections_constituency_id`, `idx_voters_status`
  - _Requirements: 1.1–1.5, 2.1–2.6, 3.1–3.2, 4.1–4.4, 5.1–5.9, 6.1–6.7, 7.1–7.7, 9.1–9.4_

  - [ ]* 1.1 Write property test: voter_status enum rejects invalid values
    - Insert a row into `voters` with an arbitrary non-enum string in `status` and assert a `22P02` (invalid_text_representation) or `23514` (check_violation) PostgreSQL error is raised
    - Repeat for a set of representative invalid strings (empty string, integer string, mixed-case variants like `"registered"`, `"VOTED_ALREADY"`)
    - **Property 1: voter_status accepts only valid enum values**
    - **Validates: Requirements 1.2**

  - [ ]* 1.2 Write property test: election_status enum rejects invalid values
    - Insert a row into `elections` with an arbitrary non-enum string in `status` and assert rejection
    - **Property 2: election_status accepts only valid enum values**
    - **Validates: Requirements 2.3**

  - [ ]* 1.3 Write property test: election date ordering constraint
    - Generate pairs of timestamps where `end_date <= start_date` and assert each insert is rejected with a CHECK constraint violation (`23514`)
    - Generate pairs where `end_date > start_date` and assert each insert succeeds
    - **Property 3: Election date ordering invariant**
    - **Validates: Requirements 2.6**

  - [ ]* 1.4 Write property test: votes table has no plaintext choice column
    - Query `information_schema.columns WHERE table_name = 'votes'` and assert that no column name equals any of: `choice`, `preference`, `candidate_name`, `vote_for`, `selection`
    - **Property 5: votes table contains no plaintext vote choice columns**
    - **Validates: Requirements 5.9**

- [x] 2. Write `voting-db/seed.sql`
  - Write `voting-db/seed.sql` with all inserts using fixed deterministic UUIDs and `ON CONFLICT DO NOTHING` on every statement
  - Section 1 — Constituencies: insert exactly 3 rows (`North District`, `South District`, `East District`) with the fixed UUIDs from the design document
  - Section 2 — Elections: insert exactly 1 row with `status = 'ACTIVE'`, `start_date = '2025-01-01 08:00:00+00'`, `end_date = '2025-12-31 20:00:00+00'`, referencing the `North District` constituency UUID
  - Section 3 — Voters: insert exactly 5 rows with `status = 'REGISTERED'`, using the names and emails from the design document; set `fingerprint_hash` to a prefixed hex string (e.g., `fp_hash_<64-char hex>`)
  - Section 4 — Candidates: insert exactly 3 rows (`Eleanor Whitfield`, `Marcus Chen`, `Sofia Ramirez`) all referencing the seeded election UUID and `active = TRUE`
  - Section 5 — Audit log: insert exactly 4 rows covering distinct action types: `LOGIN_ATTEMPT` (success=TRUE), `VOTE_SUBMITTED` (success=TRUE), `BLOCKCHAIN_COMMIT` (success=TRUE), `LOGIN_ATTEMPT` (success=FALSE, actor_id NULL); use valid `JSONB` in the `details` column
  - _Requirements: 8.1–8.6_

  - [ ]* 2.1 Write property test: seed script idempotency
    - Apply `seed.sql` to the test database twice in sequence
    - After each application, count rows in all five seeded tables (`constituencies`, `elections`, `voters`, `candidates`, `audit_log`)
    - Assert that row counts after the second run equal row counts after the first run
    - Assert that no error (e.g., unique constraint violation) is raised on the second run
    - **Property 7: Seed script idempotency**
    - **Validates: Requirements 8.6**

- [~] 3. Checkpoint — Verify schema and seed apply cleanly
  - Ensure all tests pass, ask the user if questions arise.
  - Manually verify by running `psql -f voting-db/schema.sql` and `psql -f voting-db/seed.sql` against a local PostgreSQL 14+ instance and confirming zero errors

- [x] 4. Validate nullifier hash double-vote prevention
  - [x] 4.1 Write a SQL test script (`voting-db/tests/test_double_vote.sql`) that:
    1. Inserts a single vote row with a known `nullifier_hash`
    2. Attempts to insert a second vote row with the same `nullifier_hash`
    3. Uses a `DO $$ BEGIN ... EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: double vote rejected'; END $$` block to catch and report the result
    - _Requirements: 5.5, 7.1_

  - [ ]* 4.2 Write property test: nullifier hash uniqueness
    - Generate any string as a `nullifier_hash`, insert the first vote row, then attempt to insert a second vote row with the identical `nullifier_hash`
    - Assert the second insert raises a `23505` (unique_violation) error regardless of which string is used
    - **Property 4: Nullifier hash uniqueness prevents double voting**
    - **Validates: Requirements 5.5**

- [ ] 5. Validate JSONB audit log storage
  - [ ]* 5.1 Write property test: JSONB audit details round-trip
    - Generate JSON documents of varying shapes (flat object, nested object, array value, numeric value, boolean value, null value)
    - Insert each into `audit_log.details`, then SELECT and compare the returned JSONB to the original input
    - Assert all key-value pairs are preserved (key order may differ)
    - **Property 6: JSONB audit details round-trip**
    - **Validates: Requirements 6.6**

- [ ] 6. Validate schema DDL idempotency
  - [ ]* 6.1 Write property test: schema DDL idempotency
    - Apply `schema.sql` twice to the same test database
    - Assert no errors on the second application
    - Query `information_schema.tables` and `information_schema.columns` after each application and assert the results are identical
    - **Property 8: Schema DDL idempotency**
    - **Validates: Requirements 9.2**

- [x] 7. Write `voting-db/README.md`
  - Write `voting-db/README.md` with the following sections:
    1. **Prerequisites** — PostgreSQL 14 or higher; `psql` CLI available in PATH
    2. **Create the database** — exact commands:
       ```bash
       createdb voting_db
       psql -d voting_db -f voting-db/schema.sql
       psql -d voting_db -f voting-db/seed.sql
       ```
    3. **Table descriptions** — one-line description for each of the 6 tables: `constituencies`, `elections`, `voters`, `candidates`, `votes`, `audit_log`
    4. **Environment variables** — document updating `DATABASE_URL` in `voting-api/.env` to a PostgreSQL connection string:
       ```
       DATABASE_URL=postgresql://postgres:password@localhost:5432/voting_db
       ```
    5. **Re-running seed data** — explain that `seed.sql` is idempotent and can be re-run safely
    6. **Node.js API migration note** — note that `src/db/index.js` must be updated to use the `pg` package (node-postgres) instead of `better-sqlite3`, and provide a minimal example of a `pg.Pool` connection setup
  - _Requirements: 10.1–10.4_

- [~] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster initial delivery
- All three output files (`schema.sql`, `seed.sql`, `README.md`) live under `voting-db/` at the project root
- The schema is intentionally forward-compatible: adding `pgcrypto` now opens the door to using `pgp_sym_encrypt` for future at-rest encryption of sensitive fields
- Property tests (optional tasks) are best run against a dedicated test PostgreSQL database spun up in a Docker container (`docker run --rm -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:14`)
