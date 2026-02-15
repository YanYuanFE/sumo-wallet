import { Account, hash } from "starknet";
import type { GoogleJWT, SessionKeyPair } from "@/types";
import { provider } from "@/adapters/chain/starknet/provider";
import { SUMO_LOGIN_CONTRACT_ADDRESS, STRK_CONTRACT_ADDRESS, ORACLE_ADDRESS } from "@/adapters/config/contracts";
import { GARAGA_API_URL } from "@/adapters/config/network";
import { type SnarkJSProof } from "@/adapters/proof/garaga";
import {
  generateSumoSignature,
  serializeSignature,
  SumoSigner,
  type SumoSignature,
} from "@/adapters/chain/starknet/signer";
import { getSumoAccountAddress } from "@/adapters/chain/starknet/address";

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

    const signature = await generateSumoSignature(jwt, jwtToken, sessionKey, maxBlock, zkProof);
    const serializedSig = await serializeSignature(signature);
    console.log("[deploySumoAccount] Serialized signature length:", serializedSig.length);
    console.log("[deploySumoAccount] First 5 elements:", serializedSig.slice(0, 5));

    const oracleModulusF = await getOracleModulusF();
    console.log("[deploySumoAccount] Oracle modulus_F:", oracleModulusF);
    console.log("[deploySumoAccount] Signature modulus_F:", signature.modulus_F);

    const sumoSigner = new SumoSigner(sessionKey.privateKey, sessionKey.publicKey, serializedSig);
    const account = new Account({ provider, address: SUMO_LOGIN_CONTRACT_ADDRESS, signer: sumoSigner });

    console.log("[deploySumoAccount] Executing deploy call...");
    console.log("[deploySumoAccount] Account address:", account.address);

    const block = await provider.getBlockWithTxHashes('latest');
    const l1GasPrice = BigInt(block.l1_gas_price?.price_in_fri || "100000000000000");
    const l1DataGasPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "100000000000000");
    const l2GasPrice = BigInt(block.l2_gas_price?.price_in_fri || "1000000000000");

    console.log("[deploySumoAccount] L1 Gas Price:", l1GasPrice.toString());
    console.log("[deploySumoAccount] L1 Data Gas Price:", l1DataGasPrice.toString());
    console.log("[deploySumoAccount] L2 Gas Price:", l2GasPrice.toString());

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
        l1_gas: { max_amount: BigInt("100000"), max_price_per_unit: l1GasPriceWithBuffer },
        l1_data_gas: { max_amount: BigInt("500000"), max_price_per_unit: l1DataGasPriceWithBuffer },
        l2_gas: { max_amount: BigInt("100000000"), max_price_per_unit: l2GasPriceWithBuffer },
      },
    });

    console.log("[deploySumoAccount] Transaction hash:", result.transaction_hash);
    return result.transaction_hash;
  } catch (error) {
    console.error("Deploy failed:", error);
    const errorMessage = (error as Error)?.message || String(error);

    if (errorMessage && (errorMessage.includes("exceed balance") || errorMessage.includes("balance (0)"))) {
      throw new Error(
        `❌ 部署失败: STRK 余额不足\n\n` +
        `SUMO Login 合约无法支付 gas 费用。\n\n` +
        `📍 合约地址: ${SUMO_LOGIN_CONTRACT_ADDRESS}\n\n` +
        `💡 解决方案：\n` +
        `  1. 在 Sepolia 测试网上为合约充值 STRK 代币\n` +
        `  2. 使用 Starknet Faucet: https://starknet-faucet.vercel.app/\n` +
        `  3. 或使用外部钱包部署（连接 Argent X 或 Braavos）\n\n` +
        `需要帮助？查看 docs/ISSUES_ANALYSIS.md`
      );
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

export async function loginSumoAccount(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  maxBlock: number,
  zkProof: SnarkJSProof | bigint[],
): Promise<string> {
  try {
    const signature = await generateSumoSignature(jwt, jwtToken, sessionKey, maxBlock, zkProof);
    const serializedSig = await serializeSignature(signature);
    const sumoSigner = new SumoSigner(sessionKey.privateKey, sessionKey.publicKey, serializedSig);
    const account = new Account({ provider, address: SUMO_LOGIN_CONTRACT_ADDRESS, signer: sumoSigner });

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

export async function loginToUpdateKey(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  maxBlock: number,
  zkProof: SnarkJSProof | bigint[],
): Promise<string> {
  try {
    console.log("[loginToUpdateKey] Starting login to update session key...");

    const signature = await generateSumoSignature(jwt, jwtToken, sessionKey, maxBlock, zkProof);
    const serializedSig = await serializeSignature(signature);
    const sumoSigner = new SumoSigner(sessionKey.privateKey, sessionKey.publicKey, serializedSig);
    const account = new Account({ provider, address: SUMO_LOGIN_CONTRACT_ADDRESS, signer: sumoSigner });

    const block = await provider.getBlockWithTxHashes('latest');
    const l1GasPrice = BigInt(block.l1_gas_price?.price_in_fri || "100000000000000");
    const l1DataGasPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "100000000000000");
    const l2GasPrice = BigInt(block.l2_gas_price?.price_in_fri || "1000000000000");

    const l1GasPriceWithBuffer = l1GasPrice * BigInt(150) / BigInt(100);
    const l1DataGasPriceWithBuffer = l1DataGasPrice * BigInt(150) / BigInt(100);
    const l2GasPriceWithBuffer = l2GasPrice * BigInt(150) / BigInt(100);

    const result = await account.execute({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "login",
      calldata: [],
    }, {
      skipValidate: true,
      resourceBounds: {
        l1_gas: { max_amount: BigInt("100000"), max_price_per_unit: l1GasPriceWithBuffer },
        l1_data_gas: { max_amount: BigInt("200000"), max_price_per_unit: l1DataGasPriceWithBuffer },
        l2_gas: { max_amount: BigInt("100000000"), max_price_per_unit: l2GasPriceWithBuffer },
      },
    });

    console.log("[loginToUpdateKey] Transaction hash:", result.transaction_hash);
    return result.transaction_hash;
  } catch (error) {
    console.error("[loginToUpdateKey] Login failed:", error);
    throw error;
  }
}

export async function getAccountBalance(
  accountAddress: string,
): Promise<string> {
  try {
    console.log("[getAccountBalance] Querying balance for:", accountAddress);

    const result = await provider.callContract({
      contractAddress: STRK_CONTRACT_ADDRESS,
      entrypoint: "balanceOf",
      calldata: [accountAddress],
    });

    console.log("[getAccountBalance] Raw result:", result);

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

export async function getUserDebt(accountAddress: string): Promise<string> {
  try {
    const result = await provider.callContract({
      contractAddress: SUMO_LOGIN_CONTRACT_ADDRESS,
      entrypoint: "get_user_debt",
      calldata: [accountAddress],
    });

    return result[0] || "0";
  } catch (error) {
    console.error("Get debt failed:", error);
    return "0";
  }
}

export async function getOracleModulusF(): Promise<string> {
  try {
    const result = await provider.callContract({
      contractAddress: ORACLE_ADDRESS,
      entrypoint: "get_modulus_F",
      calldata: [],
    });

    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0");
    const modulusF = high * BigInt(2) ** BigInt(128) + low;
    console.log("[getOracleModulusF] Oracle modulus_F:", modulusF.toString());
    return modulusF.toString();
  } catch (error) {
    console.error("[getOracleModulusF] Failed:", error);
    return "0";
  }
}

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

    const amountBigInt = BigInt(amount);
    const amountLow = amountBigInt & ((BigInt(1) << BigInt(128)) - BigInt(1));
    const amountHigh = amountBigInt >> BigInt(128);

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

export async function repayDebt(
  jwt: GoogleJWT,
  jwtToken: string,
  sessionKey: SessionKeyPair,
  amount?: string,
): Promise<string> {
  try {
    console.log("[repayDebt] Starting debt repayment...");

    const senderAddress = await getSumoAccountAddress(jwt, jwtToken);
    console.log("[repayDebt] Sender address:", senderAddress);

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

    const account = new Account({
      provider,
      address: senderAddress,
      signer: sessionKey.privateKey,
    });

    const block = await provider.getBlockWithTxHashes('latest');
    const l1GasPrice = BigInt(block.l1_gas_price?.price_in_fri || "100000000000000");
    const l1DataGasPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "100000000000000");
    const l2GasPrice = BigInt(block.l2_gas_price?.price_in_fri || "1000000000000");

    const l1GasPriceWithBuffer = l1GasPrice * BigInt(150) / BigInt(100);
    const l1DataGasPriceWithBuffer = l1DataGasPrice * BigInt(150) / BigInt(100);
    const l2GasPriceWithBuffer = l2GasPrice * BigInt(150) / BigInt(100);

    const amountBigInt = BigInt(repayAmount);
    const amountLow = amountBigInt & ((BigInt(1) << BigInt(128)) - BigInt(1));
    const amountHigh = amountBigInt >> BigInt(128);

    const result = await account.execute({
      contractAddress: STRK_CONTRACT_ADDRESS,
      entrypoint: "transfer",
      calldata: [SUMO_LOGIN_CONTRACT_ADDRESS, amountLow.toString(), amountHigh.toString()],
    }, {
      resourceBounds: {
        l1_gas: { max_amount: BigInt("50000"), max_price_per_unit: l1GasPriceWithBuffer },
        l1_data_gas: { max_amount: BigInt("100000"), max_price_per_unit: l1DataGasPriceWithBuffer },
        l2_gas: { max_amount: BigInt("50000000"), max_price_per_unit: l2GasPriceWithBuffer },
      },
    });

    console.log("[repayDebt] Transaction hash:", result.transaction_hash);
    return result.transaction_hash;
  } catch (error) {
    console.error("[repayDebt] Repay failed:", error);
    throw error;
  }
}

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

    const senderAddress = await getSumoAccountAddress(jwt, jwtToken);
    console.log("[sendSTRK] Sender address:", senderAddress);

    const account = new Account({
      provider,
      address: senderAddress,
      signer: sessionKey.privateKey,
    });

    const block = await provider.getBlockWithTxHashes('latest');
    const l1GasPrice = BigInt(block.l1_gas_price?.price_in_fri || "100000000000000");
    const l1DataGasPrice = BigInt(block.l1_data_gas_price?.price_in_fri || "100000000000000");
    const l2GasPrice = BigInt(block.l2_gas_price?.price_in_fri || "1000000000000");

    const l1GasPriceWithBuffer = l1GasPrice * BigInt(150) / BigInt(100);
    const l1DataGasPriceWithBuffer = l1DataGasPrice * BigInt(150) / BigInt(100);
    const l2GasPriceWithBuffer = l2GasPrice * BigInt(150) / BigInt(100);

    const amountBigInt = BigInt(amount);
    const amountLow = amountBigInt & ((BigInt(1) << BigInt(128)) - BigInt(1));
    const amountHigh = amountBigInt >> BigInt(128);

    const result = await account.execute({
      contractAddress: STRK_CONTRACT_ADDRESS,
      entrypoint: "transfer",
      calldata: [recipient, amountLow.toString(), amountHigh.toString()],
    }, {
      resourceBounds: {
        l1_gas: { max_amount: BigInt("50000"), max_price_per_unit: l1GasPriceWithBuffer },
        l1_data_gas: { max_amount: BigInt("100000"), max_price_per_unit: l1DataGasPriceWithBuffer },
        l2_gas: { max_amount: BigInt("50000000"), max_price_per_unit: l2GasPriceWithBuffer },
      },
    });

    console.log("[sendSTRK] Transaction hash:", result.transaction_hash);
    return result.transaction_hash;
  } catch (error) {
    console.error("[sendSTRK] Transfer failed:", error);
    throw error;
  }
}

export async function testSignatureSerialization(
  zkProof: SnarkJSProof | bigint[]
): Promise<void> {
  console.log("[testSignatureSerialization] Starting test...");

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

    const signature = await generateSumoSignature(jwt, jwtToken, sessionKey, maxBlock, zkProof);
    const serializedSig = await serializeSignature(signature);
    console.log("[deploySumoAccountWithExternalWallet] Serialized signature length:", serializedSig.length);

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
