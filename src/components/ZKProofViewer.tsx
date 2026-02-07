import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ZKProof, SessionKeyPair } from '@/types';
import { Shield, Key, FileCheck, Cpu } from 'lucide-react';

interface ZKProofViewerProps {
  proof: ZKProof;
  sessionKey: SessionKeyPair;
}

export function ZKProofViewer({ proof, sessionKey }: ZKProofViewerProps) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-500" />
          Zero-Knowledge Proof
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Verification Status */}
        <div className={`p-4 rounded-lg ${proof.verified ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center gap-2">
            <FileCheck className={`w-6 h-6 ${proof.verified ? 'text-green-500' : 'text-red-500'}`} />
            <div>
              <p className={`font-medium ${proof.verified ? 'text-green-700' : 'text-red-700'}`}>
                {proof.verified ? 'Proof Verified' : 'Verification Failed'}
              </p>
              <p className="text-sm text-gray-600">
                {proof.verified 
                  ? 'Identity proven without revealing JWT on-chain' 
                  : 'Proof validation failed'}
              </p>
            </div>
          </div>
        </div>

        {/* Proof Hash */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            ZK Proof Hash
          </label>
          <code className="block bg-gray-900 text-cyan-400 px-3 py-2 rounded text-xs font-mono break-all">
            {proof.proof}
          </code>
        </div>

        {/* Public Signals */}
        <div className="space-y-2">
          <label className="text-xs text-gray-500">Public Signals</label>
          <div className="space-y-2">
            {proof.publicSignals.map((signal, index) => (
              <div key={index} className="bg-gray-50 p-2 rounded">
                <span className="text-xs text-gray-400">Signal {index + 1}:</span>
                <code className="block text-xs font-mono break-all">{signal}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Session Key Info */}
        <div className="pt-2 border-t space-y-2">
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <Key className="w-3 h-3" />
            Linked Session Key
          </label>
          <div className="bg-blue-50 p-3 rounded">
            <p className="text-xs text-gray-500">Public Key</p>
            <code className="text-xs font-mono break-all">{sessionKey.publicKey}</code>
            <div className="flex gap-4 mt-2 text-xs">
              <div>
                <span className="text-gray-500">Created:</span>{' '}
                {new Date(sessionKey.createdAt).toLocaleTimeString()}
              </div>
              <div>
                <span className="text-gray-500">Expires:</span>{' '}
                {new Date(sessionKey.expiresAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>

        {/* Technical Details */}
        <div className="bg-gray-100 p-3 rounded text-xs text-gray-600">
          <p className="font-medium mb-1">How it works:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>JWT is hashed off-chain</li>
            <li>ZK circuit proves ownership without revealing content</li>
            <li>Proof is verified on-chain (Starknet)</li>
            <li>Session key is authorized for transactions</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
