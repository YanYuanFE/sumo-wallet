import type { GoogleJWT } from "@/types";
import { computeStarknetAddress } from "@/utils/crypto";
import { generateProofInputs } from "@/services/zkProofService";
import { SUMO_LOGIN_CONTRACT_ADDRESS, SUMO_ACCOUNT_CLASS_HASH } from "@/adapters/config/contracts";
import { provider } from "@/adapters/chain/starknet/provider";

export async function getSumoAccountAddress(jwt: GoogleJWT, jwtToken: string): Promise<string> {
  const dummySessionKey = {
    publicKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    privateKey: '0x01',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };

  const { publicInputs } = await generateProofInputs(jwt, dummySessionKey, jwtToken, 0);

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

export async function isSumoUser(accountAddress: string): Promise<boolean> {
  try {
    console.log("[isSumoUser] Checking deployment for:", accountAddress);

    const result = await provider.callContract({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "is_sumo_user",
      calldata: [accountAddress],
    });

    console.log("[isSumoUser] Raw result:", result);

    const isDeployed = result[0] === "0x1";
    console.log("[isSumoUser] Is deployed:", isDeployed);
    return isDeployed;
  } catch (error) {
    console.error("[isSumoUser] Check user failed:", error);
    return false;
  }
}
