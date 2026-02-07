# snforge 集成测试升级指南

## 概述

本文档记录从当前版本升级到支持 snforge 集成测试所需的所有步骤。

### 当前版本
- Scarb: 2.8.5
- starknet: 2.8.2
- garaga: v0.13.3
- snforge_std: v0.31.0 (不兼容)

### 目标版本
- Scarb: 2.14.0
- starknet: 2.14.0
- garaga: v1.0.1
- snforge_std: 0.53.0

> **注意**: 已有 `sumo_verifier/` 目录包含 garaga v1.0.1 生成的代码，可直接复制使用。

---

## ZK 证明生成流程

### 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                 scripts/setup-zk.js                      │
│                                                          │
│  Circom 电路  ──→  snarkjs  ──→  verification_key.json   │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                    garaga gen                            │
│                                                          │
│  verification_key.json  ──→  Cairo Verifier 合约         │
└──────────────────────────────────────────────────────────┘
```

### setup-zk.js 详细步骤

| 步骤 | 命令 | 输出 |
|------|------|------|
| 1. 编译电路 | `circom sumo_auth.circom` | `.r1cs`, `.wasm`, `.sym` |
| 2. Powers of Tau | `snarkjs powersoftau` | `pot14_final.ptau` |
| 3. Trusted Setup | `snarkjs groth16 setup` | `.zkey` |
| 4. Phase 2 贡献 | `snarkjs zkey contribute` | `_final.zkey` |
| 5. 导出验证密钥 | `snarkjs zkey export` | `verification_key.json` |

### garaga gen 详细说明

**输入**: `verification_key.json` (snarkjs 导出)

**输出**:
- `groth16_verifier.cairo` - 验证逻辑代码
- `groth16_verifier_constants.cairo` - 预计算常量

**命令**:
```bash
source .venv/bin/activate
garaga gen --system groth16 --vk public/zk/verification_key.json
```

---

## 第一步：安装 Scarb 2.14.0

```bash
# 使用 asdf 安装
asdf install scarb 2.14.0
asdf set scarb 2.14.0

# 验证版本
scarb --version
```

---

## 第二步：更新主项目 Scarb.toml

文件：`sumo-login-cairo/Scarb.toml`

```toml
[package]
name = "sumo"
version = "0.1.0"
edition = "2024_07"

[scripts]
test = "snforge test"

[dependencies]
garaga = { git = "https://github.com/keep-starknet-strange/garaga.git", tag = "v1.0.1" }
universal_ecip = { path = "./universal_ecip" }
erc20 = { path = "./erc20" }
oracle = { path = "./oracle" }
starknet = "2.14.0"

[dev-dependencies]
snforge_std = "0.53.0"
assert_macros = "2.14.0"

[cairo]
sierra-replace-ids = false

[[target.starknet-contract]]
build-external-contracts = ["universal_ecip::UniversalECIP","erc20::ERC20Contract","oracle::OracleContract"]
```

---

## 第三步：更新子模块 Scarb.toml

### 3.1 universal_ecip/Scarb.toml

```toml
[package]
name = "universal_ecip"
version = "0.1.0"
edition = "2024_07"

[dependencies]
garaga = { git = "https://github.com/keep-starknet-strange/garaga.git", tag = "v1.0.1" }
starknet = "2.14.0"

[lib]

[cairo]
sierra-replace-ids = false

[[target.starknet-contract]]
casm = true
casm-add-pythonic-hints = true
```

### 3.2 erc20/Scarb.toml

```toml
[package]
name = "erc20"
version = "0.1.0"
edition = "2024_07"

[dependencies]
starknet = "2.14.0"

[lib]

[cairo]
sierra-replace-ids = false

[[target.starknet-contract]]
casm = true
casm-add-pythonic-hints = true
```

### 3.3 oracle/Scarb.toml

```toml
[package]
name = "oracle"
version = "0.1.0"
edition = "2024_07"

[dependencies]
starknet = "2.14.0"

[lib]

[cairo]
sierra-replace-ids = false

[[target.starknet-contract]]
casm = true
casm-add-pythonic-hints = true
```

---

## 第四步：复制 verifier 文件

已有 `sumo_verifier/` 目录包含 garaga v1.0.1 生成的代码，直接复制即可。

```bash
# 复制 verifier 文件
cp ../sumo_verifier/src/groth16_verifier.cairo src/verifier/
cp ../sumo_verifier/src/groth16_verifier_constants.cairo src/verifier/
```

> **注意**: 代码 API 兼容，无需手动修改。

---

## 第五步：编写 snforge 集成测试

创建文件：`tests/test_login.cairo`

### 5.1 测试导入

```cairo
use snforge_std::{
    declare,
    ContractClassTrait,
    DeclareResultTrait,
    start_cheat_caller_address,
    stop_cheat_caller_address,
    start_cheat_block_number,
    spy_events,
    EventSpyTrait
};
use starknet::ContractAddress;
```

### 5.2 部署辅助函数

```cairo
fn deploy_login_contract() -> ContractAddress {
    let contract = declare("Login").unwrap().contract_class();
    let constructor_args = array![
        SUMO_ACCOUNT_CLASS_HASH,
        ADMIN_PUBLIC_KEY
    ];
    let (address, _) = contract.deploy(@constructor_args).unwrap();
    address
}
```

### 5.3 Deploy 测试示例

```cairo
#[test]
fn test_deploy_sumo_account() {
    // 部署 Login 合约
    let login_address = deploy_login_contract();
    let dispatcher = ILoginDispatcher { contract_address: login_address };

    // 模拟区块号
    start_cheat_block_number(login_address, 100);

    // TODO: 构造有效的 ZK 证明签名
    // 这需要真实的 garaga proof 数据

    // 验证用户不存在
    let user_address = compute_expected_address();
    assert(!dispatcher.is_sumo_user(user_address), 'User should not exist');
}
```

---

## 第六步：验证升级

### 6.1 编译检查

```bash
scarb build
```

### 6.2 运行单元测试

```bash
scarb cairo-test
```

### 6.3 运行 snforge 测试

```bash
snforge test
```

---

## 常见问题

### Q1: snforge 版本不兼容

**错误**: `Package snforge_std version does not meet the minimum required version`

**解决**: 确保 Scarb 版本 >= 2.14.0

### Q2: 编译错误

**解决**: 确保所有 Scarb.toml 文件的 starknet 版本一致 (2.14.0)

---

## 回滚步骤

如果升级失败，可以回滚到原版本：

```bash
# 回滚 Scarb 版本
asdf set scarb 2.8.5

# 恢复 Scarb.toml (使用 git)
git checkout -- Scarb.toml
git checkout -- */Scarb.toml

# 恢复 verifier 文件
git checkout -- src/verifier/
```

---

## 已完成的修复

在升级之前，以下 bug 已修复并通过单元测试验证：

1. **SHA256→u256 转换 bug** (`src/utils/utils.cairo`)
   - 添加 `sha256_to_u256` 函数正确转换 [u32; 8] 到 u256

2. **validate_all_inputs_hash** 验证通过
   - 使用前端真实数据测试通过

运行 `scarb cairo-test` 可验证这些修复。
