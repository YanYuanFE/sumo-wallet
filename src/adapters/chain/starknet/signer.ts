import { Signer, hash, CallData, type Call, type InvocationsSignerDetails, type Signature } from "starknet";
import type { GoogleJWT, SessionKeyPair } from "@/types";
import { signTransactionHash } from "@/utils/crypto";
import { generateProofInputs } from "@/services/zkProofService";
import { convertSnarkjsProofToGaraga, type SnarkJSProof } from "@/adapters/proof/garaga";
import { FELT252_PRIME, FELT252_MAX } from "@/adapters/config/crypto";

export interface SumoSignature {
  signature_type: string;
  r: string;
  s: string;
  eph_key: [string, string];
  address_seed: string;
  max_block: string;
  iss_b64_F: string;
  iss_index_in_payload_mod_4: string;
  header_F: string;
  modulus_F: string[];
  garaga: bigint[] | SnarkJSProof;
}

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

  const byteArrays: number[] = [];
  for (const input of inputs) {
    const hex = input.toString(16).padStart(64, "0");
    for (let i = 0; i < 64; i += 2) {
      byteArrays.push(parseInt(hex.slice(i, i + 2), 16));
    }
  }

  const data = new Uint8Array(byteArrays);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return "0x" + hashHex;
}

export function toU256(value: string | bigint): [string, string] {
  const val = typeof value === 'string' ? BigInt(value) : value;
  const MASK_128 = (BigInt(1) << BigInt(128)) - BigInt(1);
  const low = val & MASK_128;
  const high = val >> BigInt(128);
  return [low.toString(), high.toString()];
}

export async function generateSumoSignature(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  maxBlock: number,
  zkProof: SnarkJSProof | bigint[],
): Promise<SumoSignature> {
  console.log("[generateSumoSignature] Computing signature values locally (official circuit format)");

  if (!Array.isArray(zkProof) && zkProof.publicSignals) {
    console.log("[generateSumoSignature] Proof publicSignals:", zkProof.publicSignals);
    console.log("[generateSumoSignature] Expected 2 values (hash_high, hash_low)");
  }

  const { publicInputs } = await generateProofInputs(jwt, sessionKey, jwtToken, maxBlock);

  const ephKey0 = publicInputs.eph_public_key0_low;
  const ephKey1 = publicInputs.eph_public_key1_low;

  const addressSeedHigh = BigInt(publicInputs.address_seed_high);
  const addressSeedLow = BigInt(publicInputs.address_seed_low);
  const addressSeed = (addressSeedHigh << BigInt(128)) + addressSeedLow;

  const issB64FHigh = BigInt(publicInputs.iss_b64_F_high);
  const issB64FLow = BigInt(publicInputs.iss_b64_F_low);
  const issB64F = (issB64FHigh << BigInt(128)) + issB64FLow;

  const headerFHigh = BigInt(publicInputs.header_F_high);
  const headerFLow = BigInt(publicInputs.header_F_low);
  const headerF = (headerFHigh << BigInt(128)) + headerFLow;

  const modulusFHigh = BigInt(publicInputs.modulus_F_high);
  const modulusFLow = BigInt(publicInputs.modulus_F_low);
  const modulusF = (modulusFHigh << BigInt(128)) + modulusFLow;

  const issIndexInPayloadMod4 = publicInputs.iss_index_in_payload_mod_4;

  console.log("[generateSumoSignature] Using values from generateProofInputs for consistency");
  console.log("[generateSumoSignature] ephKey0:", ephKey0, "ephKey1:", ephKey1);
  console.log("[generateSumoSignature] addressSeed:", addressSeed.toString());

  console.log("[generateSumoSignature] === AIH Values Sent to Cairo ===");
  console.log("[generateSumoSignature] eph_key (felt252 tuple):", [ephKey0, ephKey1]);
  console.log("[generateSumoSignature] address_seed (u256):", addressSeed.toString());
  console.log("[generateSumoSignature] max_block (felt252):", maxBlock);
  console.log("[generateSumoSignature] iss_b64_F (u256):", issB64F.toString());
  console.log("[generateSumoSignature] iss_index_in_payload_mod_4:", issIndexInPayloadMod4);
  console.log("[generateSumoSignature] header_F (u256):", headerF.toString());
  console.log("[generateSumoSignature] modulus_F (u256):", modulusF.toString());

  console.log("[generateSumoSignature] === Cairo will compute AIH from these u256s ===");
  console.log("[generateSumoSignature] u256[0] (eph_0.into()): high=0, low=", ephKey0);
  console.log("[generateSumoSignature] u256[1] (eph_1.into()): high=0, low=", ephKey1);
  console.log("[generateSumoSignature] u256[2] (address_seed): high=", addressSeedHigh.toString(), ", low=", addressSeedLow.toString());
  console.log("[generateSumoSignature] u256[3] (max_block.into()): high=0, low=", maxBlock);
  console.log("[generateSumoSignature] u256[4] (iss_b64_F): high=", issB64FHigh.toString(), ", low=", issB64FLow.toString());
  console.log("[generateSumoSignature] u256[5] (iss_index.into()): high=0, low=", issIndexInPayloadMod4);
  console.log("[generateSumoSignature] u256[6] (header_F): high=", headerFHigh.toString(), ", low=", headerFLow.toString());
  console.log("[generateSumoSignature] u256[7] (modulus_F): high=", modulusFHigh.toString(), ", low=", modulusFLow.toString());

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

  const signatureTypeSelector = hash.getSelectorFromName("signature/user");

  return {
    signature_type: signatureTypeSelector,
    r: "0",
    s: "0",
    eph_key: [normalizeToFelt252(ephKey0), normalizeToFelt252(ephKey1)],
    address_seed: addressSeed.toString(),
    max_block: maxBlock.toString(),
    iss_b64_F: issB64F.toString(),
    iss_index_in_payload_mod_4: normalizeToFelt252(issIndexInPayloadMod4),
    header_F: headerF.toString(),
    modulus_F: [modulusF.toString()],
    garaga: zkProof,
  };
}

