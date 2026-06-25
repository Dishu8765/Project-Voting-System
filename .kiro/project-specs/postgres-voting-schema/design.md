# Design Document: PostgreSQL Voting Schema

## Overview

This document describes the complete PostgreSQL database schema for the blockchain-secured voting system. The design replaces the existing SQLite database (managed via `better-sqlite3`) with a production-grade PostgreSQL schema that supports multi-election management, constituency scoping, voter lifecycle state machines, cryptographic double-vote prevention, and a structured audit log.

The central design principle is **metadata-only vote storage**: the `votes` table never stores a plaintext candidate preference. Every vote record contains only cryptographic commitments (nullifier hash, blockchain tx hash) that can be verified against the immutable on-chain record without revealing the voter's choice.

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────┐
│                 PostgreSQL Database              │
│                                                  │
│  ┌──────────────┐        ┌──────────────────┐   │
│  │ constituencies│◄──────│    elections      │   │
│  └──────────────┘        └────────┬─────────┘   │
│                                   │              │
│                          ┌────────▼─────────┐   │
│                          │    candidates    │   │
│                          └────────┬─────────┘   │
│                                   │              │
│  ┌──────────────┐        ┌────────▼─────────┐   │
│  │    voters    │────────│      votes       │   │
│  └──────────────┘        └──────────────────┘   │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │               audit_log                   │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Entity Relationship Description

- **constituencies** → **elections**: One-to-many. Each election belongs to one constituency.
- **elections** → **candidates**: One-to-many. Each candidate runs in exactly one election.
- **voters** → **votes**: One-to-many. Each voter may have at most one vote per election (enforced by the `nullifier_hash` unique constraint).
- **candidates** → **votes**: One-to-many. A candidate may receive many votes.
- **elections** → **votes**: One-to-many. Each vote is scoped to one election for tally isolation.
- **audit_log**: Standalone table with no foreign keys, ensuring no action is lost due to cascaded deletes.

---

## Schema DDL

The following SQL is the complete content of `voting-db/schema.sql`.

```sql
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
```

---

## Seed Script

The following SQL is the complete content of `voting-db/seed.sql`.

```sql
-- ============================================================
-- voting-db/seed.sql
-- Sample data for development and testing
-- Safe to re-run: uses ON CONFLICT DO NOTHING
-- ============================================================

-- ============================================================
-- CONSTITUENCIES (3 records)
-- ============================================================

INSERT INTO constituencies (id, name, description) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'North District',
   'Northern urban constituency covering the city centre'),
  ('a1000000-0000-0000-0000-000000000002', 'South District',
   'Southern suburban constituency including residential zones'),
  ('a1000000-0000-0000-0000-000000000003', 'East District',
   'Eastern rural constituency with mixed agricultural and light industry')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ELECTIONS (1 active election)
-- ============================================================

INSERT INTO elections (id, name, description, start_date, end_date, status, constituency_id) VALUES
  (
    'b2000000-0000-0000-0000-000000000001',
    '2025 North District Mayoral Election',
    'Annual mayoral election for the North District constituency',
    '2025-01-01 08:00:00+00',
    '2025-12-31 20:00:00+00',
    'ACTIVE',
    'a1000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- VOTERS (5 records, all REGISTERED)
-- ============================================================

INSERT INTO voters (id, name, email, fingerprint_hash, status) VALUES
  ('c3000000-0000-0000-0000-000000000001', 'Jane Smith',
   'jane.smith@example.com',
   'fp_hash_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
   'REGISTERED'),
  ('c3000000-0000-0000-0000-000000000002', 'Robert Johnson',
   'robert.johnson@example.com',
   'fp_hash_b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
   'REGISTERED'),
  ('c3000000-0000-0000-0000-000000000003', 'Maria Garcia',
   'maria.garcia@example.com',
   'fp_hash_c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
   'REGISTERED'),
  ('c3000000-0000-0000-0000-000000000004', 'James Wilson',
   'james.wilson@example.com',
   'fp_hash_d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
   'REGISTERED'),
  ('c3000000-0000-0000-0000-000000000005', 'Patricia Brown',
   'patricia.brown@example.com',
   'fp_hash_e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
   'REGISTERED')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CANDIDATES (3 records for the active election)
-- ============================================================

INSERT INTO candidates (id, name, party, position, election_id, active) VALUES
  ('d4000000-0000-0000-0000-000000000001', 'Eleanor Whitfield', 'Independent',
   'Mayor', 'b2000000-0000-0000-0000-000000000001', TRUE),
  ('d4000000-0000-0000-0000-000000000002', 'Marcus Chen', 'Community Alliance',
   'Mayor', 'b2000000-0000-0000-0000-000000000001', TRUE),
  ('d4000000-0000-0000-0000-000000000003', 'Sofia Ramirez', 'Forward Together',
   'Mayor', 'b2000000-0000-0000-0000-000000000001', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- AUDIT LOG (sample entries)
-- ============================================================

INSERT INTO audit_log (id, action, actor_id, ip_address, details, success) VALUES
  (
    'e5000000-0000-0000-0000-000000000001',
    'LOGIN_ATTEMPT',
    'c3000000-0000-0000-0000-000000000001',
    '203.0.113.42',
    '{"voter_id": "c3000000-0000-0000-0000-000000000001", "method": "fingerprint"}'::jsonb,
    TRUE
  ),
  (
    'e5000000-0000-0000-0000-000000000002',
    'VOTE_SUBMITTED',
    'c3000000-0000-0000-0000-000000000001',
    '203.0.113.42',
    '{"election_id": "b2000000-0000-0000-0000-000000000001", "nullifier_hash_prefix": "0xabc123"}'::jsonb,
    TRUE
  ),
  (
    'e5000000-0000-0000-0000-000000000003',
    'BLOCKCHAIN_COMMIT',
    'c3000000-0000-0000-0000-000000000001',
    '203.0.113.42',
    '{"tx_hash": "0xdeadbeef000000000000000000000000000000000000000000000000deadbeef", "block_number": 4200001}'::jsonb,
    TRUE
  ),
  (
    'e5000000-0000-0000-0000-000000000004',
    'LOGIN_ATTEMPT',
    NULL,
    '198.51.100.77',
    '{"reason": "unknown_voter_id", "attempted_id": "VOTER999"}'::jsonb,
    FALSE
  )
ON CONFLICT DO NOTHING;
```

