const { getDb } = require('../db');
const {
  hashVotePayload,
  generateNonce,
  generateConfirmationCode
} = require('../utils/crypto');
const { AppError, USER_MESSAGES } = require('../utils/errors');
const blockchain = require('./blockchain');
const logger = require('../utils/logger');

function getActiveCandidate(candidateId) {
  const db = getDb();
  return db
    .prepare(`SELECT id, name, party, office FROM candidates WHERE id = ? AND active = 1`)
    .get(candidateId);
}

function submitVote({ voterId, candidateId }) {
  const db = getDb();

  const voter = db
    .prepare(`SELECT voter_id, has_voted FROM voters WHERE voter_id = ?`)
    .get(voterId);

  if (!voter) {
    throw new AppError(USER_MESSAGES.UNAUTHORIZED, 401, 'UNAUTHORIZED');
  }

  if (voter.has_voted) {
    throw new AppError(USER_MESSAGES.ALREADY_VOTED, 403, 'ALREADY_VOTED');
  }

  const candidate = getActiveCandidate(candidateId);
  if (!candidate) {
    throw new AppError(USER_MESSAGES.INVALID_CANDIDATE, 400, 'INVALID_CANDIDATE');
  }

  const timestamp = new Date().toISOString();
  const nonce = generateNonce();
  const voterToken = generateNonce();
  const voteHash = hashVotePayload({ candidateId, voterToken, nonce, timestamp });
  const confirmationCode = generateConfirmationCode();

  logger.info('Vote submission received', {
    voterId,
    candidateId,
    voteHash: voteHash.substring(0, 16) + '…',
    timestamp
  });

  return { voteHash, confirmationCode, candidate, timestamp, nonce, voterToken };
}

async function recordVoteOnChainAndDb({
  voterId,
  candidateId,
  voteHash,
  voterToken,
  confirmationCode,
  candidate
}) {
  const db = getDb();

  const chainResult = await blockchain.commitVoteHash(voteHash, voterToken);

  const recordVote = db.transaction(() => {
    db.prepare(
      `INSERT INTO votes (voter_id, candidate_id, vote_hash, tx_hash, confirmation_code, block_number, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      voterId,
      candidateId,
      voteHash,
      chainResult.txHash,
      confirmationCode,
      chainResult.blockNumber
    );

    db.prepare(`UPDATE voters SET has_voted = 1 WHERE voter_id = ?`).run(voterId);
  });

  recordVote();

  logger.info('Vote recorded and committed to blockchain', {
    voterId,
    candidateId,
    candidateName: candidate.name,
    txHash: chainResult.txHash,
    confirmationCode,
    blockNumber: chainResult.blockNumber,
    timestamp: new Date().toISOString()
  });

  return {
    confirmationCode,
    txHash: chainResult.txHash,
    blockNumber: chainResult.blockNumber,
    timestamp: chainResult.timestamp,
    candidate: {
      id: candidate.id,
      name: candidate.name,
      office: candidate.office
    }
  };
}

function listActiveCandidates() {
  const db = getDb();
  return db
    .prepare(`SELECT id, name, party, office FROM candidates WHERE active = 1 ORDER BY name`)
    .all();
}

module.exports = {
  submitVote,
  recordVoteOnChainAndDb,
  getActiveCandidate,
  listActiveCandidates
};
