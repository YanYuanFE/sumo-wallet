// 网络配置 - 从 config/starknet.ts 和 starknetService.ts 提取

export const STARKNET_RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/OfZA_k9dt4bm8hU_brCcah5wbRx--cf9";

export const GARAGA_API_URL =
  import.meta.env.VITE_GARAGA_API_URL || 'http://localhost:3001';

export const GOOGLE_JWKS_URL =
  "https://www.googleapis.com/oauth2/v3/certs";

export const DEFAULT_GOOGLE_CLIENT_ID =
  "481771758710-4d0pn7iag8nlut2l0p5n1lsubt1hei1h.apps.googleusercontent.com";
export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
