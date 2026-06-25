const { sha256 } = require('../../utils/crypto');
const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * Ethereum private chain adapter.
 * Stores vote hash via eth_sendTransaction to a data-only transaction.
 * Falls back gracefully if the node is unreachable.
 */
async function commitVoteHash(voteHash) {
  const dataPayload = '0x' + voteHash;
  const timestamp = new Date().toISOString();

  const body = {
    jsonrpc: '2.0',
    method: 'eth_sendTransaction',
    params: [
      {
        from: '0x0000000000000000000000000000000000000001',
        to: '0x0000000000000000000000000000000000000000',
        data: dataPayload,
        gas: '0x5208'
      }
    ],
    id: Date.now()
  };

  const response = await fetch(config.blockchain.nodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Blockchain node returned HTTP ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message || 'Blockchain transaction failed');
  }

  const txHash = result.result;

  let blockNumber = null;
  try {
    const receiptBody = {
      jsonrpc: '2.0',
      method: 'eth_getTransactionReceipt',
      params: [txHash],
      id: Date.now() + 1
    };
    const receiptRes = await fetch(config.blockchain.nodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receiptBody),
      signal: AbortSignal.timeout(5000)
    });
    const receiptJson = await receiptRes.json();
    if (receiptJson.result?.blockNumber) {
      blockNumber = parseInt(receiptJson.result.blockNumber, 16);
    }
  } catch {
    // Block number is optional for proof return
  }

  logger.info('Blockchain commit successful (ethereum)', {
    txHash,
    voteHash: voteHash.substring(0, 16) + '…',
    blockNumber,
    timestamp
  });

  return { txHash, blockNumber, timestamp, provider: 'ethereum' };
}

async function verifyTransactionOnChain(txHash) {
  const body = {
    jsonrpc: '2.0',
    method: 'eth_getTransactionByHash',
    params: [txHash],
    id: Date.now()
  };

  const response = await fetch(config.blockchain.nodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });

  const result = await response.json();
  if (!result.result) return null;

  const inputData = result.result.input || '';
  const voteHash = inputData.startsWith('0x') ? inputData.slice(2) : inputData;
  const blockNumber = result.result.blockNumber
    ? parseInt(result.result.blockNumber, 16)
    : null;

  return {
    tx_hash: txHash,
    vote_hash: voteHash.length === 64 ? voteHash : sha256(voteHash),
    block_number: blockNumber,
    timestamp: null
  };
}

async function verifyVoteHashOnChain(voteHash) {
  // Ethereum does not support reverse lookup by data; verification uses tx hash
  return null;
}

module.exports = {
  commitVoteHash,
  verifyVoteHashOnChain,
  verifyTransactionOnChain
};