export class SumoSigner extends Signer {
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

    const calldata = CallData.compile({
      calls: transactions.map(tx => ({
        to: tx.contractAddress,
        selector: hash.getSelectorFromName(tx.entrypoint),
        calldata: tx.calldata || [],
      })),
    });

    const daToNum = (mode: unknown): 0 | 1 => {
      if (mode === "L1" || mode === 0) return 0;
      if (mode === "L2" || mode === 1) return 1;
      return 0;
    };

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

    const { r, s } = signTransactionHash(txHash, this.ephemeralPrivateKey);
    console.log("[SumoSigner.signTransaction] Signature r (hex):", r);
    console.log("[SumoSigner.signTransaction] Signature s (hex):", s);

    const rDecimal = BigInt(r).toString();
    const sDecimal = BigInt(s).toString();
    console.log("[SumoSigner.signTransaction] Signature r (decimal):", rDecimal);
    console.log("[SumoSigner.signTransaction] Signature s (decimal):", sDecimal);

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

export async function serializeSignature(signature: SumoSignature): Promise<string[]> {
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

  const [addressSeedLow, addressSeedHigh] = toU256(signature.address_seed);
  const [issB64FLow, issB64FHigh] = toU256(signature.iss_b64_F);
  const [headerFLow, headerFHigh] = toU256(signature.header_F);

  const modulusValue = signature.modulus_F.length > 0
    ? BigInt(signature.modulus_F[0])
    : BigInt(0);
  const [modulusFLow, modulusFHigh] = toU256(modulusValue);

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
    garagaArray.length.toString(),
    ...garagaArray,
  ];

  console.log("[serializeSignature] Total signature length:", result.length);
  console.log("[serializeSignature] First 10 elements:", result.slice(0, 10));

  const problematicElements: Array<{index: number, originalHexLen: number, originalHex: string, normalizedHex: string, originalVal: bigint}> = [];

  result = result.map((elem, i) => {
    let val = BigInt(elem);
    const originalHex = val.toString(16);
    const originalHexLen = originalHex.length;

    if (val > FELT252_MAX || val < 0) {
      console.warn(`[serializeSignature] Element ${i} out of felt252 range (${originalHexLen} hex chars), normalizing...`);
      val = val & FELT252_MAX;
    }

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

  if (problematicElements.length > 0) {
    console.error(`[serializeSignature] CRITICAL: ${problematicElements.length} elements still exceed 64 hex chars after normalization!`);
    console.error("[serializeSignature] Problematic elements:", problematicElements.map(p => `Index ${p.index}: ${p.originalHexLen} chars`));
  } else {
    console.log("[serializeSignature] All elements normalized successfully to felt252 range.");
  }

  console.log("[serializeSignature] Final signature length:", result.length);

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
