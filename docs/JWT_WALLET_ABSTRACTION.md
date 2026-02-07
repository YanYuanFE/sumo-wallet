# JWT 生成钱包方案抽象设计

本文档把当前“JWT 生成钱包”的 Demo 实现抽象为可复用、可替换的分层架构，便于后续安全修复、替换实现（认证/证明/链适配）、与 UI 解耦。

## 目标与原则

目标：
- 将流程从 UI 中剥离，形成稳定的领域层与用例层
- 明确凭证、claims、identity seed、proof、account 的边界
- 让 proof/chain/auth/storage 都可替换

原则：
- 统一使用 `id_token` 作为 JWT 来源，避免 access_token 混用
- 派生 identity seed 的算法必须与电路一致，放在独立模块
- UI 仅负责展示和触发用例，不直接调用链/证明细节

## 分层与职责

### Domain（领域层）
定义核心模型与纯逻辑：
- `Credential`、`Claims`、`IdentitySeed`、`SessionKey`、`Proof`、`Account`
- identity seed 计算与校验
- session key 生成与过期计算

### Usecases（用例层）
编排业务流程：
- 登录与会话初始化
- 证明生成与验证
- 地址推导与部署
- 发送交易/更新 key

### Adapters（适配层）
接外部系统：
- `auth/google`：获取 token（不做业务推导）
- `proof/snarkjs`：proof 生成与验证
- `chain/starknet`：地址推导、部署、交易
- `storage/local`：仅存公开数据

### UI（展示层）
只消费用例，不触碰实现细节。

## 建议目录结构

```
src/domain/
  types.ts               // 领域模型
  identity.ts            // identity seed 派生
  session.ts             // session key 生成/过期
  flow.ts                // 流程状态机/步骤类型

src/usecases/
  loginFlow.ts           // auth -> claims -> seed -> session -> proof -> account
  deployAccount.ts
  sendTx.ts
  updateSessionKey.ts

src/adapters/
  auth/google.ts
  proof/snarkjs.ts
  chain/starknet.ts
  storage/local.ts

src/ui/
  ...                    // 组件只调用 usecases
```

## 领域模型（建议接口）

```ts
// src/domain/types.ts
export type Credential = { idToken: string; accessToken?: string };

export type Claims = {
  iss: string; aud: string; sub: string; email: string;
  email_verified: boolean; iat: number; exp: number; nonce?: string;
};

export type IdentitySeed = bigint;

export type SessionKey = {
  publicKey: string; privateKey: string; createdAt: number; expiresAt: number;
};

export type Proof = { publicSignals: string[]; proof: unknown; verified?: boolean };

export type Account = { address: string; owner: string; email: string; sessionKey: SessionKey };
```

## 用例编排（建议接口）

```ts
// src/usecases/loginFlow.ts
export async function runLoginFlow(deps: {
  credentialSource: () => Promise<Credential>;
  parseClaims: (idToken: string) => Claims;
  deriveSeed: (claims: Claims, idToken: string) => Promise<IdentitySeed>;
  sessionKeyService: { create: () => SessionKey };
  proofService: { generate: (claims: Claims, session: SessionKey, maxBlock: number) => Promise<Proof> };
  accountService: { getAddress: (seed: IdentitySeed) => Promise<string> };
}) {
  // 编排流程，返回结构化结果
}
```

## 核心边界约束

1. `auth/google` 只负责拿 token，不拼装 mock claims  
2. `parseClaims` 只处理 `id_token`，拒绝非 JWT  
3. `identity.ts` 只负责 seed 派生与一致性校验  
4. `proof/snarkjs` 不依赖 UI 或链逻辑  
5. `storage/local` 仅存公开信息，敏感信息只在内存

## 流程（高层）

1. 获取凭证（Credential）  
2. 解析 claims（Claims）  
3. 派生 identity seed（IdentitySeed）  
4. 生成 session key（SessionKey）  
5. 生成/验证 proof（Proof）  
6. 推导 account address / 部署 / 交易  

## 迁移建议（不改逻辑，先拆层）

1. 把 `App.tsx` 里的流程迁移到 `usecases/loginFlow.ts`  
2. 把 `starknetService.ts` 中的地址推导/部署/交易移到 `adapters/chain/starknet.ts`  
3. 把 `zkProofService.ts` 移到 `adapters/proof/snarkjs.ts`  
4. UI 只调用 usecases，状态管理留在 UI 层  

## 预期收益

- 安全修复时只修改单一层（例如 auth 或 storage）  
- proof/chain 逻辑可替换，便于多链或多 proof 引擎扩展  
- UI 简化，逻辑更易测试  
