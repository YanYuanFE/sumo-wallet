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
pnpm run server      # FastAPI server on port 3001 (or GARAGA_PORT env)
```
Server is a pure Python FastAPI app (`server/app.py`), run via uvicorn from `.venv`.

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
State transitions are managed by `src/hooks/useAuthFlow.ts`. The UI renders a single-card wizard (`LoginWizard`) for the login flow and a dashboard layout post-login.

### Frontend Architecture (Hexagonal / Ports & Adapters)

```
src/
├── adapters/              # Implementation details (ports & adapters)
│   ├── auth/google.ts     # Google OAuth RSA key fetching
│   ├── chain/starknet/    # Starknet interactions
│   │   ├── account.ts     # Deploy, login, send, repay debt
│   │   ├── address.ts     # Address computation from JWT
│   │   ├── provider.ts    # RpcProvider singleton
│   │   ├── signer.ts      # SumoSigner, signature serialization
│   │   └── wallet.ts      # External wallet connection (starknetkit)
│   ├── config/            # All configuration constants
│   │   ├── contracts.ts   # Contract addresses
│   │   ├── crypto.ts      # FELT252_PRIME, etc.
│   │   ├── gas.ts         # Gas configuration
│   │   ├── network.ts     # RPC URLs, Garaga API, Google Client ID
│   │   ├── proof.ts       # ZK proof config
│   │   └── storage.ts     # Storage keys
│   ├── proof/
│   │   ├── snarkjs.ts     # ZK proof generation/verification (Poseidon, Groth16)
│   │   └── garaga.ts      # Garaga API client (POST /api/garaga/calldata)
│   └── storage/
│       └── local.ts       # LocalStorage persistence
├── services/              # Barrel re-exports (thin wrappers over adapters)
│   ├── zkProofService.ts  # → adapters/proof/snarkjs.ts
│   ├── starknetService.ts # → adapters/chain/starknet/* + adapters/proof/garaga.ts
│   └── walletService.ts   # → adapters/chain/starknet/wallet.ts
├── hooks/                 # React state management
│   ├── useAuthFlow.ts     # Login state machine orchestrator
│   ├── useProofGeneration.ts  # ZK proof generation stages + progress
│   └── useAccountOps.ts   # Account deploy, send, update key, repay debt
├── components/
│   ├── LoginWizard.tsx    # Single-card wizard (4 steps with fade transitions)
│   ├── ZKProofGenerator.tsx   # Proof generation UI (auto-start, accordion details)
│   ├── WalletPanel.tsx    # Post-login wallet dashboard
│   ├── GoogleLoginButton.tsx  # OAuth trigger
│   ├── FlowStepper.tsx    # Visual progress indicator (standalone)
│   ├── JWTViewer.tsx      # JWT payload display (debug utility)
│   └── ui/                # 50+ Radix UI / shadcn components
├── utils/
│   ├── crypto.ts          # Session key generation, ECDSA signing, address computation
│   ├── storage.ts         # Barrel → adapters/storage/local.ts
│   └── units.ts           # Wei/Ether conversion
├── config/
│   └── starknet.ts        # Shared RpcProvider instance
├── types/
│   └── index.ts           # GoogleJWT, SessionKeyPair, ZKProof, SmartAccount, LoginFlow, Transaction
└── App.tsx                # Root layout: header (user avatar when logged in), LoginWizard or dashboard
```

### Backend (`server/`)
- Pure Python FastAPI server (`server/app.py`), run via uvicorn
- Verification key loaded once at startup (no per-request file I/O)
- Proof parsed via `Groth16Proof.from_dict()` directly (no temp files, no subprocess)
- `POST /api/garaga/calldata`: Accepts snarkjs proof + public signals, returns Garaga-compatible felt252 arrays
- `GET /health`: Health check endpoint
- Python dependencies: garaga v1.0.1, fastapi, uvicorn (installed in `.venv`)

### When does the frontend call the backend?
Only during on-chain operations (not during ZK proof generation):
1. **Deploy Account** — user clicks "Deploy Account" → `checkGaragaApiHealth()` → `serializeSignature()` → `convertSnarkjsProofToGaraga()`
2. **Update Session Key** — user clicks "Update Session Key" → same flow

Call chain: `useAccountOps` → `deploySumoAccount/loginToUpdateKey` → `generateSumoSignature` → `serializeSignature` → `convertSnarkjsProofToGaraga` (POST /api/garaga/calldata)

### Circuits (`circuits/`)
- `simple_auth.circom`: Simplified auth circuit (email length: 32 bytes)
- `sumo_auth_official.circom`: Full circuit with SHA256 output and U256 splits (email length: 64 bytes)
- Compiled artifacts served from `public/zk/` (wasm, zkey, verification_key.json)

### Smart Contracts (`sumo-login-cairo/`)
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
- Network: Starknet Sepolia testnet
- Garaga calldata length: ~3013 felt252 elements
- Gas buffer: 150% of current price
