import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { type FullZKProof } from '@/services/zkProofService';
import type { GoogleJWT, SessionKeyPair, ZKProof } from '@/types';
import {
  Shield,
  Cpu,
  CheckCircle,
  XCircle,
  Loader2,
  FileKey,
  Zap,
  Lock,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  Terminal
} from 'lucide-react';
import { useProofGeneration } from '@/hooks/useProofGeneration';

interface ZKProofGeneratorProps {
  jwt: GoogleJWT;
  jwtToken: string;
  sessionKey: SessionKeyPair;
  maxBlock: number;
  onProofGenerated: (proof: ZKProof & { fullProof?: FullZKProof }) => void;
}

interface StageInfo {
  label: string;
  description: string;
  icon: React.ReactNode;
}

export function ZKProofGenerator({
  jwt,
  jwtToken,
  sessionKey,
  maxBlock,
  onProofGenerated
}: ZKProofGeneratorProps) {
  const {
    stage,
    progress,
    proof,
    identityCommitment,
    sessionAuth,
    showDetails,
    setShowDetails,
    showHowItWorks,
    setShowHowItWorks,
    logs,
    generationTime,
    generateProof,
  } = useProofGeneration({
    jwt,
    jwtToken,
    sessionKey,
    maxBlock,
    onProofGenerated,
  });

  const getStageInfo = (): StageInfo => {
    switch (stage) {
      case 'hashing':
        return {
          label: 'Computing Hashes',
          description: 'Deriving secrets and generating identity commitment...',
          icon: <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        };
      case 'generating':
        return {
          label: 'Generating Proof',
          description: 'Running ZK circuit with snarkjs...',
          icon: <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
        };
      case 'verifying':
        return {
          label: 'Verifying',
          description: 'Checking proof validity...',
          icon: <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
        };
      case 'complete':
        return {
          label: 'Proof Verified',
          description: generationTime ? `Completed in ${generationTime.toFixed(0)}ms` : 'Zero-knowledge proof generated successfully',
          icon: <CheckCircle className="w-5 h-5 text-green-500" />
        };
      case 'error':
        return {
          label: 'Generation Failed',
          description: 'An error occurred during proof generation',
          icon: <XCircle className="w-5 h-5 text-red-500" />
        };
      default:
        return {
          label: 'Ready to Generate',
          description: 'Click the button below to start',
          icon: <Shield className="w-5 h-5 text-gray-400" />
        };
    }
  };

  const stageInfo = getStageInfo();

  return (
    <Card className="w-full border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <span>ZK Proof Generator</span>
          </CardTitle>
          {stage === 'complete' && (
            <Badge className="bg-green-500 hover:bg-green-600 text-white">
              <CheckCircle className="w-3 h-3 mr-1" />
              Verified
            </Badge>
          )}
          {stage === 'error' && (
            <Badge variant="destructive">
              <XCircle className="w-3 h-3 mr-1" />
              Failed
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Status Card */}
        <div className={`p-4 rounded-xl border-2 transition-all duration-300 ${
          stage === 'complete' ? 'bg-green-50 border-green-200' :
          stage === 'error' ? 'bg-red-50 border-red-200' :
          stage === 'idle' ? 'bg-gray-50 border-gray-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{stageInfo.icon}</div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{stageInfo.label}</h4>
              <p className="text-xs text-gray-600 mt-0.5">{stageInfo.description}</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress 
            value={progress} 
            className="h-2.5"
          />
        </div>

        {/* Generate Button */}
        {stage === 'idle' && (
          <Button 
            onClick={generateProof} 
            className="w-full h-12 text-base font-medium bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all"
          >
            <Zap className="w-5 h-5 mr-2" />
            Generate ZK Proof
          </Button>
        )}

        {/* Results Section */}
        {(identityCommitment || sessionAuth || proof) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-purple-500" />
                Generated Values
              </h4>

              {/* Identity Commitment */}
              {identityCommitment && (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-xl border border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <FileKey className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-medium text-purple-700">Identity Commitment</span>
                  </div>
                  <code className="text-xs font-mono break-all text-purple-900 block bg-white/50 p-2 rounded">
                    {identityCommitment.toString()}
                  </code>
                </div>
              )}

              {/* Session Authorization */}
              {sessionAuth && (
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">Session Authorization</span>
                  </div>
                  <code className="text-xs font-mono break-all text-blue-900 block bg-white/50 p-2 rounded">
                    {sessionAuth.toString()}
                  </code>
                </div>
              )}

              {/* Proof */}
              {proof && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs font-medium text-green-700">ZK Proof</span>
                    </div>
                    <Badge 
                      variant={proof.fullProof ? "default" : "secondary"}
                      className={proof.fullProof ? "bg-green-600" : ""}
                    >
                      {proof.fullProof ? 'Real snarkjs' : 'Simulated'}
                    </Badge>
                  </div>
                  <code className="text-xs font-mono break-all text-green-900 block bg-white/50 p-2 rounded">
                    {proof.proof.slice(0, 40)}...{proof.proof.slice(-20)}
                  </code>
                  
                  {proof.fullProof && (
                    <div className="mt-3 pt-3 border-t border-green-200 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-green-600">Protocol:</span>
                        <span className="ml-1 text-green-900 font-medium">{proof.fullProof.proof.protocol}</span>
                      </div>
                      <div>
                        <span className="text-green-600">Curve:</span>
                        <span className="ml-1 text-green-900 font-medium">{proof.fullProof.proof.curve}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Technical Logs */}
        <div className="border rounded-xl overflow-hidden">
          <Button
            variant="ghost"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full justify-between px-4 py-3 h-auto hover:bg-gray-50"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="w-4 h-4" />
              Technical Logs
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {logs.length}
              </Badge>
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </Button>
          
          {showDetails && (
            <div className="bg-gray-900 text-green-400 p-4 text-xs font-mono h-48 overflow-y-auto border-t">
              {logs.length === 0 ? (
                <span className="text-gray-500 italic">No logs yet. Start generation to see logs...</span>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-500 select-none">{i + 1}</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="border rounded-xl overflow-hidden">
          <Button
            variant="ghost"
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className="w-full justify-between px-4 py-3 h-auto hover:bg-gray-50"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Cpu className="w-4 h-4" />
              How it works
            </span>
            {showHowItWorks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          
          {showHowItWorks && (
            <div className="p-4 bg-gray-50 border-t text-sm space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">1</div>
                  <div>
                    <p className="font-medium text-gray-900">Secret Derivation</p>
                    <p className="text-xs text-gray-600">Secret is derived from JWT using SHA-256 hashing</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-bold shrink-0">2</div>
                  <div>
                    <p className="font-medium text-gray-900">Identity Commitment</p>
                    <p className="text-xs text-gray-600">Poseidon(emailHash, sub, secret) creates a unique identity</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xs font-bold shrink-0">3</div>
                  <div>
                    <p className="font-medium text-gray-900">Session Linking</p>
                    <p className="text-xs text-gray-600">Session authorization links identity to ephemeral key</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs font-bold shrink-0">4</div>
                  <div>
                    <p className="font-medium text-gray-900">Zero-Knowledge Proof</p>
                    <p className="text-xs text-gray-600">Proves knowledge of JWT without revealing it</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600 text-xs font-bold shrink-0">5</div>
                  <div>
                    <p className="font-medium text-gray-900">Verification</p>
                    <p className="text-xs text-gray-600">Groth16 verification on BN128 curve</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
