# JWT 生成钱包方案抽象设计

本文档把当前"JWT 生成钱包"的 Demo 实现抽象为可复用、可替换的分层架构，便于后续安全修复、替换实现（认证/证明/链适配）、与 UI 解耦。

## 现状问题诊断

### 巨型上帝文件

`starknetService.ts` 有 **1500+ 行**，混杂了 6 个不同关注点：

| 关注点 | 示例函数 |
|--------|---------|
| OAuth 层 | `getGoogleRSAKey`, `getModulusFromJWT` |
| 密码学层 | `generateSumoSignature`, `computeAllInputsHash` |
| 后端通信层 | `convertSnarkjsProofToGaraga`, `checkGaragaApiHealth` |
| 链上交互层 | `deploySumoAccount`, `loginSumoAccount`, `sendSTRK`, `repayDebt` |
| 钱包抽象层 | `SumoSigner` 类, `serializeSignature` |
| 底层工具 | `toU256`, Gas 常量 |

### 组件即业务逻辑

- `WalletPanel`：11 个 state 变量，10+ 个 service 调用，内嵌部署轮询、余额检查、Gas 预检
- `ZKProofGenerator`：内嵌完整证明生成流水线（secret 派生 → commitment → proof → verify）
- `App.tsx`：9 个 state 变量，session 恢复 + OAuth 回调 + 状态机全部混在一起
- 组件层直接操作私钥（`TransactionDemo` 中 `account.sessionKey.privateKey`）

### 零抽象，处处硬编码

- 类型系统绑死 Google OAuth（`GoogleJWT` 类型贯穿全栈）
- 合约地址、Gas 限制、Oracle modulus 值全部硬编码在 service 文件中
- 没有 Provider/Strategy 模式，无法替换身份提供者或目标链
- RPC URL 含 API Key 直接写在 `config/starknet.ts`

### 依赖关系是网状而非分层

```
组件 ──直接调用──→ starknetService ──直接调用──→ zkProofService + crypto + provider
  │                    │
  └── 直接调用 ──→ storage / walletService
```

没有清晰的层级边界，任何改动都可能波及多个文件。

## 目标与原则

目标：
- 将流程从 UI 中剥离，形成稳定的领域层与用例层
- 明确凭证、claims、identity seed、proof、account 的边界
- 让 proof/chain/auth/storage 都可替换

原则：
- 统一使用 `id_token` 作为 JWT 来源，避免 access_token 混用
- 派生 identity seed 的算法必须与电路一致，放在独立模块
- UI 仅负责展示和触发用例，不直接调用链/证明细节

## 目标架构

```
┌─────────────────────────────────────────────────┐
│  UI Layer (React Components)                     │
│  只负责渲染和用户交互，通过 hooks 调用下层        │
├─────────────────────────────────────────────────┤
│  Hooks Layer                                     │
│  useAuthFlow, useProofGeneration,                │
│  useAccountOps, useWallet                        │
│  编排业务流程，管理状态机                         │
├─────────────────────────────────────────────────┤
│  Usecases（用例层）                               │
│  loginFlow, deployAccount, sendTx,               │
│  updateSessionKey                                │
│  纯编排逻辑，依赖注入适配器                       │
├─────────────────────────────────────────────────┤
│  Domain（领域层）                                 │
│  types, identity, session, flow                  │
│  纯函数，零外部依赖                               │
├─────────────────────────────────────────────────┤
│  Adapters（适配层）                               │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │  auth/    │ │  proof/  │ │   chain/      │   │
│  │  google   │ │  snarkjs │ │   starknet    │   │
│  └──────────┘ └──────────┘ └───────────────┘   │
│  ┌──────────┐ ┌──────────┐                      │
│  │ storage/ │ │  config/  │                      │
│  │  local   │ │  env      │                      │
│  └──────────┘ └──────────┘                      │
└─────────────────────────────────────────────────┘
```

## 分层与职责

### Domain（领域层）
定义核心模型与纯逻辑，零外部依赖：
- `Credential`、`Claims`、`IdentitySeed`、`SessionKey`、`Proof`、`Account`
- identity seed 计算与校验（Poseidon 哈希逻辑）
- session key 生成与过期计算
- 流程状态机类型定义

### Usecases（用例层）
编排业务流程，通过依赖注入接收适配器：
- 登录与会话初始化
- 证明生成与验证
- 地址推导与部署
- 发送交易/更新 key/还债

