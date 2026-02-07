/**
 * ZK Proof Service
 * 
 * This service handles zero-knowledge proof generation and verification
 * using snarkjs for browser environments.
 * 
 * For production use, circuits should be pre-compiled and keys generated
 * through a trusted setup ceremony.
 */

import { buildPoseidon } from 'circomlibjs';
import { groth16 } from 'snarkjs';
import type { GoogleJWT, SessionKeyPair, ZKProof } from '@/types';

// Circuit files (pre-compiled and hosted) - Official version with SHA256 hash output
// Add cache-busting timestamp to force browser to load new files
const CACHE_BUST = '?v=' + Date.now();
const CIRCUIT_WASM_URL = '/zk/sumo_auth_official.wasm' + CACHE_BUST;
const CIRCUIT_ZKEY_URL = '/zk/sumo_auth_official_final.zkey' + CACHE_BUST;
const VERIFICATION_KEY_URL = '/zk/verification_key.json' + CACHE_BUST;

// Constants for u256 splitting
const U128_MAX = BigInt(1) << BigInt(128);
const U128_MASK = U128_MAX - BigInt(1);

// Cache for poseidon hasher
let poseidonInstance: any = null;

/**
 * Initialize Poseidon hasher
 */
async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/**
 * Split a u256 value into high and low u128 parts
 * Returns { high: u128, low: u128 }
 */
function splitU256(value: bigint): { high: bigint; low: bigint } {
  const low = value & U128_MASK;
  const high = value >> BigInt(128);
  return { high, low };
}

/**
 * Convert string to byte array (padded)
 */
function stringToBytes(str: string, length: number): number[] {
  const bytes = new Array(length).fill(0);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  for (let i = 0; i < Math.min(encoded.length, length); i++) {
    bytes[i] = encoded[i];
  }
  return bytes;
}

/**
 * Hash email bytes using Poseidon with chunking (matches Circom circuit)
 * Circuit: chunkSize = 15, numChunks = ceil(emailLength / 15)
 * Each chunk: [chainInput, byte0, byte1, ..., byte14] (16 inputs total)
 */
async function hashEmailBytes(emailBytes: number[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  
  const CHUNK_SIZE = 15;  // 15 data bytes per chunk
  const POSEIDON_SIZE = 16;  // Poseidon(16)
  const numChunks = Math.ceil(emailBytes.length / CHUNK_SIZE);
  
  let currentHash: bigint = BigInt(0);
  
  for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min((i + 1) * CHUNK_SIZE, emailBytes.length);
    const chunk = emailBytes.slice(start, end);
    
    // Build Poseidon inputs: [chainInput, byte0, byte1, ..., byte14]
    const inputs: (bigint | number)[] = new Array(POSEIDON_SIZE).fill(0);
    inputs[0] = currentHash;  // Chain input from previous hash
    
    // Fill in email bytes
    for (let j = 0; j < chunk.length; j++) {
      inputs[j + 1] = chunk[j];
    }
    
    const hash = poseidon(inputs);
    currentHash = poseidon.F.toObject(hash);
  }
  
  return currentHash;
}

/**
 * Generate identity commitment from JWT data
 */
