# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SUMO Login is a Zero-Knowledge Proof (ZKP) based authentication system for Starknet. Users log in with Google OAuth, and the system generates a Groth16 ZK proof that verifies their identity without exposing sensitive information (email, JWT) on-chain.

## Commands

### Frontend Development
```bash
pnpm install         # Install dependencies
pnpm run dev         # Start Vite dev server (port 5176)
pnpm run dev:all     # Start both frontend and backend concurrently
pnpm run build       # TypeScript compile + Vite build
pnpm run lint        # ESLint
```

### Backend (Proof Conversion Server)
```bash
pnpm run server      # Express server on port 3001 (or GARAGA_PORT env)
```

### Cairo/Starknet Contracts
```bash
cd sumo-login-cairo
scarb build          # Build Cairo contracts
scarb test           # Run tests (uses snforge)
```

### Contract Deployment (sncast)
```bash
cd sumo-login-cairo
./scripts/deploy.sh                          # 一键部署脚本（交互式）
sncast --profile sepolia declare \
    --contract-name Login                    # 声明合约
sncast --profile sepolia deploy \
    --class-hash <CLASS_HASH> \
    --constructor-calldata <ARGS>            # 部署合约
```
sncast 配置文件: `sumo-login-cairo/snfoundry.toml`，已配置 sepolia 和 mainnet profile。

### ZK Circuits
```bash
cd circuits
./compile.sh         # Compile Circom circuits
```

### Utility Scripts
```bash
node scripts/setup-zk.js         # ZK circuit setup and artifact generation
node scripts/extract-abi.cjs     # Extract contract ABIs from Cairo build
```

## Architecture

### Data Flow
```
Google OAuth → JWT → Client-side ZK Proof (snarkjs) → Backend Garaga Conversion → Starknet Contract Verification
```

### Login Flow State Machine
The app progresses through states defined in `src/types/index.ts`:
```
idle → oauth → jwt → session → zkproof → account → complete
```
State transitions are managed in `src/App.tsx`.

### Key Components

**Frontend (`src/`)**
- React 19 + Vite + TypeScript with Tailwind CSS and Radix UI components
- Path alias: `@/*` maps to `./src/*` (configured in tsconfig and vite.config)
- `services/zkProofService.ts`: Core ZK logic - Poseidon hashing, identity commitment generation, Groth16 proof generation via snarkjs
- `services/starknetService.ts`: Starknet blockchain interactions (contract calls, account deployment)
- `services/walletService.ts`: Wallet connection management via starknetkit
- `utils/crypto.ts`: Session key pair generation (Starknet ECDSA), transaction signing
- `utils/storage.ts`: LocalStorage persistence for accounts, proofs, and JWTs
- `config/starknet.ts`: Shared RpcProvider instance (Alchemy Sepolia endpoint)
- `components/ZKProofGenerator.tsx`: UI for proof generation flow
- `components/ui/`: 60+ Radix UI-based reusable components

**Backend (`server/`)**
- Express server (`index.cjs`, CommonJS) bridges to Python scripts via `.venv/bin/python3`
- `POST /api/garaga/calldata`: Accepts snarkjs proof + public signals, returns Garaga-compatible felt252 arrays
- `GET /health`: Health check endpoint
- `scripts/generate_garaga_calldata.py`: Python script for Garaga proof conversion

**Circuits (`circuits/`)**
- `simple_auth.circom`: Simplified auth circuit (email length: 32 bytes)
- `sumo_auth_official.circom`: Full circuit with SHA256 output and U256 splits (email length: 64 bytes)
- Compiled artifacts served from `public/zk/` (wasm, zkey, verification_key.json)

**Smart Contracts (`sumo-login-cairo/`)**
- `src/login/login_contract.cairo`: Main login contract - user registration, login, account deployment, debt management
- `src/account/account_contract.cairo`: User account contract - ECDSA signature verification, key rotation with expiration
- `src/verifier/groth16_verifier.cairo`: On-chain Groth16 verification using Garaga library (BN254 curve)
- `src/utils/`: Execution helpers, error definitions, structs, constants (STRK_ADDRESS, gas fees)
- Submodules: `universal_ecip`, `erc20`, `oracle`
- Dependencies: garaga v1.0.1, starknet 2.14.0, snforge_std 0.53.0 (dev)

### ZK Proof Logic

Identity Commitment = Poseidon(EmailHash, GoogleSubID, SecretFromJWT)

The circuit proves knowledge of private inputs (email, sub, secret) that hash to the public identity commitment, without revealing the private inputs.

Email hashing uses chunked Poseidon (15 bytes per chunk, chain-hashed) due to Poseidon's 16-input limit. U256 values are split into high/low 128-bit pairs for circuit compatibility.

### Key Technical Constants
- Poseidon chunk size: 15 bytes per chunk
- Session key expiration: 24 hours
- Backend payload limit: 10MB JSON
- Network: Starknet Sepolia testnet
