# SUMO Login 官方实现迁移指南

## 1. 背景

### 1.1 当前实现 vs 官方实现

| 方面 | 官方实现 | 当前实现 |
|------|---------|---------|
| ZK 电路输出 | SHA256 哈希作为第一个公共输入 | 8 个原始公共输入 |
| Cairo 验证 | 比较哈希值 | 逐个比较公共输入 |
| 公共输入数量 | 1 个 | 8 个 |

### 1.2 官方验证逻辑

官方 `validate_all_inputs_hash` 函数：

```cairo
pub fn validate_all_inputs_hash(signature: @Signature, all_inputs_hash: Span<u256>) -> bool {
    // 1. 从签名构建输入数组
    let inputs: Array<u256> = array![
        eph_0.into(), eph_1.into(), address_seed,
        max_block.into(), iss_b64_F.into(),
        iss_index_in_payload_mod_4.into(),
        header_F.into(), modulus_F.into()
    ];

    // 2. 计算 SHA256 哈希
    let sha256_input = concatenate_inputs(inputs.span());
    let hash_result = compute_sha256_byte_array(@sha256_input);

    // 3. 比较哈希值
    let left: u256 = *all_inputs_hash.at(0);
    let right: u256 = (*hash_result.span().at(0)).into();
    left == right
}
```

## 2. 迁移目标

将 ZK 电路修改为输出所有公共输入的 SHA256 哈希，使其与官方 Cairo 合约兼容。

## 3. 修改步骤概览

1. **修改 Circom 电路** - 添加 SHA256 哈希计算
2. **重新编译电路** - 生成新的 R1CS 和 WASM
3. **重新生成 Trusted Setup** - 生成新的 zkey
4. **更新 Garaga 验证器** - 生成新的 verification key 常量
5. **恢复官方 Cairo 代码** - 使用官方的 `validate_all_inputs_hash`
6. **更新前端代码** - 调整 ZK 证明生成逻辑
7. **重新部署合约** - 部署更新后的合约

## 4. 步骤一：修改 Circom 电路

### 4.1 电路文件

完整的电路文件已创建：`circuits/sumo_auth_official.circom`

**关键设计点：**
- 每个 u256 输入拆分为 `_high` 和 `_low` 两个 u128，避免 BN254 域溢出
- 输出 256 bits 的 SHA256 哈希
- 使用大端序拼接，与 Cairo 的 `concatenate_inputs` 一致

**输入信号：**
```circom
signal input eph_public_key0_high;
signal input eph_public_key0_low;
signal input eph_public_key1_high;
signal input eph_public_key1_low;
signal input address_seed_high;
signal input address_seed_low;
signal input max_epoch;
signal input iss_b64_F_high;
signal input iss_b64_F_low;
signal input iss_index_in_payload_mod_4;
signal input header_F_high;
signal input header_F_low;
signal input modulus_F_high;
signal input modulus_F_low;
signal input sub;
signal input email[64];
signal input secret;
```

**输出信号：**
```circom
signal output all_inputs_hash[256];  // 256 bits
```

### 4.2 约束数量估算

| 组件 | 约束数量 |
|------|---------|
| 原有验证逻辑 | ~5,000 |
| Num2Bits(128) x 14 | ~1,792 |
| Sha256(2048) | ~160,000 |
| **总计** | **~170,000** |

> **注意**：需要 Powers of Tau 2^19 (524,288) 才能支持此电路。

## 5. 步骤二：编译电路

```bash
cd /Users/yanyuan/Downloads/sumo-login

# 编译新电路
circom circuits/sumo_auth_official.circom \
  --r1cs \
  --wasm \
  --sym \
  -o build/circuits

# 查看约束数量
snarkjs r1cs info build/circuits/sumo_auth_official.r1cs
```

## 6. 步骤三：生成 Trusted Setup

