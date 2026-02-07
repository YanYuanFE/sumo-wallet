import { Account, Signer, hash, CallData, type Call, type InvocationsSignerDetails, type Signature } from "starknet";
import type { GoogleJWT, SessionKeyPair } from "@/types";
import { provider } from "@/config/starknet";
import { generateProofInputs } from "./zkProofService";

const FELT252_PRIME = BigInt("3618502788666131213697322783095070105623107215331596699973092056135872020481");

// Garaga calldata API endpoint
const GARAGA_API_URL = import.meta.env.VITE_GARAGA_API_URL || 'http://localhost:3001';

/**
 * Check if Garaga API server is healthy
 *
 * @returns true if API is available, false otherwise
 */
export async function checkGaragaApiHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(`${GARAGA_API_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('[checkGaragaApiHealth] API health check failed:', error);
    return false;
  }
}

/**
 * Get the Garaga API URL (for error messages)
 */
export function getGaragaApiUrl(): string {
  return GARAGA_API_URL;
}

import {
  computeStarknetAddress,
  signTransactionHash,
} from "@/utils/crypto";

// Google OAuth JWKS endpoint
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/**
 * Google JWKS Key structure
 */
interface JWKSKey {
  kty: string;
  n: string; // modulus (base64url encoded)
  e: string; // exponent
  kid: string; // key ID
  alg: string;
}

interface JWKSResponse {
  keys: JWKSKey[];
}

// Contract addresses and class hashes
// Deployed on Sepolia testnet (修复 STRK_ADDRESS 常量)
const SUMO_LOGIN_CONTRACT_ADDRESS =
  "0x0780a35dc30f6b1efe58a4949e9944cdb819b7ae5d1056c20c2690367e74592c";
const SUMO_ACCOUNT_CLASS_HASH =
  "0x233c3b7351035ed1509491a352c17b564c2ed2ae1162555619a0919e4b0162d";
// const GARAGA_VERIFIER_CLASSHASH = '0x4ca4fb1385c242094baf5d182d3f21b1123c22395e5e7f5c74514faa2df8bb8';


/**
 * Interface for snarkjs ZK Proof
 */
export interface SnarkJSProof {
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
 * Interface for SUMO Signature structure
 * Matches the Cairo Signature struct
 */
export interface SumoSignature {
  signature_type: string; // "signature/user" or "signature/admin"
  r: string;
  s: string;
  eph_key: [string, string]; // [eph_key_0, eph_key_1]
  address_seed: string;
  max_block: string;
  iss_b64_F: string;
  iss_index_in_payload_mod_4: string;
  header_F: string;
  modulus_F: string[];
  garaga: bigint[] | SnarkJSProof;
}

/**
 * Interface for Public Inputs
 * Matches the Cairo PublicInputs struct
 */
export interface PublicInputs {
  eph_public_key0: string;
  eph_public_key1: string;
  address_seed: string;
  max_epoch: string;
  iss_b64_F: string;
  iss_index_in_payload_mod_4: string;
  header_F: string;
  modulus_F: string[];
}

/**
 * Compute the all_inputs_hash
 * This is the SHA-256 hash of all public inputs concatenated
 *
 * Matches the Cairo implementation:
 * ```cairo
 * let all_inputs_hash = compute_sha256_u32_array(
 *     all_inputs,
 *     num_bytes: all_inputs.len() * 4,
 * ).span();
 * ```
 */
export async function computeAllInputsHash(publicInputs: PublicInputs): Promise<string> {
  const inputs = [
    BigInt(publicInputs.eph_public_key0),
    BigInt(publicInputs.eph_public_key1),
    BigInt(publicInputs.address_seed),
    BigInt(publicInputs.max_epoch),
    BigInt(publicInputs.iss_b64_F),
    BigInt(publicInputs.iss_index_in_payload_mod_4),
    BigInt(publicInputs.header_F),
    ...publicInputs.modulus_F.map((m) => BigInt(m)),
  ];

  // Convert to byte array (each u256 is 32 bytes)
  const byteArrays: number[] = [];
  for (const input of inputs) {
    const hex = input.toString(16).padStart(64, "0");
    for (let i = 0; i < 64; i += 2) {
      byteArrays.push(parseInt(hex.slice(i, i + 2), 16));
    }
  }

  // Compute SHA-256 hash using Web Crypto API
  const data = new Uint8Array(byteArrays);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return "0x" + hashHex;
}

/**
 * Convert base64url to hex string
 */
function base64UrlToHex(base64url: string): string {
  // Replace base64url characters with base64 characters
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding
  while (base64.length % 4) {
    base64 += "=";
  }

  // Decode base64 to bytes
  const binary = atob(base64);
  let hex = "";
  for (let i = 0; i < binary.length; i++) {
    const byte = binary.charCodeAt(i).toString(16).padStart(2, "0");
    hex += byte;
  }

  return hex;
}

/**
 * Get RSA modulus from Google JWKS
 *
 * @param kid - The Key ID from JWT header
 * @returns The modulus as a hex string
 */
export async function getGoogleRSAKey(
  kid: string,
): Promise<{ modulus: string; exponent: string }> {
  try {
    const response = await fetch(GOOGLE_JWKS_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status}`);
    }

    const jwks: JWKSResponse = await response.json();
    const key = jwks.keys.find((k) => k.kid === kid);

    if (!key) {
      throw new Error(`Key with kid "${kid}" not found in JWKS`);
    }

    // Convert base64url modulus to hex
    const modulusHex = base64UrlToHex(key.n);
    const exponentHex = base64UrlToHex(key.e);

    return {
      modulus: "0x" + modulusHex,
      exponent: "0x" + exponentHex,
    };
  } catch (error) {
    console.error("Failed to get Google RSA key:", error);
    throw error;
  }
}

/**
 * Get RSA modulus from JWT token
 *
 * @param jwtToken - The JWT token string
 * @returns The modulus as a bigint string (for Cairo)
 */
export async function getModulusFromJWT(jwtToken: string): Promise<string> {
  try {
    // Decode JWT header to get kid
    const headerBase64 = jwtToken.split(".")[0];
    const headerJson = atob(headerBase64.replace(/-/g, "+").replace(/_/g, "/"));
    const header = JSON.parse(headerJson);
    const kid = header.kid;

    if (!kid) {
      throw new Error("JWT header does not contain kid");
    }

    // Get RSA key from Google
    const { modulus } = await getGoogleRSAKey(kid);

    return modulus;
  } catch (error) {
    console.error("Failed to get modulus from JWT:", error);
    throw error;
  }
}

