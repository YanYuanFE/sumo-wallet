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
import { formatEtherFixed } from "@/utils/units";
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
import { useAccountOps } from "@/hooks/useAccountOps";

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
  const {
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
  } = useAccountOps({
    account,
    jwt,
    jwtToken,
    zkProof,
    maxBlock,
    onLogout,
    onDeploySuccess,
  });

  return (
    <>
      <Card className="w-full">
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