### Hooks Layer（钩子层）
连接 UI 与用例层，管理 React 状态：
- `useAuthFlow`：从 `App.tsx` 抽出的登录状态机 + session 恢复
- `useProofGeneration`：从 `ZKProofGenerator` 抽出的证明流水线 + 进度追踪
- `useAccountOps`：从 `WalletPanel` 抽出的部署/转账/还债 + 轮询逻辑
- `useWallet`：外部钱包连接管理

### Adapters（适配层）
对接外部系统，实现核心接口：
- `auth/google`：获取 token（不做业务推导）
- `proof/snarkjs`：proof 生成与验证 + Garaga 转换
- `chain/starknet`：地址推导、部署、交易、签名
- `storage/local`：仅存公开数据
- `config/env`：集中管理所有配置常量

### UI（展示层）
只消费 hooks，不触碰实现细节。组件不直接调用 service 或操作私钥。

## 建议目录结构

```
src/domain/
  types.ts               // 领域模型（不绑定具体 OAuth 提供者）
  identity.ts            // identity seed 派生（Poseidon 哈希）
  session.ts             // session key 生成/过期
  flow.ts                // 流程状态机/步骤类型

src/usecases/
  loginFlow.ts           // auth -> claims -> seed -> session -> proof -> account
  deployAccount.ts       // 部署编排（预检 + 部署 + 轮询确认）
  sendTx.ts              // 交易编排
  updateSessionKey.ts    // key 更新编排
  repayDebt.ts           // 还债编排

src/adapters/
  auth/google.ts         // Google OAuth token 获取
  proof/snarkjs.ts       // Groth16 证明生成/验证
  proof/garaga.ts        // snarkjs → Garaga 格式转换（后端通信）
  chain/starknet/
    account.ts           // 合约交互（deploy/login/send/repay）
    signer.ts            // SumoSigner 类 + 签名序列化
    provider.ts          // RpcProvider 封装
    address.ts           // 地址推导逻辑
  storage/local.ts       // localStorage 适配器
  config/
    index.ts             // 统一配置入口
    contracts.ts         // 合约地址、class hash
    gas.ts               // Gas 限制常量
    network.ts           // RPC URL、网络选择

src/hooks/
  useAuthFlow.ts         // 登录状态机 + session 恢复
  useProofGeneration.ts  // 证明生成流水线 + 进度
  useAccountOps.ts       // 部署/转账/还债 + 轮询
  useWallet.ts           // 外部钱包连接

src/ui/
  ...                    // 组件只调用 hooks
```

## 领域模型（建议接口）

```ts
// src/domain/types.ts

// --- 凭证与身份 ---
export type Credential = { idToken: string; accessToken?: string };

export type Claims = {
  iss: string; aud: string; sub: string; email: string;
  email_verified: boolean; iat: number; exp: number; nonce?: string;
};

export type IdentitySeed = bigint;

// --- 会话 ---
export type SessionKey = {
  publicKey: string; privateKey: string;
  createdAt: number; expiresAt: number;
};

export type SessionInfo = {
  key: SessionKey;
  maxBlock: number;
};

// --- 证明 ---
export type Proof = {
  publicSignals: string[];
  proof: unknown;
  verified?: boolean;
};

export type ChainProof = {
  calldata: bigint[];  // Garaga 格式 felt252 数组
};

// --- 账户 ---
export type Account = {
  address: string; owner: string; email: string;
  sessionKey: SessionKey; deployed?: boolean;
};
```

## 核心适配器接口

```ts
// src/adapters/auth — 身份提供者接口
interface IIdentityProvider {
  authenticate(): Promise<Credential>;
  parseClaims(idToken: string): Claims;
  getSigningKey(idToken: string): Promise<{ modulus: string; exponent: string }>;
}

// src/adapters/proof — 证明系统接口
interface IProofSystem {
  generate(claims: Claims, session: SessionInfo, idToken: string): Promise<Proof>;
  verify(proof: Proof): Promise<boolean>;
  exportForChain(proof: Proof): Promise<ChainProof>;
}

// src/adapters/chain — 链交互接口
interface IAccountManager {
  computeAddress(seed: IdentitySeed): Promise<string>;
  isDeployed(address: string): Promise<boolean>;
  deploy(session: SessionInfo, proof: ChainProof): Promise<string>;
  login(session: SessionInfo, proof: ChainProof): Promise<string>;
  sendToken(session: SessionInfo, recipient: string, amount: bigint): Promise<string>;
  getBalance(address: string): Promise<bigint>;
  getDebt(address: string): Promise<bigint>;
  repayDebt(session: SessionInfo, amount?: bigint): Promise<string>;
}

// src/adapters/storage — 存储接口
interface IStorage {
  saveAccount(account: Account): void;
  getAccount(address: string): Account | null;
  getCurrentAccount(): Account | null;
  saveProof(proof: Proof, maxBlock: number): void;
  getProof(): { proof: Proof; maxBlock: number } | null;
  clear(): void;
}
```