/**
 * Generate SUMO signature for deploy/login transactions
 *
 * This function creates the signature structure required by the SUMO protocol
 * to authenticate on Starknet using a ZK proof of Google OAuth.
 *
 * The signature includes:
 * - ECDSA signature (r, s) of the transaction hash
 * - Ephemeral public key split into two felt252 values
 * - JWT-derived values (address_seed, iss, header, modulus)
 * - ZK proof data for Garaga verifier
 *
 * Matches the Cairo Signature struct:
 * ```cairo
 * struct Signature {
 *     signature_type: felt252,
 *     r: felt252,
 *     s: felt252,
 *     eph_key: (felt252, felt252),
 *     address_seed: felt252,
 *     max_block: felt252,
 *     iss_b64_F: felt252,
 *     iss_index_in_payload_mod_4: felt252,
 *     header_F: felt252,
 *     modulus_F: felt252,
 *     garaga: Array<felt252>,
 * }
 * ```
 */
export async function generateSumoSignature(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  maxBlock: number,
  zkProof: SnarkJSProof | bigint[],
): Promise<SumoSignature> {
  // Official circuit: ZK proof outputs SHA256 hash of all inputs (2 u128 values)
  // All signature values are computed locally and passed to contract
  // Contract verifies SHA256(signature_values) == proof_output
  console.log("[generateSumoSignature] Computing signature values locally (official circuit format)");

  // Check proof format
  if (!Array.isArray(zkProof) && zkProof.publicSignals) {
    console.log("[generateSumoSignature] Proof publicSignals:", zkProof.publicSignals);
    console.log("[generateSumoSignature] Expected 2 values (hash_high, hash_low)");
  }

  // Get values from generateProofInputs to ensure consistency with ZK circuit
  const { publicInputs } = await generateProofInputs(jwt, sessionKey, jwtToken, maxBlock);

  // Extract values from publicInputs (these match what the ZK circuit uses)
  // eph_key for signature: Cairo contract reconstructs as eph_key_0 * 2^128 + eph_key_1
  // publicInputs has eph_public_key0_low = pk >> 128, eph_public_key1_low = pk & mask
  const ephKey0 = publicInputs.eph_public_key0_low;  // high 128 bits of pk
  const ephKey1 = publicInputs.eph_public_key1_low;  // low 128 bits of pk

  // address_seed as u256
  const addressSeedHigh = BigInt(publicInputs.address_seed_high);
  const addressSeedLow = BigInt(publicInputs.address_seed_low);
  const addressSeed = (addressSeedHigh << BigInt(128)) + addressSeedLow;

  // iss_b64_F as u256
  const issB64FHigh = BigInt(publicInputs.iss_b64_F_high);
  const issB64FLow = BigInt(publicInputs.iss_b64_F_low);
  const issB64F = (issB64FHigh << BigInt(128)) + issB64FLow;

  // header_F as u256
  const headerFHigh = BigInt(publicInputs.header_F_high);
  const headerFLow = BigInt(publicInputs.header_F_low);
  const headerF = (headerFHigh << BigInt(128)) + headerFLow;

  // modulus_F as u256
  const modulusFHigh = BigInt(publicInputs.modulus_F_high);
  const modulusFLow = BigInt(publicInputs.modulus_F_low);
  const modulusF = (modulusFHigh << BigInt(128)) + modulusFLow;

  const issIndexInPayloadMod4 = publicInputs.iss_index_in_payload_mod_4;

  console.log("[generateSumoSignature] Using values from generateProofInputs for consistency");
  console.log("[generateSumoSignature] ephKey0:", ephKey0, "ephKey1:", ephKey1);
  console.log("[generateSumoSignature] addressSeed:", addressSeed.toString());

  // === Debug: Log values for AIH comparison with Cairo ===
  console.log("[generateSumoSignature] === AIH Values Sent to Cairo ===");
  console.log("[generateSumoSignature] eph_key (felt252 tuple):", [ephKey0, ephKey1]);
  console.log("[generateSumoSignature] address_seed (u256):", addressSeed.toString());
  console.log("[generateSumoSignature] max_block (felt252):", maxBlock);
  console.log("[generateSumoSignature] iss_b64_F (u256):", issB64F.toString());
  console.log("[generateSumoSignature] iss_index_in_payload_mod_4:", issIndexInPayloadMod4);
  console.log("[generateSumoSignature] header_F (u256):", headerF.toString());
  console.log("[generateSumoSignature] modulus_F (u256):", modulusF.toString());

  // Cairo converts felt252 to u256 with high=0, low=value
  // So eph_key tuple (felt252, felt252) -> two u256s with (high=0, low=eph_key_0), (high=0, low=eph_key_1)
  console.log("[generateSumoSignature] === Cairo will compute AIH from these u256s ===");
  console.log("[generateSumoSignature] u256[0] (eph_0.into()): high=0, low=", ephKey0);
  console.log("[generateSumoSignature] u256[1] (eph_1.into()): high=0, low=", ephKey1);
  console.log("[generateSumoSignature] u256[2] (address_seed): high=", addressSeedHigh.toString(), ", low=", addressSeedLow.toString());
  console.log("[generateSumoSignature] u256[3] (max_block.into()): high=0, low=", maxBlock);
  console.log("[generateSumoSignature] u256[4] (iss_b64_F): high=", issB64FHigh.toString(), ", low=", issB64FLow.toString());
  console.log("[generateSumoSignature] u256[5] (iss_index.into()): high=0, low=", issIndexInPayloadMod4);
  console.log("[generateSumoSignature] u256[6] (header_F): high=", headerFHigh.toString(), ", low=", headerFLow.toString());
  console.log("[generateSumoSignature] u256[7] (modulus_F): high=", modulusFHigh.toString(), ", low=", modulusFLow.toString());

  // Now compute local AIH to verify it matches ZK proof output
  const debugComputeCairoAIH = async () => {
    const u256ToBytes = (high: bigint, low: bigint): number[] => {
      const bytes: number[] = [];
      for (let i = 15; i >= 0; i--) {
        bytes.push(Number((high >> BigInt(i * 8)) & BigInt(0xff)));
      }
      for (let i = 15; i >= 0; i--) {
        bytes.push(Number((low >> BigInt(i * 8)) & BigInt(0xff)));
      }
      return bytes;
    };

    const allBytes: number[] = [];
    // Cairo order: eph_0, eph_1, address_seed, max_block, iss_b64_F, iss_index, header_F, modulus_F
    allBytes.push(...u256ToBytes(BigInt(0), BigInt(ephKey0)));
    allBytes.push(...u256ToBytes(BigInt(0), BigInt(ephKey1)));
    allBytes.push(...u256ToBytes(addressSeedHigh, addressSeedLow));
    allBytes.push(...u256ToBytes(BigInt(0), BigInt(maxBlock)));
    allBytes.push(...u256ToBytes(issB64FHigh, issB64FLow));
    allBytes.push(...u256ToBytes(BigInt(0), BigInt(issIndexInPayloadMod4)));
    allBytes.push(...u256ToBytes(headerFHigh, headerFLow));
    allBytes.push(...u256ToBytes(modulusFHigh, modulusFLow));

    const data = new Uint8Array(allBytes);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const hashBigInt = BigInt('0x' + hashHex);
    const U128_M = (BigInt(1) << BigInt(128)) - BigInt(1);
    const hHigh = hashBigInt >> BigInt(128);
    const hLow = hashBigInt & U128_M;

    console.log("[generateSumoSignature] === AIH from signature values (Cairo will compute this) ===");
    console.log("[generateSumoSignature]   hash_high:", hHigh.toString());
    console.log("[generateSumoSignature]   hash_low:", hLow.toString());
  };

  await debugComputeCairoAIH();

  const normalizeToFelt252 = (val: string | bigint): string => {
    let bigVal = typeof val === 'string' ? BigInt(val) : val;
    if (bigVal >= FELT252_PRIME || bigVal < 0) {
      bigVal = ((bigVal % FELT252_PRIME) + FELT252_PRIME) % FELT252_PRIME;
    }
    return bigVal.toString();
  };

  // Use Starknet selector for signature type
  const signatureTypeSelector = hash.getSelectorFromName("signature/user");

  return {
    signature_type: signatureTypeSelector,
    r: "0", // Will be updated by SumoSigner
    s: "0", // Will be updated by SumoSigner
    eph_key: [normalizeToFelt252(ephKey0), normalizeToFelt252(ephKey1)],
    address_seed: addressSeed.toString(),  // u256
    max_block: maxBlock.toString(),
    iss_b64_F: issB64F.toString(),  // u256
    iss_index_in_payload_mod_4: normalizeToFelt252(issIndexInPayloadMod4),
    header_F: headerF.toString(),  // u256
    modulus_F: [modulusF.toString()],  // u256
    garaga: zkProof,
  };
}

