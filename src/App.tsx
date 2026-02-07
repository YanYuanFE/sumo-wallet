import { useState, useEffect, useCallback } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster, toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { FlowStepper } from "@/components/FlowStepper";
import { WalletPanel } from "@/components/WalletPanel";
import { JWTViewer } from "@/components/JWTViewer";
import { ZKProofGenerator } from "@/components/ZKProofGenerator";

import type {
  GoogleJWT,
  SmartAccount,
  SessionKeyPair,
  ZKProof,
  LoginFlow,
} from "@/types";
import {
  generateSessionKeyPair,
  generateNonce,
} from "@/utils/crypto";
import { getSumoAccountAddress } from "@/services/starknetService";
import { saveAccount, getCurrentAccount, clearStorage, saveZKProof, getZKProof, saveJWT, getJWT } from "@/utils/storage";
import { verifyZKProof, type FullZKProof } from "@/services/zkProofService";

import { provider } from "@/config/starknet";
import {
  Shield,
  Zap,
  Github,
  RefreshCw,
  Trash2,
  Cpu,
  CheckCircle,
} from "lucide-react";

const DEFAULT_GOOGLE_CLIENT_ID =
  "481771758710-4d0pn7iag8nlut2l0p5n1lsubt1hei1h.apps.googleusercontent.com";
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;

