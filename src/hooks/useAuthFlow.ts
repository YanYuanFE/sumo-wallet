import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import type {
  GoogleJWT,
  SmartAccount,
  SessionKeyPair,
  ZKProof,
  LoginFlow,
} from "@/types";
import { generateSessionKeyPair, generateNonce } from "@/utils/crypto";
import { getSumoAccountAddress } from "@/services/starknetService";
import {
  saveAccount,
  getCurrentAccount,
  clearStorage,
  saveZKProof,
  getZKProof,
  saveJWT,
  getJWT,
} from "@/utils/storage";
import { verifyZKProof, type FullZKProof } from "@/services/zkProofService";
import { provider } from "@/config/starknet";
import {
  GOOGLE_CLIENT_ID,
  DEFAULT_GOOGLE_CLIENT_ID,
} from "@/adapters/config/network";

export { GOOGLE_CLIENT_ID, DEFAULT_GOOGLE_CLIENT_ID };

export function useAuthFlow() {
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

  // Refs to avoid stale closures in callbacks
  const googleTokenRef = useRef(googleToken);
  const decodedJWTRef = useRef(decodedJWT);
  const sessionKeyRef = useRef(sessionKey);

  useEffect(() => { googleTokenRef.current = googleToken; }, [googleToken]);
  useEffect(() => { decodedJWTRef.current = decodedJWT; }, [decodedJWT]);
  useEffect(() => { sessionKeyRef.current = sessionKey; }, [sessionKey]);

  // Check for existing session on mount
  useEffect(() => {
    const existingAccount = getCurrentAccount();
    if (existingAccount) {
      const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
      if (existingAccount.sessionKey.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
        setAccount(existingAccount);

        const savedProofData = getZKProof();
        if (savedProofData) {
          setZkProof(savedProofData.proof);
          if (savedProofData.maxBlock) {
            setMaxBlock(savedProofData.maxBlock);
          }
        }

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

  const handleSessionKeyGeneration = useCallback(async () => {
    setFlow({
      step: "session",
      progress: 40,
      message: "Generating ephemeral session keys...",
    });

    const keyPair = generateSessionKeyPair();
    setSessionKey(keyPair);

    try {
      const currentBlock = await provider.getBlockNumber();
      const blockBuffer = 100000;
      setMaxBlock(currentBlock + blockBuffer);
    } catch (error) {
      console.error("Failed to get block number:", error);
      setMaxBlock(10000000);
    }

    toast.success("Session keys generated!");

    setFlow({
      step: "zkproof",
      progress: 60,
      message: "Ready to generate ZK proof",
    });
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

        const tokenForDeployment = idToken || accessToken;
        setGoogleToken(tokenForDeployment);
        setDecodedJWT(mockJWT);
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
    [nonce, handleSessionKeyGeneration],
  );

  const handleAccountCreation = useCallback(
    async (jwt: GoogleJWT, keyPair: SessionKeyPair) => {
      setFlow({
        step: "account",
        progress: 90,
        message: "Deploying smart account...",
      });

      try {
        console.log("[handleAccountCreation] JWT sub:", jwt.sub);
        console.log("[handleAccountCreation] JWT email:", jwt.email);

        if (!googleTokenRef.current) {
          throw new Error("JWT token required for address calculation");
        }
        const address = await getSumoAccountAddress(jwt, googleTokenRef.current);
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
    [],
  );

  const handleZKProofGenerated = useCallback(
    async (proof: ZKProof & { fullProof?: FullZKProof }) => {
      setZkProof(proof);
      saveZKProof(proof, maxBlock);

      setFlow({
        step: "zkproof",
        progress: 80,
        message: "Verifying ZK proof...",
      });

      try {
        const isValid = await verifyZKProof(proof);
        setProofVerified(isValid);

        if (isValid && decodedJWTRef.current && sessionKeyRef.current) {
          toast.success("ZK Proof verified!");
          handleAccountCreation(decodedJWTRef.current, sessionKeyRef.current);
        } else {
          toast.error("ZK Proof verification failed");
        }
      } catch {
        toast.error("Proof verification error");
      }
    },
    [maxBlock, handleAccountCreation],
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

  return {
    flow,
    googleToken,
    decodedJWT,
    sessionKey,
    zkProof,
    proofVerified,
    account,
    maxBlock,
    handleGoogleSuccess,
    handleZKProofGenerated,
    handleLogout,
    handleReset,
  };
}