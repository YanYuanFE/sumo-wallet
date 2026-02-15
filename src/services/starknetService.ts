// Re-export barrel - all exports forwarded to adapter modules

export { checkGaragaApiHealth, getGaragaApiUrl } from "@/adapters/proof/garaga";
export type { SnarkJSProof } from "@/adapters/proof/garaga";

export { getGoogleRSAKey, getModulusFromJWT } from "@/adapters/auth/google";

export { provider } from "@/adapters/chain/starknet/provider";

export { getSumoAccountAddress, isSumoUser } from "@/adapters/chain/starknet/address";

export {
  type SumoSignature,
  type PublicInputs,
  computeAllInputsHash,
  toU256,
  generateSumoSignature,
  SumoSigner,
  serializeSignature,
} from "@/adapters/chain/starknet/signer";

export {
  deploySumoAccount,
  loginSumoAccount,
  loginToUpdateKey,
  getAccountBalance,
  getUserDebt,
  getOracleModulusF,
  repayDebtWithExternalWallet,
  repayDebt,
  sendSTRK,
  testSignatureSerialization,
  deploySumoAccountWithExternalWallet,
} from "@/adapters/chain/starknet/account";

export {
  SUMO_LOGIN_CONTRACT_ADDRESS,
  SUMO_ACCOUNT_CLASS_HASH,
} from "@/adapters/config/contracts";