function AppContent() {
  const [flow, setFlow] = useState<LoginFlow>({
    step: "idle",
    progress: 0,
    message: 'Click "Continue with Google" to start',
  });

  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [decodedJWT, setDecodedJWT] = useState<GoogleJWT | null>(null);
  const [sessionKey, setSessionKey] = useState<SessionKeyPair | null>(null);
  const [zkProof, setZkProof] = useState<
    (ZKProof & { fullProof?: FullZKProof }) | null
  >(null);
  const [proofVerified, setProofVerified] = useState<boolean | null>(null);
  const [account, setAccount] = useState<SmartAccount | null>(null);
  const [maxBlock, setMaxBlock] = useState<number>(0);
  const [nonce] = useState(() =>
    generateNonce("0x" + Math.random().toString(16).slice(2)),
  );

  // Check for existing session on mount
  useEffect(() => {
    const existingAccount = getCurrentAccount();
    if (existingAccount) {
      // Add 5 minute buffer to avoid race condition where session expires
      // between this check and WalletPanel render
      const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
      if (existingAccount.sessionKey.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
        setAccount(existingAccount);

        // Restore ZK Proof and maxBlock from storage
        const savedProofData = getZKProof();
        if (savedProofData) {
          setZkProof(savedProofData.proof);
          if (savedProofData.maxBlock) {
            setMaxBlock(savedProofData.maxBlock);
          }
        }

        // Restore JWT from storage
        const savedJWT = getJWT();
        if (savedJWT) {
          setDecodedJWT(savedJWT.jwt);
          setGoogleToken(savedJWT.jwtToken);
        }

        setFlow({
          step: "complete",
          progress: 100,
          message: "Session restored from storage",
        });
        toast.success("Welcome back! Session restored.");
      } else {
        clearStorage();
      }
    }
  }, []);

  const handleGoogleSuccess = useCallback(
    async (tokenResponse: { access_token: string; id_token?: string }) => {
      try {
        const accessToken = tokenResponse.access_token;
        const idToken = tokenResponse.id_token;

        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!userInfoResponse.ok) {
          throw new Error("Failed to fetch user info");
        }

        const userInfo = await userInfoResponse.json();

        const mockJWT: GoogleJWT = {
          iss: "https://accounts.google.com",
          azp: GOOGLE_CLIENT_ID,
          aud: GOOGLE_CLIENT_ID,
          sub: userInfo.sub,
          email: userInfo.email,
          email_verified: userInfo.email_verified,
          name: userInfo.name,
          picture: userInfo.picture,
          given_name: userInfo.given_name,
          family_name: userInfo.family_name,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          nonce,
        };

        // Use id_token (JWT) for deployment if available, otherwise fall back to access_token
        const tokenForDeployment = idToken || accessToken;
        setGoogleToken(tokenForDeployment);
        setDecodedJWT(mockJWT);
        
        // Save JWT to storage for persistence
        saveJWT(mockJWT, tokenForDeployment);

        setFlow({
          step: "jwt",
          progress: 20,
          message: "JWT received and decoded",
        });

        toast.success("Google authentication successful!");

        setTimeout(() => {
          handleSessionKeyGeneration();
        }, 800);
      } catch (error) {
        console.error("Auth error:", error);
        toast.error("Authentication failed. Please try again.");
      }
    },
    [nonce],
  );

  const handleSessionKeyGeneration = useCallback(async () => {
    setFlow({
      step: "session",
      progress: 40,
      message: "Generating ephemeral session keys...",
    });

    const keyPair = generateSessionKeyPair();
    setSessionKey(keyPair);

    // Get current block number for maxBlock
    // Use a very large buffer for testing (100000 blocks ≈ 2-5 days on Starknet)
    // Starknet produces blocks every 2-6 seconds, so:
    // - 1 hour ≈ 600-1800 blocks
    // - 1 day ≈ 14,400-43,200 blocks
    // - 100,000 blocks ≈ 2-7 days
    try {
      const currentBlock = await provider.getBlockNumber();
      const blockBuffer = 100000; // ~2-7 days buffer
      setMaxBlock(currentBlock + blockBuffer);
      console.log("[handleSessionKeyGeneration] Current block:", currentBlock);
      console.log("[handleSessionKeyGeneration] maxBlock set to:", currentBlock + blockBuffer);
      console.log("[handleSessionKeyGeneration] Estimated expiry: ~2-7 days from now");
    } catch (error) {
      console.error("Failed to get block number:", error);
      // Use a very high fallback value
      setMaxBlock(10000000);
    }

    toast.success("Session keys generated!");

    setFlow({
      step: "zkproof",
      progress: 60,
      message: "Ready to generate ZK proof",
    });
  }, []);

  const handleZKProofGenerated = useCallback(
    async (proof: ZKProof & { fullProof?: FullZKProof }) => {
      setZkProof(proof);

      // Save ZK Proof and maxBlock to storage
      saveZKProof(proof, maxBlock);

      setFlow({
        step: "zkproof",
        progress: 80,
        message: "Verifying ZK proof...",
      });

      try {
        const isValid = await verifyZKProof(proof);
        setProofVerified(isValid);

        if (isValid && decodedJWT && sessionKey) {
          toast.success("ZK Proof verified!");
          handleAccountCreation(decodedJWT, sessionKey);
        } else {
          toast.error("ZK Proof verification failed");
        }
      } catch {
        toast.error("Proof verification error");
      }
    },
    [decodedJWT, sessionKey, maxBlock],
  );

  const handleAccountCreation = useCallback(
    async (jwt: GoogleJWT, keyPair: SessionKeyPair) => {
      setFlow({
        step: "account",
        progress: 90,
        message: "Deploying smart account...",
      });

      try {
        // Debug: Log JWT data used for address calculation
        console.log("[handleAccountCreation] JWT sub:", jwt.sub);
        console.log("[handleAccountCreation] JWT email:", jwt.email);

        // Use getSumoAccountAddress which computes address_seed using Poseidon hash
        // This ensures consistency with the ZK proof and Cairo contract
        if (!googleToken) {
          throw new Error("JWT token required for address calculation");
        }
        const address = await getSumoAccountAddress(jwt, googleToken);
        console.log("[handleAccountCreation] Computed address:", address);

        const newAccount: SmartAccount = {
          address,
          owner: jwt.sub,
          email: jwt.email,
          sessionKey: keyPair,
          createdAt: Date.now(),
          lastLogin: Date.now(),
          transactions: [],
        };

        saveAccount(newAccount);
        setAccount(newAccount);

        setFlow({
          step: "complete",
          progress: 100,
          message: "Smart account ready!",
        });

        toast.success("Smart account deployed successfully!");
      } catch (error) {
        console.error("[handleAccountCreation] Error:", error);
        toast.error("Account creation failed");
      }
    },
    [googleToken],
  );

  const handleLogout = useCallback(() => {
    clearStorage();
    setAccount(null);
    setGoogleToken(null);
    setDecodedJWT(null);
    setSessionKey(null);
    setZkProof(null);
    setProofVerified(null);
    setFlow({
      step: "idle",
      progress: 0,
      message: 'Click "Continue with Google" to start',
    });
    toast.info("Logged out successfully");
  }, []);

  const handleReset = useCallback(() => {
    handleLogout();
    window.location.reload();
  }, [handleLogout]);

  const isConfigured = GOOGLE_CLIENT_ID !== DEFAULT_GOOGLE_CLIENT_ID;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">SUMO Login</h1>
              <p className="text-xs text-gray-500">
                Real ZK-Proofs with snarkjs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="hidden sm:flex items-center gap-1"
            >
              <Cpu className="w-3 h-3" />
              snarkjs + Poseidon
            </Badge>
            <a
              href="https://github.com/fatlabsxyz/sumo-login-cairo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <Github className="w-4 h-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!isConfigured && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>Demo Mode:</strong> Configure
              <code className="mx-1 px-1 bg-amber-100 rounded">
                VITE_GOOGLE_CLIENT_ID
              </code>
              for real Google auth. ZK proofs use real snarkjs with Poseidon
              hashing.
            </p>
          </div>
        )}

        {/* Hero Section */}
        {!account && (
          <div className="text-center mb-10">
            <h2 className="text-4xl font-bold mb-4">
              Social Login with{" "}
              <span className="text-purple-600">Real ZK-Proofs</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Experience true zero-knowledge authentication. Prove JWT ownership
              without revealing it on-chain using Groth16 proofs.
            </p>

            <div className="flex justify-center gap-6 mt-8">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                <span className="text-sm text-gray-600">No Seed Phrases</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-600">Groth16 ZK</span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-500" />
                <span className="text-sm text-gray-600">snarkjs</span>
              </div>
            </div>
          </div>
        )}

        {/* Flow Stepper */}
        {!account && (
          <div className="max-w-3xl mx-auto mb-8">
            <FlowStepper flow={flow} />
          </div>
        )}

        {/* Main Content */}
        {account ? (
          <div className="max-w-md mx-auto">
            <WalletPanel
              account={account}
              jwt={decodedJWT}
              jwtToken={googleToken}
              zkProof={zkProof}
              maxBlock={maxBlock}
              onLogout={handleLogout}
              onDeploySuccess={() => {
                toast.success('Account deployed on Starknet!');
              }}
            />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <Tabs defaultValue="demo" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">How It Works</TabsTrigger>
                <TabsTrigger value="demo">Live Demo</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Complete ZK Authentication Flow</CardTitle>
                    <CardDescription>
                      Real zero-knowledge proofs using snarkjs and Poseidon
                      hashing
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      {[
                        {
                          step: "1",
                          title: "OAuth Authentication",
                          desc: "User signs in with Google. The OAuth provider returns a cryptographically signed JWT.",
                          tech: "Google OAuth 2.0",
                        },
                        {
                          step: "2",
                          title: "Session Key Generation",
                          desc: "Client generates ephemeral Ed25519 session keys stored locally in the browser.",
                          tech: "Ed25519 Key Pair",
                        },
                        {
                          step: "3",
                          title: "ZK Proof Generation (snarkjs)",
                          desc: "Generate Groth16 proof proving JWT ownership without revealing the token. Uses Poseidon hashing.",
                          tech: "snarkjs + Poseidon",
                        },
                        {
                          step: "4",
                          title: "On-Chain Verification",
                          desc: "The ZK proof is verified on Starknet. If valid, the smart wallet is deployed/accessed.",
                          tech: "Starknet + Cairo",
                        },
                      ].map((item) => (
                        <div
                          key={item.step}
                          className="flex gap-4 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                            {item.step}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{item.title}</h4>
                              <Badge variant="secondary" className="text-xs">
                                {item.tech}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="demo" className="mt-4 space-y-4">
                {flow.step === "idle" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Start Authentication</CardTitle>
                      <CardDescription>
                        Sign in with Google to begin the ZK authentication flow
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <GoogleLoginButton
                        onSuccess={handleGoogleSuccess}
                        onError={() => toast.error("Google login failed")}
                      />
                    </CardContent>
                  </Card>
                )}

                {flow.step !== "idle" &&
                  flow.step !== "complete" &&
                  decodedJWT &&
                  sessionKey && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Authentication in Progress</CardTitle>
                        <CardDescription>{flow.message}</CardDescription>
                      </CardHeader>
                      <CardContent className="text-center py-4">
                        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                      </CardContent>
                    </Card>
                  )}

                {/* JWT Viewer */}
                {decodedJWT && googleToken && (
                  <JWTViewer jwt={decodedJWT} rawToken={googleToken} />
                )}

                {/* ZK Proof Generator */}
                {decodedJWT && sessionKey && flow.step === "zkproof" && (
                  <ZKProofGenerator
                    jwt={decodedJWT}
                    jwtToken={googleToken || ""}
                    sessionKey={sessionKey}
                    maxBlock={maxBlock}
                    onProofGenerated={handleZKProofGenerated}
                  />
                )}

                {/* Proof Status */}
                {zkProof && (
                  <Card
                    className={
                      proofVerified ? "border-green-200" : "border-red-200"
                    }
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        {proofVerified ? (
                          <CheckCircle className="w-6 h-6 text-green-500" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center">
                            !
                          </div>
                        )}
                        <div>
                          <p
                            className={`font-medium ${proofVerified ? "text-green-800" : "text-red-800"}`}
                          >
                            {proofVerified
                              ? "Proof Verified"
                              : "Verification Failed"}
                          </p>
                          <p className="text-sm text-gray-600">
                            {zkProof.fullProof
                              ? `Real snarkjs proof (${zkProof.fullProof.proof.protocol}/${zkProof.fullProof.proof.curve})`
                              : "Simulated proof (circuit files not available)"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Footer Actions */}
        {account && (
          <div className="flex justify-center gap-4 mt-8">
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Start Over
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Data
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
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
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span> snarkjs</span>
              <span>•</span>
              <span>Groth16</span>
              <span>•</span>
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
