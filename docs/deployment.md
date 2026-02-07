# SUMO Login 部署文档

## 当前工作进度

### 已完成 ✅

1. **Garaga 版本兼容性问题修复**
   - 问题：npm garaga v1.0.1 生成的 calldata 格式与 Cairo 合约 (garaga v0.13.3) 不兼容
   - 解决：创建后端服务器调用 Python garaga v0.13.3 生成兼容的 calldata

2. **后端服务器搭建**
   - 创建 `server/index.cjs` - Express 服务器
   - 创建 `scripts/generate_garaga_calldata.py` - Python calldata 生成脚本
   - 安装 Python garaga v0.13.3 到 `.venv` 虚拟环境

3. **ECIP_OPS_CLASS_HASH 修复**
   - 问题：原 class hash `0x04ca4fb...` 在 Sepolia 上未声明
   - 解决：使用 Sepolia 上已存在的 `0x7918f484291eb154e13d0e43ba6403e62dc1f5fbb3a191d868e2e37359f8713`

4. **合约重新部署**
   - 声明新的 Groth16VerifierBN254
   - 更新 GARAGA_VERIFY_CLASSHASH
   - 声明并部署新的 Login 合约

5. **前端代码更新**
   - 更新 Login 合约地址
   - 修改 `starknetService.ts` 调用后端 API 生成 calldata
   - 修复 L2 gas 价格配置

### 待完成 ⏳

1. **向新 Login 合约充值 STRK**
   ```
   地址: 0x01d1e9c2cff00f2fa06cb98b1d0ac29c3966454d0d3f808e79aa96c281f77956
   建议金额: 100 STRK
   ```

2. **测试完整部署流程**
   - 启动后端服务器和前端
   - 使用 Google OAuth 登录
   - 生成 ZK 证明
   - 调用 deploy 函数

## 下一步计划

### 第一步：充值 STRK
向新部署的 Login 合约充值 STRK 用于支付用户的 gas 费用。

### 第二步：启动服务
```bash
# 同时启动前端和后端
npm run dev:all

# 或分别启动
npm run server  # 端口 3001
npm run dev     # 端口 5173
```

### 第三步：测试部署
1. 访问 http://localhost:5173
2. 使用 Google 账号登录
3. 生成 ZK 证明
4. 点击部署按钮
5. 验证交易是否成功

### 第四步：问题排查（如有）
- 检查后端服务器日志
- 检查浏览器控制台
- 验证 calldata 长度是否为 ~3013

---

## RPC 配置

### Starknet Sepolia 测试网

```
# Alchemy RPC (推荐)
# v0.7 (用于前端 starknet.js)
https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/OfZA_k9dt4bm8hU_brCcah5wbRx--cf9

# v0.10 (用于 sncast)
https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/OfZA_k9dt4bm8hU_brCcah5wbRx--cf9
```

## sncast 使用指南

### 1. 查看账户列表

```bash
sncast account list
```

### 2. 声明合约

```bash
# 声明 Login 合约
sncast --account new_account declare \
  --url "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/OfZA_k9dt4bm8hU_brCcah5wbRx--cf9" \
  --contract-name Login

# 声明 Account 合约
sncast --account new_account declare \
  --url "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/OfZA_k9dt4bm8hU_brCcah5wbRx--cf9" \
  --contract-name Account
```

### 3. 部署合约

```bash
# 部署 Login 合约
sncast --account new_account deploy \
  --url "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/OfZA_k9dt4bm8hU_brCcah5wbRx--cf9" \
  --class-hash <LOGIN_CLASS_HASH> \
  --constructor-calldata <ACCOUNT_CLASS_HASH> <ORACLE_ADDRESS>
```

## 重要 Class Hash

### Sepolia 测试网

| 合约 | Class Hash |
|------|------------|
| ECIP_OPS (Garaga) | `0x7918f484291eb154e13d0e43ba6403e62dc1f5fbb3a191d868e2e37359f8713` |
| Groth16VerifierBN254 | `0x50e8a12221896d07dc4c715c5aa435564de596721afe5415bfdf52c3b3091e7` |
| Account | `0x044fc86b59b7f0e7344d6d927a164d9cb8164047689370ad9ec2e791d7c4c542` |
| Login | `0x73c677f3def566034751d08b039b9888546b1d3bf69fa79007ff0ec1b7ebaf4` |

## 合约地址

### Sepolia 测试网

| 合约 | 地址 |
|------|------|
| Login | `0x01d1e9c2cff00f2fa06cb98b1d0ac29c3966454d0d3f808e79aa96c281f77956` |
| Oracle | `0x0084b8a600e0076a6fda30ce9ba4d93ba8e152239b88308cac3f80bbbc4ca3cc` |

## 注意事项

1. **sncast 版本**: 需要 v0.55.0 或更高版本
2. **RPC 版本**: sncast 需要 RPC v0.10，前端 starknet.js 使用 v0.7
3. **Gas 费用**: 声明大型合约（如 UniversalECIP）需要约 50 STRK