class SumoSigner extends Signer {
  private sumoSignatureBase: string[];
  private ephemeralPublicKey: string;
  private ephemeralPrivateKey: string;

  constructor(ephemeralPrivateKey: string, ephemeralPublicKey: string, sumoSignature: string[]) {
    super(ephemeralPrivateKey);
    this.ephemeralPrivateKey = ephemeralPrivateKey;
    this.ephemeralPublicKey = ephemeralPublicKey;
    this.sumoSignatureBase = sumoSignature;
  }

  async getPubKey(): Promise<string> {
    return this.ephemeralPublicKey;
  }

  async signTransaction(
    transactions: Call[],
    details: InvocationsSignerDetails
  ): Promise<Signature> {
    console.log("[SumoSigner.signTransaction] Called with details");

    // Build calldata for the transaction
    const calldata = CallData.compile({
      calls: transactions.map(tx => ({
        to: tx.contractAddress,
        selector: hash.getSelectorFromName(tx.entrypoint),
        calldata: tx.calldata || [],
      })),
    });

    // Convert data availability mode strings to numbers (L1=0, L2=1)
    const daToNum = (mode: unknown): 0 | 1 => {
      if (mode === "L1" || mode === 0) return 0;
      if (mode === "L2" || mode === 1) return 1;
      return 0; // default to L1
    };

    // Calculate the transaction hash
    const txHash = hash.calculateInvokeTransactionHash({
      senderAddress: details.walletAddress,
      version: details.version,
      compiledCalldata: calldata,
      chainId: details.chainId,
      nonce: details.nonce,
      accountDeploymentData: details.accountDeploymentData,
      nonceDataAvailabilityMode: daToNum(details.nonceDataAvailabilityMode),
      feeDataAvailabilityMode: daToNum(details.feeDataAvailabilityMode),
      resourceBounds: details.resourceBounds,
      tip: details.tip,
      paymasterData: details.paymasterData,
    });

    console.log("[SumoSigner.signTransaction] Calculated tx hash:", txHash);

    // Sign the transaction hash
    const { r, s } = signTransactionHash(txHash, this.ephemeralPrivateKey);
    console.log("[SumoSigner.signTransaction] Signature r (hex):", r);
    console.log("[SumoSigner.signTransaction] Signature s (hex):", s);

    // Convert hex to decimal strings (the signature array uses decimal strings)
    const rDecimal = BigInt(r).toString();
    const sDecimal = BigInt(s).toString();
    console.log("[SumoSigner.signTransaction] Signature r (decimal):", rDecimal);
    console.log("[SumoSigner.signTransaction] Signature s (decimal):", sDecimal);

    // Update r and s in the signature array (indices 1 and 2)
    const updatedSignature = [...this.sumoSignatureBase];
    updatedSignature[1] = rDecimal;
    updatedSignature[2] = sDecimal;

    return updatedSignature;
  }

  async signMessage(_typedData: unknown, _accountAddress: string): Promise<string[]> {
    return this.sumoSignatureBase;
  }

  async signDeployAccountTransaction(_details: unknown): Promise<string[]> {
    return this.sumoSignatureBase;
  }

  async signDeclareTransaction(_details: unknown): Promise<string[]> {
    return this.sumoSignatureBase;
  }
}

/**
 * Deploy a new SUMO Account
 *
 * This function deploys a new SUMO account on Starknet using the SUMO protocol.
 * The account is deterministically derived from the user's JWT identity.
 *
 * The deployment process:
 * 1. Generate SUMO signature with ZK proof
 * 2. Call the deploy function on the SUMO Login contract
 * 3. The contract verifies the ZK proof and deploys the account
 *
 * Matches the Cairo deploy function:
 * ```cairo
 * fn deploy(ref self: ContractState, signature: Array<felt252>)
 * ```
 */