```bash
# 下载 Powers of Tau（需要足够大的 ptau 文件）
# 对于 ~110k 约束，需要 2^17 = 131072 的 ptau
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_17.ptau

# 生成 zkey
snarkjs groth16 setup \
  build/circuits/sumo_auth_official.r1cs \
  powersOfTau28_hez_final_17.ptau \
  build/circuits/sumo_auth_official_0000.zkey

# 贡献随机性
snarkjs zkey contribute \
  build/circuits/sumo_auth_official_0000.zkey \
  build/circuits/sumo_auth_official_final.zkey \
  --name="SUMO Login" -v

# 导出 verification key
snarkjs zkey export verificationkey \
  build/circuits/sumo_auth_official_final.zkey \
  public/zk/verification_key.json
```

## 7. 步骤四：更新 Garaga 验证器

```bash
# 激活 Python 虚拟环境
source .venv/bin/activate

# 使用 Garaga 生成新的验证器常量
garaga gen \
  --vk public/zk/verification_key.json \
  --system groth16 \
  -o sumo-login-cairo/src/verifier/
```

## 8. 步骤五：恢复官方 Cairo 代码

### 8.1 恢复 `utils.cairo`

将 `validate_all_inputs_hash` 恢复为官方版本：

```cairo
use core::sha256::{ compute_sha256_byte_array };

pub fn validate_all_inputs_hash(signature: @Signature, all_inputs_hash: Span<u256>) -> bool {
    let (eph_0, eph_1) = *signature.eph_key;

    let inputs: Array<u256> = array![
        eph_0.into(),
        eph_1.into(),
        (*signature.address_seed),
        (*signature.max_block).into(),
        (*signature.iss_b64_F).into(),
        (*signature.iss_index_in_payload_mod_4).into(),
        (*signature.header_F).into(),
        (*signature.modulus_F).into()
    ];

    let sha256_input = concatenate_inputs(inputs.span());
    let hash_result = compute_sha256_byte_array(@sha256_input);

    let left: u256 = *all_inputs_hash.at(0);
    let right: u256 = (*hash_result.span().at(0)).into();
    left == right
}
```

### 8.2 恢复 `concatenate_inputs` 函数

```cairo
fn concatenate_inputs(inputs: Span<u256>) -> ByteArray {
    let mut byte_array = Default::default();
    let mut index = 0_u32;
    while index < inputs.len() {
        let int_value: u256 = *inputs.at(index);
        byte_array.append_word(int_value.high.into(), 16);
        byte_array.append_word(int_value.low.into(), 16);
        index += 1;
    };
    byte_array
}
```

## 9. 步骤六：更新前端代码

### 9.1 修改 `zkProofService.ts`

更新证明生成逻辑，适配新电路的输入格式（u256 拆分为 high/low）：

```typescript
// 辅助函数：将 u256 拆分为 high/low
function splitU256(value: bigint): { high: string; low: string } {
  const mask128 = (1n << 128n) - 1n;
  return {
    high: ((value >> 128n) & mask128).toString(),
    low: (value & mask128).toString()
  };
}

// 新电路的输入
const ephKey0Split = splitU256(BigInt(ephPublicKey0));
const ephKey1Split = splitU256(BigInt(ephPublicKey1));
const addressSeedSplit = splitU256(BigInt(addressSeed));
const issB64FSplit = splitU256(BigInt(issB64F));
const headerFSplit = splitU256(BigInt(headerF));
const modulusFSplit = splitU256(BigInt(modulusF));

const circuitInputs = {
  // u256 输入拆分为 high/low
  eph_public_key0_high: ephKey0Split.high,
  eph_public_key0_low: ephKey0Split.low,
  eph_public_key1_high: ephKey1Split.high,
  eph_public_key1_low: ephKey1Split.low,
  address_seed_high: addressSeedSplit.high,
  address_seed_low: addressSeedSplit.low,
  max_epoch: maxBlock.toString(),
  iss_b64_F_high: issB64FSplit.high,
  iss_b64_F_low: issB64FSplit.low,
  iss_index_in_payload_mod_4: issIndex.toString(),
  header_F_high: headerFSplit.high,
  header_F_low: headerFSplit.low,
  modulus_F_high: modulusFSplit.high,
  modulus_F_low: modulusFSplit.low,

  // 私有输入
  sub: sub,
  email: emailBytes,
  secret: secret
};
```

### 9.2 修改 `starknetService.ts`

更新签名生成，处理 256 bits 的哈希输出：

