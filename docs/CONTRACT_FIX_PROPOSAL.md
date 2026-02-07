# SUMO Login 合约修复方案

> 解决 Session Key 更新与债务的死循环问题

## 问题回顾

### 死循环描述

```
用户想还债 → 需要签名 → 签名无效(session key已变)
    ↓
需要更新公钥 → 调用 login → 检查债务 → 有债务失败
    ↓
回到起点...
```

### 根本原因

`login_contract.cairo` 第 414-418 行：

```cairo
if call.selector == selector!("login"){
    assert(is_user, LoginErrors::NOT_USER );
    let debt = self.user_debt.entry(target_address).read();
    assert(debt == 0, LoginErrors::HAS_DEBT);  // ← 问题所在
}
```

---

## 修复方案

### 方案 A: 移除 login 的债务检查 (推荐)

**原理**: login 函数的目的是更新公钥，不应该被债务阻塞。债务可以在用户执行交易时自动收取。

**修改文件**: `src/login/login_contract.cairo`

**修改内容**:

```cairo
// 修改前 (第 414-418 行)
if call.selector == selector!("login"){
    assert(is_user, LoginErrors::NOT_USER );
    let debt = self.user_debt.entry(target_address).read();
    assert(debt == 0, LoginErrors::HAS_DEBT);  // ← 删除这两行
}

// 修改后
if call.selector == selector!("login"){
    assert(is_user, LoginErrors::NOT_USER );
    // 不再检查债务，允许用户更新公钥
    // 债务会在用户执行交易时通过 Account.__execute__ -> call_for_collect 自动收取
}
```

**优点**:
- 修改最小，只删除两行代码
- 不影响现有逻辑
- 债务仍然会被收取（通过 Account 的 `__execute__`）

**缺点**:
- 用户可能延迟还债（但最终还是会还）

---

### 方案 B: 添加新入口点 `login_with_debt`

**原理**: 保留原有 login 的债务检查，添加新函数允许有债务的用户更新公钥。

**修改文件**: `src/login/login_contract.cairo`

**修改内容**:

#### 1. 更新接口定义

```cairo
#[starknet::interface]
pub trait ILogin<TContractState> {
    // ... 现有函数 ...

    // 新增: 允许有债务的用户更新公钥
    fn login_with_debt(ref self: TContractState);
}
```

#### 2. 更新 USER_ENDPOINTS

```cairo
// 修改前
const USER_ENDPOINTS : [felt252;2] = [selector!("deploy"), selector!("login")];

// 修改后
const USER_ENDPOINTS : [felt252;3] = [
    selector!("deploy"),
    selector!("login"),
    selector!("login_with_debt")  // 新增
];
```

#### 3. 实现新函数

```cairo
/// 允许有债务的用户更新公钥
///
/// 与 login 相同，但不检查债务。用户更新公钥后可以执行交易，
/// 交易会自动触发债务收取。
fn login_with_debt(ref self: ContractState) {
    let signature = self.get_serialized_signature();
    let (eph_key_0, eph_key_1) = signature.eph_key;
    let reconstructed_eph_key: felt252 = eph_key_0 * TWO_POWER_128 + eph_key_1;
    let expiration_block: u64 = signature.max_block.try_into().unwrap();

    let user_address: ContractAddress = self.get_target_address(signature.address_seed);

    // 验证用户存在
    assert(self.user_list.entry(user_address).read(), LoginErrors::NOT_USER);

    // 更新公钥（不检查债务）
    self.set_user_pkey(user_address, reconstructed_eph_key, expiration_block);

    // 添加 login 费用到债务
    self.add_debt(user_address, LOGIN_FEE_GAS);

    self.emit(LoginAccount { address: user_address });
}
```

#### 4. 更新验证逻辑

```cairo
fn validate_login_deploy_call(self: @ContractState, call: Call) {
    let signature = self.get_serialized_signature();
    // ... 现有验证 ...

    let target_address = self.get_target_address(signature.address_seed);
    let is_user = self.user_list.entry(target_address).read();

    if call.selector == selector!("deploy") {
        assert(is_user == false, LoginErrors::IS_USER);
    }

    if call.selector == selector!("login") {
        assert(is_user, LoginErrors::NOT_USER);
        let debt = self.user_debt.entry(target_address).read();
        assert(debt == 0, LoginErrors::HAS_DEBT);
    }

    // 新增: login_with_debt 不检查债务
    if call.selector == selector!("login_with_debt") {
        assert(is_user, LoginErrors::NOT_USER);
        // 不检查债务
    }
}
```

**优点**:
- 保持向后兼容
- 原有 login 逻辑不变
- 给用户更多选择

**缺点**:
- 代码改动较多
- 需要前端适配新入口点

---

### 方案 C: 修改 login 自动处理债务

**原理**: 在 login 中先更新公钥，然后尝试收取债务。如果收取失败（余额不足），记录新债务但不阻塞。

**修改文件**: `src/login/login_contract.cairo`

**修改内容**:

