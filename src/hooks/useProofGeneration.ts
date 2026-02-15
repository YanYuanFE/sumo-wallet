import { useState, useCallback } from "react";
import {
  generateRealZKProof,
  verifyZKProof,
  generateIdentityCommitment,
  generateSessionAuth,
  type FullZKProof,
} from "@/services/zkProofService";
import type { GoogleJWT, SessionKeyPair, ZKProof } from "@/types";

export type ProofStage = "idle" | "hashing" | "generating" | "verifying" | "complete" | "error";

interface UseProofGenerationParams {
  jwt: GoogleJWT;
  jwtToken: string;
  sessionKey: SessionKeyPair;
  maxBlock: number;
  onProofGenerated: (proof: ZKProof & { fullProof?: FullZKProof }) => void;
}

export function useProofGeneration({
  jwt,
  jwtToken,
  sessionKey,
  maxBlock,
  onProofGenerated,
}: UseProofGenerationParams) {
  const [stage, setStage] = useState<ProofStage>("idle");
  const [progress, setProgress] = useState(0);
  const [proof, setProof] = useState<(ZKProof & { fullProof?: FullZKProof }) | null>(null);
  const [identityCommitment, setIdentityCommitment] = useState<bigint | null>(null);
  const [sessionAuth, setSessionAuth] = useState<bigint | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [generationTime, setGenerationTime] = useState<number | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  const generateProof = useCallback(async () => {
    setStage("hashing");
    setProgress(10);
    setLogs([]);
    setGenerationTime(null);
    addLog("🚀 Starting ZK proof generation...");
    addLog(`📅 maxBlock: ${maxBlock} (proof expires at this block)`);

    if (!maxBlock || maxBlock === 0) {
      addLog("❌ Error: maxBlock is not set! Please refresh and try again.");
      setStage("error");
      return;
    }

    const totalStartTime = performance.now();

    try {
      // Step 1: Generate identity commitment
      addLog("🔐 Deriving secret from JWT...");
      const encoder = new TextEncoder();
      const data = encoder.encode(jwtToken);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const secret = BigInt(
        "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32),
      );

      addLog("🧮 Generating identity commitment...");
      const commitment = await generateIdentityCommitment(jwt.email, jwt.sub, secret);
      setIdentityCommitment(commitment);
      setProgress(25);
      addLog(`✅ Identity commitment: ${commitment.toString().slice(0, 16)}...`);

      // Step 2: Generate session authorization
      addLog("🔗 Linking session key...");
      const auth = await generateSessionAuth(commitment, sessionKey.publicKey);
      setSessionAuth(auth);
      setProgress(40);
      addLog(`✅ Session auth hash: ${auth.toString().slice(0, 16)}...`);

      // Step 3: Generate ZK proof
      setStage("generating");
      addLog("⚡ Generating zero-knowledge proof...");

      const startTime = performance.now();
      const generatedProof = await generateRealZKProof(jwt, sessionKey, jwtToken, maxBlock);
      const endTime = performance.now();
      const proofTime = endTime - startTime;

      setProof(generatedProof);
      setProgress(70);
      addLog(`✅ Proof generated in ${proofTime.toFixed(0)}ms`);

      // Step 4: Verify proof
      setStage("verifying");
      addLog("🔍 Verifying proof...");
      const isValid = await verifyZKProof(generatedProof);

      const totalTime = performance.now() - totalStartTime;
      setGenerationTime(totalTime);

      if (isValid) {
        setProgress(100);
        setStage("complete");
        addLog(`🎉 Proof verified successfully! Total time: ${totalTime.toFixed(0)}ms`);
        onProofGenerated(generatedProof);
      } else {
        setStage("error");
        addLog("❌ Proof verification failed!");
      }
    } catch (error) {
      console.error("ZK Proof generation error:", error);
      setStage("error");
      addLog(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [jwt, jwtToken, sessionKey, maxBlock, onProofGenerated, addLog]);

  return {
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
  };
}