## 用例编排（建议接口）

```ts
// src/usecases/loginFlow.ts
// 通过依赖注入接收所有适配器，用例本身不 import 任何具体实现
export async function runLoginFlow(deps: {
  auth: IIdentityProvider;
  proof: IProofSystem;
  account: IAccountManager;
  storage: IStorage;
  deriveSeed: (claims: Claims, idToken: string) => Promise<IdentitySeed>;
  createSession: () => SessionKey;
  getMaxBlock: () => Promise<number>;
  onProgress?: (step: string, progress: number) => void;
}): Promise<{ account: Account; proof: Proof }> {
  // 1. 获取凭证
  const credential = await deps.auth.authenticate();
  // 2. 解析 claims
  const claims = deps.auth.parseClaims(credential.idToken);
  // 3. 派生 identity seed
  const seed = await deps.deriveSeed(claims, credential.idToken);
  // 4. 生成 session key
  const sessionKey = deps.createSession();
  const maxBlock = await deps.getMaxBlock();
  const session: SessionInfo = { key: sessionKey, maxBlock };
  // 5. 生成证明
  const proof = await deps.proof.generate(claims, session, credential.idToken);
  // 6. 推导地址
  const address = await deps.account.computeAddress(seed);
  // 7. 组装账户
  const account: Account = { address, owner: claims.sub, email: claims.email, sessionKey };
  deps.storage.saveAccount(account);
  return { account, proof };
}
```

```ts
// src/usecases/deployAccount.ts
export async function deployAccount(deps: {
  account: IAccountManager;
  proof: IProofSystem;
  session: SessionInfo;
  rawProof: Proof;
  onProgress?: (stage: string) => void;
}): Promise<string> {
  deps.onProgress?.('converting_proof');
  const chainProof = await deps.proof.exportForChain(deps.rawProof);
  deps.onProgress?.('deploying');
  const txHash = await deps.account.deploy(deps.session, chainProof);
  // 轮询确认逻辑也在用例层，不在组件层
  deps.onProgress?.('confirming');
  // ... polling logic
  return txHash;
}
```

## 核心边界约束

1. `auth/google` 只负责拿 token，不拼装 mock claims
2. `parseClaims` 只处理 `id_token`，拒绝非 JWT
3. `identity.ts` 只负责 seed 派生与一致性校验
4. `proof/snarkjs` 不依赖 UI 或链逻辑
5. `storage/local` 仅存公开信息，敏感信息只在内存
6. 组件层禁止直接访问 `privateKey`，签名操作必须通过适配器
7. 所有硬编码常量必须收归 `config/` 目录

## 配置外置

当前硬编码在各文件中的常量，统一收归 `config/`：

```ts
// src/adapters/config/index.ts
export const config = {
  network: import.meta.env.VITE_NETWORK || 'sepolia',
  rpcUrl: import.meta.env.VITE_RPC_URL,
  garagaApiUrl: import.meta.env.VITE_GARAGA_API_URL || 'http://localhost:3001',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,

  contracts: {
    login: import.meta.env.VITE_LOGIN_CONTRACT,
    accountClassHash: import.meta.env.VITE_ACCOUNT_CLASS_HASH,
    strkToken: '0x04718...938d',
    oracle: import.meta.env.VITE_ORACLE_ADDRESS,
  },

  gas: {
    deploy: { l1: 100_000, l1Data: 500_000, l2: 100_000_000 },
    regular: { l1: 50_000, l1Data: 100_000, l2: 50_000_000 },
    priceBufferMultiplier: 1.5,
  },

  proof: {
    circuitWasm: '/zk/sumo_auth_official.wasm',
    circuitZkey: '/zk/sumo_auth_official_final.zkey',
    verificationKey: '/zk/verification_key.json',
  },

  session: {
    expiryHours: 24,
    blockBuffer: 100_000,
  },
} as const;
```

## 流程（高层）

