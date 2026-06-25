'use strict';
const config = require('../../config');
const simulated = require('./simulatedLedger');
const ethereum = require('./ethereumAdapter');
const ganache = require('./ganacheAdapter');
const { AppError, USER_MESSAGES } = require('../../utils/errors');
const logger = require('../../utils/logger');

function getProvider() {
  switch (config.blockchain.provider) {
    case 'ganache':
      return ganache;
    case 'ethereum':
      return ethereum;
    default:
      return simulated;
  }
}

async function commitVoteHash(voteHash, voterToken) {
  const provider = getProvider();
  try {
    return await provider.commitVoteHash(voteHash, voterToken);
  } catch (err) {
    logger.error('Blockchain commit failed', {
      provider: config.blockchain.provider,
      error: err.message
    });
    throw new AppError(USER_MESSAGES.BLOCKCHAIN_ERROR, 503, 'BLOCKCHAIN_ERROR');
  }
}

async function verifyVoteHash(voteHash) {
  const provider = getProvider();
  return provider.verifyVoteHashOnChain(voteHash);
}

async function verifyTransaction(txHash) {
  const provider = getProvider();
  return provider.verifyTransactionOnChain(txHash);
}

/**
 * Get blockchain status — only supported by the ganache provider.
 * Returns a minimal status object for other providers.
 */
async function getStatus() {
  const provider = getProvider();
  if (typeof provider.getStatus === 'function') {
    try {
      return await provider.getStatus();
    } catch (err) {
      logger.warn('Blockchain status check failed', { error: err.message });
      return {
        connected: false,
        provider: config.blockchain.provider,
        nodeUrl: config.blockchain.nodeUrl,
        error: err.message,
        checkedAt: new Date().toISOString()
      };
    }
  }
  // Simulated / Ethereum adapter: return static info
  return {
    connected: true,
    provider: config.blockchain.provider,
    nodeUrl: config.blockchain.nodeUrl,
    blockNumber: null,
    contractAddress: null,
    accountCount: null,
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  commitVoteHash,
  verifyVoteHash,
  verifyTransaction,
  getStatus
};
