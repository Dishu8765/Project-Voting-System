-- ============================================================
-- voting-db/schema.sql
-- PostgreSQL schema for blockchain-secured voting system
-- Compatible with PostgreSQL 14+
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE voter_status AS ENUM ('REGISTERED', 'VOTED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE election_status AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: constituencies
-- ============================================================

CREATE TABLE IF NOT EXISTS constituencies (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT constituencies_pkey PRIMARY KEY (id),
  CONSTRAINT constituencies_name_unique UNIQUE (name)
);

-- ============================================================
-- TABLE: elections
-- ============================================================

CREATE TABLE IF NOT EXISTS elections (
  id               UUID             NOT NULL DEFAULT gen_random_uuid(),
  name             TEXT             NOT NULL,
  description      TEXT,
  start_date       TIMESTAMPTZ      NOT NULL,
  end_date         TIMESTAMPTZ      NOT NULL,
  status           election_status  NOT NULL DEFAULT 'UPCOMING',
  constituency_id  UUID             NOT NULL,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT elections_pkey PRIMARY KEY (id),
  CONSTRAINT elections_constituency_fkey
    FOREIGN KEY (constituency_id) REFERENCES constituencies (id)
    ON DELETE RESTRICT,
  CONSTRAINT elections_dates_check
    CHECK (end_date > start_date)
);

-- ============================================================
-- TABLE: voters
-- ============================================================

CREATE TABLE IF NOT EXISTS voters (
  id               UUID          NOT NULL DEFAULT gen_random_uuid(),
  name             TEXT          NOT NULL,
  email            TEXT          NOT NULL,
  fingerprint_hash TEXT          NOT NULL,
  status           voter_status  NOT NULL DEFAULT 'REGISTERED',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT voters_pkey  PRIMARY KEY (id),
  CONSTRAINT voters_email_unique UNIQUE (email)
);

-- ============================================================
-- TABLE: candidates
-- ============================================================

CREATE TABLE IF NOT EXISTS candidates (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  party       TEXT        NOT NULL,
  position    TEXT        NOT NULL,
  election_id UUID        NOT NULL,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT candidates_pkey PRIMARY KEY (id),
  CONSTRAINT candidates_election_fkey
    FOREIGN KEY (election_id) REFERENCES elections (id)
    ON DELETE RESTRICT
);

-- ============================================================
-- TABLE: votes
-- ============================================================
-- IMPORTANT: No plaintext vote choice is stored here.
-- The candidate association is captured only for tally purposes
-- (candidate_id FK), not as a readable preference field.
-- The actual vote commitment lives on-chain (blockchain_tx_hash).
-- ============================================================

CREATE TABLE IF NOT EXISTS votes (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  voter_id           UUID        NOT NULL,
  candidate_id       UUID        NOT NULL,
  election_id        UUID        NOT NULL,
  nullifier_hash     TEXT        NOT NULL,
  blockchain_tx_hash TEXT        NOT NULL,
  ip_address_hash    TEXT,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT votes_pkey PRIMARY KEY (id),
  CONSTRAINT votes_voter_fkey
    FOREIGN KEY (voter_id) REFERENCES voters (id)
    ON DELETE RESTRICT,
  CONSTRAINT votes_candidate_fkey
    FOREIGN KEY (candidate_id) REFERENCES candidates (id)
    ON DELETE RESTRICT,
  CONSTRAINT votes_election_fkey
    FOREIGN KEY (election_id) REFERENCES elections (id)
    ON DELETE RESTRICT,
  CONSTRAINT votes_nullifier_unique UNIQUE (nullifier_hash)
);

-- ============================================================
-- TABLE: audit_log
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  action     TEXT        NOT NULL,
  actor_id   TEXT,
  ip_address TEXT,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details    JSONB,
  success    BOOLEAN     NOT NULL,

  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Double-vote prevention (also enforced by UNIQUE constraint above)
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_nullifier_hash
  ON votes (nullifier_hash);

-- Fast voter identity deduplication
CREATE INDEX IF NOT EXISTS idx_voters_fingerprint_hash
  ON voters (fingerprint_hash);

-- Fast forensic time-range queries on audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
  ON audit_log (timestamp);

-- Fast tally queries scoped to an election
CREATE INDEX IF NOT EXISTS idx_votes_election_id
  ON votes (election_id);

-- Fast candidate listing per election
CREATE INDEX IF NOT EXISTS idx_candidates_election_id
  ON candidates (election_id);

-- Fast election lookup by constituency
CREATE INDEX IF NOT EXISTS idx_elections_constituency_id
  ON elections (constituency_id);

-- Fast voter lookup by status (e.g. count REGISTERED voters)
CREATE INDEX IF NOT EXISTS idx_voters_status
  ON voters (status);
