# SUMO Login 技术概述

本文档记录 SUMO Login 系统的核心技术概念和工作原理。

## 目录

1. [Session Key（会话密钥）](#session-key会话密钥)
2. [Session Key 生成机制](#session-key-生成机制)
3. [Session Key 更新时机](#session-key-更新时机)
4. [ZK 电路的作用](#zk-电路的作用)
5. [ZK 电路工作流程](#zk-电路工作流程)
6. [Login 方法功能](#login-方法功能)

---

## Session Key（会话密钥）

### 什么是 Session Key

Session Key 是一对**临时的**公私钥对，用于签署用户的交易。

```
Session Key = {
  publicKey:  存储在链上（Account 合约）
  privateKey: 存储在用户浏览器本地
  expiresAt:  过期时间（默认 24 小时）
}
```

### 为什么需要 Session Key

传统钱包（如 MetaMask）需要用户每次交易都手动确认签名。

SUMO Login 的设计：
1. 用户通过 **Google OAuth + ZK 证明** 验证身份
2. 生成临时的 Session Key
3. 在有效期内，用户可以**无需再次验证**直接签署交易

### 工作流程

```
1. 用户登录 Google
      ↓
2. 生成 ZK 证明（证明身份）
      ↓
3. 生成 Session Key（临时密钥对）
      ↓
4. 调用 deploy/login 将公钥写入链上
      ↓
5. 用户用私钥签署交易（无需 Google 再次验证）
      ↓
6. Session Key 过期 → 重新 login 更新
```

### 安全性

- **私钥只存在浏览器** - 不上传到任何服务器
- **有限有效期** - 过期后必须重新验证身份
- **与身份绑定** - 通过 ZK 证明确保只有账户所有者能更新

---

## Session Key 生成机制

### 生成代码

位置：`src/utils/crypto.ts`

```typescript
export function generateSessionKeyPair(): SessionKeyPair {
  // 1. 生成随机私钥（使用 starknet.js 的椭圆曲线工具）
  const privateKeyBytes = ec.starkCurve.utils.randomPrivateKey();

  // 2. 从私钥派生公钥
  const publicKeyResult = ec.starkCurve.getPublicKey(privateKeyBytes, false);

  // 3. 提取 x 坐标作为公钥（Starknet ECDSA 只需要 x 坐标）
  const xCoordinate = publicKeyFullHex.slice(2, 66);

  return {
    publicKey: publicKeyHex,
    privateKey: privateKeyHex,
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000, // 24小时后过期
  };
}
```

### 生成流程

```
1. 随机生成私钥
   └─ ec.starkCurve.utils.randomPrivateKey()
   └─ 使用 Starknet 椭圆曲线的安全随机数生成器
         ↓
2. 派生公钥
   └─ ec.starkCurve.getPublicKey(privateKey)
   └─ 椭圆曲线点乘: publicKey = privateKey × G
         ↓
3. 提取 x 坐标
   └─ Starknet 只需要公钥的 x 坐标
         ↓
4. 设置过期时间
   └─ 默认 24 小时
```

### 密钥存储

- **私钥** → 存储在浏览器 localStorage（不上传服务器）
- **公钥** → 通过 deploy/login 写入链上合约

### 安全性

- 使用 **Starknet 椭圆曲线**（STARK-friendly curve）
- 私钥是 **密码学安全的随机数**
- 私钥 **永远不离开用户浏览器**

---

## Session Key 更新时机

### 需要更新的场景

| 场景 | 是否需要更新 Session Key |
|------|------------------------|
| 超过 24 小时 | ✅ 是（自动登出） |
| 重新登录 Google | ✅ 是（生成新的） |
| 刷新页面（未过期） | ❌ 否 |
| 主动登出 | ✅ 是 |
| 切换 Google 账户 | ✅ 是 |

### 过期处理

位置：`src/components/WalletPanel.tsx`

```typescript
const isExpired = account.sessionKey.expiresAt < Date.now();

if (isExpired) {
  toast.error("Session expired. Please log in again.");
  onLogout();  // 自动登出
}
```

### 重新登录流程

```
1. 登录 Google        → 自动
2. 生成 Session Key   → 自动
3. 生成 ZK 证明       → 自动
4. 更新链上公钥       → 手动点击 "Update Session Key" 按钮
```

**注意**：重新登录 Google 后，Session Key 会自动在本地生成，但需要**手动**点击 "Update Session Key" 调用合约的 `login` 方法更新链上公钥。

---

## ZK 电路的作用

### 核心目的

**证明用户拥有 Google 账户的所有权，而不暴露敏感信息**。

### 输入/输出

```
公开输入（链上可见）:
├── identityCommitment  → 身份承诺（哈希值）
└── sessionPublicKey    → Session 公钥

私有输入（不上链，保密）:
├── email[]  → 用户邮箱
├── sub      → Google 用户 ID
└── secret   → 从 JWT 派生的密钥
```

### 电路逻辑

位置：`circuits/simple_auth.circom`

```
1. 计算 emailHash = Poseidon(email)
         ↓
2. 计算 identityHash = Poseidon(emailHash, sub, secret)
         ↓
3. 验证 identityHash == identityCommitment（公开输入）
         ↓
4. 绑定 sessionPublicKey 到身份
```

### 核心功能

| 功能 | 说明 |
|------|------|
| **身份验证** | 证明用户知道 email + sub + secret |
| **隐私保护** | 链上只看到哈希值，看不到邮箱等信息 |
| **Session Key 绑定** | 将临时公钥与身份关联 |
| **防伪造** | 没有正确的私有输入无法生成有效证明 |

### 简单理解

```
传统方式: "我是 alice@gmail.com" → 暴露邮箱
ZK 方式:  "我能证明我知道某个邮箱的秘密" → 不暴露邮箱
```

---

## ZK 电路工作流程

### 完整流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端 (浏览器)                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Google 登录 → 获取 JWT (email, sub, secret)                 │
│  2. 生成 Session Key (公私钥对)                                  │
│  3. 准备电路输入:                                                │
│     - 私有: email, sub, secret                                  │
│     - 公开: identityCommitment, sessionPublicKey                │
│  4. snarkjs.groth16.fullProve() → 生成 ZK 证明                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      后端 (Express Server)                       │
├─────────────────────────────────────────────────────────────────┤
│  5. POST /api/garaga/calldata                                   │
│  6. Python 脚本转换证明格式 (snarkjs → Garaga/Starknet)         │
│  7. 返回 felt252[] 数组                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Starknet 合约                               │
├─────────────────────────────────────────────────────────────────┤
│  8. Login.__validate__() 验证签名中的 ZK 证明                   │
│  9. Garaga 库验证 Groth16 证明                                   │
│  10. 验证通过 → 执行 deploy/login                               │
└─────────────────────────────────────────────────────────────────┘
```

### 关键步骤详解

#### 步骤 4: 浏览器生成证明

位置：`src/services/zkProofService.ts`

```javascript
const fullProof = await groth16.fullProve(
  { email, sub, secret, identityCommitment, sessionPublicKey },
  'simple_auth.wasm',  // 编译后的电路
  'simple_auth.zkey'   // 可信设置
);
// 输出: { proof: {pi_a, pi_b, pi_c}, publicSignals: [...] }
```

#### 步骤 6: 转换为 Starknet 格式

位置：`server/index.cjs` 和 `scripts/generate_garaga_calldata.py`

```
snarkjs 证明格式 (BN254 曲线)
        ↓
Garaga Python 脚本转换
        ↓
felt252[] 数组 (Starknet 可用)
```

#### 步骤 9: 合约验证

```cairo
// Login 合约使用 Garaga 库验证
let is_valid = garaga_verifier.verify(proof_calldata);
assert(is_valid, "Invalid ZK proof");
```

### 安全保证

| 阶段 | 保护内容 |
|------|----------|
| 电路 | email, sub, secret 永不暴露 |
| 证明 | 只有知道私有输入才能生成有效证明 |
| 验证 | 合约只验证证明，不需要私有数据 |

---

## Login 方法功能

### 功能概述

`login` 方法的功能是**更新用户的 Session Key（会话密钥）**。

### 代码位置

`sumo-login-cairo/src/login/login_contract.cairo`

### 具体步骤

```cairo
fn login(ref self: ContractState) {
    // 1. 解析签名数据 - 从交易签名中提取 ephemeral key 和过期区块
    let signature = self.get_serialized_signature();
    let reconstructed_eph_key: felt252 = eph_key_0 * TWO_POWER_128 + eph_key_1;
    let expiration_block: u64 = signature.max_block.try_into().unwrap();

    // 2. 更新公钥 - 将新的 session key 写入用户账户
    self.set_user_pkey(user_address, reconstructed_eph_key, expiration_block);

    // 3. 尝试收取旧债务 - 如果用户有债务且余额足够，收取债务
    self.try_collect_debt_internal(user_address);

    // 4. 添加本次 login 费用 - 记录新的债务
    self.add_debt(user_address, LOGIN_FEE_GAS);

    self.emit(LoginAccount { address: user_address });
}
```

### 使用场景

- Session Key 过期后，用户需要调用 `login` 来更新密钥
- 用户需要提供新的 ZK 证明来验证身份

### 与 deploy 的区别

| 方法 | 用途 | 前提条件 |
|------|------|----------|
| `deploy` | 首次创建账户 | 用户不存在 |
| `login` | 更新已有账户的 session key | 用户已存在 |

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/utils/crypto.ts` | Session Key 生成 |
| `src/services/zkProofService.ts` | ZK 证明生成 |
| `circuits/simple_auth.circom` | ZK 电路定义 |
| `server/index.cjs` | 证明格式转换服务 |
| `sumo-login-cairo/src/login/login_contract.cairo` | Login 合约 |
| `sumo-login-cairo/src/account/account_contract.cairo` | Account 合约 |

---

**文档版本**: 1.0.0
**创建日期**: 2026-02-02
**作者**: Technical Documentation
