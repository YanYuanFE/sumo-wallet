import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SmartAccount } from '@/types';
import { formatAddress, formatTime } from '@/utils/crypto';
import { Wallet, Key, Clock, LogOut, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface AccountCardProps {
  account: SmartAccount;
  onLogout: () => void;
}

export function AccountCard({ account, onLogout }: AccountCardProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = account.sessionKey.expiresAt < Date.now();

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-500" />
            Smart Account
          </CardTitle>
          <Badge variant={isExpired ? 'destructive' : 'default'}>
            {isExpired ? 'Expired' : 'Active'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
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
              onClick={() => copyToClipboard(account.address, 'address')}
            >
              {copied === 'address' ? (
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
              onClick={() => copyToClipboard(account.sessionKey.publicKey, 'pk')}
            >
              {copied === 'pk' ? (
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
          <p className="text-sm">{formatTime(account.sessionKey.expiresAt)}</p>
        </div>

        {/* Account Info */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <label className="text-xs text-gray-500">Created</label>
            <p className="text-sm">{formatTime(account.createdAt)}</p>
          </div>
          <div>
            <label className="text-xs text-gray-500">Last Login</label>
            <p className="text-sm">{formatTime(account.lastLogin)}</p>
          </div>
        </div>

        {/* Logout Button */}
        <Button
          variant="outline"
          className="w-full mt-4"
          onClick={onLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Disconnect
        </Button>
      </CardContent>
    </Card>
  );
}
