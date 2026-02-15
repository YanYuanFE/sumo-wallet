import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { SmartAccount, GoogleJWT } from "@/types";
import { parseEther } from "@/utils/units";
import {
  isSumoUser,
  deploySumoAccount,
  getAccountBalance,
  checkGaragaApiHealth,
  getGaragaApiUrl,
  provider,
  sendSTRK,
  loginToUpdateKey,
  getUserDebt,
  repayDebt,
} from "@/services/starknetService";

interface UseAccountOpsParams {
  account: SmartAccount;
  jwt: GoogleJWT | null;
  jwtToken: string | null;
  zkProof: any;
  maxBlock: number;
  onLogout: () => void;
  onDeploySuccess?: () => void;
}

export function useAccountOps({
  account,
  jwt,
  jwtToken,
  zkProof,
  maxBlock,
  onLogout,
  onDeploySuccess,
}: UseAccountOpsParams) {
  const [copied, setCopied] = useState<string | null>(null);
  const [isDeployed, setIsDeployed] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingKey, setIsUpdatingKey] = useState(false);
  const [isRepayingDebt, setIsRepayingDebt] = useState(false);
  const [balance, setBalance] = useState("0");
  const [debt, setDebt] = useState("0");
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const isExpired = account.sessionKey.expiresAt < Date.now();

  // Auto-logout when session expires
  useEffect(() => {
    if (isExpired) {
      toast.error("Session expired. Please log in again.");
      onLogout();
      return;
    }

    const timeUntilExpiry = account.sessionKey.expiresAt - Date.now();
    if (timeUntilExpiry > 0) {
      const timer = setTimeout(() => {
        toast.error("Session expired. Please log in again.");
        onLogout();
      }, timeUntilExpiry);
      return () => clearTimeout(timer);
    }
  }, [account.sessionKey.expiresAt, isExpired, onLogout]);

  // Track deploy polling interval for cleanup
  const deployIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up deploy polling on unmount
  useEffect(() => {
    return () => {
      if (deployIntervalRef.current) {
        clearInterval(deployIntervalRef.current);
      }
    };
  }, []);

  // Check if account is deployed
  useEffect(() => {
    const checkDeployment = async () => {
      setIsChecking(true);
      try {
        const deployed = await isSumoUser(account.address);
        setIsDeployed(deployed);

        const bal = await getAccountBalance(account.address);
        setBalance(bal);

        if (deployed) {
          const userDebt = await getUserDebt(account.address);
          setDebt(userDebt);
        }
      } catch (error) {
        console.error("[useAccountOps] Check deployment failed:", error);
        setIsDeployed(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkDeployment();
  }, [account.address]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Copied to clipboard");
  };

  const handleDeploy = async () => {
    if (!zkProof) {
      toast.error("ZK Proof required for deployment");
      return;
    }

    if (!jwt || !jwtToken) {
      toast.error("JWT information required for deployment");
      return;
    }

    setIsDeploying(true);
    setShowDeployDialog(false);

    try {
      const apiHealthy = await checkGaragaApiHealth();

      if (!apiHealthy) {
        toast.error(
          `Garaga API 服务未响应。请运行: npm run server\n\nAPI 地址: ${getGaragaApiUrl()}`,
          { duration: 8000 },
        );
        setIsDeploying(false);
        return;
      }

      try {
        const currentBlock = await provider.getBlockNumber();
        if (currentBlock >= maxBlock) {
          toast.error(
            `ZK 证明已过期！\n\n当前区块: ${currentBlock}\n证明有效期至: ${maxBlock}\n\n请重新生成 ZK 证明。`,
            { duration: 8000 },
          );
          setIsDeploying(false);
          return;
        }

        const blocksRemaining = maxBlock - currentBlock;
        if (blocksRemaining < 50) {
          toast.warning(`ZK 证明即将过期，剩余 ${blocksRemaining} 个区块。请尽快完成部署。`);
        }
      } catch (error) {
        console.warn("[handleDeploy] Could not check block number:", error);
      }

      const proofData = zkProof?.fullProof || zkProof;

      const txHash = await deploySumoAccount(
        jwt,
        jwtToken,
        account.sessionKey,
        maxBlock,
        proofData,
      );

      toast.success("Deployment transaction submitted!", {
        description: `Transaction hash: ${txHash.slice(0, 20)}...`,
      });

      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts++;
        const deployed = await isSumoUser(account.address);
        if (deployed) {
          clearInterval(checkInterval);
          deployIntervalRef.current = null;
          setIsDeployed(true);
          setIsDeploying(false);
          toast.success("Account deployed successfully!");
          onDeploySuccess?.();
        } else if (attempts > 30) {
          clearInterval(checkInterval);
          deployIntervalRef.current = null;
          setIsDeploying(false);
          toast.error("Deployment status check timeout");
        }
      }, 5000);
      deployIntervalRef.current = checkInterval;
    } catch (error) {
      console.error("Deploy failed:", error);
      setIsDeploying(false);
      toast.error("Deployment failed: " + (error as Error).message);
    }
  };

  const handleSend = async () => {
    if (!recipient || !amount) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!jwt || !jwtToken) {
      toast.error("JWT information required for sending");
      return;
    }

    if (!recipient.startsWith("0x") || recipient.length < 10) {
      toast.error("Invalid recipient address");
      return;
    }

    let amountWei: bigint;
    try {
      amountWei = parseEther(amount);
    } catch {
      toast.error("Invalid amount");
      return;
    }

    if (amountWei <= BigInt(0)) {
      toast.error("Invalid amount");
      return;
    }

    if (amountWei > BigInt(balance)) {
      toast.error("Insufficient balance");
      return;
    }

    setIsSending(true);

    try {
      const txHash = await sendSTRK(
        jwt,
        jwtToken,
        account.sessionKey,
        recipient,
        amountWei.toString(),
      );

      toast.success("Transfer submitted!", {
        description: `TX: ${txHash.slice(0, 20)}...`,
      });

      setShowSendDialog(false);
      setRecipient("");
      setAmount("");

      setTimeout(async () => {
        const newBalance = await getAccountBalance(account.address);
        setBalance(newBalance);
      }, 5000);
    } catch (error) {
      console.error("[handleSend] Transfer failed:", error);
      toast.error("Transfer failed: " + (error as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateKey = async () => {
    if (!jwt || !jwtToken) {
      toast.error("JWT information required");
      return;
    }

    if (!zkProof) {
      toast.error("ZK Proof required to update key");
      return;
    }

    setIsUpdatingKey(true);

    try {
      const apiHealthy = await checkGaragaApiHealth();
      if (!apiHealthy) {
        toast.error(`Garaga API not responding. Run: npm run server`);
        setIsUpdatingKey(false);
        return;
      }

      const proofData = zkProof?.fullProof || zkProof;

      const txHash = await loginToUpdateKey(
        jwt,
        jwtToken,
        account.sessionKey,
        maxBlock,
        proofData,
      );

      toast.success("Key update submitted!", {
        description: `TX: ${txHash.slice(0, 20)}...`,
      });

      toast.info("Waiting for confirmation...");
    } catch (error) {
      console.error("[handleUpdateKey] Update failed:", error);
      toast.error("Key update failed: " + (error as Error).message);
    } finally {
      setIsUpdatingKey(false);
    }
  };

  const handleRepayDebt = async () => {
    if (!jwt || !jwtToken) {
      toast.error("JWT information required");
      return;
    }

    if (debt === "0" || BigInt(debt) === BigInt(0)) {
      toast.info("No debt to repay");
      return;
    }

    if (BigInt(balance) < BigInt(debt)) {
      toast.error("Insufficient balance to repay debt");
      return;
    }

    setIsRepayingDebt(true);

    try {
      const txHash = await repayDebt(
        jwt,
        jwtToken,
        account.sessionKey,
        debt,
      );

      toast.success("Debt repayment submitted!", {
        description: `TX: ${txHash.slice(0, 20)}...`,
      });

      setTimeout(async () => {
        const newBalance = await getAccountBalance(account.address);
        setBalance(newBalance);
        const newDebt = await getUserDebt(account.address);
        setDebt(newDebt);
      }, 5000);
    } catch (error) {
      console.error("[handleRepayDebt] Repay failed:", error);
      toast.error("Debt repayment failed: " + (error as Error).message);
    } finally {
      setIsRepayingDebt(false);
    }
  };

  const openStarkScan = () => {
    window.open(
      `https://sepolia.starkscan.co/contract/${account.address}`,
      "_blank",
    );
  };

  return {
    copied,
    isDeployed,
    isChecking,
    isDeploying,
    isSending,
    isUpdatingKey,
    isRepayingDebt,
    balance,
    debt,
    showDeployDialog,
    setShowDeployDialog,
    showSendDialog,
    setShowSendDialog,
    recipient,
    setRecipient,
    amount,
    setAmount,
    isExpired,
    copyToClipboard,
    handleDeploy,
    handleSend,
    handleUpdateKey,
    handleRepayDebt,
    openStarkScan,
  };
}