---

## Index Strategy

| Index | Table | Column | Rationale |
|---|---|---|---|
| `idx_votes_nullifier_hash` (UNIQUE) | `votes` | `nullifier_hash` | Double-vote enforcement; also drives the UNIQUE constraint |
| `idx_voters_fingerprint_hash` | `voters` | `fingerprint_hash` | Identity deduplication on registration/lookup |
| `idx_audit_log_timestamp` | `audit_log` | `timestamp` | Forensic time-range queries (`WHERE timestamp BETWEEN ...`) |
| `idx_votes_election_id` | `votes` | `election_id` | Tally aggregation (`SELECT candidate_id, COUNT(*) ... GROUP BY`) |
| `idx_candidates_election_id` | `candidates` | `election_id` | Listing active candidates for a given election |
| `idx_elections_constituency_id` | `elections` | `constituency_id` | Filtering elections by constituency |
| `idx_voters_status` | `voters` | `status` | Counting registered/voted/revoked voters efficiently |

---

## Migration Approach

The schema uses a **flat file migration** pattern suitable for this project's current scale:

1. **`schema.sql`** — Full DDL, idempotent via `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. ENUM types are guarded with `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` blocks.
2. **`seed.sql`** — Reference data and test fixtures, idempotent via `ON CONFLICT DO NOTHING`.

For future evolution, the recommended next step is adopting a migration tool such as `node-pg-migrate` or `Flyway`, with each schema change in its own numbered migration file (e.g., `V2__add_voter_phone.sql`).

---

## Node.js API Integration Notes

The existing `voting-api` uses `better-sqlite3`. To connect to PostgreSQL, replace the `src/db/index.js` module with a `pg` (node-postgres) pool. Key changes:

- Replace `better-sqlite3` with `pg` package.
- Replace `db.prepare(...).get(...)` calls with `pool.query(...)` async calls.
- Replace `db.transaction(fn)` with explicit `BEGIN`/`COMMIT`/`ROLLBACK` SQL via the pool.
- Update `DATABASE_URL` in `.env` to a PostgreSQL connection string: `postgresql://user:password@localhost:5432/voting_db`.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: voter_status accepts only valid enum values

For any string value inserted into `voters.status`, the database SHALL accept the value if and only if it equals one of `REGISTERED`, `VOTED`, or `REVOKED`. Any other string value SHALL be rejected with a constraint violation.

**Validates: Requirements 1.2**

---

### Property 2: election_status accepts only valid enum values

For any string value inserted into `elections.status`, the database SHALL accept the value if and only if it equals one of `UPCOMING`, `ACTIVE`, or `CLOSED`. Any other string value SHALL be rejected with a constraint violation.

**Validates: Requirements 2.3**

---

### Property 3: Election date ordering invariant

For any pair of timestamps `(start_date, end_date)`, the database SHALL accept the election record if and only if `end_date > start_date`. Any record where `end_date <= start_date` SHALL be rejected by the CHECK constraint.

**Validates: Requirements 2.6**

---

### Property 4: Nullifier hash uniqueness prevents double voting

For any two vote records sharing the same `nullifier_hash` value, the database SHALL accept the first insert and reject the second with a unique constraint violation, regardless of the specific hash string used.

**Validates: Requirements 5.5**

---

### Property 5: votes table contains no plaintext vote choice columns

For any introspection of the `votes` table's column list, no column name SHALL suggest a plaintext vote preference (e.g., columns named `choice`, `preference`, `candidate_name`, or `vote_for` are absent). Only cryptographic references (`nullifier_hash`, `blockchain_tx_hash`) and relational foreign keys (`candidate_id`, `voter_id`, `election_id`) are permitted.

**Validates: Requirements 5.9**

---

### Property 6: JSONB audit details round-trip

For any valid JSON document inserted into `audit_log.details`, querying the row SHALL return a value equal to the original JSON document (key order may differ as PostgreSQL normalizes JSONB storage, but all key-value pairs SHALL be preserved).

**Validates: Requirements 6.6**

---

### Property 7: Seed script idempotency

For any number of sequential executions of `seed.sql` against the same database (N ≥ 1), the row counts in `constituencies`, `elections`, `voters`, `candidates`, and `audit_log` SHALL be identical after the Nth execution as after the first execution. No duplicate-key errors SHALL be raised.

**Validates: Requirements 8.6**

---

### Property 8: Schema DDL idempotency

For any number of sequential executions of `schema.sql` against the same PostgreSQL database (N ≥ 1), the second and subsequent executions SHALL complete without error and SHALL NOT alter the table definitions, indexes, or constraints created by the first execution.

**Validates: Requirements 9.2**