export async function deploySumoAccount(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  maxBlock: number,
  zkProof: SnarkJSProof | bigint[],
): Promise<string> {
  try {
    console.log("[deploySumoAccount] Called with:");
    console.log("[deploySumoAccount]   zkProof type:", Array.isArray(zkProof) ? "array" : typeof zkProof);
    console.log("[deploySumoAccount]   zkProof length:", Array.isArray(zkProof) ? zkProof.length : "N/A");
    if (!Array.isArray(zkProof) && zkProof?.proof) {
      console.log("[deploySumoAccount]   zkProof.proof.pi_a:", zkProof.proof.pi_a);
    }
    
    // Generate SUMO signature with ZK proof
    const signature = await generateSumoSignature(
      jwt,
      jwtToken,
      sessionKey,
      maxBlock,
      zkProof,
    );

    // Serialize the SUMO signature
    const serializedSig = await serializeSignature(signature);
    console.log("[deploySumoAccount] Serialized signature length:", serializedSig.length);
    console.log("[deploySumoAccount] First 5 elements:", serializedSig.slice(0, 5));

    // Debug: Check Oracle modulus_F value
    const oracleModulusF = await getOracleModulusF();
    console.log("[deploySumoAccount] Oracle modulus_F:", oracleModulusF);
    console.log("[deploySumoAccount] Signature modulus_F:", signature.modulus_F);

    // Create custom signer with the SUMO signature
    const sumoSigner = new SumoSigner(sessionKey.privateKey, sessionKey.publicKey, serializedSig);

    // Create account instance with the custom signer
    const account = new Account({
      provider,
      address: SUMO_LOGIN_CONTRACT_ADDRESS,
      signer: sumoSigner,
    });

    console.log("[deploySumoAccount] Executing deploy call...");
    console.log("[deploySumoAccount] Account address:", account.address);

    // Get current block to fetch gas prices
    const block = await provider.getBlockWithTxHashes('latest');
    const l1GasPrice = BigInt(block.l1_gas_price?.price_in_fri || "100000000000000");
    const l1DataGasPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "100000000000000");
    // L2 gas price is much cheaper than L1 gas price
    const l2GasPrice = BigInt(block.l2_gas_price?.price_in_fri || "1000000000000");

    console.log("[deploySumoAccount] L1 Gas Price:", l1GasPrice.toString());
    console.log("[deploySumoAccount] L1 Data Gas Price:", l1DataGasPrice.toString());
    console.log("[deploySumoAccount] L2 Gas Price:", l2GasPrice.toString());

    // Add 50% buffer to gas prices
    const l1GasPriceWithBuffer = l1GasPrice * BigInt(150) / BigInt(100);
    const l1DataGasPriceWithBuffer = l1DataGasPrice * BigInt(150) / BigInt(100);
    const l2GasPriceWithBuffer = l2GasPrice * BigInt(150) / BigInt(100);

    const result = await account.execute({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "deploy",
      calldata: [],
    }, {
      skipValidate: true,
      resourceBounds: {
        l1_gas: {
          max_amount: BigInt("100000"),  // 增加到 100K
          max_price_per_unit: l1GasPriceWithBuffer,
        },
        l1_data_gas: {
          max_amount: BigInt("500000"),  // 增加到 500K
          max_price_per_unit: l1DataGasPriceWithBuffer,
        },
        l2_gas: {
          max_amount: BigInt("100000000"),  // 增加到 100M (Groth16 验证需要大量计算)
          max_price_per_unit: l2GasPriceWithBuffer,
        },
      },
    });

    console.log("[deploySumoAccount] Transaction hash:", result.transaction_hash);

    return result.transaction_hash;
  } catch (error) {
    console.error("Deploy failed:", error);
    const errorMessage = (error as Error)?.message || String(error);

    // Enhanced error messages for common issues
    if (errorMessage && (errorMessage.includes("exceed balance") || errorMessage.includes("balance (0)"))) {
      const enhancedError = new Error(
        `❌ 部署失败: STRK 余额不足\n\n` +
        `SUMO Login 合约无法支付 gas 费用。\n\n` +
        `📍 合约地址: ${SUMO_LOGIN_CONTRACT_ADDRESS}\n\n` +
        `💡 解决方案：\n` +
        `  1. 在 Sepolia 测试网上为合约充值 STRK 代币\n` +
        `  2. 使用 Starknet Faucet: https://starknet-faucet.vercel.app/\n` +
        `  3. 或使用外部钱包部署（连接 Argent X 或 Braavos）\n\n` +
        `需要帮助？查看 docs/ISSUES_ANALYSIS.md`
      );
      throw enhancedError;
    }

    if (errorMessage.includes("Garaga")) {
      throw new Error(
        `❌ Garaga API 错误\n\n` +
        `${errorMessage}\n\n` +
        `💡 请确保后端服务正在运行：\n` +
        `  npm run server\n\n` +
        `服务地址: ${GARAGA_API_URL}`
      );
    }

    if (errorMessage.includes("TRANSACTION_EXECUTION_ERROR") || errorMessage.includes("execution reverted")) {
      throw new Error(
        `❌ 交易执行失败\n\n` +
        `合约验证未通过，可能原因：\n` +
        `  1. ZK Proof 验证失败\n` +
        `  2. Address Seed 不匹配\n` +
        `  3. 签名验证失败\n\n` +
        `请检查浏览器控制台获取详细日志。\n` +
        `原始错误: ${errorMessage.slice(0, 200)}`
      );
    }

    throw error;
  }
}

/**
 * Login to an existing SUMO Account
 *
 * This function authenticates to an existing SUMO account on Starknet.
 * It verifies the ZK proof and updates the account's ephemeral public key.
 *
 * The login process:
 * 1. Generate SUMO signature with ZK proof
 * 2. Call the login function on the SUMO Login contract
 * 3. The contract verifies the ZK proof and updates the account state
 *
 * Matches the Cairo login function:
 * ```cairo
 * fn login(ref self: ContractState, signature: Array<felt252>)
 * ```
 */
