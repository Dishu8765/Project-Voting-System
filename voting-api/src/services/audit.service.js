const { getDb } = require('../db');
const blockchain = require('./blockchain');
const { AppError, USER_MESSAGES } = require('../utils/errors');

function verifyByConfirmationCode(confirmationCode) {
  const db = getDb();
  const vote = db
    .prepare(
      `SELECT v.confirmation_code, v.tx_hash, v.vote_hash, v.block_number, v.submitted_at,
              c.name AS candidate_name, c.office
       FROM votes v
       JOIN candidates c ON c.id = v.candidate_id
       WHERE v.confirmation_code = ?`
    )
    .get(confirmationCode.trim().toUpperCase());

  if (!vote) {
    throw new AppError(USER_MESSAGES.VOTE_NOT_FOUND, 404, 'VOTE_NOT_FOUND');
  }

  return formatVerificationResult(vote);
}

async function verifyByTransactionHash(txHash) {
  const db = getDb();
  const normalized = txHash.trim().toLowerCase();
  const vote = db
    .prepare(
      `SELECT v.confirmation_code, v.tx_hash, v.vote_hash, v.block_number, v.submitted_at,
              c.name AS candidate_name, c.office
       FROM votes v
       JOIN candidates c ON c.id = v.candidate_id
       WHERE LOWER(v.tx_hash) = ?`
    )
    .get(normalized);

  if (!vote) {
    const onChain = await blockchain.verifyTransaction(txHash);
    if (!onChain) {
      throw new AppError(USER_MESSAGES.TX_NOT_FOUND, 404, 'TX_NOT_FOUND');
    }
    return {
      verified: true,
      onBlockchain: true,
      transactionHash: txHash,
      voteHash: onChain.vote_hash,
      blockNumber: onChain.block_number,
      message: 'This transaction is recorded on the blockchain. No local ballot details are available.'
    };
  }

  return formatVerificationResult(vote);
}

async function verifyVoteHash(voteHash) {
  const db = getDb();
  const vote = db
    .prepare(
      `SELECT confirmation_code, tx_hash, vote_hash, block_number, submitted_at
       FROM votes WHERE vote_hash = ?`
    )
    .get(voteHash);

  const onChain = await blockchain.verifyVoteHash(voteHash);

  if (!vote && !onChain) {
    throw new AppError(USER_MESSAGES.VOTE_NOT_FOUND, 404, 'VOTE_NOT_FOUND');
  }

  return {
    verified: true,
    onBlockchain: Boolean(onChain),
    voteHash,
    transactionHash: vote?.tx_hash || onChain?.tx_hash,
    blockNumber: vote?.block_number || onChain?.block_number,
    submittedAt: vote?.submitted_at || onChain?.timestamp,
    message: 'The vote hash is recorded on the permissioned blockchain.'
  };
}

function formatVerificationResult(vote) {
  return {
    verified: true,
    onBlockchain: true,
    confirmationCode: vote.confirmation_code,
    transactionHash: vote.tx_hash,
    voteHash: vote.vote_hash,
    blockNumber: vote.block_number,
    submittedAt: vote.submitted_at,
    message: 'Your vote has been verified and is recorded on the blockchain.'
  };
}

function getAuditSummary() {
  const db = getDb();
  const ledgerCount = db.prepare(`SELECT COUNT(*) AS count FROM blockchain_ledger`).get().count;
  const voteCount = db.prepare(`SELECT COUNT(*) AS count FROM votes`).get().count;
  const lastBlock = db
    .prepare(
      `SELECT block_number, tx_hash, timestamp FROM blockchain_ledger ORDER BY block_number DESC LIMIT 1`
    )
    .get();

  return {
    totalVotesRecorded: voteCount,
    totalBlockchainEntries: ledgerCount,
    ledgerInSync: voteCount === ledgerCount,
    lastBlock: lastBlock || null,
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  verifyByConfirmationCode,
  verifyByTransactionHash,
  verifyVoteHash,
  getAuditSummary
};
