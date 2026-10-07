/** Shared presentation contracts; onboarding services own providers, navigation and storage. */
export interface ChatOnboardingProgress {
  step: number;
  total: number;
  label: string;
  previousStep: number | null;
}
export interface ChatProviderSetupView {
  name: string;
  personalityLabel: string;
  connected: boolean;
  branch: string;
  extensionHTML: string;
  progress: ChatOnboardingProgress;
}
export function projectOnboardingProgress(currentStep: number, providerConnected: boolean): ChatOnboardingProgress {
  const labels: Record<number, string> = { 1: 'Basics', 2: 'AI setup', 3: 'Add-ons', 4: 'Context' };
  const skipProvider = providerConnected && (currentStep === 1 || currentStep >= 3);
  return {
    step: skipProvider && currentStep >= 3 ? currentStep - 1 : currentStep,
    total: skipProvider ? 3 : 4,
    label: labels[currentStep] || 'Setup',
    previousStep: currentStep > 1 ? (currentStep === 3 && providerConnected ? 1 : currentStep - 1) : null,
  };
}