export async function loginSumoAccount(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  maxBlock: number,
  zkProof: SnarkJSProof | bigint[],
): Promise<string> {
  try {
    // Generate SUMO signature with ZK proof
    const signature = await generateSumoSignature(
      jwt,
      jwtToken,
      sessionKey,
      maxBlock,
      zkProof,
    );

    // Serialize the SUMO signature
    const serializedSig = await serializeSignature(signature);
    
    // Create custom signer with the SUMO signature
    const sumoSigner = new SumoSigner(sessionKey.privateKey, sessionKey.publicKey, serializedSig);
    
    // Create account instance with the custom signer
    const account = new Account({
      provider,
      address: SUMO_LOGIN_CONTRACT_ADDRESS,
      signer: sumoSigner,
    });

    // Execute the login call
    const result = await account.execute({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "login",
      calldata: [],
    });

    return result.transaction_hash;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

/**
 * Get the SUMO Account address for a user
 *
 * This function computes the deterministic Starknet address for a user
 * based on their JWT identity (sub + email + secret derived from JWT token).
 *
 * IMPORTANT: The address_seed must be computed using the same algorithm as
 * generateProofInputs in zkProofService.ts:
 *   address_seed = Poseidon(subNum, emailHash, secret)
 *
 * The address is computed using Starknet's address formula:
 * ```cairo
 * address = pedersen(
 *     0,
 *     pedersen(
 *         class_hash,
 *         pedersen(salt, 0)
 *     )
 * )
 * ```
 * Where salt = address_seed (masked to 250 bits)
 */
export async function getSumoAccountAddress(jwt: GoogleJWT, jwtToken: string): Promise<string> {
  // Import the address_seed calculation from zkProofService to ensure consistency
  const { generateProofInputs } = await import('./zkProofService');

  // We need a dummy session key just to get the address_seed
  // The address_seed doesn't depend on the session key
  const dummySessionKey = {
    publicKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    privateKey: '0x01',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };

  const { publicInputs } = await generateProofInputs(jwt, dummySessionKey, jwtToken, 0);

  // Reconstruct address_seed from high/low parts
  const addressSeedHigh = BigInt(publicInputs.address_seed_high);
  const addressSeedLow = BigInt(publicInputs.address_seed_low);
  const addressSeed = (addressSeedHigh << BigInt(128)) + addressSeedLow;

  console.log('[getSumoAccountAddress] address_seed:', addressSeed.toString());

  return computeStarknetAddress(
    SUMO_LOGIN_CONTRACT_ADDRESS,
    SUMO_ACCOUNT_CLASS_HASH,
    addressSeed,
  );
}

/**
 * Check if a SUMO Account exists
 *
 * Queries the SUMO Login contract to check if an account has been deployed.
 *
 * Matches the Cairo view function:
 * ```cairo
 * fn is_sumo_user(self: @ContractState, account_address: ContractAddress) -> bool
 * ```
 */
export async function isSumoUser(accountAddress: string): Promise<boolean> {
  try {
    console.log("[isSumoUser] Checking deployment for:", accountAddress);
    
    // Use provider.callContract directly instead of Contract class
    const result = await provider.callContract({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "is_sumo_user",
      calldata: [accountAddress],
    });
    
    console.log("[isSumoUser] Raw result:", result);
    
    // Result is an array, first element is the boolean value
    const isDeployed = result[0] === "0x1";
    console.log("[isSumoUser] Is deployed:", isDeployed);
    return isDeployed;
  } catch (error) {
    console.error("[isSumoUser] Check user failed:", error);
    return false;
  }
}

/**
 * Get user debt
 *
 * Queries the SUMO Login contract for the user's current debt.
 * Debt accumulates when users perform transactions without paying gas.
 *
 * Matches the Cairo view function:
 * ```cairo
 * fn get_user_debt(self: @ContractState, account_address: ContractAddress) -> u256
 * ```
 */
export async function getUserDebt(accountAddress: string): Promise<string> {
  try {
    // Use provider.callContract directly instead of Contract class
    const result = await provider.callContract({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "get_user_debt",
      calldata: [accountAddress],
    });

    // Result is an array, combine low and high parts for u256
    return result[0] || "0";
  } catch (error) {
    console.error("Get debt failed:", error);
    return "0";
  }
}

/**
 * Get Oracle modulus_F value for debugging
 */
export async function getOracleModulusF(): Promise<string> {
  const ORACLE_ADDRESS = "0x0084b8a600e0076a6fda30ce9ba4d93ba8e152239b88308cac3f80bbbc4ca3cc";
  try {
    const result = await provider.callContract({
      contractAddress: ORACLE_ADDRESS,
      entrypoint: "get_modulus_F",
      calldata: [],
    });

    // Result is u256 (low, high)
    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0");
    const modulusF = high * BigInt(2) ** BigInt(128) + low;
    console.log("[getOracleModulusF] Oracle modulus_F:", modulusF.toString());
    console.log("[getOracleModulusF] Expected:", "6472322537804972268794034248194861302128540584786330577698326766016488520183");
    return modulusF.toString();
  } catch (error) {
    console.error("[getOracleModulusF] Failed:", error);
    return "0";
  }
}

async function convertSnarkjsProofToGaraga(proof: SnarkJSProof): Promise<string[]> {
  console.log("[convertSnarkjsProofToGaraga] Calling backend API for Garaga v0.13.3 calldata...");

  try {
    const response = await fetch(`${GARAGA_API_URL}/api/garaga/calldata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        proof: proof.proof,
        publicSignals: proof.publicSignals,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API request failed: ${response.status}`);
    }

    const result = await response.json();
    console.log("[convertSnarkjsProofToGaraga] Calldata received, length:", result.calldata?.length || result.length);
    console.log("[convertSnarkjsProofToGaraga] Expected length: ~3013 (0xbc5)");

    // 打印完整的 garaga calldata 用于测试
    console.log("[convertSnarkjsProofToGaraga] === Full Garaga Calldata (for Cairo testing) ===");
    console.log("[convertSnarkjsProofToGaraga] calldata:", JSON.stringify(result.calldata));

    return result.calldata;
  } catch (error) {
    console.error("[convertSnarkjsProofToGaraga] API call failed:", error);

    // Enhanced error message with troubleshooting steps
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const isConnectionError = errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED');

    if (isConnectionError) {
      throw new Error(
        `Garaga API 服务未响应\n\n` +
        `请确保后端服务正在运行：\n` +
        `  1. 打开新终端窗口\n` +
        `  2. 运行命令: npm run server\n` +
        `  3. 等待服务启动后重试\n\n` +
        `API 地址: ${GARAGA_API_URL}`
      );
    }

    throw new Error(
      `Garaga calldata 生成失败: ${errorMsg}\n\n` +
      `排查步骤：\n` +
      `  1. 检查服务是否运行: npm run server\n` +
      `  2. API 地址: ${GARAGA_API_URL}/api/garaga/calldata\n` +
      `  3. 查看服务器日志获取详细错误信息`
    );
  }
}

// Maximum value for felt252 (2^252 - 1)
const FELT252_MAX = (BigInt(1) << BigInt(252)) - BigInt(1);

// Convert a bigint to u256 format (low, high) for Cairo serialization
function toU256(value: string | bigint): [string, string] {
  const val = typeof value === 'string' ? BigInt(value) : value;
  const MASK_128 = (BigInt(1) << BigInt(128)) - BigInt(1);
  const low = val & MASK_128;
  const high = val >> BigInt(128);
  return [low.toString(), high.toString()];
}

async function serializeSignature(signature: SumoSignature): Promise<string[]> {
  console.log("[serializeSignature] Starting serialization...");
  console.log("[serializeSignature] === All signature fields ===");
  console.log("  signature_type:", signature.signature_type);
  console.log("  eph_key:", signature.eph_key);
  console.log("  address_seed:", signature.address_seed);
  console.log("  max_block:", signature.max_block);
  console.log("  iss_b64_F:", signature.iss_b64_F);
  console.log("  iss_index_in_payload_mod_4:", signature.iss_index_in_payload_mod_4);
  console.log("  header_F:", signature.header_F);
  console.log("  modulus_F:", signature.modulus_F);

  const garagaArray = Array.isArray(signature.garaga)
    ? signature.garaga.map((x) => x.toString())
    : await convertSnarkjsProofToGaraga(signature.garaga);

  console.log("[serializeSignature] garagaArray length:", garagaArray.length);

  // Convert u256 fields to (low, high) format
  const [addressSeedLow, addressSeedHigh] = toU256(signature.address_seed);
  const [issB64FLow, issB64FHigh] = toU256(signature.iss_b64_F);
  const [headerFLow, headerFHigh] = toU256(signature.header_F);

  // modulus_F should be a single u256, take first chunk or combine
  const modulusValue = signature.modulus_F.length > 0
    ? BigInt(signature.modulus_F[0])
    : BigInt(0);
  const [modulusFLow, modulusFHigh] = toU256(modulusValue);

  // Build signature array matching Cairo Signature struct order:
  // signature_type, r, s, eph_key.0, eph_key.1,
  // address_seed.low, address_seed.high, max_block,
  // iss_b64_F.low, iss_b64_F.high, iss_index_in_payload_mod_4,
  // header_F.low, header_F.high, modulus_F.low, modulus_F.high,
  // garaga_len, garaga...
  let result = [
    signature.signature_type,
    signature.r,
    signature.s,
    signature.eph_key[0],
    signature.eph_key[1],
    addressSeedLow,
    addressSeedHigh,
    signature.max_block,
    issB64FLow,
    issB64FHigh,
    signature.iss_index_in_payload_mod_4,
    headerFLow,
    headerFHigh,
    modulusFLow,
    modulusFHigh,
    garagaArray.length.toString(),  // Span length prefix
    ...garagaArray,
  ];

  console.log("[serializeSignature] Total signature length:", result.length);
  console.log("[serializeSignature] First 10 elements:", result.slice(0, 10));
  
  const problematicElements: Array<{index: number, originalHexLen: number, originalHex: string, normalizedHex: string, originalVal: bigint}> = [];
  
  result = result.map((elem, i) => {
    let val = BigInt(elem);
    const originalHex = val.toString(16);
    const originalHexLen = originalHex.length;
    
    // Normalize to felt252 range using bit masking (not modulo)
    // This ensures the value fits in 252 bits
    if (val > FELT252_MAX || val < 0) {
      console.warn(`[serializeSignature] Element ${i} out of felt252 range (${originalHexLen} hex chars), normalizing...`);
      // Use bit masking to keep only the lower 252 bits
      val = val & FELT252_MAX;
    }
    
    // Verify hex length after normalization
    let hexStr = val.toString(16);
    if (hexStr.length > 64) {
      console.error(`[serializeSignature] Element ${i} STILL too long after bit masking (${hexStr.length} chars)!`);
      console.error(`[serializeSignature]   Original: ${originalHex.substring(0, 100)}...`);
      console.error(`[serializeSignature]   Normalized: ${hexStr.substring(0, 100)}...`);
      problematicElements.push({
        index: i,
        originalHexLen: originalHexLen,
        originalHex: originalHex.substring(0, 100),
        normalizedHex: hexStr.substring(0, 100),
        originalVal: val
      });
    }
    
    return val.toString();
  });
  
  // Summary of problematic elements
  if (problematicElements.length > 0) {
    console.error(`[serializeSignature] CRITICAL: ${problematicElements.length} elements still exceed 64 hex chars after normalization!`);
    console.error("[serializeSignature] Problematic elements:", problematicElements.map(p => `Index ${p.index}: ${p.originalHexLen} chars`));
  } else {
    console.log("[serializeSignature] All elements normalized successfully to felt252 range.");
  }
  
  console.log("[serializeSignature] Final signature length:", result.length);

  // 打印完整签名数据用于 Cairo 测试
  console.log("[serializeSignature] === Full Serialized Signature (for Cairo testing) ===");
  console.log("[serializeSignature] signature_type:", result[0]);
  console.log("[serializeSignature] r:", result[1]);
  console.log("[serializeSignature] s:", result[2]);
  console.log("[serializeSignature] eph_key_0:", result[3]);
  console.log("[serializeSignature] eph_key_1:", result[4]);
  console.log("[serializeSignature] address_seed_low:", result[5]);
  console.log("[serializeSignature] address_seed_high:", result[6]);
  console.log("[serializeSignature] max_block:", result[7]);
  console.log("[serializeSignature] iss_b64_F_low:", result[8]);
  console.log("[serializeSignature] iss_b64_F_high:", result[9]);
  console.log("[serializeSignature] iss_index_in_payload_mod_4:", result[10]);
  console.log("[serializeSignature] header_F_low:", result[11]);
  console.log("[serializeSignature] header_F_high:", result[12]);
  console.log("[serializeSignature] modulus_F_low:", result[13]);
  console.log("[serializeSignature] modulus_F_high:", result[14]);
  console.log("[serializeSignature] garaga_len:", result[15]);

  return result;
}

/**
 * Get account balance
 *
 * Queries the STRK token balance for the given account address.
 *
 * @param accountAddress - The account address
 * @returns The balance as a string
 */
export async function getAccountBalance(
  accountAddress: string,
): Promise<string> {
  try {
    console.log("[getAccountBalance] Querying balance for:", accountAddress);
    
    // STRK token contract on Sepolia
    const strkContractAddress =
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

    // Use provider.callContract directly instead of Contract class
    const result = await provider.callContract({
      contractAddress: strkContractAddress,
      entrypoint: "balanceOf",
      calldata: [accountAddress],
    });

    console.log("[getAccountBalance] Raw result:", result);

    // Result is an array, first element is the balance (u256 has low and high parts)
    // For STRK, we combine both parts
    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0");
    const balance = high * BigInt(2) ** BigInt(128) + low;
    
    console.log("[getAccountBalance] Parsed balance:", balance.toString());
    return balance.toString();
  } catch (error) {
    console.error("[getAccountBalance] Get balance failed:", error);
    return "0";
  }
}

/**
 * Repay user debt using external wallet
 *
 * When the user's session key has changed and they can't sign transactions,
 * they can use an external wallet (Argent X, Braavos) to repay the debt.
 *
 * @param externalAccount - External wallet account
 * @param sumoAccountAddress - The SUMO account address that has debt
 * @param amount - Amount to repay (in wei)
 * @returns Transaction hash
 */
export async function repayDebtWithExternalWallet(
  externalAccount: Account,
  sumoAccountAddress: string,
  amount: string,
): Promise<string> {
  try {
    console.log("[repayDebtWithExternalWallet] Starting debt repayment...");
    console.log("[repayDebtWithExternalWallet] External wallet:", externalAccount.address);
    console.log("[repayDebtWithExternalWallet] SUMO account:", sumoAccountAddress);
    console.log("[repayDebtWithExternalWallet] Amount:", amount);

    // Convert amount to u256 (low, high)
    const amountBigInt = BigInt(amount);
    const amountLow = amountBigInt & ((BigInt(1) << BigInt(128)) - BigInt(1));
    const amountHigh = amountBigInt >> BigInt(128);

    // Transfer STRK from external wallet to Login contract
    const result = await externalAccount.execute({
      contractAddress: STRK_CONTRACT_ADDRESS,
      entrypoint: "transfer",
      calldata: [SUMO_LOGIN_CONTRACT_ADDRESS, amountLow.toString(), amountHigh.toString()],
    });

    console.log("[repayDebtWithExternalWallet] Transaction hash:", result.transaction_hash);
    return result.transaction_hash;
  } catch (error) {
    console.error("[repayDebtWithExternalWallet] Repay failed:", error);
    throw error;
  }
}

/**
 * Repay user debt to the Login contract
 *
 * Users accumulate debt when the Login contract pays gas fees on their behalf.
 * This debt must be repaid before certain operations (like login/update key).
 *
 * @param jwt - Google JWT data
 * @param jwtToken - Raw JWT token string
 * @param sessionKey - Session key pair
 * @param amount - Amount to repay (in wei). If not specified, repays full debt.
 * @returns Transaction hash
 */
export async function repayDebt(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  amount?: string,
): Promise<string> {
  try {
    console.log("[repayDebt] Starting debt repayment...");

    // Get sender address
    const senderAddress = await getSumoAccountAddress(jwt, jwtToken);
    console.log("[repayDebt] Sender address:", senderAddress);

    // Get current debt if amount not specified
    let repayAmount = amount;
    if (!repayAmount) {
      const debt = await getUserDebt(senderAddress);
      console.log("[repayDebt] Current debt:", debt);
      repayAmount = debt;
    }

    if (repayAmount === "0" || !repayAmount) {
      throw new Error("No debt to repay");
    }

    console.log("[repayDebt] Repaying amount:", repayAmount);

    // Create account with standard ECDSA signer
    const account = new Account({
      provider,
      address: senderAddress,
      signer: sessionKey.privateKey,
    });

    // Get current block to fetch gas prices
    const block = await provider.getBlockWithTxHashes('latest');
    const l1GasPrice = BigInt(block.l1_gas_price?.price_in_fri || "100000000000000");
    const l1DataGasPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "100000000000000");
    const l2GasPrice = BigInt(block.l2_gas_price?.price_in_fri || "1000000000000");

    // Add 50% buffer
    const l1GasPriceWithBuffer = l1GasPrice * BigInt(150) / BigInt(100);
    const l1DataGasPriceWithBuffer = l1DataGasPrice * BigInt(150) / BigInt(100);
    const l2GasPriceWithBuffer = l2GasPrice * BigInt(150) / BigInt(100);

    // Convert amount to u256 (low, high)
    const amountBigInt = BigInt(repayAmount);
    const amountLow = amountBigInt & ((BigInt(1) << BigInt(128)) - BigInt(1));
    const amountHigh = amountBigInt >> BigInt(128);

    // Transfer STRK to Login contract to repay debt
    const result = await account.execute({
      contractAddress: STRK_CONTRACT_ADDRESS,
      entrypoint: "transfer",
      calldata: [SUMO_LOGIN_CONTRACT_ADDRESS, amountLow.toString(), amountHigh.toString()],
    }, {
      resourceBounds: {
        l1_gas: {
          max_amount: BigInt("50000"),
          max_price_per_unit: l1GasPriceWithBuffer,
        },
        l1_data_gas: {
          max_amount: BigInt("100000"),
          max_price_per_unit: l1DataGasPriceWithBuffer,
        },
        l2_gas: {
          max_amount: BigInt("50000000"),
          max_price_per_unit: l2GasPriceWithBuffer,
        },
      },
    });

    console.log("[repayDebt] Transaction hash:", result.transaction_hash);
    return result.transaction_hash;
  } catch (error) {
    console.error("[repayDebt] Repay failed:", error);
    throw error;
  }
}

