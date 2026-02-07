/**
 * External Wallet Service
 * Connects to Argent X, Braavos, or other Starknet wallets
 */

import { connect, disconnect } from "starknetkit";
import { Account, RpcProvider } from "starknet";
import { STARKNET_RPC_URL } from "@/config/starknet";

// Wallet connection state
let connectedAccount: Account | null = null;

const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });

/**
 * Connect to external wallet (Argent X, Braavos, etc.)
 */
export async function connectExternalWallet(): Promise<{
  address: string;
  account: Account;
}> {
  try {
    const result = await connect({
      modalMode: "alwaysAsk",
      modalTheme: "dark",
    });

    if (!result || !result.wallet) {
      throw new Error("No wallet connected");
    }

    // Get wallet account - starknetkit returns the account directly
    const walletAccount = (result.wallet as any).account || result.wallet;
    const address = walletAccount.address || (result.wallet as any).selectedAddress;

    // Create Account instance
    connectedAccount = new Account({
      provider,
      address,
      signer: walletAccount.signer || walletAccount,
    });

    console.log("[connectExternalWallet] Connected:", address);

    return {
      address,
      account: connectedAccount,
    };
  } catch (error) {
    console.error("[connectExternalWallet] Failed:", error);
    throw error;
  }
}

/**
 * Disconnect external wallet
 */
export async function disconnectExternalWallet(): Promise<void> {
  try {
    await disconnect();
    connectedAccount = null;
    console.log("[disconnectExternalWallet] Disconnected");
  } catch (error) {
    console.error("[disconnectExternalWallet] Failed:", error);
  }
}

/**
 * Get connected wallet account
 */
export function getConnectedAccount(): Account | null {
  return connectedAccount;
}

/**
 * Check if wallet is connected
 */
export function isWalletConnected(): boolean {
  return connectedAccount !== null;
}

/**
 * Get connected wallet address
 */
export function getConnectedAddress(): string | null {
  return connectedAccount?.address || null;
}
