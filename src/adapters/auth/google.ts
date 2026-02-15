import { GOOGLE_JWKS_URL } from '@/adapters/config/network';

interface JWKSKey {
  kty: string;
  n: string;
  e: string;
  kid: string;
  alg: string;
}

interface JWKSResponse {
  keys: JWKSKey[];
}

function base64UrlToHex(base64url: string): string {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  let hex = "";
  for (let i = 0; i < binary.length; i++) {
    const byte = binary.charCodeAt(i).toString(16).padStart(2, "0");
    hex += byte;
  }
  return hex;
}

export async function getGoogleRSAKey(
  kid: string,
): Promise<{ modulus: string; exponent: string }> {
  try {
    const response = await fetch(GOOGLE_JWKS_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status}`);
    }

    const jwks: JWKSResponse = await response.json();
    const key = jwks.keys.find((k) => k.kid === kid);

    if (!key) {
      throw new Error(`Key with kid "${kid}" not found in JWKS`);
    }

    const modulusHex = base64UrlToHex(key.n);
    const exponentHex = base64UrlToHex(key.e);

    return {
      modulus: "0x" + modulusHex,
      exponent: "0x" + exponentHex,
    };
  } catch (error) {
    console.error("Failed to get Google RSA key:", error);
    throw error;
  }
}

export async function getModulusFromJWT(jwtToken: string): Promise<string> {
  try {
    const headerBase64 = jwtToken.split(".")[0];
    const headerJson = atob(headerBase64.replace(/-/g, "+").replace(/_/g, "/"));
    const header = JSON.parse(headerJson);
    const kid = header.kid;

    if (!kid) {
      throw new Error("JWT header does not contain kid");
    }

    const { modulus } = await getGoogleRSAKey(kid);
    return modulus;
  } catch (error) {
    console.error("Failed to get modulus from JWT:", error);
    throw error;
  }
}
