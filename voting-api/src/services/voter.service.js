const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { hashVoterSecret } = require('../utils/crypto');
const { AppError, USER_MESSAGES } = require('../utils/errors');
const config = require('../config');
const logger = require('../utils/logger');

function authenticateVoter({ voterId, fullName, dateOfBirth }) {
  const db = getDb();
  const dobHash = hashVoterSecret(voterId, dateOfBirth);

  const voter = db
    .prepare(
      `SELECT voter_id, full_name, has_voted
       FROM voters
       WHERE voter_id = ? AND dob_hash = ?`
    )
    .get(voterId.trim().toUpperCase(), dobHash);

  if (!voter) {
    logger.warn('Authentication failed — no matching voter record', {
      voterId: voterId.trim().toUpperCase()
    });
    throw new AppError(USER_MESSAGES.INVALID_CREDENTIALS, 401, 'INVALID_CREDENTIALS');
  }

  const normalizedName = fullName.trim().toLowerCase();
  const recordName = voter.full_name.trim().toLowerCase();
  if (normalizedName !== recordName) {
    logger.warn('Authentication failed — name mismatch', { voterId: voter.voter_id });
    throw new AppError(USER_MESSAGES.INVALID_CREDENTIALS, 401, 'INVALID_CREDENTIALS');
  }

  if (voter.has_voted) {
    logger.warn('Authentication blocked — voter already voted', { voterId: voter.voter_id });
    throw new AppError(USER_MESSAGES.ALREADY_VOTED, 403, 'ALREADY_VOTED');
  }

  const token = jwt.sign(
    { voterId: voter.voter_id, sub: voter.voter_id },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  logger.info('Voter authenticated successfully', {
    voterId: voter.voter_id,
    timestamp: new Date().toISOString()
  });

  return {
    token,
    voterId: voter.voter_id,
    expiresIn: config.jwt.expiresIn
  };
}

function getVoterById(voterId) {
  const db = getDb();
  return db
    .prepare(`SELECT voter_id, full_name, has_voted FROM voters WHERE voter_id = ?`)
    .get(voterId);
}

module.exports = { authenticateVoter, getVoterById };
