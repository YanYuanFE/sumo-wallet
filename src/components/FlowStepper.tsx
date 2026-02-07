import { Check, Loader2 } from 'lucide-react';
import type { LoginFlow } from '@/types';

interface FlowStepperProps {
  flow: LoginFlow;
}

const steps = [
  { key: 'oauth', label: 'OAuth', description: 'Google Authentication' },
  { key: 'jwt', label: 'JWT', description: 'Token Verification' },
  { key: 'session', label: 'Session', description: 'Key Generation' },
  { key: 'zkproof', label: 'ZK Proof', description: 'Zero-Knowledge' },
  { key: 'account', label: 'Account', description: 'Smart Wallet' },
];

export function FlowStepper({ flow }: FlowStepperProps) {
  const currentStepIndex = steps.findIndex(s => s.key === flow.step);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        {steps.map((step, index) => {
          const isCompleted = currentStepIndex > index;
          const isCurrent = currentStepIndex === index;
          const isPending = currentStepIndex < index;

          return (
            <div key={step.key} className="flex flex-col items-center flex-1">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  transition-all duration-300
                  ${isCompleted ? 'bg-green-500 text-white' : ''}
                  ${isCurrent ? 'bg-blue-500 text-white ring-4 ring-blue-100' : ''}
                  ${isPending ? 'bg-gray-200 text-gray-400' : ''}
                `}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  index + 1
                )}
              </div>
              <span className="text-xs mt-1 text-gray-500 hidden sm:block">{step.label}</span>
            </div>
          );
        })}
      </div>
      
      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
          style={{ width: `${flow.progress}%` }}
        />
      </div>
      
      {/* Status message */}
      <p className="text-center text-sm text-gray-600 mt-3">{flow.message}</p>
    </div>
  );
}