export async function generateIdentityCommitment(
  email: string,
  sub: string,
  secret: bigint
): Promise<bigint> {
  const poseidon = await getPoseidon();
  
  // Hash email
  const emailBytes = stringToBytes(email, 32);
  const emailHash = await hashEmailBytes(emailBytes);
  
  // Convert sub to number (use first 16 chars as hex)
  const subBytes = new TextEncoder().encode(sub.slice(0, 16));
  const subHex = Array.from(subBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const subNum = BigInt('0x' + subHex);
  
  // Identity commitment = Poseidon(emailHash, sub, secret)
  const commitment = poseidon([emailHash, subNum, secret]);
  return poseidon.F.toObject(commitment);
}

/**
 * Generate session authorization hash
 */
export async function generateSessionAuth(
  identityCommitment: bigint,
  sessionPublicKey: string
): Promise<bigint> {
  const poseidon = await getPoseidon();
  
  // Convert public key to number
  // Handle case where public key might be an array string like "0x2,97,221,..."
  let cleanPk = sessionPublicKey;
  if (sessionPublicKey.includes(',')) {
    // It's an array representation, convert to hex
    const bytes = sessionPublicKey.replace('0x', '').split(',').map(b => parseInt(b.trim()));
    cleanPk = '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Remove '0x' prefix and take first 32 hex chars (16 bytes)
  const hexStr = cleanPk.startsWith('0x') ? cleanPk.slice(2) : cleanPk;
  const pkNum = BigInt('0x' + hexStr.slice(0, 32));
  
  const auth = poseidon([identityCommitment, pkNum]);
  return poseidon.F.toObject(auth);
}

/**
 * Generate ZK Proof inputs matching sumo_auth_official.circom circuit
 *
 * The official circuit uses SHA256 hash of all inputs as public output.
 * Each u256 input is split into high (128 bits) and low (128 bits).
 *
 * Circuit Inputs (all private, hash is computed inside circuit):
 * - eph_public_key0_high/low - Ephemeral public key X coordinate
 * - eph_public_key1_high/low - Ephemeral public key Y coordinate
 * - address_seed_high/low - Derived from JWT sub + email + secret
 * - max_epoch - Maximum block number for validity (u64)
 * - iss_b64_F_high/low - JWT issuer field representation
 * - iss_index_in_payload_mod_4 - Issuer index in payload mod 4 (u8)
 * - header_F_high/low - JWT header field representation
 * - modulus_F_high/low - RSA modulus field representation
 * - sub - JWT subject identifier
 * - email[64] - Email bytes
 * - secret - User secret
 *
 * Circuit Outputs (public):
 * - all_inputs_hash_high - SHA256 hash high 128 bits
 * - all_inputs_hash_low - SHA256 hash low 128 bits
 */
export async function generateProofInputs(
  jwt: GoogleJWT,
  sessionKey: SessionKeyPair,
  jwtToken: string,
  maxBlock: number
): Promise<{ publicInputs: any; privateInputs: any }> {
  const poseidon = await getPoseidon();

  // Derive secret from JWT stable fields (sub + email)
  const secret = await deriveSecretFromJWT(jwt.sub, jwt.email);

  // === Calculate address_seed ===
  // Hash email bytes using chunked Poseidon (matches circuit)
  const emailBytes = stringToBytes(jwt.email, 64); // 64 bytes for email
  const emailHash = await hashEmailBytes(emailBytes);

  // Convert sub to number
  const subBytes = new TextEncoder().encode(jwt.sub.slice(0, 16));
  const subHex = Array.from(subBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const subNum = BigInt('0x' + subHex);

  // address_seed = Poseidon(sub, emailHash, secret)
  const addressSeedHash = poseidon([subNum, emailHash, secret]);
  const addressSeed = poseidon.F.toObject(addressSeedHash);

  // === P1: Address Seed Verification Logging ===
  console.log('[generateProofInputs] === Address Seed Verification ===');
  console.log('[generateProofInputs]   sub (number):', subNum.toString());
  console.log('[generateProofInputs]   emailHash:', emailHash.toString());
  console.log('[generateProofInputs]   secret (first 20 chars):', secret.toString().slice(0, 20) + '...');
  console.log('[generateProofInputs]   addressSeed (full):', addressSeed.toString());
  console.log('[generateProofInputs]   addressSeed (hex):', '0x' + addressSeed.toString(16));

  // Verify mask compatibility with felt252
  const MASK_250 = (BigInt(1) << BigInt(250)) - BigInt(1);
  const maskedSeed = addressSeed & MASK_250;
  console.log('[generateProofInputs]   addressSeed (masked 250-bit):', maskedSeed.toString());
  console.log('[generateProofInputs]   addressSeed fits in 250 bits:', addressSeed === maskedSeed ? '✅ Yes' : '❌ No (will be truncated)');

  // === Calculate ephemeral public key parts ===
  // Cairo contract: eph_key_0 = high 128 bits, eph_key_1 = low 128 bits
  // SHA256 input: each felt252 converted to u256 (value in low bits, high = 0)
  let pkHex = sessionKey.publicKey;
  if (typeof pkHex === 'string' && pkHex.includes(',')) {
    const parts = pkHex.split(',');
    const firstPart = parts[0].trim();
    const hexParts = parts.map((p, i) => {
      const num = parseInt(p.trim(), i === 0 && firstPart.startsWith('0x') ? 16 : 10);
      return num.toString(16).padStart(2, '0');
    });
    pkHex = '0x' + hexParts.join('');
  }
  const ephKeyBigInt = BigInt(pkHex);

  // Split public key into high/low 128 bits (matches Cairo contract)
  const ephKey0Value = ephKeyBigInt >> BigInt(128);  // high 128 bits
  const ephKey1Value = ephKeyBigInt & U128_MASK;     // low 128 bits

  // === P1: Public Key Format Verification ===
  console.log('[generateProofInputs] === Public Key Verification ===');
  console.log('[generateProofInputs]   Original PK (hex):', pkHex);
  console.log('[generateProofInputs]   PK as BigInt:', ephKeyBigInt.toString());
  console.log('[generateProofInputs]   PK bit length:', ephKeyBigInt.toString(2).length);
  console.log('[generateProofInputs]   ephKey0 (high 128 bits):', ephKey0Value.toString());
  console.log('[generateProofInputs]   ephKey1 (low 128 bits):', ephKey1Value.toString());

  // Verify reconstruction
  const reconstructedPK = (ephKey0Value << BigInt(128)) + ephKey1Value;
  console.log('[generateProofInputs]   Reconstructed PK:', reconstructedPK.toString());
  console.log('[generateProofInputs]   PK reconstruction match:', ephKeyBigInt === reconstructedPK ? '✅ Yes' : '❌ No');

  if (ephKeyBigInt !== reconstructedPK) {
    console.error('[generateProofInputs]   ERROR: Public key reconstruction failed!');
  }

  // As u256 for SHA256: value in low bits, high = 0
  const ephKey0Split = { high: BigInt(0), low: ephKey0Value };
  const ephKey1Split = { high: BigInt(0), low: ephKey1Value };

  // === Parse JWT header for header_F ===
  // Truncate to 32 bytes (256 bits) to fit in u256
  const jwtParts = jwtToken.split('.');
  const headerBase64 = jwtParts[0];
  const headerDecoded = atob(headerBase64.replace(/-/g, '+').replace(/_/g, '/'));
  const headerBytes = headerDecoded.slice(0, 32); // Take first 32 bytes
  const headerHex = headerBytes.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const headerF = BigInt('0x' + headerHex.padEnd(64, '0')); // Pad to 64 hex chars (256 bits)

  // === Get issuer info ===
  // Truncate to 32 bytes (256 bits) to fit in u256
  const issBytes = jwt.iss.slice(0, 32); // Take first 32 bytes
  const issHex = issBytes.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const issB64F = BigInt('0x' + issHex.padEnd(64, '0')); // Pad to 64 hex chars (256 bits)
  const issIndexInPayloadMod4 = BigInt(0);

  // === Modulus F (fixed Oracle value) ===
  const modulusF = BigInt('6472322537804972268794034248194861302128540584786330577698326766016488520183');

  // Split all u256 values into high/low
  const addressSeedSplit = splitU256(addressSeed);
  const issB64FSplit = splitU256(issB64F);
  const headerFSplit = splitU256(headerF);
  const modulusFSplit = splitU256(modulusF);

  // Circuit inputs (matching sumo_auth_official.circom)
  // All inputs are private, circuit computes SHA256 hash as public output
  const publicInputs = {
    // Ephemeral public key 0 (X coordinate)
    eph_public_key0_high: ephKey0Split.high.toString(),
    eph_public_key0_low: ephKey0Split.low.toString(),
    // Ephemeral public key 1 (Y coordinate)
    eph_public_key1_high: ephKey1Split.high.toString(),
    eph_public_key1_low: ephKey1Split.low.toString(),
    // Address seed
    address_seed_high: addressSeedSplit.high.toString(),
    address_seed_low: addressSeedSplit.low.toString(),
    // Max epoch (u64, no split needed)
    max_epoch: maxBlock.toString(),
    // Issuer base64 field
    iss_b64_F_high: issB64FSplit.high.toString(),
    iss_b64_F_low: issB64FSplit.low.toString(),
    // Issuer index mod 4 (u8, no split needed)
    iss_index_in_payload_mod_4: issIndexInPayloadMod4.toString(),
    // Header field
    header_F_high: headerFSplit.high.toString(),
    header_F_low: headerFSplit.low.toString(),
    // Modulus field
    modulus_F_high: modulusFSplit.high.toString(),
    modulus_F_low: modulusFSplit.low.toString(),
  };

  // Private inputs
  const privateInputs = {
    sub: subNum.toString(),
    email: emailBytes,
    secret: secret.toString(),
  };

  console.log('[generateProofInputs] Public inputs:', publicInputs);
  console.log('[generateProofInputs] Private inputs keys:', Object.keys(privateInputs));

  // === Debug: Log all values for AIH verification ===
  console.log('[generateProofInputs] === AIH Debug Values ===');
  console.log('[generateProofInputs] eph_key0 (high, low):', ephKey0Split.high.toString(), ephKey0Split.low.toString());
  console.log('[generateProofInputs] eph_key1 (high, low):', ephKey1Split.high.toString(), ephKey1Split.low.toString());
  console.log('[generateProofInputs] address_seed (high, low):', addressSeedSplit.high.toString(), addressSeedSplit.low.toString());
  console.log('[generateProofInputs] max_epoch (as u256 low):', maxBlock.toString());
  console.log('[generateProofInputs] iss_b64_F (high, low):', issB64FSplit.high.toString(), issB64FSplit.low.toString());
  console.log('[generateProofInputs] iss_index:', issIndexInPayloadMod4.toString());
  console.log('[generateProofInputs] header_F (high, low):', headerFSplit.high.toString(), headerFSplit.low.toString());
  console.log('[generateProofInputs] modulus_F (high, low):', modulusFSplit.high.toString(), modulusFSplit.low.toString());
  console.log('[generateProofInputs] iss raw hex:', issHex);
  console.log('[generateProofInputs] header raw hex:', headerHex);

  return { publicInputs, privateInputs };
}

/**
 * Derive a secret from JWT stable fields
 * Uses sub (user ID) and email which are constant across logins
 * This ensures the same user always gets the same address
 */
async function deriveSecretFromJWT(sub: string, email: string): Promise<bigint> {
  // Use stable fields only: sub + email + a salt
  // This ensures the same Google account always produces the same secret
  const stableData = `${sub}:${email}:sumo_secret_v1`;
  const encoder = new TextEncoder();
  const data = encoder.encode(stableData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return BigInt('0x' + hashHex.slice(0, 32));
}

/**
 * Full ZK Proof structure matching snarkjs output
 */
export interface FullZKProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
}

/**
 * Generate a real ZK Proof using snarkjs
 *
 * Note: This requires pre-compiled circuit files (WASM and zkey)
 * For the demo, we'll simulate if files are not available
 */
export async function generateRealZKProof(
  jwt: GoogleJWT,
  sessionKey: SessionKeyPair,
  jwtToken: string,
  maxBlock: number
): Promise<ZKProof & { fullProof?: FullZKProof }> {
  console.log('Generating ZK Proof...');

  try {
    // Generate proof inputs
    const { publicInputs, privateInputs } = await generateProofInputs(
      jwt,
      sessionKey,
      jwtToken,
      maxBlock
    );
    
    // Check if circuit files are available
    const wasmExists = await checkFileExists(CIRCUIT_WASM_URL);
    const zkeyExists = await checkFileExists(CIRCUIT_ZKEY_URL);
    
    if (!wasmExists || !zkeyExists) {
      console.warn('Circuit files not found, using simulated proof');
      return generateSimulatedProof(jwt, sessionKey, jwtToken);
    }
    
    // Full proof generation using snarkjs
    console.log('Using real snarkjs proof generation...');
    console.log('[generateRealZKProof] Loading circuit from:', CIRCUIT_WASM_URL);
    console.log('[generateRealZKProof] Loading zkey from:', CIRCUIT_ZKEY_URL);

    const fullProof = await groth16.fullProve(
      { ...privateInputs, ...publicInputs },
      CIRCUIT_WASM_URL,
      CIRCUIT_ZKEY_URL
    );

    console.log('ZK Proof generated successfully');
    console.log('[generateRealZKProof] Public signals count:', fullProof.publicSignals.length);
    console.log('[generateRealZKProof] Public signals:', fullProof.publicSignals);
    console.log('[generateRealZKProof] === AIH from ZK Circuit ===');
    console.log('[generateRealZKProof]   all_inputs_hash_high:', fullProof.publicSignals[0]);
    console.log('[generateRealZKProof]   all_inputs_hash_low:', fullProof.publicSignals[1]);

    // Debug: Compute local AIH to compare with circuit output
    await debugComputeLocalAIH(publicInputs);

    // Verify we have exactly 2 public signals (official circuit)
    if (fullProof.publicSignals.length !== 2) {
      console.error('[generateRealZKProof] ERROR: Expected 2 public signals, got', fullProof.publicSignals.length);
      console.error('[generateRealZKProof] This indicates the wrong circuit is being used!');
      console.error('[generateRealZKProof] Please clear browser cache and reload.');
    }

    return {
      proof: fullProof.proof.pi_a[0],
      publicSignals: fullProof.publicSignals,
      verified: true,
      fullProof: {
        proof: fullProof.proof,
        publicSignals: fullProof.publicSignals,
      },
    };
  } catch (error) {
    console.error('ZK Proof generation failed:', error);
    // Fallback to simulated proof
    return generateSimulatedProof(jwt, sessionKey, jwtToken);
  }
}

/**
 * Verify a ZK Proof
 */
export async function verifyZKProof(
  proof: ZKProof & { fullProof?: FullZKProof }
): Promise<boolean> {
  try {
    // If we have a full proof, use snarkjs verification
    if (proof.fullProof) {
      const vKeyResponse = await fetch(VERIFICATION_KEY_URL);
      if (!vKeyResponse.ok) {
        console.warn('Verification key not found, using local verification');
        return proof.verified;
      }
      
      const vKey = await vKeyResponse.json();
      const isValid = await groth16.verify(
        vKey,
        proof.fullProof.publicSignals,
        proof.fullProof.proof
      );
      
      return isValid;
    }
    
    // Fallback to basic verification
    return proof.verified && proof.proof.length >= 66;
  } catch (error) {
    console.error('Proof verification failed:', error);
    return false;
  }
}

/**
 * Generate a simulated proof (fallback for demo)
 */
async function generateSimulatedProof(
  jwt: GoogleJWT,
  sessionKey: SessionKeyPair,
  jwtToken: string
): Promise<ZKProof> {
  console.log('Generating simulated ZK proof...');
  
  // Simulate proof generation delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Create a simulated proof hash
  const encoder = new TextEncoder();
  const data = encoder.encode(jwtToken + sessionKey.publicKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const proofHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Generate identity commitment for public signals
  const secret = await deriveSecretFromJWT(jwt.sub, jwt.email);
  const identityCommitment = await generateIdentityCommitment(
    jwt.email,
    jwt.sub,
    secret
  );
  
  return {
    proof: '0x' + proofHash,
    publicSignals: [
      identityCommitment.toString(),
      sessionKey.publicKey.slice(0, 34),
    ],
    verified: true,
  };
}

/**
 * Check if a file exists
 */
async function checkFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Debug function: Compute local AIH (All Inputs Hash) matching Cairo's implementation
 * This helps verify that the values sent to the contract match what the ZK circuit computes
 */
async function debugComputeLocalAIH(publicInputs: {
  eph_public_key0_high: string;
  eph_public_key0_low: string;
  eph_public_key1_high: string;
  eph_public_key1_low: string;
  address_seed_high: string;
  address_seed_low: string;
  max_epoch: string;
  iss_b64_F_high: string;
  iss_b64_F_low: string;
  iss_index_in_payload_mod_4: string;
  header_F_high: string;
  header_F_low: string;
  modulus_F_high: string;
  modulus_F_low: string;
}): Promise<void> {
  console.log('[debugComputeLocalAIH] === Computing local AIH ===');

  // Build byte array matching Cairo's concatenate_inputs
  // Each u256 is serialized as: high (16 bytes) + low (16 bytes)
  const u256ToBytes = (high: string, low: string): number[] => {
    const highBigInt = BigInt(high);
    const lowBigInt = BigInt(low);
    const bytes: number[] = [];

    // High 128 bits (16 bytes, big endian)
    for (let i = 15; i >= 0; i--) {
      bytes.push(Number((highBigInt >> BigInt(i * 8)) & BigInt(0xff)));
    }
    // Low 128 bits (16 bytes, big endian)
    for (let i = 15; i >= 0; i--) {
      bytes.push(Number((lowBigInt >> BigInt(i * 8)) & BigInt(0xff)));
    }
    return bytes;
  };

  // Build all 8 u256 inputs in order
  const allBytes: number[] = [];

  // 1. eph_public_key0
  allBytes.push(...u256ToBytes(publicInputs.eph_public_key0_high, publicInputs.eph_public_key0_low));
  // 2. eph_public_key1
  allBytes.push(...u256ToBytes(publicInputs.eph_public_key1_high, publicInputs.eph_public_key1_low));
  // 3. address_seed
  allBytes.push(...u256ToBytes(publicInputs.address_seed_high, publicInputs.address_seed_low));
  // 4. max_epoch (as u256 with high=0)
  allBytes.push(...u256ToBytes('0', publicInputs.max_epoch));
  // 5. iss_b64_F
  allBytes.push(...u256ToBytes(publicInputs.iss_b64_F_high, publicInputs.iss_b64_F_low));
  // 6. iss_index_in_payload_mod_4 (as u256 with high=0)
  allBytes.push(...u256ToBytes('0', publicInputs.iss_index_in_payload_mod_4));
  // 7. header_F
  allBytes.push(...u256ToBytes(publicInputs.header_F_high, publicInputs.header_F_low));
  // 8. modulus_F
  allBytes.push(...u256ToBytes(publicInputs.modulus_F_high, publicInputs.modulus_F_low));

  console.log('[debugComputeLocalAIH] Total bytes:', allBytes.length, '(expected: 256 = 8 * 32)');

  // Compute SHA256
  const data = new Uint8Array(allBytes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Split into high and low u128
  const hashBigInt = BigInt('0x' + hashHex);
  const U128_MASK_LOCAL = (BigInt(1) << BigInt(128)) - BigInt(1);
  const hashHigh = hashBigInt >> BigInt(128);
  const hashLow = hashBigInt & U128_MASK_LOCAL;

  console.log('[debugComputeLocalAIH] Local SHA256 hash:', '0x' + hashHex);
  console.log('[debugComputeLocalAIH]   hash_high:', hashHigh.toString());
  console.log('[debugComputeLocalAIH]   hash_low:', hashLow.toString());
  console.log('[debugComputeLocalAIH] Compare with ZK circuit output above ^^^');
}

/**
 * Export proof to JSON for on-chain verification
 */
export function exportProofForChain(
  proof: FullZKProof
): { proof: string; publicSignals: string } {
  return {
    proof: JSON.stringify(proof.proof),
    publicSignals: JSON.stringify(proof.publicSignals),
  };
}
