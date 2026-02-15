// 密码学常量 - 从 starknetService.ts 和 zkProofService.ts 提取

export const FELT252_PRIME = BigInt(
  "3618502788666131213697322783095070105623107215331596699973092056135872020481"
);

export const FELT252_MAX = (BigInt(1) << BigInt(252)) - BigInt(1);

export const U128_MAX = BigInt(1) << BigInt(128);
export const U128_MASK = U128_MAX - BigInt(1);

export const MASK_250 = (BigInt(1) << BigInt(250)) - BigInt(1);