export { provider, SUMO_LOGIN_CONTRACT_ADDRESS, SUMO_ACCOUNT_CLASS_HASH };

/**
 * Login to update the session key stored in the SUMO account
 *
 * This function calls the Login contract's `login` entry point to update
 * the public key stored in the user's Account contract. This is needed when:
 * - The user has a new session key (e.g., after re-login)
 * - The stored public key doesn't match the current session key
 *
 * @param jwt - Google JWT data
 * @param jwtToken - Raw JWT token string
 * @param sessionKey - Session key pair
 * @param maxBlock - Maximum block for transaction validity
 * @param zkProof - ZK proof data
 * @returns Transaction hash
 */
export async function loginToUpdateKey(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  maxBlock: number,
  zkProof: SnarkJSProof | bigint[],
): Promise<string> {
  try {
    console.log("[loginToUpdateKey] Starting login to update session key...");

    // Generate SUMO signature with ZK proof
    const signature = await generateSumoSignature(
      jwt,
      jwtToken,
      sessionKey,
      maxBlock,
      zkProof,
    );

    // Serialize the SUMO signature
    const serializedSig = await serializeSignature(signature);

    // Create custom signer with the SUMO signature
    const sumoSigner = new SumoSigner(sessionKey.privateKey, sessionKey.publicKey, serializedSig);

    // Create account instance for the Login contract
    const account = new Account({
      provider,
      address: SUMO_LOGIN_CONTRACT_ADDRESS,
      signer: sumoSigner,
    });

    // Get current block to fetch gas prices
    const block = await provider.getBlockWithTxHashes('latest');
    const l1GasPrice = BigInt(block.l1_gas_price?.price_in_fri || "100000000000000");
    const l1DataGasPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "100000000000000");
    const l2GasPrice = BigInt(block.l2_gas_price?.price_in_fri || "1000000000000");

    // Add 50% buffer
    const l1GasPriceWithBuffer = l1GasPrice * BigInt(150) / BigInt(100);
    const l1DataGasPriceWithBuffer = l1DataGasPrice * BigInt(150) / BigInt(100);
    const l2GasPriceWithBuffer = l2GasPrice * BigInt(150) / BigInt(100);

    // Execute login call
    const result = await account.execute({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "login",
      calldata: [],
    }, {
      skipValidate: true,
      resourceBounds: {
        l1_gas: {
          max_amount: BigInt("100000"),
          max_price_per_unit: l1GasPriceWithBuffer,
        },
        l1_data_gas: {
          max_amount: BigInt("200000"),
          max_price_per_unit: l1DataGasPriceWithBuffer,
        },
        l2_gas: {
          max_amount: BigInt("100000000"),
          max_price_per_unit: l2GasPriceWithBuffer,
        },
      },
    });

    console.log("[loginToUpdateKey] Transaction hash:", result.transaction_hash);
    return result.transaction_hash;
  } catch (error) {
    console.error("[loginToUpdateKey] Login failed:", error);
    throw error;
  }
}

