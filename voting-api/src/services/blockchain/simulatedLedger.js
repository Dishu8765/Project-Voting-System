const { getDb } = require('../../db');
const { generateTransactionHash } = require('../../utils/crypto');
const logger = require('../../utils/logger');

const GENESIS_HASH = '0'.repeat(64);

function getLastBlock() {
  const db = getDb();
  return db
    .prepare(
      `SELECT block_number, vote_hash, tx_hash, previous_hash
       FROM blockchain_ledger
       ORDER BY block_number DESC
       LIMIT 1`
    )
    .get();
}

/**
 * Simulated permissioned ledger — stores only vote hashes in a hash-linked chain.
 * Suitable for development and Hyperledger Fabric-style workflows without external deps.
 */
async function commitVoteHash(voteHash) {
  const db = getDb();
  const lastBlock = getLastBlock();
  const blockNumber = lastBlock ? lastBlock.block_number + 1 : 1;
  const previousHash = lastBlock ? lastBlock.vote_hash : GENESIS_HASH;
  const txHash = generateTransactionHash();
  const timestamp = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO blockchain_ledger (block_number, previous_hash, vote_hash, tx_hash, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  insert.run(blockNumber, previousHash, voteHash, txHash, timestamp);

  logger.info('Blockchain commit successful (simulated ledger)', {
    blockNumber,
    txHash,
    voteHash: voteHash.substring(0, 16) + '…',
    timestamp
  });

  return { txHash, blockNumber, timestamp, provider: 'simulated' };
}

async function verifyVoteHashOnChain(voteHash) {
  const db = getDb();
  const record = db
    .prepare(
      `SELECT block_number, tx_hash, timestamp, previous_hash
       FROM blockchain_ledger
       WHERE vote_hash = ?`
    )
    .get(voteHash);

  return record || null;
}

async function verifyTransactionOnChain(txHash) {
  const db = getDb();
  const record = db
    .prepare(
      `SELECT block_number, vote_hash, timestamp, previous_hash
       FROM blockchain_ledger
       WHERE tx_hash = ?`
    )
    .get(txHash);

  return record || null;
}

module.exports = {
  commitVoteHash,
  verifyVoteHashOnChain,
  verifyTransactionOnChain
};
