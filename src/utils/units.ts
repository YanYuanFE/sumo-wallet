// Token amount parsing/formatting helpers (BigInt-safe)

const TEN = BigInt(10);

function pow10(decimals: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < decimals; i += 1) {
    result *= TEN;
  }
  return result;
}

function normalizeDecimalInput(value: string): { sign: string; whole: string; fraction: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Invalid number");
  }

  const sign = trimmed.startsWith("-") ? "-" : "";
  const unsigned = sign ? trimmed.slice(1) : trimmed;
  if (unsigned.length === 0) {
    throw new Error("Invalid number");
  }

  const normalized = unsigned.startsWith(".") ? `0${unsigned}` : unsigned;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(normalized)) {
    throw new Error("Invalid number");
  }

  const [whole, fraction = ""] = normalized.split(".");
  return { sign, whole, fraction };
}

export function parseUnits(value: string, decimals: number = 18): bigint {
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error("Invalid decimals");
  }

  const { sign, whole, fraction } = normalizeDecimalInput(value);
  if (fraction.length > decimals) {
    throw new Error("Too many decimal places");
  }

  const wholeBigInt = BigInt(whole || "0");
  const fractionPadded = fraction.padEnd(decimals, "0");
  const fractionBigInt = BigInt(fractionPadded || "0");
  const base = pow10(decimals);
  const combined = wholeBigInt * base + fractionBigInt;
  return sign ? -combined : combined;
}

export function formatUnits(value: bigint | string, decimals: number = 18): string {
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error("Invalid decimals");
  }

  const bigValue = typeof value === "bigint" ? value : BigInt(value);
  const sign = bigValue < BigInt(0) ? "-" : "";
  const absValue = bigValue < BigInt(0) ? -bigValue : bigValue;
  const base = pow10(decimals);
  const whole = absValue / base;
  const fraction = absValue % base;

  if (fraction === BigInt(0)) {
    return `${sign}${whole.toString()}`;
  }

  let fractionStr = fraction.toString().padStart(decimals, "0");
  fractionStr = fractionStr.replace(/0+$/, "");
  return `${sign}${whole.toString()}.${fractionStr}`;
}

// Fixed precision (truncation, not rounding) for UI display.
export function formatUnitsFixed(
  value: bigint | string,
  decimals: number = 18,
  fractionDigits: number = 0,
): string {
  if (fractionDigits < 0 || !Number.isInteger(fractionDigits)) {
    throw new Error("Invalid fraction digits");
  }

  const bigValue = typeof value === "bigint" ? value : BigInt(value);
  const sign = bigValue < BigInt(0) ? "-" : "";
  const absValue = bigValue < BigInt(0) ? -bigValue : bigValue;
  const base = pow10(decimals);
  const whole = absValue / base;
  const fraction = absValue % base;

  if (fractionDigits === 0) {
    return `${sign}${whole.toString()}`;
  }

  const fullFraction = fraction.toString().padStart(decimals, "0");
  const sliced = fullFraction.slice(0, fractionDigits).padEnd(fractionDigits, "0");
  return `${sign}${whole.toString()}.${sliced}`;
}

export function parseEther(value: string): bigint {
  return parseUnits(value, 18);
}

export function formatEther(value: bigint | string): string {
  return formatUnits(value, 18);
}

export function formatEtherFixed(value: bigint | string, fractionDigits: number): string {
  return formatUnitsFixed(value, 18, fractionDigits);
}
