import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster, toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import { LoginWizard } from "@/components/LoginWizard";
import { WalletPanel } from "@/components/WalletPanel";

import { useAuthFlow, GOOGLE_CLIENT_ID } from "@/hooks/useAuthFlow";

import {
  Shield,
  Cpu,
  Github,
  RefreshCw,
  LogOut,
} from "lucide-react";

function AppContent() {
  const {
    flow,
    googleToken,
    decodedJWT,
    sessionKey,
    zkProof,
    account,
    maxBlock,
    handleGoogleSuccess,
    handleZKProofGenerated,
    handleLogout,
    handleReset,
  } = useAuthFlow();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">SUMO Login</h1>
              <p className="text-[11px] text-muted-foreground">ZK Authentication on Starknet</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {account && decodedJWT ? (
              <>
                <Avatar className="size-7">
                  <AvatarImage src={decodedJWT.picture} alt={decodedJWT.name} />
                  <AvatarFallback className="text-xs">{decodedJWT.name?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground hidden sm:inline">{decodedJWT.email}</span>
                <Button variant="ghost" size="icon" className="size-8" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <Badge variant="outline" className="hidden sm:flex items-center gap-1 text-xs">
                  <Cpu className="w-3 h-3" />
                  snarkjs + Poseidon
                </Badge>
                <a
                  href="https://github.com/fatlabsxyz/sumo-login-cairo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Github className="w-4 h-4" />
                  <span className="hidden sm:inline">GitHub</span>
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {account ? (
          /* Post-login dashboard */
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  Welcome{decodedJWT?.given_name ? `, ${decodedJWT.given_name}` : ''}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Your ZK-authenticated wallet on Starknet Sepolia
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Start Over
              </Button>
            </div>

            <WalletPanel
              account={account}
              jwt={decodedJWT}
              jwtToken={googleToken}
              zkProof={zkProof}
              maxBlock={maxBlock}
              onLogout={handleLogout}
              onDeploySuccess={() => toast.success('Account deployed on Starknet!')}
            />
          </div>
        ) : (
          /* Login wizard */
          <div className="flex items-center justify-center min-h-[60vh]">
            <LoginWizard
              flow={flow}
              decodedJWT={decodedJWT}
              googleToken={googleToken}
              sessionKey={sessionKey}
              maxBlock={maxBlock}
              onGoogleSuccess={handleGoogleSuccess}
              onZKProofGenerated={handleZKProofGenerated}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-6xl mx-auto px-4 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Based on{" "}
              <a
                href="https://github.com/fatlabsxyz/sumo-login-cairo"
                className="text-blue-600 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                sumo-login-cairo
              </a>{" "}
              by Fat Labs
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>snarkjs</span>
              <span>·</span>
              <span>Groth16</span>
              <span>·</span>
              <span>Poseidon</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  );
}

export default App;
