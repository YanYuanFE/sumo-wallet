import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SmartAccount, GoogleJWT } from "@/types";
import { formatAddress, formatTime } from "@/utils/crypto";
import { parseEther, formatEtherFixed } from "@/utils/units";
import {
  Wallet,
  Key,
  Clock,
  LogOut,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  Rocket,
  Send,
  RefreshCw,
  Shield,
} from "lucide-react";
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
import { toast } from "sonner";

interface WalletPanelProps {
  account: SmartAccount;
  jwt: GoogleJWT | null;
  jwtToken: string | null;
  zkProof: any;
  maxBlock: number;  // Must match the maxBlock used for ZK proof generation
  onLogout: () => void;
  onDeploySuccess?: () => void;
}

export function WalletPanel({
  account,
  jwt,
  jwtToken,
  zkProof,
  maxBlock,
  onLogout,
  onDeploySuccess,
}: WalletPanelProps) {
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

    // Set timer to auto-logout when session expires
    const timeUntilExpiry = account.sessionKey.expiresAt - Date.now();
    if (timeUntilExpiry > 0) {
      const timer = setTimeout(() => {
        toast.error("Session expired. Please log in again.");
        onLogout();
      }, timeUntilExpiry);
      return () => clearTimeout(timer);
    }
  }, [account.sessionKey.expiresAt, isExpired, onLogout]);

  // Check if account is deployed
  useEffect(() => {
    checkDeployment();
  }, [account.address]);

  const checkDeployment = async () => {
    setIsChecking(true);
    try {
      console.log("[WalletPanel] Checking deployment for:", account.address);
      const deployed = await isSumoUser(account.address);
      console.log("[WalletPanel] Deployed:", deployed);
      setIsDeployed(deployed);

      // Always get balance regardless of deployment status
      console.log("[WalletPanel] Getting balance for:", account.address);
      const bal = await getAccountBalance(account.address);
      console.log("[WalletPanel] Balance:", bal);
      setBalance(bal);

      // Get debt if deployed
      if (deployed) {
        const userDebt = await getUserDebt(account.address);
        console.log("[WalletPanel] Debt:", userDebt);
        setDebt(userDebt);
      }
    } catch (error) {
      console.error("[WalletPanel] Check deployment failed:", error);
      setIsDeployed(false);
    } finally {
      setIsChecking(false);
    }
  };

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
      // Pre-flight check: Garaga API health
      console.log('[handleDeploy] Checking Garaga API health...');
      const apiHealthy = await checkGaragaApiHealth();

      if (!apiHealthy) {
        toast.error(
          `Garaga API 服务未响应。请运行: npm run server\n\nAPI 地址: ${getGaragaApiUrl()}`,
          { duration: 8000 }
        );
        setIsDeploying(false);
        return;
      }

      console.log('[handleDeploy] Garaga API is healthy ✅');

      // Pre-flight check: Proof expiration
      console.log('[handleDeploy] Checking proof expiration...');
      try {
        const currentBlock = await provider.getBlockNumber();
        console.log('[handleDeploy] Current block:', currentBlock, 'maxBlock:', maxBlock);

        if (currentBlock >= maxBlock) {
          toast.error(
            `ZK 证明已过期！\n\n当前区块: ${currentBlock}\n证明有效期至: ${maxBlock}\n\n请重新生成 ZK 证明。`,
            { duration: 8000 }
          );
          setIsDeploying(false);
          return;
        }

        const blocksRemaining = maxBlock - currentBlock;
        console.log('[handleDeploy] Blocks remaining until expiration:', blocksRemaining);

        if (blocksRemaining < 50) {
          toast.warning(`ZK 证明即将过期，剩余 ${blocksRemaining} 个区块。请尽快完成部署。`);
        }
      } catch (error) {
        console.warn('[handleDeploy] Could not check block number:', error);
      }

      console.log("[handleDeploy] Starting deployment...");
      console.log("[handleDeploy] zkProof:", zkProof);
      console.log("[handleDeploy] zkProof.fullProof:", zkProof?.fullProof);
      console.log("[handleDeploy] Using maxBlock from props:", maxBlock);

      // Pass fullProof object if available, otherwise pass the zkProof itself
      // deploySumoAccount expects SnarkJSProof | bigint[]
      const proofData = zkProof?.fullProof || zkProof;
      console.log("[handleDeploy] Proof data type:", typeof proofData);
      console.log("[handleDeploy] Has proof.proof:", !!proofData?.proof);

      const txHash = await deploySumoAccount(
        jwt,
        jwtToken,
        account.sessionKey,
        maxBlock,  // Use the maxBlock from props (same as ZK proof generation)
        proofData,
      );

      toast.success("Deployment transaction submitted!", {
        description: `Transaction hash: ${txHash.slice(0, 20)}...`,
      });

      // Wait for deployment to complete
      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts++;
        const deployed = await isSumoUser(account.address);
        if (deployed) {
          clearInterval(checkInterval);
          setIsDeployed(true);
          setIsDeploying(false);
          toast.success("Account deployed successfully!");
          onDeploySuccess?.();
        } else if (attempts > 30) {
          clearInterval(checkInterval);
          setIsDeploying(false);
          toast.error("Deployment status check timeout");
        }
      }, 5000);
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

    // Validate recipient address
    if (!recipient.startsWith("0x") || recipient.length < 10) {
      toast.error("Invalid recipient address");
      return;
    }

    // Validate amount and convert to wei (BigInt)
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

    // Check balance (BigInt)
    if (amountWei > BigInt(balance)) {
      toast.error("Insufficient balance");
      return;
    }

    setIsSending(true);

    try {
      console.log("[handleSend] Sending", amount, "STRK to", recipient);
      console.log("[handleSend] Amount in wei:", amountWei.toString());

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

      // Refresh balance after a delay
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

      console.log("[handleUpdateKey] Updating session key in contract...");

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

      // Wait for transaction to be confirmed
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

    // Check if balance is sufficient
    if (BigInt(balance) < BigInt(debt)) {
      toast.error("Insufficient balance to repay debt");
      return;
    }

    setIsRepayingDebt(true);

    try {
      console.log("[handleRepayDebt] Repaying debt:", debt);

      const txHash = await repayDebt(
        jwt,
        jwtToken,
        account.sessionKey,
        debt,
      );

      toast.success("Debt repayment submitted!", {
        description: `TX: ${txHash.slice(0, 20)}...`,
      });

      // Refresh balance and debt after a delay
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

  return (
    <>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Sumo Wallet</CardTitle>
                <p className="text-xs text-gray-500">Sepolia Testnet</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isChecking ? (
                <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
              ) : isDeployed ? (
                <Badge variant="default" className="bg-green-500">
                  <Shield className="w-3 h-3 mr-1" />
                  Deployed
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Not Deployed
                </Badge>
              )}
              <Badge variant={isExpired ? "destructive" : "outline"}>
                {isExpired ? "Expired" : "Active"}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Balance Section */}
          <div className="text-center py-6 bg-gradient-to-b from-blue-50 to-white rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Total Balance</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-bold text-gray-800">
                {formatEtherFixed(balance, 4)}
              </span>
              <span className="text-lg text-gray-500">STRK</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">≈ $0.00 USD</p>
          </div>

          {/* Debt Warning Section */}
          {isDeployed && debt !== "0" && BigInt(debt) > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-amber-800">Outstanding Debt</p>
                  <p className="text-lg font-bold text-amber-900">
                    {formatEtherFixed(debt, 6)} STRK
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    还债后才能更新 Session Key
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRepayDebt}
                    disabled={isRepayingDebt}
                    className="flex-1 border-amber-500 text-amber-700 hover:bg-amber-100"
                  >
                    {isRepayingDebt ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        处理中...
                      </>
                    ) : (
                      "还债"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {!isDeployed ? (
              <Button
                className="w-full col-span-2"
                size="lg"
                onClick={() => setShowDeployDialog(true)}
                disabled={isDeploying || !zkProof}
              >
                {isDeploying ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Deploy Account
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setShowSendDialog(true)}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={openStarkScan}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View
                </Button>
                <Button
                  variant="secondary"
                  className="w-full col-span-2"
                  size="sm"
                  onClick={handleUpdateKey}
                  disabled={isUpdatingKey || !zkProof}
                >
                  {isUpdatingKey ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Updating Key...
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4 mr-2" />
                      Update Session Key
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Account Details Tabs */}
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-3 mt-4">
              {/* Account Address */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Account Address</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono">
                    {formatAddress(account.address)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(account.address, "address")}
                  >
                    {copied === "address" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Owner Email */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Owner</label>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                    {account.email[0].toUpperCase()}
                  </div>
                  <span className="text-sm">{account.email}</span>
                </div>
              </div>

              {/* Session Info */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-xs text-gray-500">Created</label>
                  <p className="text-sm">{formatTime(account.createdAt)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Last Login</label>
                  <p className="text-sm">{formatTime(account.lastLogin)}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="security" className="space-y-3 mt-4">
              {/* Session Key */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500 flex items-center gap-1">
                  <Key className="w-3 h-3" />
                  Session Public Key
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono">
                    {formatAddress(account.sessionKey.publicKey)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(account.sessionKey.publicKey, "pk")
                    }
                  >
                    {copied === "pk" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Session Expiry */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Session Expires
                </label>
                <p className="text-sm">
                  {formatTime(account.sessionKey.expiresAt)}
                </p>
              </div>

              {/* ZK Proof Status */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500">ZK Proof</label>
                <Badge variant={zkProof ? "default" : "secondary"}>
                  {zkProof ? "Verified ✓" : "Not Generated"}
                </Badge>
              </div>
            </TabsContent>
          </Tabs>

          {/* Logout Button */}
          <Button variant="outline" className="w-full" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Disconnect
          </Button>
        </CardContent>
      </Card>

      {/* Deploy Dialog */}
      <Dialog open={showDeployDialog} onOpenChange={setShowDeployDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deploy Your Sumo Account</DialogTitle>
            <DialogDescription>
              Your account needs to be deployed on Starknet before you can use
              it. This is a one-time operation that requires a ZK proof.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">
                What happens during deployment?
              </h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>A smart contract wallet is created for you</li>
                <li>Your session key is registered as the signer</li>
                <li>
                  The Login contract pays the gas fee (you'll repay later)
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Account Address</Label>
              <code className="block bg-gray-100 px-3 py-2 rounded text-sm font-mono">
                {account.address}
              </code>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeployDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleDeploy} disabled={!zkProof}>
              <Rocket className="w-4 h-4 mr-2" />
              Deploy Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send STRK</DialogTitle>
            <DialogDescription>
              Send STRK tokens to another address on Starknet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient Address</Label>
              <Input
                id="recipient"
                placeholder="0x..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (STRK)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Available: {formatEtherFixed(balance, 4)} STRK
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSendDialog(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