```cairo
fn login(ref self: ContractState) {
    let signature = self.get_serialized_signature();
    let (eph_key_0, eph_key_1) = signature.eph_key;
    let reconstructed_eph_key: felt252 = eph_key_0 * TWO_POWER_128 + eph_key_1;
    let expiration_block: u64 = signature.max_block.try_into().unwrap();

    let user_address: ContractAddress = self.get_target_address(signature.address_seed);

    // 1. 先更新公钥（最重要的操作）
    self.set_user_pkey(user_address, reconstructed_eph_key, expiration_block);

    // 2. 添加本次 login 的费用
    self.add_debt(user_address, LOGIN_FEE_GAS);

    // 3. 尝试收取债务（可选，失败不阻塞）
    // 注意：这里不能直接调用 collect_debt，因为用户账户的公钥刚更新，
    // 但交易签名是用旧公钥签的。需要等下一笔交易才能收取。

    self.emit(LoginAccount { address: user_address });
}
```

同时修改 `validate_login_deploy_call`:

```cairo
if call.selector == selector!("login") {
    assert(is_user, LoginErrors::NOT_USER);
    // 移除债务检查
    // let debt = self.user_debt.entry(target_address).read();
    // assert(debt == 0, LoginErrors::HAS_DEBT);
}
```

**优点**:
- 修改简单
- 逻辑清晰

**缺点**:
- 改变了原有行为

---

## 推荐方案

### 首选: 方案 A (最小修改)

只需删除两行代码，风险最低：

```cairo
// src/login/login_contract.cairo 第 414-418 行
if call.selector == selector!("login"){
    assert(is_user, LoginErrors::NOT_USER );
    // 删除以下两行:
    // let debt = self.user_debt.entry(target_address).read();
    // assert(debt == 0, LoginErrors::HAS_DEBT);
}
```

### 债务收取保证

即使移除 login 的债务检查，债务仍然会被收取：

```
用户调用 login → 更新公钥 → 添加新债务
    ↓
用户执行任何交易 (transfer, etc.)
    ↓
Account.__execute__ 调用 call_for_collect()
    ↓
Login.collect_debt() 被调用
    ↓
Account.pay() 转账 STRK 到 Login 合约
    ↓
债务清零
```

**关键代码** (`account_contract.cairo` 第 101-106 行):

```cairo
fn __execute__(ref self: ContractState, mut calls: Span<Call>) -> Array<Span<felt252>> {
    self.only_protocol();
    self.validate_tx_version();
    self.call_for_collect();  // ← 每次执行交易都会尝试收取债务
    execute_calls(calls)
}
```

---

## 实施步骤

### 步骤 1: 修改合约代码

```bash
cd sumo-login-cairo
```

编辑 `src/login/login_contract.cairo`:

```cairo
// 找到 validate_login_deploy_call 函数，修改 login 分支
if call.selector == selector!("login"){
    assert(is_user, LoginErrors::NOT_USER );
    // 注释掉或删除债务检查
    // let debt = self.user_debt.entry(target_address).read();
    // assert(debt == 0, LoginErrors::HAS_DEBT);
}
```

### 步骤 2: 编译合约

```bash
scarb build
```

### 步骤 3: 运行测试

```bash
scarb test
```

### 步骤 4: 部署新合约

```bash
# 声明新的 class
starkli declare target/dev/sumo_login_Login.contract_class.json \
    --account <ACCOUNT> \
    --keystore <KEYSTORE>

# 部署新合约（或升级现有合约）
starkli deploy <NEW_CLASS_HASH> \
    <SUMO_ACCOUNT_CLASS_HASH> \
    <ADMIN_PUBLIC_KEY> \
    --account <ACCOUNT> \
    --keystore <KEYSTORE>
```

### 步骤 5: 更新前端配置

更新 `src/services/starknetService.ts`:

```typescript
// 更新为新部署的合约地址
const SUMO_LOGIN_CONTRACT_ADDRESS = "0x<NEW_ADDRESS>";
```

---

## 测试验证

### 测试场景 1: 有债务的用户可以 login

```bash
# 1. 查询用户债务
starkli call <LOGIN_CONTRACT> get_user_debt <USER_ADDRESS>
# 预期: 非零值

# 2. 用户调用 login（使用新的 ZK proof）
# 预期: 成功，不再报 "HAS_DEBT" 错误

# 3. 用户执行任何交易
# 预期: 债务被自动收取
```

### 测试场景 2: 债务仍然被收取

```bash
# 1. 用户 login 后查询债务
starkli call <LOGIN_CONTRACT> get_user_debt <USER_ADDRESS>
# 预期: 债务增加（login 费用）

# 2. 用户执行 transfer 交易
# 预期: 交易成功

# 3. 再次查询债务
starkli call <LOGIN_CONTRACT> get_user_debt <USER_ADDRESS>
# 预期: 0（债务已清零）
```

---

## 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 用户永不还债 | 低 | 低 | Account.__execute__ 强制收取 |
| 合约升级失败 | 低 | 高 | 先在测试网验证 |
| 前端不兼容 | 无 | 无 | 方案 A 不需要前端改动 |

---

## 总结

**推荐方案**: 方案 A - 移除 login 的债务检查

**修改量**: 2 行代码

**风险**: 低

**向后兼容**: 是

**需要前端改动**: 否

---

**文档版本**: 1.0.0
**创建日期**: 2026-02-01
**作者**: AI Analysis Bot