1. 获取凭证（Credential）  
2. 解析 claims（Claims）  
3. 派生 identity seed（IdentitySeed）  
4. 生成 session key（SessionKey）  
5. 生成/验证 proof（Proof）  
6. 推导 account address / 部署 / 交易  

## 迁移映射（现有文件 → 目标位置）

### starknetService.ts 拆分（1500+ 行 → 5 个模块）

| 现有函数 | 目标模块 |
|---------|---------|
| `getGoogleRSAKey`, `getModulusFromJWT` | `adapters/auth/google.ts` |
| `generateSumoSignature`, `computeAllInputsHash` | `adapters/chain/starknet/signer.ts` |
| `convertSnarkjsProofToGaraga`, `checkGaragaApiHealth` | `adapters/proof/garaga.ts` |
| `deploySumoAccount`, `loginSumoAccount`, `sendSTRK`, `repayDebt` | `adapters/chain/starknet/account.ts` |
| `SumoSigner` 类, `serializeSignature`, `toU256` | `adapters/chain/starknet/signer.ts` |
| `getSumoAccountAddress`, `isSumoUser` | `adapters/chain/starknet/address.ts` |
| 所有硬编码常量 | `adapters/config/` |

### 组件业务逻辑抽取

| 现有位置 | 抽取内容 | 目标 |
|---------|---------|------|
| `App.tsx` (9 state) | session 恢复 + OAuth 回调 + 状态机 | `hooks/useAuthFlow.ts` |
| `WalletPanel.tsx` (11 state) | 部署轮询 + 余额检查 + 转账 + 还债 | `hooks/useAccountOps.ts` |
| `ZKProofGenerator.tsx` | secret 派生 + commitment + proof 流水线 | `hooks/useProofGeneration.ts` |
| `TransactionDemo.tsx` | 私钥签名操作 | 通过 `IAccountManager.execute()` |

### 其他文件迁移

| 现有文件 | 目标 |
|---------|------|
| `services/zkProofService.ts` | `adapters/proof/snarkjs.ts` |
| `services/walletService.ts` | `adapters/chain/starknet/wallet.ts` |
| `utils/crypto.ts` | `domain/session.ts` + `adapters/chain/starknet/signer.ts` |
| `utils/storage.ts` | `adapters/storage/local.ts` |
| `config/starknet.ts` | `adapters/config/network.ts` |
| `types/index.ts` | `domain/types.ts`（去除 Google 绑定） |

## 实施顺序

按风险从低到高，逐步迁移，每步保持可运行：

### 第一步：定义接口 + 外置配置（不改现有逻辑）

- 新增 `domain/types.ts`，定义不绑定 Google 的通用类型
- 新增 `adapters/config/`，把硬编码常量集中
- 新增 `IIdentityProvider`、`IProofSystem`、`IAccountManager`、`IStorage` 接口
- **风险：零**，只新增文件

### 第二步：拆分 starknetService.ts

- 按迁移映射表逐模块搬迁
- 每搬一个模块，原文件 re-export 保持兼容
- 全部搬完后删除 re-export
- **风险：低**，逻辑不变，只是文件位置变化

### 第三步：抽取 Hooks

- 从 `App.tsx` 抽出 `useAuthFlow`
- 从 `WalletPanel` 抽出 `useAccountOps`
- 从 `ZKProofGenerator` 抽出 `useProofGeneration`
- 组件瘦身为纯渲染
- **风险：中**，需要调整组件 props 和状态传递

### 第四步：用例层编排

- 新增 `usecases/` 目录
- Hooks 调用用例函数，用例函数通过依赖注入调用适配器
- **风险：中**，需要重构调用链

### 第五步：组件瘦身

- 组件只保留渲染 + hook 调用
- 移除组件中所有直接 service 调用和私钥操作
- **风险：低**，前四步完成后此步水到渠成

## 预期收益

| 维度 | 现状 | 抽象后 |
|------|------|--------|
| 换身份提供者（如 Apple ID） | 改 5+ 个文件 | 实现 `IIdentityProvider`，注册即可 |
| 换链（如 EVM） | 基本重写 | 实现 `IAccountManager`，前端不动 |
| 换证明系统 | 改 service + 组件 | 实现 `IProofSystem` |
| 单元测试 | 几乎无法测试（全是副作用） | Mock 接口即可测试 |
| 新人上手 | 读 1500 行才能理解 | 看接口定义就懂边界 |
| 安全修复 | 波及多层 | 只修改单一适配器 |
