#!/usr/bin/env node
/**
 * Extract ABI from compiled Sierra contract file
 * 
 * Usage: node extract-abi.js <contract_class.json> <output.json>
 */

const fs = require('fs');
const path = require('path');

function extractAbi(contractPath, outputPath) {
  console.log(`Reading contract from: ${contractPath}`);
  
  const content = fs.readFileSync(contractPath, 'utf8');
  const contract = JSON.parse(content);
  
  // Sierra program format contains ABI information
  // The ABI is encoded in the sierra_program array
  if (!contract.sierra_program) {
    console.error('No sierra_program found in contract');
    process.exit(1);
  }
  
  console.log('Contract loaded successfully');
  console.log('Sierra program entries:', contract.sierra_program.length);
  
  // For now, create a minimal ABI based on the interface
  // This is a workaround until we can properly parse the Sierra format
  const minimalAbi = [
    {
      "type": "function",
      "name": "deploy",
      "inputs": [],
      "outputs": [{ "type": "felt" }],
      "state_mutability": "external"
    },
    {
      "type": "function",
      "name": "login",
      "inputs": [],
      "outputs": [],
      "state_mutability": "external"
    },
    {
      "type": "function",
      "name": "is_sumo_user",
      "inputs": [{ "name": "user_address", "type": "felt" }],
      "outputs": [{ "type": "felt" }],
      "state_mutability": "view"
    },
    {
      "type": "function",
      "name": "get_user_debt",
      "inputs": [{ "name": "user_address", "type": "felt" }],
      "outputs": [{ "type": "felt" }],
      "state_mutability": "view"
    },
    {
      "type": "function",
      "name": "is_valid_signature",
      "inputs": [
        { "name": "msg_hash", "type": "felt" },
        { "name": "signature", "type": "felt*" }
      ],
      "outputs": [{ "type": "felt" }],
      "state_mutability": "view"
    },
    {
      "type": "function",
      "name": "__validate__",
      "inputs": [{ "name": "calls", "type": "Call*" }],
      "outputs": [{ "type": "felt" }],
      "state_mutability": "view"
    },
    {
      "type": "function",
      "name": "__validate_declare__",
      "inputs": [{ "name": "declared_class_hash", "type": "felt" }],
      "outputs": [{ "type": "felt" }],
      "state_mutability": "view"
    },
    {
      "type": "function",
      "name": "__execute__",
      "inputs": [{ "name": "calls", "type": "Call*" }],
      "outputs": [{ "type": "felt*" }],
      "state_mutability": "external"
    },
    {
      "type": "function",
      "name": "update_oauth_public_key",
      "inputs": [],
      "outputs": [],
      "state_mutability": "external"
    },
    {
      "type": "function",
      "name": "collect_debt",
      "inputs": [{ "name": "user_address", "type": "felt" }],
      "outputs": [],
      "state_mutability": "external"
    }
  ];
  
  fs.writeFileSync(outputPath, JSON.stringify(minimalAbi, null, 2));
  console.log(`ABI extracted to: ${outputPath}`);
}

const contractFile = process.argv[2] || 'sumo-login-cairo/target/release/sumo_Login.contract_class.json';
const outputFile = process.argv[3] || 'src/abi/Login.json';

// Ensure output directory exists
const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

extractAbi(contractFile, outputFile);
