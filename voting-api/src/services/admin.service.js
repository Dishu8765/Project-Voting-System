'use strict';
/**
 * admin.service.js — Business logic for the Admin Dashboard.
 *
 * Handles:
 *   - Admin authentication (bcrypt password compare, issues JWT)
 *   - Full audit log (all votes with tx hashes, timestamps, candidate names)
 *   - Full tally with percentage calculations
 *   - Election finalization
 *   - Verify by tx hash (admin view — shows candidate name)
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const config = require('../config');
const logger = require('../utils/logger');

// ── Authentication ──────────────────────────────────────────────────────────

/**
 * Authenticate an admin user with username + password.
 * @returns {{ token, username, expiresIn }}
 */
async function loginAdmin({ username, password }) {
  const db = getDb();
  const admin = db
    .prepare(`SELECT id, username, password_hash FROM admin_users WHERE username = ?`)
    .get(username.trim().toLowerCase());

  if (!admin) {
    throw new AppError('Invalid username or password.', 401, 'ADMIN_INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    logger.warn('Admin login failed — wrong password', { username });
    throw new AppError('Invalid username or password.', 401, 'ADMIN_INVALID_CREDENTIALS');
  }

  const token = jwt.sign(
    { adminId: admin.id, username: admin.username, role: 'admin' },
    config.adminJwt.secret,
    { expiresIn: config.adminJwt.expiresIn }
  );

  logger.info('Admin logged in', { username: admin.username });

  return { token, username: admin.username, expiresIn: config.adminJwt.expiresIn };
}

// ── Tally ───────────────────────────────────────────────────────────────────

/**
 * Full tally with vote counts and percentages.
 */
function getFullTally() {
  const db = getDb();

  const totalVotes = db.prepare(`SELECT COUNT(*) AS count FROM votes`).get().count;
  const registeredVoters = db.prepare(`SELECT COUNT(*) AS count FROM voters`).get().count;
  const votedCount = db.prepare(`SELECT COUNT(*) AS count FROM voters WHERE has_voted = 1`).get().count;

  const byCandidate = db
    .prepare(
      `SELECT c.id, c.name, c.party, c.office, COUNT(v.id) AS vote_count
       FROM candidates c
       LEFT JOIN votes v ON v.candidate_id = c.id
       WHERE c.active = 1
       GROUP BY c.id
       ORDER BY vote_count DESC, c.name ASC`
    )
    .all();

  const meta = db.prepare(`SELECT is_finalized, finalized_at, contract_address FROM election_meta WHERE id = 1`).get();

  return {
    totalVotesCast: totalVotes,
    registeredVoters,
    votedCount,
    turnoutPercent: registeredVoters > 0 ? Math.round((votedCount / registeredVoters) * 100) : 0,
    isFinalized: meta ? Boolean(meta.is_finalized) : false,
    finalizedAt: meta?.finalized_at || null,
    contractAddress: meta?.contract_address || null,
    results: byCandidate.map((row) => ({
      candidateId: row.id,
      name: row.name,
      party: row.party,
      office: row.office,
      votes: row.vote_count,
      percentage: totalVotes > 0 ? Math.round((row.vote_count / totalVotes) * 1000) / 10 : 0
    })),
    lastUpdated: new Date().toISOString()
  };
}

// ── Audit Log ───────────────────────────────────────────────────────────────

/**
 * Full audit log: all votes with masked voter ID, candidate, timestamps, tx hash.
 */
function getAuditLog({ limit = 200, offset = 0 } = {}) {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT
         v.id,
         -- Mask voter ID: show first 3 + *** + last 3 chars
         SUBSTR(v.voter_id, 1, 3) || '***' || SUBSTR(v.voter_id, -3) AS masked_voter_id,
         c.name AS candidate_name,
         c.party AS candidate_party,
         c.office AS candidate_office,
         v.tx_hash,
         v.block_number,
         v.confirmation_code,
         v.submitted_at
       FROM votes v
       JOIN candidates c ON c.id = v.candidate_id
       ORDER BY v.submitted_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  const total = db.prepare(`SELECT COUNT(*) AS count FROM votes`).get().count;

  return {
    total,
    limit,
    offset,
    entries: rows.map((row) => ({
      id: row.id,
      voterId: row.masked_voter_id,
      candidateName: row.candidate_name,
      candidateParty: row.candidate_party,
      candidateOffice: row.candidate_office,
      txHash: row.tx_hash,
      blockNumber: row.block_number,
      confirmationCode: row.confirmation_code,
      submittedAt: row.submitted_at
    }))
  };
}

// ── Finalization ─────────────────────────────────────────────────────────────

/**
 * Finalize the election — no more votes can be cast.
 * Also records the current vote count and contract address.
 */
function finalizeElection() {
  const db = getDb();

  const meta = db.prepare(`SELECT is_finalized FROM election_meta WHERE id = 1`).get();
  if (meta && meta.is_finalized) {
    throw new AppError('Election has already been finalized.', 409, 'ALREADY_FINALIZED');
  }

  const totalVotes = db.prepare(`SELECT COUNT(*) AS count FROM votes`).get().count;
  const finalizedAt = new Date().toISOString();
  const contractAddress = config.blockchain.contractAddress || null;

  db.prepare(
    `UPDATE election_meta
     SET is_finalized = 1, finalized_at = ?, contract_address = ?, total_votes_at_finalization = ?, updated_at = ?
     WHERE id = 1`
  ).run(finalizedAt, contractAddress, totalVotes, finalizedAt);

  logger.info('Election finalized by admin', { totalVotes, finalizedAt, contractAddress });

  return {
    finalized: true,
    totalVotesCast: totalVotes,
    finalizedAt,
    contractAddress,
    message: `Election finalized. ${totalVotes} vote(s) recorded on the blockchain.`
  };
}

// ── Verify by Tx Hash ─────────────────────────────────────────────────────

/**
 * Verify a vote by its blockchain transaction hash (admin view — shows candidate).
 */
async function verifyByTxHash(txHash) {
  const db = getDb();
  const normalized = txHash.trim().toLowerCase();

  const vote = db
    .prepare(
      `SELECT
         v.voter_id, v.tx_hash, v.vote_hash, v.block_number, v.submitted_at, v.confirmation_code,
         c.name AS candidate_name, c.party AS candidate_party, c.office AS candidate_office
       FROM votes v
       JOIN candidates c ON c.id = v.candidate_id
       WHERE LOWER(v.tx_hash) = ?`
    )
    .get(normalized);

  if (!vote) {
    throw new AppError(
      'No vote found for this transaction hash.',
      404,
      'TX_NOT_FOUND'
    );
  }

  return {
    found: true,
    txHash: vote.tx_hash,
    voteHash: vote.vote_hash,
    blockNumber: vote.block_number,
    submittedAt: vote.submitted_at,
    confirmationCode: vote.confirmation_code,
    candidateName: vote.candidate_name,
    candidateParty: vote.candidate_party,
    candidateOffice: vote.candidate_office,
    maskedVoterId: vote.voter_id.slice(0, 3) + '***' + vote.voter_id.slice(-3)
  };
}

module.exports = {
  loginAdmin,
  getFullTally,
  getAuditLog,
  finalizeElection,
  verifyByTxHash
};
