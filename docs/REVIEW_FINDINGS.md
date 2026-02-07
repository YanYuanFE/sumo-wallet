# Review Findings (Hackathon Demo)

本文档记录当前代码审查中发现的主要问题。项目为黑客松 Demo，可按优先级逐步修复。

## P0（高风险）

1. OAuth code exchange 在前端完成，且包含 `client_secret`，未走 PKCE  
   - 位置：`src/components/GoogleLoginButton.tsx:19`  
   - 风险：泄露 client_secret；公有客户端场景不合规；token 交换可能失败  
   - 建议：将 code exchange 移到服务端，或使用纯 PKCE（前端不含 client_secret，传 `code_verifier`）

2. 私钥/JWT/token 持久化到 `localStorage`  
   - 位置：`src/utils/storage.ts:48`  
   - 风险：XSS 或共享设备直接泄露，可能重放交易  
   - 建议：只缓存公开信息；私钥/JWT 仅存内存或服务端 httpOnly cookie

## P1（中风险）

1. JWT 与 token 来源不一致导致证明输入不一致  
   - 位置：`src/App.tsx:128`  
   - 风险：`jwt` 来自 `userinfo`，`jwtToken` 可能是 `id_token` 或 `access_token`，非 JWT 时解析失败；证明/地址种子不一致  
   - 建议：统一使用真实 `id_token` 并解析 claims，拒绝非 JWT 的 token

2. 会话私钥被打印到控制台  
   - 位置：`src/utils/crypto.ts:40`  
   - 风险：控制台/日志采集泄露私钥  
   - 建议：移除私钥日志或仅在严格本地调试开关下启用

3. 转账流程仍打印私钥片段  
   - 位置：`src/services/starknetService.ts:1338`  
   - 风险：敏感信息泄露  
   - 建议：移除所有私钥相关日志
