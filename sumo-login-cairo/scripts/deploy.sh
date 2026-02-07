#!/bin/bash
# SUMO Login 合约部署脚本
# 使用方法: ./deploy.sh

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== SUMO Login 合约部署 ===${NC}"

# 检查环境
if ! command -v sncast &> /dev/null; then
    echo -e "${RED}错误: sncast 未安装${NC}"
    exit 1
fi

# 配置
NETWORK="sepolia"
RPC_URL="https://starknet-sepolia.public.blastapi.io/rpc/v0_7"

# 检查账户
echo -e "${YELLOW}请确保已配置部署账户...${NC}"
echo "如果没有账户，请先运行:"
echo "  sncast account create --name deployer --network $NETWORK"
echo "  然后为账户充值 STRK/ETH"
echo ""
read -p "按 Enter 继续部署，或 Ctrl+C 取消..."

# 编译合约
echo -e "${GREEN}[1/6] 编译合约...${NC}"
scarb build

echo -e "${GREEN}[2/6] 声明 Account 合约...${NC}"
ACCOUNT_DECLARE=$(sncast --profile $NETWORK declare \
    --contract-name Account \
    2>&1) || true
echo "$ACCOUNT_DECLARE"

# 提取 class hash
ACCOUNT_CLASS_HASH=$(echo "$ACCOUNT_DECLARE" | grep "class_hash:" | awk '{print $2}')
if [ -z "$ACCOUNT_CLASS_HASH" ]; then
    echo -e "${YELLOW}Account 可能已声明，请手动输入 class hash:${NC}"
    read -p "Account class hash: " ACCOUNT_CLASS_HASH
fi
echo -e "Account class hash: ${GREEN}$ACCOUNT_CLASS_HASH${NC}"

echo -e "${GREEN}[3/6] 声明 Groth16Verifier 合约...${NC}"
VERIFIER_DECLARE=$(sncast --profile $NETWORK declare \
    --contract-name Groth16VerifierBN254 \
    2>&1) || true
echo "$VERIFIER_DECLARE"

VERIFIER_CLASS_HASH=$(echo "$VERIFIER_DECLARE" | grep "class_hash:" | awk '{print $2}')
if [ -z "$VERIFIER_CLASS_HASH" ]; then
    echo -e "${YELLOW}Verifier 可能已声明，请手动输入 class hash:${NC}"
    read -p "Verifier class hash: " VERIFIER_CLASS_HASH
fi
echo -e "Verifier class hash: ${GREEN}$VERIFIER_CLASS_HASH${NC}"

echo -e "${GREEN}[4/6] 声明 Oracle 合约...${NC}"
ORACLE_DECLARE=$(sncast --profile $NETWORK declare \
    --contract-name OracleContract \
    2>&1) || true
echo "$ORACLE_DECLARE"

echo -e "${GREEN}[5/6] 声明 Login 合约...${NC}"
LOGIN_DECLARE=$(sncast --profile $NETWORK declare \
    --contract-name Login \
    2>&1) || true
echo "$LOGIN_DECLARE"

LOGIN_CLASS_HASH=$(echo "$LOGIN_DECLARE" | grep "class_hash:" | awk '{print $2}')
if [ -z "$LOGIN_CLASS_HASH" ]; then
    echo -e "${YELLOW}Login 可能已声明，请手动输入 class hash:${NC}"
    read -p "Login class hash: " LOGIN_CLASS_HASH
fi

echo ""
echo -e "${GREEN}[6/6] 部署 Login 合约...${NC}"
echo -e "${YELLOW}请输入 admin public key (felt252):${NC}"
read -p "Admin public key: " ADMIN_PUBLIC_KEY

echo "部署参数:"
echo "  - Account class hash: $ACCOUNT_CLASS_HASH"
echo "  - Admin public key: $ADMIN_PUBLIC_KEY"

LOGIN_DEPLOY=$(sncast --profile $NETWORK deploy \
    --class-hash $LOGIN_CLASS_HASH \
    --constructor-calldata $ACCOUNT_CLASS_HASH $ADMIN_PUBLIC_KEY \
    2>&1)
echo "$LOGIN_DEPLOY"

LOGIN_ADDRESS=$(echo "$LOGIN_DEPLOY" | grep "contract_address:" | awk '{print $2}')

echo ""
echo -e "${GREEN}=== 部署完成 ===${NC}"
echo -e "Login 合约地址: ${GREEN}$LOGIN_ADDRESS${NC}"
echo -e "Account class hash: ${GREEN}$ACCOUNT_CLASS_HASH${NC}"
echo -e "Verifier class hash: ${GREEN}$VERIFIER_CLASS_HASH${NC}"
echo ""
echo -e "${YELLOW}请更新前端配置 src/services/starknetService.ts:${NC}"
echo "  SUMO_LOGIN_CONTRACT_ADDRESS = \"$LOGIN_ADDRESS\""
echo "  SUMO_ACCOUNT_CLASS_HASH = \"$ACCOUNT_CLASS_HASH\""
