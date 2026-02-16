import { useEffect, useRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { type FullZKProof } from '@/services/zkProofService';
import type { GoogleJWT, SessionKeyPair, ZKProof } from '@/types';
import {
  Shield,
  CheckCircle,
  XCircle,
  Loader2,
  FileKey,
  Lock,
  Terminal,
  Fingerprint,
} from 'lucide-react';
import { useProofGeneration } from '@/hooks/useProofGeneration';

interface ZKProofGeneratorProps {
  jwt: GoogleJWT;
  jwtToken: string;
  sessionKey: SessionKeyPair;
  maxBlock: number;
  autoStart?: boolean;
  onProofGenerated: (proof: ZKProof & { fullProof?: FullZKProof }) => void;
}

export function ZKProofGenerator({
  jwt,
  jwtToken,
  sessionKey,
  maxBlock,
  autoStart = false,
  onProofGenerated,
}: ZKProofGeneratorProps) {
  const {
    stage,
    progress,
    proof,
    identityCommitment,
    sessionAuth,
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

  // Auto-start with ref guard to prevent double-invocation in StrictMode
  const hasStarted = useRef(false);
  useEffect(() => {
    if (autoStart && stage === 'idle' && !hasStarted.current) {
      hasStarted.current = true;
      generateProof();
    }
  }, [autoStart, stage, generateProof]);

  const stageLabel = (() => {
    switch (stage) {
      case 'hashing': return 'Computing hashes...';
      case 'generating': return 'Generating ZK proof...';
      case 'verifying': return 'Verifying proof...';
      case 'complete': return generationTime ? `Completed in ${generationTime.toFixed(0)}ms` : 'Proof verified';
      case 'error': return 'Generation failed';
      default: return 'Preparing...';
    }
  })();

  const stageIcon = (() => {
    switch (stage) {
      case 'complete': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    }
  })();

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-3">
        {stageIcon}
        <span className="text-sm font-medium">{stageLabel}</span>
        {stage === 'complete' && (
          <Badge className="bg-green-500 text-white ml-auto">Verified</Badge>
        )}
        {stage === 'error' && (
          <Badge variant="destructive" className="ml-auto">Failed</Badge>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Technical Details (collapsed) */}
      {(identityCommitment || sessionAuth || proof || logs.length > 0) && (
        <Accordion type="single" collapsible className="border rounded-lg">
          <AccordionItem value="details" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex items-center gap-2 text-sm">
                <Terminal className="w-4 h-4" />
                Technical Details
                <Badge variant="secondary" className="text-xs">{logs.length}</Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 space-y-3">
              {/* Identity Commitment */}
              {identityCommitment && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Fingerprint className="w-3 h-3" /> Identity Commitment
                  </label>
                  <code className="text-xs font-mono break-all block bg-muted p-2 rounded">
                    {identityCommitment.toString()}
                  </code>
                </div>
              )}

              {/* Session Authorization */}
              {sessionAuth && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Session Authorization
                  </label>
                  <code className="text-xs font-mono break-all block bg-muted p-2 rounded">
                    {sessionAuth.toString()}
                  </code>
                </div>
              )}

              {/* Proof */}
              {proof && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileKey className="w-3 h-3" /> ZK Proof
                    {proof.fullProof && (
                      <Badge variant="secondary" className="text-xs ml-1">
                        {proof.fullProof.proof.protocol}/{proof.fullProof.proof.curve}
                      </Badge>
                    )}
                  </label>
                  <code className="text-xs font-mono break-all block bg-muted p-2 rounded">
                    {proof.proof.slice(0, 60)}...{proof.proof.slice(-20)}
                  </code>
                </div>
              )}

              {/* Logs */}
              {logs.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Logs
                  </label>
                  <div className="bg-gray-900 text-green-400 p-3 text-xs font-mono rounded max-h-36 overflow-y-auto space-y-0.5">
                    {logs.map((log, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-gray-500 select-none">{i + 1}</span>
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
