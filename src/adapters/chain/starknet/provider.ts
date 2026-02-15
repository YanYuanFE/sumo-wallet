import { RpcProvider } from "starknet";
import { STARKNET_RPC_URL } from "@/adapters/config/network";

export const provider = new RpcProvider({
  nodeUrl: STARKNET_RPC_URL,
});

export { STARKNET_RPC_URL };
