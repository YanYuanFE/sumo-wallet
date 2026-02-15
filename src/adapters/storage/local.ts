import type { SmartAccount, ZKProof, GoogleJWT } from '@/types';
import type { FullZKProof } from '@/services/zkProofService';

const STORAGE_KEY = 'sumo_login_demo';
const ZKPROOF_STORAGE_KEY = 'sumo_zkproof';
const JWT_STORAGE_KEY = 'sumo_jwt';
const JWT_TOKEN_STORAGE_KEY = 'sumo_jwt_token';

interface StorageData {
  accounts: SmartAccount[];
  currentAccount: string | null;
}

interface ZKProofStorage {
  proof: (ZKProof & { fullProof?: FullZKProof }) | null;
  timestamp: number;
  maxBlock?: number;
}

interface JWTStorage {
  jwt: GoogleJWT;
  jwtToken: string;
  timestamp: number;
}

export function getStorage(): StorageData {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Storage read error:', e);
  }
  return { accounts: [], currentAccount: null };
}

export function setStorage(data: StorageData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Storage write error:', e);
  }
}

export function saveAccount(account: SmartAccount): void {
  const storage = getStorage();
  const existingIndex = storage.accounts.findIndex(a => a.address === account.address);

  if (existingIndex >= 0) {
    storage.accounts[existingIndex] = account;
  } else {
    storage.accounts.push(account);
  }

  storage.currentAccount = account.address;
  setStorage(storage);
}

export function getAccount(address: string): SmartAccount | null {
  const storage = getStorage();
  return storage.accounts.find(a => a.address === address) || null;
}

export function getCurrentAccount(): SmartAccount | null {
  const storage = getStorage();
  if (!storage.currentAccount) return null;
  return getAccount(storage.currentAccount);
}

export function removeAccount(address: string): void {
  const storage = getStorage();
  storage.accounts = storage.accounts.filter(a => a.address !== address);
  if (storage.currentAccount === address) {
    storage.currentAccount = storage.accounts[0]?.address || null;
  }
  setStorage(storage);
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ZKPROOF_STORAGE_KEY);
  localStorage.removeItem(JWT_STORAGE_KEY);
  localStorage.removeItem(JWT_TOKEN_STORAGE_KEY);
}

export function saveJWT(jwt: GoogleJWT | null, jwtToken: string | null): void {
  try {
    if (jwt && jwtToken) {
      const data: JWTStorage = {
        jwt,
        jwtToken,
        timestamp: Date.now(),
      };
      localStorage.setItem(JWT_STORAGE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(JWT_STORAGE_KEY);
    }
  } catch (e) {
    console.error('JWT storage write error:', e);
  }
}

export function getJWT(): { jwt: GoogleJWT; jwtToken: string } | null {
  try {
    const data = localStorage.getItem(JWT_STORAGE_KEY);
    if (data) {
      const parsed: JWTStorage = JSON.parse(data);
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        return { jwt: parsed.jwt, jwtToken: parsed.jwtToken };
      } else {
        localStorage.removeItem(JWT_STORAGE_KEY);
      }
    }
  } catch (e) {
    console.error('JWT storage read error:', e);
  }
  return null;
}

export function saveZKProof(proof: (ZKProof & { fullProof?: FullZKProof }) | null, maxBlock?: number): void {
  try {
    if (proof) {
      const data: ZKProofStorage = {
        proof,
        timestamp: Date.now(),
        maxBlock,
      };
      localStorage.setItem(ZKPROOF_STORAGE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(ZKPROOF_STORAGE_KEY);
    }
  } catch (e) {
    console.error('ZK Proof storage write error:', e);
  }
}

export function getZKProof(): { proof: (ZKProof & { fullProof?: FullZKProof }); maxBlock?: number } | null {
  try {
    const data = localStorage.getItem(ZKPROOF_STORAGE_KEY);
    if (data) {
      const parsed: ZKProofStorage = JSON.parse(data);
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        return { proof: parsed.proof!, maxBlock: parsed.maxBlock };
      } else {
        localStorage.removeItem(ZKPROOF_STORAGE_KEY);
      }
    }
  } catch (e) {
    console.error('ZK Proof storage read error:', e);
  }
  return null;
}
