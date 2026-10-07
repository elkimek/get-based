import { describe, expect, it } from 'vitest';
import { projectOnboardingProgress } from '../js/chat-onboarding-presentation.js';

describe('onboarding progress navigation contract', () => {
  it('retains all four steps and backward destinations before a response backend is connected', () => {
    expect([1, 2, 3, 4].map(step => projectOnboardingProgress(step, false))).toEqual([
      { step: 1, total: 4, label: 'Basics', previousStep: null },
      { step: 2, total: 4, label: 'AI setup', previousStep: 1 },
      { step: 3, total: 4, label: 'Add-ons', previousStep: 2 },
      { step: 4, total: 4, label: 'Context', previousStep: 3 },
    ]);
  });
  it('omits connected setup from the displayed sequence while retaining explicit provider revisits', () => {
    expect([1, 3, 4, 2].map(step => projectOnboardingProgress(step, true))).toEqual([
      { step: 1, total: 3, label: 'Basics', previousStep: null },
      { step: 2, total: 3, label: 'Add-ons', previousStep: 1 },
      { step: 3, total: 3, label: 'Context', previousStep: 3 },
      { step: 2, total: 4, label: 'AI setup', previousStep: 1 },
    ]);
  });
});
