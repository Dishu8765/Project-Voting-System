'use strict';
/**
 * ganacheAdapter.js — Real Ganache blockchain adapter using Web3.js.
 *
 * Calls the deployed Voting smart contract to:
 *   - recordVote(nullifier, voteHash)  → real on-chain tx
 *   - verifyVote(nullifier)            → reads stored voteHash
 *   - verifyTransactionOnChain(txHash) → reads tx receipt
 *
 * Falls back gracefully if Ganache is unreachable.
 */

const { Web3 } = require('web3');
const path = require('path');
const fs = require('fs');
const { sha256 } = require('../../utils/crypto');
const logger = require('../../utils/logger');
const config = require('../../config');

// ── Lazy-load contract artifact ────────────────────────────────────────────
let _web3 = null;
let _contract = null;
let _accounts = [];

const ARTIFACT_PATH = path.join(__dirname, '..', '..', 'compiled', 'Voting.json');

function loadArtifact() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error(
      `Compiled contract not found at ${ARTIFACT_PATH}. ` +
      'Run: node src/contracts/compile.js'
    );
  }
  return JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
}

async function getWeb3() {
  if (_web3) return _web3;
  _web3 = new Web3(config.blockchain.nodeUrl);
  return _web3;
}

async function getContract() {
  if (_contract) return _contract;
  const web3 = await getWeb3();
  const artifact = loadArtifact();
  const address = config.blockchain.contractAddress;

  if (!address) {
    throw new Error(
      'CONTRACT_ADDRESS is not set in .env. ' +
      'Run: node scripts/deploy-contract.js'
    );
  }

  _contract = new web3.eth.Contract(artifact.abi, address);
  _accounts = await web3.eth.getAccounts();

  logger.info('Ganache contract loaded', {
    address,
    accounts: _accounts.length
  });

  return _contract;
}

/**
 * Converts a hex string (vote hash) to bytes32 for the contract call.
 */
function hexToBytes32(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Pad to 32 bytes (64 hex chars)
  return '0x' + clean.padEnd(64, '0').slice(0, 64);
}

/**
 * Generate a nullifier bytes32 from a voter token.
 * This is the on-chain double-vote prevention key.
 */
function makeNullifier(voterToken) {
  const hash = sha256(voterToken + ':nullifier');
  return hexToBytes32(hash);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Record a vote on the Ganache blockchain via the Voting contract.
 * @param {string} voteHash   - hex string (64 chars)
 * @param {string} voterToken - random token generated per vote (stays private)
 */
async function commitVoteHash(voteHash, voterToken) {
  const web3 = await getWeb3();
  const contract = await getContract();
  const from = _accounts[0];

  const nullifier = makeNullifier(voterToken || voteHash);
  const voteHashBytes32 = hexToBytes32(voteHash);

  logger.info('Sending vote to Ganache contract', {
    nullifier: nullifier.slice(0, 18) + '…',
    voteHash: voteHash.slice(0, 16) + '…'
  });

  const receipt = await contract.methods
    .recordVote(nullifier, voteHashBytes32)
    .send({ from, gas: '200000' });

  const txHash = receipt.transactionHash;
  const blockNumber = Number(receipt.blockNumber);
  const timestamp = new Date().toISOString();

  logger.info('Blockchain commit successful (Ganache)', {
    txHash,
    blockNumber,
    timestamp
  });

  return { txHash, blockNumber, timestamp, provider: 'ganache', nullifier };
}

/**
 * Verify a transaction by hash — reads the receipt from Ganache.
 */
async function verifyTransactionOnChain(txHash) {
  const web3 = await getWeb3();

  const receipt = await web3.eth.getTransactionReceipt(txHash);
  if (!receipt) return null;

  const tx = await web3.eth.getTransaction(txHash);
  const block = await web3.eth.getBlock(receipt.blockNumber);

  return {
    tx_hash: txHash,
    block_number: Number(receipt.blockNumber),
    timestamp: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
    status: receipt.status ? 'success' : 'failed',
    from: tx.from,
    contract: receipt.to
  };
}

/**
 * Ganache doesn't support reverse lookup by voteHash — use tx hash instead.
 */
async function verifyVoteHashOnChain(voteHash) {
  return null;
}

/**
 * Get current blockchain status from Ganache.
 */
async function getStatus() {
  const web3 = await getWeb3();

  const [blockNumber, accounts, networkId, isListening] = await Promise.all([
    web3.eth.getBlockNumber(),
    web3.eth.getAccounts(),
    web3.eth.net.getId(),
    web3.eth.net.isListening()
  ]);

  return {
    connected: isListening,
    provider: 'ganache',
    nodeUrl: config.blockchain.nodeUrl,
    blockNumber: Number(blockNumber),
    networkId: Number(networkId),
    contractAddress: config.blockchain.contractAddress || null,
    accountCount: accounts.length,
    accounts: accounts.map((a) => a.toLowerCase()),
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  commitVoteHash,
  verifyVoteHashOnChain,
  verifyTransactionOnChain,
  getStatus
};
