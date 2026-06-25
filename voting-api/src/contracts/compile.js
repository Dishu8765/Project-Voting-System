'use strict';
/**
 * compile.js — Compiles Voting.sol using solc and writes ABI + bytecode
 * to src/compiled/Voting.json.
 *
 * Run with: node src/contracts/compile.js
 */

const solc = require('solc');
const path = require('path');
const fs = require('fs');

const CONTRACT_NAME = 'Voting';
const SOURCE_PATH = path.join(__dirname, `${CONTRACT_NAME}.sol`);
const OUTPUT_DIR = path.join(__dirname, '..', 'compiled');
const OUTPUT_PATH = path.join(OUTPUT_DIR, `${CONTRACT_NAME}.json`);

function compile() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      [`${CONTRACT_NAME}.sol`]: { content: source }
    },
    settings: {
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode'] }
      },
      optimizer: { enabled: true, runs: 200 }
    }
  };

  console.log(`Compiling ${CONTRACT_NAME}.sol …`);
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e) => e.severity === 'error');
    if (errors.length > 0) {
      errors.forEach((e) => console.error(e.formattedMessage));
      throw new Error('Solidity compilation failed');
    }
    // Print warnings
    output.errors.forEach((e) => console.warn(e.formattedMessage));
  }

  const contract = output.contracts[`${CONTRACT_NAME}.sol`][CONTRACT_NAME];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const artifact = { contractName: CONTRACT_NAME, abi, bytecode };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(artifact, null, 2));

  console.log(`✓ Compiled successfully → ${OUTPUT_PATH}`);
  console.log(`  ABI functions: ${abi.filter((x) => x.type === 'function').map((x) => x.name).join(', ')}`);

  return artifact;
}

// Run directly or export
if (require.main === module) {
  compile();
}

module.exports = { compile };
