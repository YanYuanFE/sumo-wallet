import { connect, disconnect } from "starknetkit";
import { Account, RpcProvider } from "starknet";
import { STARKNET_RPC_URL } from "@/adapters/config/network";

let connectedAccount: Account | null = null;

const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });

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

    const walletAccount = (result.wallet as any).account || result.wallet;
    const address = walletAccount.address || (result.wallet as any).selectedAddress;

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

export async function disconnectExternalWallet(): Promise<void> {
  try {
    await disconnect();
    connectedAccount = null;
    console.log("[disconnectExternalWallet] Disconnected");
  } catch (error) {
    console.error("[disconnectExternalWallet] Failed:", error);
  }
}

export function getConnectedAccount(): Account | null {
  return connectedAccount;
}

export function isWalletConnected(): boolean {
  return connectedAccount !== null;
}

export function getConnectedAddress(): string | null {
  return connectedAccount?.address || null;
}
