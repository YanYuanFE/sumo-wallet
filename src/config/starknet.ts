import { RpcProvider } from "starknet";

// Starknet RPC 配置
export const STARKNET_RPC_URL =
  "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/OfZA_k9dt4bm8hU_brCcah5wbRx--cf9";

// 共享的 RpcProvider 实例
export const provider = new RpcProvider({
  nodeUrl: STARKNET_RPC_URL,
});
