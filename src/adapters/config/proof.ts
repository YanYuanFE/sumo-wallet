// ZK 电路文件路径 - 从 zkProofService.ts 提取

const CACHE_BUST = '?v=' + Date.now();

export const CIRCUIT_WASM_URL = '/zk/sumo_auth_official.wasm' + CACHE_BUST;
export const CIRCUIT_ZKEY_URL = '/zk/sumo_auth_official_final.zkey' + CACHE_BUST;
export const VERIFICATION_KEY_URL = '/zk/verification_key.json' + CACHE_BUST;
