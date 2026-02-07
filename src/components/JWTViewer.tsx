import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { GoogleJWT } from '@/types';
import { FileKey, User, Mail, Clock, Shield } from 'lucide-react';

interface JWTViewerProps {
  jwt: GoogleJWT;
  rawToken: string;
}

export function JWTViewer({ jwt, rawToken }: JWTViewerProps) {
  const tokenPreview = rawToken.slice(0, 50) + '...' + rawToken.slice(-20);
  
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileKey className="w-5 h-5 text-purple-500" />
          JWT Token Decoded
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Raw Token Preview */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Raw Token (Preview)</label>
          <code className="block bg-gray-900 text-green-400 px-3 py-2 rounded text-xs font-mono break-all">
            {tokenPreview}
          </code>
        </div>

        {/* User Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {jwt.picture ? (
              <img
                src={jwt.picture}
                alt={jwt.name}
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-bold">
                {jwt.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium">{jwt.name}</p>
              <p className="text-sm text-gray-500">{jwt.given_name} {jwt.family_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 p-3 rounded">
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <Mail className="w-3 h-3" />
                Email
              </label>
              <p className="text-sm font-medium truncate">{jwt.email}</p>
              {jwt.email_verified && (
                <Badge variant="outline" className="text-xs mt-1">Verified</Badge>
              )}
            </div>

            <div className="bg-gray-50 p-3 rounded">
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <User className="w-3 h-3" />
                Subject ID
              </label>
              <p className="text-sm font-mono truncate">{jwt.sub.slice(0, 16)}...</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 p-3 rounded">
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Issued At
              </label>
              <p className="text-sm">{new Date(jwt.iat * 1000).toLocaleString()}</p>
            </div>

            <div className="bg-gray-50 p-3 rounded">
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Expires At
              </label>
              <p className="text-sm">{new Date(jwt.exp * 1000).toLocaleString()}</p>
            </div>
          </div>

          {/* Issuer & Audience */}
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500">Issuer (iss)</label>
              <p className="text-sm font-mono">{jwt.iss}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500">Audience (aud)</label>
              <p className="text-sm font-mono">{jwt.aud}</p>
            </div>
            {jwt.nonce && (
              <div>
                <label className="text-xs text-gray-500">Nonce</label>
                <p className="text-sm font-mono">{jwt.nonce}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