```typescript
// 新电路输出 256 个 bit，需要转换为 u256
function bitsToU256(bits: string[]): { high: string; low: string } {
  let high = 0n;
  let low = 0n;

  // 前 128 bits -> high
  for (let i = 0; i < 128; i++) {
    if (bits[i] === '1') {
      high |= (1n << BigInt(127 - i));
    }
  }

  // 后 128 bits -> low
  for (let i = 0; i < 128; i++) {
    if (bits[128 + i] === '1') {
      low |= (1n << BigInt(127 - i));
    }
  }

  return {
    high: high.toString(),
    low: low.toString()
  };
}

// 从 publicSignals 获取哈希值
const hashBits = zkProof.publicSignals; // 256 个 bit
const allInputsHash = bitsToU256(hashBits);
```

### 9.3 更新 wasm/zkey 文件路径

```typescript
// 更新文件路径
const WASM_PATH = '/zk/sumo_auth_official.wasm';
const ZKEY_PATH = '/zk/sumo_auth_official_final.zkey';
```

## 10. 步骤七：重新部署合约

### 10.1 编译合约

```bash
cd sumo-login-cairo

# 编译 Cairo 合约
scarb build
```

### 10.2 声明合约

```bash
# 声明 LoginContract
sncast --account=<ACCOUNT_NAME> declare \
  --contract-name=LoginContract \
  --network=sepolia

# 声明 AccountContract
sncast --account=<ACCOUNT_NAME> declare \
  --contract-name=AccountContract \
  --network=sepolia
```

### 10.3 部署合约

```bash
# 部署 LoginContract
# 参数: account_class_hash, groth16_verifier_class_hash
sncast --account=<ACCOUNT_NAME> deploy \
  --class-hash=<LOGIN_CLASS_HASH> \
  --constructor-calldata 0x<ACCOUNT_CLASS_HASH> 0x<VERIFIER_CLASS_HASH> \
  --network=sepolia
```

### 10.4 sncast 账户配置

如果尚未配置账户，先创建账户配置：

```bash
# 添加已有账户
sncast account add \
  --name <ACCOUNT_NAME> \
  --address <ACCOUNT_ADDRESS> \
  --private-key <PRIVATE_KEY> \
  --type oz
```

### 10.5 指定网络

```bash
# 方式一：使用 --network 参数（推荐）
sncast --account=<ACCOUNT_NAME> --network=sepolia \
  declare --contract-name=LoginContract

# 方式二：使用 --url 指定 RPC（备选）
sncast --account=<ACCOUNT_NAME> \
  --url=https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/OfZA_k9dt4bm8hU_brCcah5wbRx--cf9 \
  declare --contract-name=LoginContract
```

## 11. 注意事项

### 11.1 性能影响

| 指标 | 当前实现 | 官方实现（预估） |
|------|---------|-----------------|
| 电路约束数 | ~5,000 | ~110,000 |
| 证明生成时间 | ~2-5 秒 | ~30-60 秒 |
| 证明大小 | 相同 | 相同 |
| 链上验证 Gas | 较高（8 个输入） | 较低（1 个哈希） |

### 11.2 安全性对比

两种实现的安全性是等价的：
- **当前实现**：直接验证 8 个公共输入
- **官方实现**：验证 8 个输入的 SHA256 哈希

两者都能确保签名中的值与 ZK 证明中的值一致。

### 11.3 建议

如果不需要与官方实现完全兼容，**建议保持当前实现**：
- 证明生成更快
- 用户体验更好
- 安全性相同

## 12. 完整迁移检查清单

- [ ] 创建新电路文件 `sumo_auth_official.circom`
- [ ] 编译电路生成 R1CS 和 WASM
- [ ] 下载合适的 Powers of Tau 文件
- [ ] 生成新的 zkey
- [ ] 导出 verification key
- [ ] 使用 Garaga 生成验证器常量
- [ ] 恢复官方 `utils.cairo` 代码
- [ ] 更新前端 `zkProofService.ts`
- [ ] 更新前端 `starknetService.ts`
- [ ] 编译 Cairo 合约
- [ ] 部署新合约
- [ ] 更新前端合约地址
- [ ] 端到端测试

