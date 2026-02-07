# SUMO Login Demo - 问题分析与修复指南

> 基于 [sumo-login-cairo](https://github.com/fatlabsxyz/sumo-login-cairo) 实现的 ZK 登录 Demo 分析报告
> 
> 分析日期: 2026-02-01

---

## 📋 目录

- [项目概述](#项目概述)
- [实现正确的部分](#实现正确的部分)
- [发现的关键问题](#发现的关键问题)
- [修复建议](#修复建议)
- [测试验证步骤](#测试验证步骤)
- [附录](#附录)

---

## 📖 项目概述

这是一个基于零知识证明的 Google OAuth 登录 Demo，实现了以下核心功能：

1. **Google OAuth 认证**: 用户通过 Google 账号登录
2. **ZK 证明生成**: 使用 Groth16 + Poseidon 生成 ZK proof
3. **Starknet 部署**: 将账户部署到 Starknet 测试网
4. **会话密钥管理**: 生成临时会话密钥用于交易签名

### 技术栈

- **前端**: React + TypeScript + Vite
- **ZK 电路**: Circom (sumo_auth_official.circom)
- **ZK 库**: snarkjs + circomlibjs
- **区块链**: Starknet (Cairo)
- **密码学**: Poseidon hash, ECDSA, SHA-256

---

## ✅ 实现正确的部分

### 1. ZK 电路实现 (`circuits/sumo_auth_official.circom`)

✅ **Email 哈希计算**
```circom
// 正确使用 Poseidon(16) 进行分块哈希
// 每块: [链式输入, byte0-byte14] (16 inputs total)
var chunkSize = 15;
var numChunks = (emailLength + chunkSize - 1) \ chunkSize;

for (var i = 0; i < numChunks; i++) {
    chunkHasher[i] = Poseidon(16);
    chunkHasher[i].inputs[0] <== (i == 0) ? 0 : intermediateHashes[i-1];
    // 填充 email bytes...
}
```

✅ **Address Seed 验证**
```circom
// 正确验证: Poseidon(sub, emailHash, secret) == address_seed
component addressSeedHasher = Poseidon(3);
addressSeedHasher.inputs[0] <== sub;
addressSeedHasher.inputs[1] <== emailHash;
addressSeedHasher.inputs[2] <== secret;
```

✅ **SHA256 输出格式**
```circom
// 输出 2 个 u128 值 (hash_high, hash_low)
signal output all_inputs_hash_high;
signal output all_inputs_hash_low;
```

✅ **U256 拆分处理**
```circom
// 所有 u256 值正确拆分为 high/low 128 位
signal input eph_public_key0_high;
signal input eph_public_key0_low;
// ...
```

### 2. TypeScript 证明生成 (`src/services/zkProofService.ts`)

✅ **Email 哈希逻辑与电路一致**
```typescript
// src/services/zkProofService.ts:67-95
async function hashEmailBytes(emailBytes: number[]): Promise<bigint> {
  const CHUNK_SIZE = 15;
  const POSEIDON_SIZE = 16;
  let currentHash: bigint = BigInt(0);
  
  for (let i = 0; i < numChunks; i++) {
    const inputs = new Array(POSEIDON_SIZE).fill(0);
    inputs[0] = currentHash;  // 链式输入
    // 填充数据...
    const hash = poseidon(inputs);
    currentHash = poseidon.F.toObject(hash);
  }
  
  return currentHash;
}
```

✅ **Secret 派生**
```typescript
// src/services/zkProofService.ts:286-293
async function deriveSecretFromJWT(jwtToken: string): Promise<bigint> {
  const encoder = new TextEncoder();
  const data = encoder.encode(jwtToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return BigInt('0x' + hashHex.slice(0, 32));
}
```

### 3. 会话密钥生成 (`src/utils/crypto.ts`)

✅ **使用 Starknet curve**
```typescript
// src/utils/crypto.ts:22-51
export function generateSessionKeyPair(): SessionKeyPair {
  // 使用 starknet.js 生成有效的私钥
  const privateKeyBytes = ec.starkCurve.utils.randomPrivateKey();
  
  // 派生公钥
  const publicKeyResult = ec.starkCurve.getPublicKey(privateKeyBytes, false);
  
  // 提取 x 坐标
  const xCoordinate = publicKeyFullHex.slice(2, 66);
  const publicKeyHex = '0x' + xCoordinate.padStart(64, '0');
  
  return { publicKey: publicKeyHex, privateKey: privateKeyHex, ... };
}
```

---

## ❌ 发现的关键问题

### 🔴 问题 1: Address Seed 计算逻辑不一致 (P0 - 必须修复)

#### 问题描述

**位置**: 
- `src/services/zkProofService.ts:191` (ZK proof 生成)
- `src/utils/crypto.ts:175` (地址计算)

**不一致点**:

| 使用场景 | 计算方法 | 代码位置 |
|---------|---------|---------|
| ZK 电路验证 | `Poseidon(sub, emailHash, secret)` | zkProofService.ts:191 |
| 地址计算 | `SHA256(sub + email + 'sumo_address_seed_v1')` | crypto.ts:175 |

**代码对比**:

```typescript
// ❌ 错误: zkProofService.ts:191
const addressSeedHash = poseidon([subNum, emailHash, secret]);
const addressSeed = poseidon.F.toObject(addressSeedHash);

// ❌ 错误: crypto.ts:175-182
export async function deriveAddressSeed(sub: string, email: string): Promise<bigint> {
  const data = sub + email + 'sumo_address_seed_v1';
  const hash = await sha256(data);  // ⚠️ 使用了 SHA-256，而非 Poseidon
  const seed = BigInt('0x' + hash);
  const MASK_250 = (BigInt(1) << BigInt(250)) - BigInt(1);
  return seed & MASK_250;
}
```

#### 问题影响

1. **ZK Proof 验证失败**: 
   - 电路内部验证 `Poseidon(sub, emailHash, secret) == address_seed`
   - 但传入的 address_seed 是用 SHA-256 计算的
   - 验证永远无法通过 ❌

2. **地址不匹配**:
   - Demo 中显示的地址是基于 SHA-256 的 address_seed 计算的
   - 合约中验证通过后计算的地址是基于 Poseidon 的 address_seed
   - 两个地址不同，导致部署失败 ❌

3. **流程图示**:
```
JWT + secret
    ↓
ZK Circuit Path (zkProofService.ts):
    Poseidon(sub, emailHash, secret) → address_seed_A
    ↓
    生成 ZK Proof (包含 address_seed_A)
    ↓
    ❌ 验证失败 (因为下面的 address_seed_B ≠ address_seed_A)

Address Calculation Path (crypto.ts):
    SHA256(sub + email + 'salt') → address_seed_B
    ↓
    计算 Starknet 地址 → address_display
    ↓
    显示给用户
```

#### 修复方案

见 [修复建议 #1](#1-统一-address-seed-计算-p0)

---

### 🟡 问题 2: Address Seed Mask 实现需要验证 (P1)

#### 问题描述

**位置**: `src/utils/crypto.ts:182`

虽然当前代码中有 mask 操作，但需要确保与合约保持一致：

**代码对比**:

```typescript
// TypeScript 实现 (crypto.ts:182)
const MASK_250 = (BigInt(1) << BigInt(250)) - BigInt(1);
return seed & MASK_250;
```

```cairo
// Cairo 实现 (login_contract.cairo)
fn mask_address_seed(address_seed: u256) -> felt252 {
    let mask_250: u256 = (1_u256 << 250) - 1;
    let masked = address_seed & mask_250;
    masked.try_into().unwrap()
}
```

#### 验证要点

- ✅ Mask 值相同: `(1 << 250) - 1`
- ⚠️ 需要验证: 修复问题 1 后，Poseidon 输出是否可能超过 250 位

---

### 🟡 问题 3: 公钥格式处理需要验证 (P1)

#### 问题描述

**位置**: `src/services/starknetService.ts:207-216`

**当前实现**:
```typescript
// starknetService.ts:207-216
const ephKeyBigInt = BigInt(pkHex);

// 拆分为 high/low 128 bits
const ephKey0Value = ephKeyBigInt >> BigInt(128);  // high 128 bits
const ephKey1Value = ephKeyBigInt & U128_MASK;     // low 128 bits

// 作为 u256 传入 SHA256: value in low bits, high = 0
const ephKey0Split = { high: BigInt(0), low: ephKey0Value };
const ephKey1Split = { high: BigInt(0), low: ephKey1Value };
```

**潜在问题**:
1. Starknet 公钥是 251 位
2. 拆分为两个 128 位部分: `ephKey0` (high 128 bits), `ephKey1` (low 128 bits)
3. 但在 SHA256 计算时设置 `high: 0, low: value`

**疑问**:
- Cairo 合约中 `eph_key_0` 和 `eph_key_1` 如何使用？
- 是直接作为 felt252 还是需要重组为 u256？

#### 验证方法

添加日志验证重组后的公钥是否正确：

```typescript
const reconstructed = (ephKey0Value << BigInt(128)) + ephKey1Value;
console.log('Original PK:', ephKeyBigInt.toString());
console.log('Reconstructed:', reconstructed.toString());
console.log('Match:', ephKeyBigInt === reconstructed);
```

---

### 🟠 问题 4: 缺少真实的 JWT 签名验证 (P2)

#### 问题描述

**位置**: 整个项目

**当前实现**:
```typescript
// zkProofService.ts:234
const modulusF = BigInt('6472322537804972268794034248194861302128540584786330577698326766016488520183');
```

**缺失功能**:
1. ❌ 没有获取真正的 Google JWT `id_token`
2. ❌ 没有解析 JWT header 中的 `kid` (Key ID)
3. ❌ 没有从 Google JWKS 获取 RSA 公钥
4. ❌ `header_F`, `iss_b64_F` 等字段是模拟的

**影响**:
- ZK proof 可以生成和验证
- 但**不是基于真实的 JWT signature**
- 无法证明 JWT 的真实性和有效性

**理想流程**:
```
Google OAuth
    ↓
获取 id_token (JWT)
    ↓
解析 JWT header (kid, alg)
    ↓
从 Google JWKS 获取 RSA 公钥 (modulus, exponent)
    ↓
使用 modulus 作为 modulus_F
    ↓
生成 ZK Proof
```

#### 修复建议

如果需要 production-ready 的实现：

1. 修改 `App.tsx:handleGoogleSuccess()` 确保获取 `id_token`
2. 实现 `getModulusFromJWT()` 函数（已在 `starknetService.ts:197` 定义）
3. 在 `generateProofInputs()` 中使用真实的 modulus

---

### 🔵 问题 5: Garaga API 依赖与错误处理 (P2)

#### 问题描述

**位置**: `src/services/starknetService.ts:708-737`

**当前实现**:
```typescript
// starknetService.ts:708-737
async function convertSnarkjsProofToGaraga(proof: SnarkJSProof): Promise<string[]> {
  const response = await fetch(`${GARAGA_API_URL}/api/garaga/calldata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proof: proof.proof, publicSignals: proof.publicSignals }),
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  return result.calldata;
}
```

**问题点**:
1. ❌ **依赖外部 API**: 必须运行 `npm run server`
2. ❌ **缺少健康检查**: 没有预检测 API 是否可用
3. ❌ **错误信息不明确**: 用户不知道为什么失败
4. ❌ **没有 fallback**: API 不可用时直接失败

#### 影响

如果 Garaga API 服务未启动或无响应：
```
用户点击 "Deploy on Starknet"
    ↓
生成 ZK Proof 成功 ✅
    ↓
调用 convertSnarkjsProofToGaraga() ❌
    ↓
Fetch 失败: ERR_CONNECTION_REFUSED
    ↓
错误信息: "Failed to generate Garaga calldata: Unknown error"
    ↓
用户困惑 😕
```

#### 修复建议

见 [修复建议 #5](#5-添加-garaga-api-健康检查-p2)

---

## 🔧 修复建议

### 1. 统一 Address Seed 计算 (P0)

#### 修改 `src/utils/crypto.ts`

```typescript
import { buildPoseidon } from 'circomlibjs';

/**
 * Derive address seed from JWT sub, email, and secret
 * 
 * IMPORTANT: This MUST match the ZK circuit logic!
 * Circuit verification: Poseidon(sub, emailHash, secret) == address_seed
 * 
 * @param sub - Google subject ID
 * @param email - User email
 * @param secret - Secret derived from JWT
 * @returns Address seed (masked to 250 bits)
 */
export async function deriveAddressSeed(
  sub: string,
  email: string,
  secret: bigint
): Promise<bigint> {
  const poseidon = await buildPoseidon();
  
  // 1. Calculate email hash (same as ZK circuit)
  const emailBytes = stringToBytes(email, 64);
  const emailHash = await hashEmailBytes(emailBytes);
  
  // 2. Convert sub to number
  const subBytes = new TextEncoder().encode(sub.slice(0, 16));
  const subHex = Array.from(subBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const subNum = BigInt('0x' + subHex);
  
  // 3. Calculate address_seed = Poseidon(sub, emailHash, secret)
  const addressSeedHash = poseidon([subNum, emailHash, secret]);
  const addressSeed = poseidon.F.toObject(addressSeedHash);
  
  // 4. Mask to 250 bits (Starknet felt252 limit)
  const MASK_250 = (BigInt(1) << BigInt(250)) - BigInt(1);
  return addressSeed & MASK_250;
}

/**
 * Convert string to byte array (padded)
 */
function stringToBytes(str: string, length: number): number[] {
  const bytes = new Array(length).fill(0);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  for (let i = 0; i < Math.min(encoded.length, length); i++) {
    bytes[i] = encoded[i];
  }
  return bytes;
}

/**
 * Hash email bytes using Poseidon with chunking
 * Matches the Circom circuit implementation
 */
async function hashEmailBytes(emailBytes: number[]): Promise<bigint> {
  const poseidon = await buildPoseidon();
  
  const CHUNK_SIZE = 15;  // 15 data bytes per chunk
  const POSEIDON_SIZE = 16;  // Poseidon(16)
  const numChunks = Math.ceil(emailBytes.length / CHUNK_SIZE);
  
  let currentHash: bigint = BigInt(0);
  
  for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min((i + 1) * CHUNK_SIZE, emailBytes.length);
    const chunk = emailBytes.slice(start, end);
    
    // Build Poseidon inputs: [chainInput, byte0, byte1, ..., byte14]
    const inputs: (bigint | number)[] = new Array(POSEIDON_SIZE).fill(0);
    inputs[0] = currentHash;  // Chain input from previous hash
    
    // Fill in email bytes
    for (let j = 0; j < chunk.length; j++) {
      inputs[j + 1] = chunk[j];
    }
    
    const hash = poseidon(inputs);
    currentHash = poseidon.F.toObject(hash);
  }
  
  return currentHash;
}
```

#### 修改 `src/App.tsx:239`

```typescript
const handleAccountCreation = useCallback(
  async (jwt: GoogleJWT, keyPair: SessionKeyPair) => {
    setFlow({
      step: "account",
      progress: 90,
      message: "Deploying smart account...",
    });

    try {
      console.log("[handleAccountCreation] JWT sub:", jwt.sub);
      console.log("[handleAccountCreation] JWT email:", jwt.email);

      // Derive secret from JWT token
      const encoder = new TextEncoder();
      const data = encoder.encode(googleToken || '');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const secret = BigInt('0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32));
      
      console.log("[handleAccountCreation] Secret (first 20 chars):", secret.toString().slice(0, 20) + '...');

      // Derive deterministic address seed from JWT (MUST match ZK circuit!)
      const addressSeed = await deriveAddressSeed(jwt.sub, jwt.email, secret);
      console.log("[handleAccountCreation] Address seed:", addressSeed.toString());

      // Compute Starknet address
      const deployerAddress = "0x03f568fbee5ab08f41b6566287e200d47ed3df58589688069fbf04e1c8e7f45c";
      const accountClassHash = "0x044fc86b59b7f0e7344d6d927a164d9cb8164047689370ad9ec2e791d7c4c542";
      const address = computeStarknetAddress(deployerAddress, accountClassHash, addressSeed);
      console.log("[handleAccountCreation] Computed address:", address);

      const newAccount: SmartAccount = {
        address,
        owner: jwt.sub,
        email: jwt.email,
        sessionKey: keyPair,
        createdAt: Date.now(),
        lastLogin: Date.now(),
        transactions: [],
      };

      saveAccount(newAccount);
      setAccount(newAccount);

      setFlow({
        step: "complete",
        progress: 100,
        message: "Smart account ready!",
      });

      toast.success("Smart account deployed successfully!");
    } catch (error) {
      console.error("[handleAccountCreation] Error:", error);
      toast.error("Account creation failed");
    }
  },
  [googleToken]  // Add dependency
);
```

---

### 2. 添加 Address Seed 验证日志 (P1)

#### 修改 `src/services/zkProofService.ts:192`

在 address_seed 计算后添加详细日志：

```typescript
// After line 192
console.log('[generateProofInputs] === Address Seed Verification ===');
console.log('[generateProofInputs]   sub (number):', subNum.toString());
console.log('[generateProofInputs]   emailHash:', emailHash.toString());
console.log('[generateProofInputs]   secret (first 20):', secret.toString().slice(0, 20) + '...');
console.log('[generateProofInputs]   addressSeed (full):', addressSeed.toString());
console.log('[generateProofInputs]   addressSeed (hex):', '0x' + addressSeed.toString(16));

const MASK_250 = (BigInt(1) << BigInt(250)) - BigInt(1);
const maskedSeed = addressSeed & MASK_250;
console.log('[generateProofInputs]   addressSeed (masked):', maskedSeed.toString());
console.log('[generateProofInputs]   matches input:', addressSeed === maskedSeed);
```

---

### 3. 验证公钥格式 (P1)

#### 修改 `src/services/starknetService.ts:300`

在公钥拆分后添加验证：

```typescript
// After line 216
console.log('[generateSumoSignature] === Public Key Verification ===');
console.log('[generateSumoSignature]   Original PK (hex):', pkHex);
console.log('[generateSumoSignature]   PK as BigInt:', ephKeyBigInt.toString());
console.log('[generateSumoSignature]   PK bits:', ephKeyBigInt.toString(2).length);
console.log('[generateSumoSignature]   ephKey0 (high 128 bits):', ephKey0Value.toString());
console.log('[generateSumoSignature]   ephKey1 (low 128 bits):', ephKey1Value.toString());

// Verify reconstruction
const reconstructed = (ephKey0Value << BigInt(128)) + ephKey1Value;
console.log('[generateSumoSignature]   Reconstructed PK:', reconstructed.toString());
console.log('[generateSumoSignature]   Match:', ephKeyBigInt === reconstructed ? '✅' : '❌');

if (ephKeyBigInt !== reconstructed) {
  console.error('[generateSumoSignature]   ERROR: Public key reconstruction failed!');
}
```

---

### 4. 实现真实的 JWT 验证 (P2 - 可选)

#### 步骤 1: 确保获取 id_token

修改 `src/App.tsx:106-162`:

```typescript
const handleGoogleSuccess = useCallback(
  async (tokenResponse: { access_token: string; id_token?: string }) => {
    try {
      const accessToken = tokenResponse.access_token;
      const idToken = tokenResponse.id_token;

      // Prefer id_token over access_token
      if (!idToken) {
        console.warn('[handleGoogleSuccess] No id_token received, using access_token as fallback');
      }

      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!userInfoResponse.ok) {
        throw new Error("Failed to fetch user info");
      }

      const userInfo = await userInfoResponse.json();

      const mockJWT: GoogleJWT = {
        iss: "https://accounts.google.com",
        azp: GOOGLE_CLIENT_ID,
        aud: GOOGLE_CLIENT_ID,
        sub: userInfo.sub,
        email: userInfo.email,
        email_verified: userInfo.email_verified,
        name: userInfo.name,
        picture: userInfo.picture,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce,
      };

      // Use id_token if available, otherwise fall back to access_token
      const tokenForDeployment = idToken || accessToken;
      
      console.log('[handleGoogleSuccess] Using token type:', idToken ? 'id_token (JWT)' : 'access_token (fallback)');
      
      setGoogleToken(tokenForDeployment);
      setDecodedJWT(mockJWT);
      
      saveJWT(mockJWT, tokenForDeployment);

      // ... rest of the code
    } catch (error) {
      console.error("Auth error:", error);
      toast.error("Authentication failed. Please try again.");
    }
  },
  [nonce],
);
```

#### 步骤 2: 使用真实的 modulus

修改 `src/services/zkProofService.ts:233-234`:

```typescript
// Replace hardcoded modulus with real one from JWT
// const modulusF = BigInt('6472322537804972268794034248194861302128540584786330577698326766016488520183');

// Get real modulus from JWT
let modulusF: bigint;
try {
  const modulusStr = await getModulusFromJWT(jwtToken);
  modulusF = BigInt(modulusStr);
  console.log('[generateProofInputs] Using real modulus from JWT:', modulusF.toString());
} catch (error) {
  console.warn('[generateProofInputs] Failed to get real modulus, using Oracle value:', error);
  // Fallback to Oracle modulus
  modulusF = BigInt('6472322537804972268794034248194861302128540584786330577698326766016488520183');
}
```

---

### 5. 添加 Garaga API 健康检查 (P2)

#### 新增函数到 `src/services/starknetService.ts`

```typescript
/**
 * Check if Garaga API server is healthy
 * 
 * @returns true if API is available, false otherwise
 */
export async function checkGaragaApiHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(`${GARAGA_API_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('[checkGaragaApiHealth] API health check failed:', error);
    return false;
  }
}
```

#### 修改 `convertSnarkjsProofToGaraga` 函数

```typescript
async function convertSnarkjsProofToGaraga(proof: SnarkJSProof): Promise<string[]> {
  console.log("[convertSnarkjsProofToGaraga] Calling backend API for Garaga v0.13.3 calldata...");

  try {
    const response = await fetch(`${GARAGA_API_URL}/api/garaga/calldata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        proof: proof.proof,
        publicSignals: proof.publicSignals,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API request failed: ${response.status}`);
    }

    const result = await response.json();
    console.log("[convertSnarkjsProofToGaraga] Calldata received, length:", result.calldata.length);
    console.log("[convertSnarkjsProofToGaraga] Expected length: ~3013 (0xbc5)");

    return result.calldata;
  } catch (error) {
    console.error("[convertSnarkjsProofToGaraga] API call failed:", error);
    
    // Enhanced error message
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Failed to generate Garaga calldata: ${errorMsg}\n\n` +
      `Make sure the Garaga API server is running:\n` +
      `  1. Check if server is running: npm run server\n` +
      `  2. API endpoint: ${GARAGA_API_URL}/api/garaga/calldata\n` +
      `  3. Check server logs for errors`
    );
  }
}
```

#### 在部署前添加检查

修改 `src/components/WalletPanel.tsx` (在 `handleDeploy` 函数中):

```typescript
const handleDeploy = async () => {
  setIsDeploying(true);
  try {
    // Pre-flight check: Garaga API health
    console.log('[handleDeploy] Checking Garaga API health...');
    const apiHealthy = await checkGaragaApiHealth();
    
    if (!apiHealthy) {
      toast.error(
        'Garaga API server is not responding. Please run: npm run server',
        { duration: 5000 }
      );
      return;
    }
    
    console.log('[handleDeploy] Garaga API is healthy ✅');
    
    // Proceed with deployment...
    const txHash = await deploySumoAccount(jwt, jwtToken, account.sessionKey, maxBlock, zkProof);
    // ...
  } catch (error) {
    console.error('[handleDeploy] Deploy failed:', error);
    toast.error(error instanceof Error ? error.message : 'Deployment failed');
  } finally {
    setIsDeploying(false);
  }
};
```

---

### 6. 改进错误提示 (P2)

#### 修改 `src/services/starknetService.ts:520-532`

```typescript
} catch (error) {
  console.error("Deploy failed:", error);
  const errorMessage = (error as Error)?.message || String(error);
  
  // Enhanced error messages for common issues
  if (errorMessage.includes("exceed balance") || errorMessage.includes("balance (0)")) {
    const enhancedError = new Error(
      `❌ Deployment failed: Insufficient STRK balance\n\n` +
      `The SUMO Login contract cannot pay for gas fees.\n\n` +
      `📍 Contract address: ${SUMO_LOGIN_CONTRACT_ADDRESS}\n\n` +
      `💡 Solutions:\n` +
      `  1. Fund the contract with STRK tokens on Sepolia testnet\n` +
      `  2. Use Starknet Faucet: https://starknet-faucet.vercel.app/\n` +
      `  3. Or use external wallet deployment (not yet implemented)\n\n` +
      `Need help? Check docs/ISSUES_ANALYSIS.md`
    );
    throw enhancedError;
  }
  
  if (errorMessage.includes("Garaga")) {
    throw new Error(
      `❌ Garaga API Error\n\n` +
      `${errorMessage}\n\n` +
      `💡 Make sure the backend server is running:\n` +
      `  npm run server\n\n` +
      `The server should be available at: ${GARAGA_API_URL}`
    );
  }
  
  throw error;
}
```

---

## 🧪 测试验证步骤

### 前提条件

1. ✅ 已安装依赖: `npm install`
2. ✅ Garaga API 服务已启动: `npm run server`
3. ✅ 已配置 Google Client ID (`.env` 文件)

### 步骤 1: 验证 Address Seed 一致性

在浏览器 DevTools Console 中运行：

```javascript
// 1. 获取当前的 JWT 和 secret
const jwt = {
  sub: 'your_google_sub_id',
  email: 'test@example.com'
};

// 2. 模拟 secret 派生
const jwtToken = 'your_jwt_token_here';
const encoder = new TextEncoder();
const data = encoder.encode(jwtToken);
const hashBuffer = await crypto.subtle.digest('SHA-256', data);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const secret = BigInt('0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32));

// 3. 调用 deriveAddressSeed
const addressSeed = await deriveAddressSeed(jwt.sub, jwt.email, secret);
console.log('Address Seed:', addressSeed.toString());

// 4. 检查 ZK proof inputs 中的 address_seed
// (在生成 ZK proof 时会打印，对比两者是否相同)
```

**预期结果**: 
- ✅ Console 中打印的 `addressSeed` 与 ZK proof 生成日志中的 `address_seed` 相同

### 步骤 2: 验证地址计算

```javascript
// 在 handleAccountCreation 执行后，检查日志
// 应该看到:
// [handleAccountCreation] Address seed: 12345...
// [handleAccountCreation] Computed address: 0x04bb...
```

**预期结果**:
- ✅ 地址计算成功，无错误
- ✅ 地址格式正确 (0x 开头，64 位十六进制)

### 步骤 3: 验证 ZK Proof 生成

点击 "Generate ZK Proof" 按钮，检查 Console 日志：

**预期日志**:
```
[generateRealZKProof] Loading circuit from: /zk/sumo_auth_official.wasm?v=...
[generateRealZKProof] Loading zkey from: /zk/sumo_auth_official_final.zkey?v=...
[generateRealZKProof] Public signals count: 2
[generateRealZKProof] Public signals: ["12345...", "67890..."]
ZK Proof generated successfully
```

**检查点**:
- ✅ Public signals count 必须是 `2` (hash_high, hash_low)
- ✅ Proof 验证通过 (绿色 ✓ 标记)

### 步骤 4: 验证 Garaga API

```bash
# 终端 1: 启动 Garaga API 服务
npm run server

# 终端 2: 测试健康检查
curl http://localhost:3001/health

# 预期输出: {"status":"ok"}
```

**预期结果**:
- ✅ API 服务正常运行
- ✅ 健康检查返回 200 OK

### 步骤 5: 验证部署流程

1. 点击 "Deploy on Starknet" 按钮
2. 检查 Console 日志

**预期日志序列**:
```
[handleDeploy] Checking Garaga API health...
[handleDeploy] Garaga API is healthy ✅
[deploySumoAccount] Called with:
[deploySumoAccount]   zkProof type: object
[generateSumoSignature] Computing signature values locally (official circuit format)
[generateSumoSignature] Using values from generateProofInputs for consistency
[convertSnarkjsProofToGaraga] Calling backend API for Garaga v0.13.3 calldata...
[convertSnarkjsProofToGaraga] Calldata received, length: 3013
[serializeSignature] Starting serialization...
[serializeSignature] Total signature length: 3029
[deploySumoAccount] Executing deploy call...
[deploySumoAccount] Transaction hash: 0xabc123...
```

**检查点**:
- ✅ Garaga API 健康检查通过
- ✅ Calldata 长度约为 3013
- ✅ 交易成功提交，获得 tx hash

### 步骤 6: 完整流程测试

执行完整的端到端测试：

```
1. Google OAuth 登录 ✅
   ↓
2. 生成会话密钥 ✅
   ↓
3. 生成 ZK Proof ✅
   ↓
4. 验证 ZK Proof ✅
   ↓
5. 计算账户地址 ✅
   ↓
6. 部署到 Starknet ✅
   ↓
7. 检查交易状态 ✅
```

**最终验证**:
```bash
# 使用 Starknet CLI 检查账户是否部署成功
starkli call 0x007d9f0f72c8a040439ee8ef674ae1a4580d744d1003ca382360beaa45db3a49 \
  is_sumo_user \
  <YOUR_COMPUTED_ADDRESS>

# 预期输出: 0x1 (true)
```

---

## 📊 问题优先级总结

| 优先级 | 问题 | 影响 | 修复难度 | 修复时间估算 |
|-------|------|------|---------|------------|
| **P0** | Address Seed 计算不一致 | 🔴 阻塞部署 | 中等 | 2-3 小时 |
| **P1** | Address Seed Mask 验证 | 🟡 潜在问题 | 低 | 30 分钟 |
| **P1** | 公钥格式验证 | 🟡 潜在问题 | 低 | 30 分钟 |
| **P2** | 缺少真实 JWT 验证 | 🟠 功能缺失 | 高 | 4-6 小时 |
| **P2** | Garaga API 依赖 | 🔵 用户体验 | 低 | 1 小时 |

**建议修复顺序**:
1. ✅ P0: Address Seed 计算不一致 (必须先修复)
2. ✅ P1: 添加验证日志
3. ✅ P2: 改进错误提示
4. 🔄 P2: Garaga API 健康检查
5. 📅 P2: 实现真实 JWT 验证 (可选)

---

## 📚 附录

### A. 相关文件清单

| 文件路径 | 说明 | 需要修改 |
|---------|------|---------|
| `src/utils/crypto.ts` | 加密工具函数 | ✅ 是 |
| `src/services/zkProofService.ts` | ZK 证明生成 | ✅ 是 |
| `src/services/starknetService.ts` | Starknet 交互 | ✅ 是 |
| `src/App.tsx` | 主应用组件 | ✅ 是 |
| `src/components/WalletPanel.tsx` | 钱包面板 | ✅ 是 |
| `circuits/sumo_auth_official.circom` | ZK 电路 | ❌ 否 |
| `sumo-login-cairo/src/login/login_contract.cairo` | Cairo 合约 | ❌ 否 |

### B. 关键算法对比

#### Email Hashing (Poseidon with Chunking)

**Circom 实现**:
```circom
var chunkSize = 15;
var numChunks = (emailLength + chunkSize - 1) \ chunkSize;

for (var i = 0; i < numChunks; i++) {
    chunkHasher[i] = Poseidon(16);
    chunkHasher[i].inputs[0] <== (i == 0) ? 0 : intermediateHashes[i-1];
    for (var j = 0; j < 15; j++) {
        chunkHasher[i].inputs[j + 1] <== email[start + j];
    }
    intermediateHashes[i] <== chunkHasher[i].out;
}
```

**TypeScript 实现**:
```typescript
const CHUNK_SIZE = 15;
let currentHash = BigInt(0);

for (let i = 0; i < numChunks; i++) {
    const inputs = new Array(16).fill(0);
    inputs[0] = currentHash;
    for (let j = 0; j < chunk.length; j++) {
        inputs[j + 1] = chunk[j];
    }
    const hash = poseidon(inputs);
    currentHash = poseidon.F.toObject(hash);
}
```

#### Address Seed Calculation

**正确实现** (应该统一使用):
```
address_seed = Poseidon(sub, emailHash, secret) & MASK_250
```

| 实现位置 | 当前算法 | 正确算法 |
|---------|---------|---------|
| zkProofService.ts:191 | ✅ Poseidon | ✅ Poseidon |
| crypto.ts:175 | ❌ SHA-256 | ✅ Poseidon |

### C. 调试技巧

#### 1. 打印所有 ZK proof 输入

在 `zkProofService.ts` 中添加：

```typescript
console.log('=== ZK Proof Inputs Debug ===');
console.log(JSON.stringify({
  public: publicInputs,
  private: {
    ...privateInputs,
    secret: secret.toString().slice(0, 20) + '...',
    email: emailBytes.slice(0, 10).join(',') + '...'
  }
}, null, 2));
```

#### 2. 验证 Poseidon 一致性

```typescript
// TypeScript
const hash1 = poseidon([1n, 2n, 3n]);
console.log('TS:', poseidon.F.toObject(hash1).toString());

// Circom (在电路中添加临时输出)
// signal test_hash <== Poseidon(3)([1, 2, 3]);
```

#### 3. 检查 felt252 溢出

```typescript
const FELT252_MAX = (BigInt(1) << BigInt(252)) - BigInt(1);
if (value > FELT252_MAX) {
  console.error('Value exceeds felt252 range!', value.toString(16));
}
```

### D. 常见错误信息

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|---------|
| `Public signals count: 8` | 使用了错误的电路 | 确保使用 `sumo_auth_official.circom` |
| `Garaga API Error` | 后端服务未运行 | 运行 `npm run server` |
| `balance (0)` | 合约账户无余额 | 从 faucet 获取 STRK 代币 |
| `address_seed verification failed` | Address seed 不一致 | 应用 P0 修复 |

### E. 参考资源

- **SUMO Login Cairo**: https://github.com/fatlabsxyz/sumo-login-cairo
- **Circom 文档**: https://docs.circom.io/
- **snarkjs 文档**: https://github.com/iden3/snarkjs
- **Starknet 文档**: https://docs.starknet.io/
- **Garaga 项目**: https://github.com/keep-starknet-strange/garaga

---

## ✅ 已完成修复

### 修复 1: 地址计算统一 (2026-02-01)

**问题**: 前端显示的钱包地址与合约实际部署的地址不一致

**根本原因**:
1. `getSumoAccountAddress` 使用 `deriveAddressSeed` (SHA256)
2. 实际部署使用 `generateProofInputs` 中的 Poseidon 哈希
3. 两种算法产生不同的 `address_seed`

**修复文件**:
- `src/services/starknetService.ts` - 更新 `getSumoAccountAddress` 函数
- `src/App.tsx` - 更新 `handleAccountCreation` 函数

**修复内容**:
```typescript
// starknetService.ts - getSumoAccountAddress 现在使用 generateProofInputs
export async function getSumoAccountAddress(jwt: GoogleJWT, jwtToken: string): Promise<string> {
  const { generateProofInputs } = await import('./zkProofService');
  const { publicInputs } = await generateProofInputs(jwt, dummySessionKey, jwtToken, 0);
  // 从 publicInputs 重建 address_seed
  const addressSeed = (BigInt(publicInputs.address_seed_high) << BigInt(128)) +
                      BigInt(publicInputs.address_seed_low);
  return computeStarknetAddress(SUMO_LOGIN_CONTRACT_ADDRESS, SUMO_ACCOUNT_CLASS_HASH, addressSeed);
}
```

---

### 修复 2: 地址稳定性 (2026-02-01)

**问题**: 每次重新登录生成的钱包地址不同

**根本原因**:
- `deriveSecretFromJWT` 使用整个 JWT token 计算 secret
- JWT token 每次登录都包含不同的时间戳 (`iat`, `exp`)
- 导致 secret → address_seed → 地址 每次都不同

**修复文件**:
- `src/services/zkProofService.ts` - 更新 `deriveSecretFromJWT` 函数

**修复内容**:
```typescript
// 修复前: 使用整个 JWT token (每次不同)
async function deriveSecretFromJWT(jwtToken: string): Promise<bigint> {
  const data = encoder.encode(jwtToken);  // ❌ jwtToken 每次登录都不同
  // ...
}

// 修复后: 只使用稳定字段 (sub + email)
async function deriveSecretFromJWT(sub: string, email: string): Promise<bigint> {
  const stableData = `${sub}:${email}:sumo_secret_v1`;  // ✅ 每次登录都相同
  // ...
}
```

**结果**: 同一个 Google 账户每次登录都会得到相同的钱包地址

---

### 修复 3: 合约地址更新 (2026-02-01)

**问题**: App.tsx 中硬编码的合约地址与实际部署的不一致

**修复内容**:
- 移除 App.tsx 中的硬编码地址
- 统一使用 `starknetService.ts` 中的常量

**当前部署的合约地址 (Sepolia)**:
```typescript
const SUMO_LOGIN_CONTRACT_ADDRESS = "0x050c3f8d9101ef9ddb0922564ca286c7da3668ba2943da790fddec457e44bcc0";
const SUMO_ACCOUNT_CLASS_HASH = "0x773a3de893f8cdea0688ae88712094755edb30d3648ff8754cfc76c55bbb177";
```

---

### 修复 4: TypeScript 编译错误 (2026-02-01)

**修复的文件**:
- `src/services/walletService.ts` - 修复 starknetkit API 类型错误
- `src/services/starknetService.ts` - 移除未使用的变量和函数

---

## 📝 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-02-01 | 1.0.0 | 初始版本 - 完整问题分析和修复建议 |
| 2026-02-01 | 1.1.0 | 修复地址计算不一致问题 - 统一使用 Poseidon 哈希 |
| 2026-02-01 | 1.2.0 | 修复地址稳定性问题 - secret 派生使用稳定字段 |

---

## 🔴 已知合约设计问题

### 问题 6: Session Key 更新与债务的死循环 (P0 - 合约层面)

#### 问题描述

当用户的 session key 过期或丢失，且账户有未偿还债务时，会陷入无法解决的死循环。

#### 死循环流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        死循环问题                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户想要还债                                                    │
│      ↓                                                          │
│  需要从 SUMO 账户执行交易 (transfer STRK)                        │
│      ↓                                                          │
│  Account.__validate__ 验证签名                                   │
│      ↓                                                          │
│  签名无效！(当前 session key 与合约存储的公钥不匹配)              │
│      ↓                                                          │
│  需要更新公钥 → 调用 Login.login()                               │
│      ↓                                                          │
│  Login.__validate__ → validate_login_deploy_call()              │
│      ↓                                                          │
│  检查债务: assert(debt == 0, LoginErrors::HAS_DEBT)             │
│      ↓                                                          │
│  有债务 → login 失败！                                           │
│      ↓                                                          │
│  回到起点: 用户想要还债...                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 合约代码分析

**Login 合约 (`login_contract.cairo`)**:

```cairo
// 第 414-418 行: login 函数在验证阶段检查债务
fn validate_login_deploy_call(self: @ContractState, call:Call) {
    // ...
    if call.selector == selector!("login"){
        assert(is_user, LoginErrors::NOT_USER );
        let debt = self.user_debt.entry(target_address).read();
        assert(debt == 0, LoginErrors::HAS_DEBT);  // ← 有债务就失败！
    }
}
```

**Account 合约 (`account_contract.cairo`)**:

```cairo
// 第 89-93 行: 验证签名
fn __validate__(self: @ContractState, calls: Span<Call>) -> felt252 {
    self.only_protocol();
    self.validate_block_time();
    self.validate_tx_signature();  // ← 使用存储的公钥验证签名
    VALIDATED
}

// 第 172-177 行: 签名验证逻辑
fn validate_tx_signature(self: @ContractState){
    let tx_info = get_tx_info().unbox();
    let signature = tx_info.signature;
    let tx_hash = tx_info.transaction_hash;
    // ← 使用 self.public_key.read() 验证，但这是旧的公钥！
    assert(self.is_valid_signature(tx_hash, signature.into()) == VALIDATED,
           AccountErrors::INVALID_SIGNATURE);
}
```

#### 触发条件

1. 用户部署了 SUMO 账户（产生债务）
2. 用户的 session key 过期或重新登录生成了新的 session key
3. 新的 session key 公钥与合约中存储的旧公钥不匹配
4. 用户无法签名任何交易，也无法更新公钥

#### 影响范围

- **严重程度**: 🔴 Critical
- **影响用户**: 所有有债务且 session key 已变更的用户
- **资金影响**: 用户的 STRK 代币被锁定在账户中，无法转出

#### 可能的解决方案

**方案 1: 联系 Login 合约 Admin (临时方案)**

Login 合约的 admin 可以调用 `collect_debt(user_address)` 来帮助用户清除债务：

```cairo
// Admin 签名的交易可以调用 collect_debt
// 但需要用户账户有足够的 STRK 余额
fn collect_debt(ref self: ContractState, user_address: ContractAddress) {
    let caller = get_caller_address();
    // Admin (Login 合约自己) 可以调用
    if (caller != get_contract_address()) && (caller != user_address) {
        assert(false, LoginErrors::SELECTOR_NOT_ALLOWED);
    }
    // ...
}
```

**方案 2: 修改合约逻辑 (需要合约升级)**

在 `login` 函数中移除债务检查，或者添加一个新的入口点允许用户在有债务的情况下更新公钥：

```cairo
// 建议: 添加新函数允许更新公钥而不检查债务
fn update_pkey_with_debt(ref self: ContractState) {
    // 验证 ZK proof
    // 更新公钥
    // 不检查债务
    // 用户之后可以还债
}
```

**方案 3: 添加紧急恢复机制 (需要合约升级)**

```cairo
// 建议: 添加紧急恢复函数，允许 admin 帮助用户更新公钥
fn admin_update_user_pkey(
    ref self: ContractState,
    user_address: ContractAddress,
    new_pkey: felt252,
    expiration: u64
) {
    // 只有 admin 可以调用
    self.validate_tx_admin_signature(...);
    self.set_user_pkey(user_address, new_pkey, expiration);
}
```

#### 当前状态

| 状态 | 说明 |
|------|------|
| 🔴 未解决 | 需要合约层面的修改 |
| 📋 已记录 | 问题已记录到文档 |
| ⏳ 等待 | 等待合约开发团队响应 |

#### 临时解决步骤

如果用户遇到此问题：

1. **确认问题**: 检查是否有债务且 session key 已变更
   ```bash
   # 查询债务
   starkli call <LOGIN_CONTRACT> get_user_debt <USER_ADDRESS>
   ```

2. **联系 Admin**: 需要 Login 合约的 admin 帮助
   - Admin 需要调用 `collect_debt(user_address)`
   - 前提是用户账户有足够的 STRK 余额

3. **等待合约升级**: 长期解决方案需要合约升级

---

## 📝 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-02-01 | 1.0.0 | 初始版本 - 完整问题分析和修复建议 |
| 2026-02-01 | 1.1.0 | 修复地址计算不一致问题 - 统一使用 Poseidon 哈希 |
| 2026-02-01 | 1.2.0 | 修复地址稳定性问题 - secret 派生使用稳定字段 |
| 2026-02-01 | 1.3.0 | 记录合约设计问题 - Session Key 更新与债务的死循环 |

---

**文档维护者**: AI Analysis Bot
**最后更新**: 2026-02-01
**状态**: ⚠️ 存在未解决的合约层面问题

如有问题或建议，请创建 issue 或联系开发团队。
