#!/usr/bin/env node

/**
 * ZK Circuit Setup Script
 *
 * This script sets up the zero-knowledge circuits for SUMO Login.
 * It compiles the Circom circuits and generates proving/verification keys.
 *
 * Requirements:
 * - circom (https://docs.circom.io/getting-started/installation/)
 * - snarkjs (npm install -g snarkjs)
 *
 * Usage:
 *   node scripts/setup-zk.js [--official]
 *
 * Options:
 *   --official  Use official circuit with SHA256 hash output (slower, ~110k constraints)
 *   (default)   Use current circuit with direct public inputs (faster, ~5k constraints)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CIRCUITS_DIR = path.join(__dirname, '../circuits');
const BUILD_DIR = path.join(CIRCUITS_DIR, 'build');
const PUBLIC_ZK_DIR = path.join(__dirname, '../public/zk');

// Parse command line arguments
const useOfficial = process.argv.includes('--official');

// Circuit configuration
const CIRCUIT_NAME = useOfficial ? 'sumo_auth_official' : 'sumo_auth';
const PTAU_POWER = useOfficial ? 19 : 14;  // 2^19 = 524288 for official (~170k constraints), 2^14 = 16384 for current

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  log(`> ${command}`, 'blue');
  return execSync(command, { 
    stdio: 'inherit',
    cwd: CIRCUITS_DIR,
    ...options 
  });
}

function checkCommand(command) {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, dest) {
  log(`Downloading ${url}...`, 'yellow');
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  log(`Downloaded to ${dest}`, 'green');
}

async function main() {
  log('\n=== SUMO Login ZK Circuit Setup ===\n', 'bright');
  log(`Mode: ${useOfficial ? 'Official (SHA256 hash)' : 'Current (direct inputs)'}`, 'yellow');
  log(`Circuit: ${CIRCUIT_NAME}.circom`, 'yellow');
  log(`Powers of Tau: 2^${PTAU_POWER} = ${Math.pow(2, PTAU_POWER)} constraints\n`, 'yellow');

  // Check prerequisites
  log('Checking prerequisites...', 'yellow');
  
  if (!checkCommand('circom')) {
    log('\nError: circom is not installed.', 'red');
    log('Please install it first:', 'red');
    log('  https://docs.circom.io/getting-started/installation/\n', 'red');
    process.exit(1);
  }
  
  let snarkjsCmd = 'snarkjs';
  if (!checkCommand('snarkjs')) {
    try {
      execSync('npx snarkjs --help', { stdio: 'ignore' });
      snarkjsCmd = 'npx snarkjs';
    } catch (e) {
      // snarkjs --help returns exit code 99
      if (e.status === 99) {
        snarkjsCmd = 'npx snarkjs';
      } else {
        log('\nError: snarkjs is not installed.', 'red');
        log('Please install it: npm install -g snarkjs\n', 'red');
        process.exit(1);
      }
    }
  }
  
  log('Prerequisites check passed!\n', 'green');

  // Create directories
  log('Creating directories...', 'yellow');
  [BUILD_DIR, PUBLIC_ZK_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Compile circuit
  log('\n1. Compiling circuit...', 'bright');
  try {
    exec(`circom ${CIRCUIT_NAME}.circom --r1cs --wasm --sym -o build/ -l ../node_modules`);
    log('Circuit compiled successfully!\n', 'green');
  } catch (error) {
    log('Circuit compilation failed!', 'red');
    console.error(error);
    process.exit(1);
  }

  // Setup Powers of Tau
  log('2. Setting up Powers of Tau...', 'bright');
  const ptauPath = path.join(BUILD_DIR, `pot${PTAU_POWER}_final.ptau`);

  if (!fs.existsSync(ptauPath)) {
    try {
      log('Generating Powers of Tau...', 'yellow');
      exec(`${snarkjsCmd} powersoftau new bn128 ${PTAU_POWER} build/pot${PTAU_POWER}_0000.ptau`);
      exec(`${snarkjsCmd} powersoftau contribute build/pot${PTAU_POWER}_0000.ptau build/pot${PTAU_POWER}_0001.ptau --name="First contribution" -v -e="random text"`);
      exec(`${snarkjsCmd} powersoftau prepare phase2 build/pot${PTAU_POWER}_0001.ptau build/pot${PTAU_POWER}_final.ptau -v`);
      log('Powers of Tau generated!', 'green');
    } catch (error) {
      log('Failed to generate Powers of Tau', 'red');
      console.error(error);
      process.exit(1);
    }
  } else {
    log('Powers of Tau already exists, skipping generation', 'yellow');
  }

  // Trusted setup
  log('\n3. Running trusted setup...', 'bright');
  try {
    exec(`${snarkjsCmd} groth16 setup build/${CIRCUIT_NAME}.r1cs build/pot${PTAU_POWER}_final.ptau build/${CIRCUIT_NAME}_0000.zkey`);
    log('Trusted setup complete!\n', 'green');
  } catch (error) {
    log('Trusted setup failed!', 'red');
    console.error(error);
    process.exit(1);
  }

  // Contribute to phase 2
  log('4. Contributing to phase 2...', 'bright');
  try {
    exec(`${snarkjsCmd} zkey contribute build/${CIRCUIT_NAME}_0000.zkey build/${CIRCUIT_NAME}_final.zkey --name="SUMO Login" -v -e="random entropy"`);
    log('Phase 2 contribution complete!\n', 'green');
  } catch (error) {
    log('Phase 2 contribution failed!', 'red');
    console.error(error);
    process.exit(1);
  }

  // Export verification key
  log('5. Exporting verification key...', 'bright');
  try {
    exec(`${snarkjsCmd} zkey export verificationkey build/${CIRCUIT_NAME}_final.zkey build/verification_key.json`);
    log('Verification key exported!\n', 'green');
  } catch (error) {
    log('Verification key export failed!', 'red');
    console.error(error);
    process.exit(1);
  }

  // Copy files to public directory
  log('6. Copying files to public directory...', 'bright');
  try {
    fs.copyFileSync(
      path.join(BUILD_DIR, `${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm`),
      path.join(PUBLIC_ZK_DIR, `${CIRCUIT_NAME}.wasm`)
    );
    fs.copyFileSync(
      path.join(BUILD_DIR, `${CIRCUIT_NAME}_final.zkey`),
      path.join(PUBLIC_ZK_DIR, `${CIRCUIT_NAME}_final.zkey`)
    );
    fs.copyFileSync(
      path.join(BUILD_DIR, 'verification_key.json'),
      path.join(PUBLIC_ZK_DIR, 'verification_key.json')
    );
    log('Files copied successfully!\n', 'green');
  } catch (error) {
    log('File copy failed!', 'red');
    console.error(error);
    process.exit(1);
  }

  // Summary
  log('=== Setup Complete ===\n', 'bright');
  log('Generated files:', 'green');
  log(`  - public/zk/${CIRCUIT_NAME}.wasm`);
  log(`  - public/zk/${CIRCUIT_NAME}_final.zkey`);
  log('  - public/zk/verification_key.json');
  log('\nYou can now build and deploy the application!', 'green');

  if (useOfficial) {
    log('\nNext steps for official implementation:', 'yellow');
    log('  1. Run: garaga gen --vk public/zk/verification_key.json --system groth16');
    log('  2. Update Cairo contracts with new verifier constants');
    log('  3. Restore official validate_all_inputs_hash in utils.cairo');
  }
}

main().catch(error => {
  log(`\nError: ${error.message}`, 'red');
  process.exit(1);
});
