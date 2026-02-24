# SUMO Wallet — ZK Social Login for Starknet

A zero-knowledge proof powered smart wallet on Starknet. Users authenticate with Google, a client-side Groth16 ZK proof verifies their identity without revealing any personal data on-chain, and a self-custodial smart contract wallet is created instantly.

**No seed phrases. No custodians. Full privacy.**

## The Problem

Onboarding to Web3 remains broken. Users must manage seed phrases, install wallet extensions, and understand cryptographic key management before making their first transaction. Custodial solutions simplify UX but sacrifice decentralization — users trust a third party with their funds.

There is no way to get a self-custodial wallet with just a Google login — until now.

## How It Works

### Step 1 — Google Sign-In

User clicks "Sign in with Google". The OAuth flow returns a signed JWT token containing the user's identity claims.

### Step 2 — Client-Side ZK Proof Generation

The browser generates a Groth16 proof using snarkjs. The circuit computes:

```
Identity Commitment = Poseidon(EmailHash, GoogleSubID, SecretFromJWT)
```

This proves the user owns a valid Google identity **without exposing what that identity is**. The email is hashed using chunked Poseidon (15 bytes per chunk) to fit within the circuit's field constraints.

### Step 3 — On-Chain Verification

The ZK proof is converted to Garaga-compatible calldata (BN254 curve) and submitted to Starknet. The on-chain Groth16 verifier validates the proof, and a smart contract wallet is deployed — linked to the user's identity commitment, not their email.

### Step 4 — Session Keys

A temporary ECDSA session key (24h expiry) is generated for smooth transaction signing. Users can send STRK, interact with dApps, and manage their wallet without re-proving their identity for every action.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Google OAuth │────▶│  Browser ZK  │────▶│  Starknet Chain  │
│ (JWT Token)  │     │  (snarkjs +  │     │ (Groth16 verify  │
│              │     │   Poseidon)  │     │ + Smart Wallet)  │
└─────────────┘     └──────┬───────┘     └──────────────────┘
                           │
                    ┌──────▼───────┐
                    │  Garaga API  │
                    │    (Proof    │
                    │  Conversion) │
                    └──────────────┘
```

- **Frontend**: React + TypeScript + Vite, hexagonal architecture (adapters / services / hooks)
- **ZK Circuits**: Circom (Groth16), compiled to WASM for in-browser proving
- **Proof Conversion**: FastAPI server using Garaga v1.0.1 for BN254 calldata generation
- **Smart Contracts**: Cairo on Starknet — Login contract (registration + verification), Account contract (session key management), Groth16 Verifier (on-chain proof validation via Garaga)

## Key Features

- **One-Click Onboarding** — Sign in with Google, get a Starknet wallet. No seed phrases, no extensions.
- **Full Privacy** — Email, JWT, and personal data never touch the blockchain. Only the ZK identity commitment is stored on-chain.
- **Self-Custodial** — No centralized key management. The smart contract wallet is controlled by the user's ZK-proven identity.
- **Client-Side Proving** — ZK proof generation happens entirely in the browser. No server ever sees the user's private inputs.
- **Session Keys** — 24-hour ephemeral keys for seamless UX without repeated proof generation.
- **On-Chain Verification** — Groth16 proof verified on Starknet using Garaga's BN254 verifier. Trustless, fully decentralized.
- **Account Abstraction** — Leverages Starknet's native account abstraction for flexible signature schemes and gas management.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Radix UI |
| ZK Circuits | Circom, snarkjs (Groth16), Poseidon Hash |
| Proof Conversion | Python FastAPI, Garaga v1.0.1 (BN254) |
| Smart Contracts | Cairo, Starknet 2.14.0, snforge |
| On-Chain Verifier | Garaga Groth16 Verifier (BN254 curve) |
| Authentication | Google OAuth 2.0 (Authorization Code flow) |
| Deployment | Docker, Nginx, Dokploy |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start frontend + backend
pnpm run dev:all

# Or separately
pnpm run dev        # Frontend (port 5176)
pnpm run server     # Backend (port 3001)
```

## What Makes SUMO Wallet Unique?

Most "social login" wallets are custodial or semi-custodial (MPC). SUMO Wallet is the first to combine **Google OAuth + client-side ZK proofs + on-chain verification** into a fully self-custodial flow on Starknet. Your identity is proven by a zero-knowledge proof, not by trusting a server. Your wallet is controlled by math, not by a company.

## Links

- [SUMO Login Cairo Contracts](https://github.com/fatlabsxyz/sumo-login-cairo)
- [Starknet Documentation](https://docs.starknet.io/)
- [Garaga](https://github.com/keep-starknet-strange/garaga)

## License

MIT License