// STRK token contract on Sepolia
const STRK_CONTRACT_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/**
 * Send STRK tokens from SUMO account
 *
 * For regular transactions (after account is deployed), only ECDSA signature [r, s] is needed.
 * The ZK proof is only required during account deployment.
 *
 * @param jwt - Google JWT data
 * @param jwtToken - Raw JWT token string
 * @param sessionKey - Session key pair
 * @param recipient - Recipient address
 * @param amount - Amount to send (in wei, 1 STRK = 1e18 wei)
 * @returns Transaction hash
 */
export async function sendSTRK(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  recipient: string,
  amount: string,
): Promise<string> {
  try {
    console.log("[sendSTRK] Starting transfer...");
    console.log("[sendSTRK] Recipient:", recipient);
    console.log("[sendSTRK] Amount (wei):", amount);
    console.log("[sendSTRK] Session key public:", sessionKey.publicKey);
    console.log("[sendSTRK] Session key private:", sessionKey.privateKey.slice(0, 10) + "...");

    // Get sender address
    const senderAddress = await getSumoAccountAddress(jwt, jwtToken);
    console.log("[sendSTRK] Sender address:", senderAddress);

    // Debug: Check what public key is stored in the contract
    // The stored public key should be: eph_key_0 * 2^128 + eph_key_1
    const pkBigInt = BigInt(sessionKey.publicKey);
    const U128_MASK = (BigInt(1) << BigInt(128)) - BigInt(1);
    const ephKey0 = pkBigInt >> BigInt(128);  // high 128 bits
    const ephKey1 = pkBigInt & U128_MASK;     // low 128 bits
    const reconstructedPk = ephKey0 * (BigInt(1) << BigInt(128)) + ephKey1;
    console.log("[sendSTRK] Public key BigInt:", pkBigInt.toString());
    console.log("[sendSTRK] eph_key_0 (high):", ephKey0.toString());
    console.log("[sendSTRK] eph_key_1 (low):", ephKey1.toString());
    console.log("[sendSTRK] Reconstructed PK:", reconstructedPk.toString());
    console.log("[sendSTRK] PK match:", pkBigInt === reconstructedPk);

    // For regular transactions, use standard ECDSA signer
    // The Account contract's __validate__ only checks [r, s] signature
    const account = new Account({
      provider,
      address: senderAddress,
      signer: sessionKey.privateKey,
    });

    // Get current block to fetch gas prices
    const block = await provider.getBlockWithTxHashes('latest');
    const l1GasPrice = BigInt(block.l1_gas_price?.price_in_fri || "100000000000000");
    const l1DataGasPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "100000000000000");
    const l2GasPrice = BigInt(block.l2_gas_price?.price_in_fri || "1000000000000");

    // Add 50% buffer to gas prices
    const l1GasPriceWithBuffer = l1GasPrice * BigInt(150) / BigInt(100);
    const l1DataGasPriceWithBuffer = l1DataGasPrice * BigInt(150) / BigInt(100);
    const l2GasPriceWithBuffer = l2GasPrice * BigInt(150) / BigInt(100);

    // Convert amount to u256 (low, high)
    const amountBigInt = BigInt(amount);
    const amountLow = amountBigInt & ((BigInt(1) << BigInt(128)) - BigInt(1));
    const amountHigh = amountBigInt >> BigInt(128);

    // Execute transfer call
    const result = await account.execute({
      contractAddress: STRK_CONTRACT_ADDRESS,
      entrypoint: "transfer",
      calldata: [recipient, amountLow.toString(), amountHigh.toString()],
    }, {
      resourceBounds: {
        l1_gas: {
          max_amount: BigInt("50000"),
          max_price_per_unit: l1GasPriceWithBuffer,
        },
        l1_data_gas: {
          max_amount: BigInt("100000"),
          max_price_per_unit: l1DataGasPriceWithBuffer,
        },
        l2_gas: {
          max_amount: BigInt("50000000"),
          max_price_per_unit: l2GasPriceWithBuffer,
        },
      },
    });

    console.log("[sendSTRK] Transaction hash:", result.transaction_hash);
    return result.transaction_hash;
  } catch (error) {
    console.error("[sendSTRK] Transfer failed:", error);
    throw error;
  }
}

