const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

let db;

function resolveDbPath() {
  const url = config.databaseUrl;
  if (url.startsWith('file:')) {
    return url.replace('file:', '');
  }
  return path.isAbsolute(url) ? url : path.join(process.cwd(), url);
}

function getDb() {
  if (!db) {
    const dbPath = resolveDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema();
    seedAdminUser();
    logger.info('Database connected', { path: dbPath });
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      dob_hash TEXT NOT NULL,
      has_voted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      party TEXT NOT NULL,
      office TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id TEXT NOT NULL UNIQUE,
      candidate_id TEXT NOT NULL,
      vote_hash TEXT NOT NULL UNIQUE,
      tx_hash TEXT NOT NULL UNIQUE,
      confirmation_code TEXT NOT NULL UNIQUE,
      block_number INTEGER,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    );

    CREATE TABLE IF NOT EXISTS blockchain_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_number INTEGER NOT NULL UNIQUE,
      previous_hash TEXT NOT NULL,
      vote_hash TEXT NOT NULL UNIQUE,
      tx_hash TEXT NOT NULL UNIQUE,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Admin users for the election dashboard
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Election metadata (finalization state, contract info)
    CREATE TABLE IF NOT EXISTS election_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      is_finalized INTEGER NOT NULL DEFAULT 0,
      finalized_at TEXT,
      contract_address TEXT,
      total_votes_at_finalization INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_votes_confirmation ON votes(confirmation_code);
    CREATE INDEX IF NOT EXISTS idx_votes_tx ON votes(tx_hash);
    CREATE INDEX IF NOT EXISTS idx_ledger_vote_hash ON blockchain_ledger(vote_hash);
    CREATE INDEX IF NOT EXISTS idx_admin_username ON admin_users(username);
  `);

  // Ensure election_meta has at least one row
  const meta = db.prepare(`SELECT id FROM election_meta WHERE id = 1`).get();
  if (!meta) {
    db.prepare(`INSERT INTO election_meta (id, is_finalized) VALUES (1, 0)`).run();
  }
}

/**
 * Seed the default admin user if none exists.
 * Credentials: admin / admin123
 *
 * Password is hashed with bcryptjs (cost 10).
 * Change this before deploying to production.
 */
function seedAdminUser() {
  const existing = db.prepare(`SELECT id FROM admin_users LIMIT 1`).get();
  if (existing) return;

  // Pre-computed bcrypt hash of "admin123" with cost 10.
  // This avoids a sync require of bcryptjs at startup — the admin service
  // uses bcryptjs.compare() for actual logins.
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('admin123', 10);

  db.prepare(`INSERT INTO admin_users (username, password_hash) VALUES (?, ?)`).run('admin', hash);
  logger.info('Default admin user seeded (username: admin, password: admin123)');
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb, initializeSchema };
