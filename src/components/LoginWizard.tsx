import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { GoogleLoginButton } from '@/components/GoogleLoginButton';
import { ZKProofGenerator } from '@/components/ZKProofGenerator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { LoginFlow, GoogleJWT, SessionKeyPair, ZKProof } from '@/types';
import { type FullZKProof } from '@/services/zkProofService';
import { Check, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface LoginWizardProps {
  flow: LoginFlow;
  decodedJWT: GoogleJWT | null;
  googleToken: string | null;
  sessionKey: SessionKeyPair | null;
  maxBlock: number;
  onGoogleSuccess: (tokenResponse: { access_token: string; id_token?: string }) => void;
  onZKProofGenerated: (proof: ZKProof & { fullProof?: FullZKProof }) => void;
}

const STEPS = [
  { label: 'Sign In' },
  { label: 'Verify' },
  { label: 'ZK Proof' },
  { label: 'Ready' },
];

function getWizardStep(flowStep: LoginFlow['step']): number {
  switch (flowStep) {
    case 'idle': return 0;
    case 'oauth':
    case 'jwt':
    case 'session': return 1;
    case 'zkproof': return 2;
    case 'account': return 3;
    default: return 3;
  }
}

function WizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 w-full">
      {STEPS.map((step, i) => {
        const completed = currentStep > i;
        const active = currentStep === i;
        return (
          <div key={step.label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300
                  ${completed ? 'bg-green-500 text-white' : ''}
                  ${active ? 'bg-primary text-primary-foreground ring-2 ring-primary/20' : ''}
                  ${!completed && !active ? 'bg-muted text-muted-foreground' : ''}
                `}
              >
                {completed ? <Check className="w-3.5 h-3.5" /> : active ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : i + 1}
              </div>
              <span className={`text-[11px] mt-1 ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 mb-5 transition-colors duration-300 ${currentStep > i ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LoginWizard({
  flow,
  decodedJWT,
  googleToken,
  sessionKey,
  maxBlock,
  onGoogleSuccess,
  onZKProofGenerated,
}: LoginWizardProps) {
  const wizardStep = getWizardStep(flow.step);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="pb-2">
        <WizardStepper currentStep={wizardStep} />
      </CardHeader>

      <CardContent>
        <div key={wizardStep} className="animate-fade-in-up">
          {/* Step 0: Google Login */}
          {wizardStep === 0 && (
            <div className="py-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold">Welcome to SUMO Login</h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Sign in to create your ZK-authenticated wallet on Starknet
                </p>
              </div>
              <GoogleLoginButton
                onSuccess={onGoogleSuccess}
                onError={() => toast.error('Google login failed')}
              />
            </div>
          )}

          {/* Step 1: Processing (jwt + session, auto) */}
          {wizardStep === 1 && (
            <div className="py-10 space-y-5">
              <div className="flex flex-col items-center gap-4">
                {decodedJWT ? (
                  <Avatar className="size-14">
                    <AvatarImage src={decodedJWT.picture} alt={decodedJWT.name} />
                    <AvatarFallback className="text-lg">{decodedJWT.name?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-muted animate-pulse" />
                )}
                <div className="text-center space-y-1">
                  {decodedJWT && <p className="font-medium">{decodedJWT.name}</p>}
                  <p className="text-sm text-muted-foreground">{flow.message}</p>
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Step 2: ZK Proof Generation (auto-start) */}
          {wizardStep === 2 && decodedJWT && sessionKey && (
            <div className="py-4 space-y-4">
              <div className="text-center space-y-1 mb-2">
                <h3 className="font-semibold">Generating ZK Proof</h3>
                <p className="text-xs text-muted-foreground">
                  Proving JWT ownership without revealing it on-chain
                </p>
              </div>
              <ZKProofGenerator
                jwt={decodedJWT}
                jwtToken={googleToken || ''}
                sessionKey={sessionKey}
                maxBlock={maxBlock}
                autoStart
                onProofGenerated={onZKProofGenerated}
              />
            </div>
          )}

          {/* Step 3: Creating Account */}
          {wizardStep === 3 && (
            <div className="py-10 space-y-4">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-medium">Creating your account</p>
                  <p className="text-sm text-muted-foreground">{flow.message}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
