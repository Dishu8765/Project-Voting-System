'use strict';
/**
 * deploy-contract.js — Deploys Voting.sol to a running Ganache instance
 * and writes the contract address to voting-api/.env automatically.
 *
 * Prerequisites:
 *   1. Ganache running:  ganache --deterministic --accounts 10 --host 0.0.0.0
 *   2. Contract compiled: node src/contracts/compile.js
 *
 * Usage:
 *   cd voting-api && node scripts/deploy-contract.js
 */

const { Web3 } = require('web3');
const path = require('path');
const fs = require('fs');

// ── Paths ──────────────────────────────────────────────────────────────────
const ROOT_DIR = path.join(__dirname, '..');
const ARTIFACT_PATH = path.join(ROOT_DIR, 'src', 'compiled', 'Voting.json');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const CONTRACTS_DIR = path.join(ROOT_DIR, 'src', 'compiled');

// ── Config ─────────────────────────────────────────────────────────────────
const GANACHE_URL = process.env.BLOCKCHAIN_NODE_URL || 'http://127.0.0.1:8545';

async function compileIfNeeded() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    console.log('Compiled artifact not found — compiling Voting.sol …');
    const { compile } = require('../src/contracts/compile');
    compile();
  }
}

async function deploy() {
  await compileIfNeeded();

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
  const { abi, bytecode } = artifact;

  console.log(`\nConnecting to Ganache at ${GANACHE_URL} …`);
  const web3 = new Web3(GANACHE_URL);

  // Verify connection
  let blockNumber;
  try {
    blockNumber = await web3.eth.getBlockNumber();
    console.log(`✓ Connected — current block: ${blockNumber}`);
  } catch (err) {
    console.error(`✗ Cannot connect to Ganache at ${GANACHE_URL}`);
    console.error('  Make sure Ganache is running: ganache --deterministic --accounts 10 --host 0.0.0.0');
    process.exit(1);
  }

  const accounts = await web3.eth.getAccounts();
  const deployer = accounts[0];
  console.log(`\nDeploying from account: ${deployer}`);

  const contract = new web3.eth.Contract(abi);
  const gas = await contract.deploy({ data: '0x' + bytecode }).estimateGas({ from: deployer });

  console.log(`Estimated gas: ${gas}`);

  const deployed = await contract
    .deploy({ data: '0x' + bytecode })
    .send({ from: deployer, gas: Math.ceil(Number(gas) * 1.2).toString() });

  const contractAddress = deployed.options.address;

  console.log(`\n✓ Contract deployed successfully!`);
  console.log(`  Address:      ${contractAddress}`);
  console.log(`  Block number: ${await web3.eth.getBlockNumber()}`);
  console.log(`  Network ID:   ${await web3.eth.net.getId()}`);

  // ── Write contract address to .env ─────────────────────────────────────
  updateEnvFile(ENV_PATH, 'CONTRACT_ADDRESS', contractAddress);
  updateEnvFile(ENV_PATH, 'BLOCKCHAIN_PROVIDER', 'ganache');
  updateEnvFile(ENV_PATH, 'BLOCKCHAIN_NODE_URL', GANACHE_URL);

  console.log(`\n✓ Updated .env with CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`✓ Updated .env with BLOCKCHAIN_PROVIDER=ganache`);
  console.log('\nNext step: cd voting-api && npm run dev');

  return contractAddress;
}

/**
 * Upserts a key=value line in a .env file.
 */
function updateEnvFile(envPath, key, value) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const newLine = `${key}=${value}`;

  if (regex.test(content)) {
    content = content.replace(regex, newLine);
  } else {
    content = content.trimEnd() + '\n' + newLine + '\n';
  }

  fs.writeFileSync(envPath, content);
}

deploy().catch((err) => {
  console.error('\n✗ Deployment failed:', err.message);
  process.exit(1);
});
