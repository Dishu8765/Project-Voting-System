# voting-db — PostgreSQL Schema for Blockchain-Secured Voting System

## Prerequisites

- PostgreSQL 14 or higher
- `psql` CLI available in your PATH
- (Optional) `createdb` utility, which ships with PostgreSQL

---

## Create the database

Run the following commands from the project root (the directory containing `voting-api/` and `voter-frontend/`):

```bash
# 1. Create the database
createdb voting_db

# 2. Apply the schema
psql -d voting_db -f voting-db/schema.sql

# 3. Load sample data
psql -d voting_db -f voting-db/seed.sql
```

To verify the schema was applied correctly:

```bash
psql -d voting_db -c "\dt"
```

---

## Table descriptions

| Table | Purpose |
|---|---|
| `constituencies` | Geographic or organizational groupings that scope elections |
| `elections` | Bounded voting events with start/end dates and a lifecycle status (UPCOMING → ACTIVE → CLOSED) |
| `voters` | Registered individuals eligible to cast a vote; tracks status (REGISTERED, VOTED, REVOKED) using a hashed identity fingerprint |
| `candidates` | Individuals standing for election; scoped per election with an active flag |
| `votes` | Vote metadata only — stores a cryptographic nullifier hash and blockchain transaction hash; no plaintext vote choice is ever stored |
| `audit_log` | Append-only record of every system action (login attempts, vote submissions, blockchain commits) with IP addresses and structured details |

---

## Environment variables

Update `voting-api/.env` to point to your PostgreSQL instance:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/voting_db
```

Replace `postgres` and `password` with your PostgreSQL username and password.

---

## Re-running seed data

`seed.sql` is idempotent — all inserts use `ON CONFLICT DO NOTHING`. You can safely re-run it against a database that already contains seed data without duplicating rows or triggering errors:

```bash
psql -d voting_db -f voting-db/seed.sql
```

---

## Node.js API migration note

The existing `voting-api` uses `better-sqlite3` (synchronous SQLite). To connect to PostgreSQL, replace `src/db/index.js` with a `pg` (node-postgres) connection pool.

**Install the pg package:**

```bash
cd voting-api
npm install pg
```

**Minimal `src/db/index.js` replacement:**

```js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function getDb() {
  return pool;
}

module.exports = { getDb };
```

**Query style changes:**
- Replace `db.prepare('SELECT ...').get(params)` → `await pool.query('SELECT ...', [params])`
- Replace `db.prepare('INSERT ...').run(params)` → `await pool.query('INSERT ...', [params])`
- Replace `db.transaction(fn)` → explicit `BEGIN` / `COMMIT` / `ROLLBACK` via `pool.query`

All route handlers and services that use `getDb()` will need to be updated to `async/await` style.