/**
 * Test function to debug signature serialization
 * This can be called from browser console to see debug output
 */
export async function testSignatureSerialization(
  zkProof: SnarkJSProof | bigint[]
): Promise<void> {
  console.log("[testSignatureSerialization] Starting test...");
  console.log("[testSignatureSerialization] zkProof type:", Array.isArray(zkProof) ? "array" : "object");
  
  const mockSignature: SumoSignature = {
    signature_type: hash.getSelectorFromName("signature/user"),
    r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    eph_key: ["12345678901234567890", "98765432109876543210"],
    address_seed: "123456789012345678901234567890",
    max_block: "1000",
    iss_b64_F: "1234567890",
    iss_index_in_payload_mod_4: "0",
    header_F: "12345678901234567890",
    modulus_F: [
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    ],
    garaga: zkProof,
  };
  
  try {
    const serialized = await serializeSignature(mockSignature);
    console.log("[testSignatureSerialization] Success! Length:", serialized.length);
    
    let maxLen = 0;
    let maxIdx = -1;
    for (let i = 0; i < serialized.length; i++) {
      if (serialized[i].length > maxLen) {
        maxLen = serialized[i].length;
        maxIdx = i;
      }
    }
    console.log(`[testSignatureSerialization] Longest element at index ${maxIdx}: ${maxLen} chars`);
    if (maxIdx >= 0) {
      console.log(`[testSignatureSerialization] Value:`, serialized[maxIdx].substring(0, 100));
    }
  } catch (error) {
    console.error("[testSignatureSerialization] Error:", error);
  }
}

/**
 * Deploy SUMO account using external wallet (Argent X, Braavos) to pay gas
 * This allows users to deploy without pre-funding the Login contract
 */
export async function deploySumoAccountWithExternalWallet(
  externalAccount: Account,
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  maxBlock: number,
  zkProof: SnarkJSProof | bigint[],
): Promise<string> {
  try {
    console.log("[deploySumoAccountWithExternalWallet] Starting deployment...");
    console.log("[deploySumoAccountWithExternalWallet] External wallet:", externalAccount.address);

    // Generate SUMO signature with ZK proof
    const signature = await generateSumoSignature(
      jwt,
      jwtToken,
      sessionKey,
      maxBlock,
      zkProof,
    );

    // Serialize the SUMO signature
    const serializedSig = await serializeSignature(signature);
    console.log("[deploySumoAccountWithExternalWallet] Serialized signature length:", serializedSig.length);

    // Call Login contract's deploy_for function using external wallet
    // The external wallet pays for gas
    const result = await externalAccount.execute({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "deploy_for",
      calldata: serializedSig,
    });

    console.log("[deploySumoAccountWithExternalWallet] Transaction hash:", result.transaction_hash);

    return result.transaction_hash;
  } catch (error) {
    console.error("[deploySumoAccountWithExternalWallet] Deploy failed:", error);
    throw error;
  }
}
