import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { SmartAccount, Transaction } from '@/types';
import { signTransaction } from '@/utils/crypto';
import { Send, ArrowRightLeft, CheckCircle, Loader2 } from 'lucide-react';

interface TransactionDemoProps {
  account: SmartAccount;
}

export function TransactionDemo({ account }: TransactionDemoProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>(account.transactions || []);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);

  const handleTransfer = async () => {
    if (!recipient || !amount) return;
    
    setLoading(true);
    
    // Create transaction
    const tx: Transaction = {
      id: '0x' + Math.random().toString(16).slice(2, 34),
      type: 'transfer',
      to: recipient,
      amount,
      token: 'ETH',
      timestamp: Date.now(),
      status: 'pending',
    };
    
    // Sign transaction with session key
    tx.signature = await signTransaction(tx, account.sessionKey.privateKey);
    
    // Simulate transaction processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    tx.status = 'confirmed';
    setLastTx(tx);
    setTransactions([tx, ...transactions]);
    setLoading(false);
    setRecipient('');
    setAmount('');
  };

  const handleSwap = async () => {
    setLoading(true);
    
    const tx: Transaction = {
      id: '0x' + Math.random().toString(16).slice(2, 34),
      type: 'swap',
      to: '0xUniswapV2...',
      amount: '1.0',
      token: 'ETH → USDC',
      timestamp: Date.now(),
      status: 'pending',
    };
    
    tx.signature = await signTransaction(tx, account.sessionKey.privateKey);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    tx.status = 'confirmed';
    setLastTx(tx);
    setTransactions([tx, ...transactions]);
    setLoading(false);
  };

  return (
    <Card className="w-full max-w-md mx-auto mt-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-green-500" />
          Transaction Demo
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Transfer Form */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="recipient">Recipient Address</Label>
            <Input
              id="recipient"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="amount">Amount (ETH)</Label>
            <Input
              id="amount"
              type="number"
              step="0.001"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          
          <Button
            className="w-full"
            onClick={handleTransfer}
            disabled={loading || !recipient || !amount}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Sign & Send
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="pt-4 border-t">
          <p className="text-sm text-gray-500 mb-2">Quick Actions</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSwap}
              disabled={loading}
            >
              Swap ETH → USDC
            </Button>
          </div>
        </div>

        {/* Last Transaction */}
        {lastTx && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700 mb-2">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Transaction Confirmed!</span>
            </div>
            <div className="space-y-1 text-sm">
              <p><span className="text-gray-500">Type:</span> {lastTx.type}</p>
              <p><span className="text-gray-500">To:</span> {lastTx.to.slice(0, 20)}...</p>
              <p><span className="text-gray-500">Amount:</span> {lastTx.amount} {lastTx.token}</p>
              <p className="font-mono text-xs break-all">
                <span className="text-gray-500">Signature:</span> {lastTx.signature?.slice(0, 30)}...
              </p>
            </div>
          </div>
        )}

        {/* Transaction History */}
        {transactions.length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm text-gray-500 mb-2">Recent Transactions</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {transactions.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={tx.type === 'transfer' ? 'default' : 'secondary'}>
                      {tx.type}
                    </Badge>
                    <span className="text-gray-600">{tx.amount} {tx.token}</span>
                  </div>
                  <Badge variant={tx.status === 'confirmed' ? 'outline' : 'secondary'}>
                    {tx.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
