// SUMO Login Demo Types

export interface GoogleJWT {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
  iat: number;
  exp: number;
  nonce?: string;
}

export interface SessionKeyPair {
  publicKey: string;
  privateKey: string;
  createdAt: number;
  expiresAt: number;
}

export interface ZKProof {
  proof: string;
  publicSignals: string[];
  verified: boolean;
}

export interface SmartAccount {
  address: string;
  owner: string;
  email: string;
  sessionKey: SessionKeyPair;
  createdAt: number;
  lastLogin: number;
  transactions: Transaction[];
}

export interface Transaction {
  id: string;
  type: 'transfer' | 'swap' | 'approve';
  to: string;
  amount: string;
  token: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  signature?: string;
}

export interface LoginFlow {
  step: 'idle' | 'oauth' | 'jwt' | 'session' | 'zkproof' | 'account' | 'complete';
  progress: number;
  message: string;
}
