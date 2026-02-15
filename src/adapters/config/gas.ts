// Gas 限制常量 - 从 starknetService.ts 多处提取

export const GAS_LIMITS = {
  deploy: {
    l1: BigInt("100000"),
    l1Data: BigInt("500000"),
    l2: BigInt("100000000"),
  },
  login: {
    l1: BigInt("100000"),
    l1Data: BigInt("200000"),
    l2: BigInt("100000000"),
  },
  regular: {
    l1: BigInt("50000"),
    l1Data: BigInt("100000"),
    l2: BigInt("50000000"),
  },
} as const;

export const GAS_PRICE_BUFFER_NUMERATOR = BigInt(150);
export const GAS_PRICE_BUFFER_DENOMINATOR = BigInt(100);

export const DEFAULT_GAS_PRICES = {
  l1: "100000000000000",
  l1Data: "100000000000000",
  l2: "1000000000000",
} as const;
