// Crypto utilities for SUMO Login Demo

import type { SessionKeyPair, ZKProof } from '@/types';
import { ec, hash } from 'starknet';

/**
 * Generate a random hex string
 */
export function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/**
 * Generate ephemeral session key pair using Starknet ECDSA
 * Uses starknet.js for proper key generation
 */
export function generateSessionKeyPair(): SessionKeyPair {
  // Generate a random private key using starknet.js to ensure it's in valid range
  // starknet.js generates keys that are valid for the Starknet curve
  const privateKeyBytes = ec.starkCurve.utils.randomPrivateKey();
  const privateKeyHex = '0x' + Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // Derive public key from private key using starknet.js
  const publicKeyResult = ec.starkCurve.getPublicKey(privateKeyBytes, false); // false = uncompressed

  // Convert to hex string properly (publicKeyResult is Uint8Array in newer starknet.js)
  const publicKeyFullHex = Array.from(publicKeyResult as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');

  // Uncompressed public key format: 04 + x-coordinate (64 hex) + y-coordinate (64 hex)
  // We need only the x-coordinate for Starknet ECDSA
  // Skip the '04' prefix (2 hex chars) and take the x-coordinate (64 hex chars)
  const xCoordinate = publicKeyFullHex.slice(2, 66);
  const publicKeyHex = '0x' + xCoordinate.padStart(64, '0');

  console.log("[generateSessionKeyPair] Private key:", privateKeyHex);
  console.log("[generateSessionKeyPair] Public key (x-coord):", publicKeyHex);

  const now = Date.now();

  return {
    publicKey: publicKeyHex,
    privateKey: privateKeyHex,
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
  };
}

/**
 * Sign a transaction hash using ECDSA
 * 
 * @param txHash - The transaction hash to sign (felt252)
 * @param privateKey - The private key (hex string)
 * @returns The signature [r, s]
 */
export function signTransactionHash(
  txHash: string,
  privateKey: string
): { r: string; s: string } {
  // Sign using starknet.js ECDSA
  // ec.starkCurve.sign expects hex strings
  const signature = ec.starkCurve.sign(txHash, privateKey);
  
  // Extract r and s values (they are already hex strings)
  const r = signature.r.toString().startsWith('0x') 
    ? signature.r.toString().padStart(66, '0') // 0x + 64 hex chars
    : '0x' + signature.r.toString(16).padStart(64, '0');
  const s = signature.s.toString().startsWith('0x')
    ? signature.s.toString().padStart(66, '0')
    : '0x' + signature.s.toString(16).padStart(64, '0');
  
  return { r, s };
}

/**
 * Verify a transaction signature
 * 
 * @param txHash - The transaction hash
 * @param publicKey - The public key
 * @param signature - The signature { r, s }
 * @returns boolean indicating if signature is valid
 */
export function verifyTransactionSignature(
  txHash: string,
  publicKey: string,
  signature: { r: string; s: string }
): boolean {
  try {
    // ec.starkCurve.verify expects (msgHash, pubKey, signature)
    // Convert signature to format expected by starknet.js
    const sigHex = signature.r + signature.s.slice(2); // Concatenate r and s (remove 0x from s)
    return ec.starkCurve.verify(txHash, publicKey, sigHex);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Get public key from private key
 *
 * @param privateKey - The private key (hex string)
 * @returns The public key (hex string)
 */
export function getPublicKeyFromPrivate(privateKey: string): string {
  const publicKeyResult = ec.starkCurve.getPublicKey(privateKey, false);

  // Convert to hex string properly (publicKeyResult is Uint8Array)
  const publicKeyFullHex = Array.from(publicKeyResult as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');

  // Take x-coordinate (skip '04' prefix)
  const xCoordinate = publicKeyFullHex.slice(2, 66);
  return '0x' + xCoordinate.padStart(64, '0');
}

/**
 * Generate a nonce for OAuth request
 */
export function generateNonce(publicKey: string): string {
  const timestamp = Date.now().toString(36);
  const random = randomHex(16);
  const data = `${publicKey.slice(2, 34)}${timestamp}${random}`;
  return btoa(data).replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Simulate ZK Proof generation
 * In production, this would use Circom/Starknet ZK circuits
 */
export async function generateZKProof(
  jwt: string,
  sessionKey: SessionKeyPair
): Promise<ZKProof> {
  // Simulate proof generation delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Create a simulated proof hash
  const jwtHash = await sha256(jwt);
  const pkHash = await sha256(sessionKey.publicKey);
  
  const proof = await sha256(jwtHash + pkHash + randomHex(32));
  
  return {
    proof: '0x' + proof,
    publicSignals: [
      sessionKey.publicKey,
      '0x' + jwtHash.slice(0, 64),
    ],
    verified: true,
  };
}

/**
 * Verify ZK Proof (simulated)
 */
export async function verifyZKProof(
  proof: ZKProof,
  _jwt: string
): Promise<boolean> {
  // Simulate verification delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // In production, this would verify the ZK proof on-chain
  return proof.verified && proof.proof.length === 66;
}

/**
 * Derive address seed from JWT sub and email
 * This ensures the same Google account always generates the same address seed
 */
export async function deriveAddressSeed(sub: string, email: string): Promise<bigint> {
  const data = sub + email + 'sumo_address_seed_v1';
  const hash = await sha256(data);
  // Convert to bigint and mask to 250 bits (Starknet felt size)
  const seed = BigInt('0x' + hash);
  const MASK_250 = (BigInt(1) << BigInt(250)) - BigInt(1);
  return seed & MASK_250;
}

/**
 * Compute Starknet account address
 * Matches the Cairo contract logic: precompute_account_address()
 *
 * Uses starknet.js hash.calculateContractAddressFromHash for correct calculation
 */
export function computeStarknetAddress(
  deployerAddress: string,
  classHash: string,
  addressSeed: bigint
): string {
  // Mask address_seed to 250 bits for salt
  const MASK_250 = (BigInt(1) << BigInt(250)) - BigInt(1);
  const salt = addressSeed & MASK_250;

  // Use starknet.js standard address calculation
  const address = hash.calculateContractAddressFromHash(
    '0x' + salt.toString(16),  // salt
    classHash,                  // class hash
    [],                         // constructor calldata (empty)
    deployerAddress             // deployer address
  );

  return address;
}

/**
 * Generate smart account address from JWT and session key
 * @deprecated Use computeStarknetAddress with addressSeed instead
 */
export async function generateAccountAddress(
  email: string,
  publicKey: string
): Promise<string> {
  const data = email + publicKey;
  const hash = await sha256(data);
  return '0x' + hash.slice(0, 40);
}

/**
 * Sign transaction with session key (simulated)
 */
export async function signTransaction(
  tx: object,
  privateKey: string
): Promise<string> {
  const txHash = await sha256(JSON.stringify(tx));
  const signature = await sha256(txHash + privateKey.slice(2, 34));
  return '0x' + signature;
}

/**
 * Simple SHA-256 hash
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Format address for display
 * Handles both hex strings and array format strings
 */
export function formatAddress(address: string): string {
  // Handle array format like "0x4,187,36,3,..."
  if (address.includes(',')) {
    const bytes = address.replace('0x', '').split(',').map(b => parseInt(b.trim()));
    const hexStr = '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    if (hexStr.length <= 12) return hexStr;
    return `${hexStr.slice(0, 6)}...${hexStr.slice(-4)}`;
  }
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format timestamp
 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
