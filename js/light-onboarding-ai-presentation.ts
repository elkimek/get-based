import type { AIVerdictAnalysis, AIVerdictStatus } from './ai-verdict-engine.js';

export type OnboardingAIDot = 'green' | 'yellow' | 'red' | 'gray';
export interface OnboardingAIView {
  readonly actionOwner: string;
  readonly status: AIVerdictStatus;
  readonly dot: OnboardingAIDot;
  readonly prefix: string;
  readonly tip: string;
  readonly detail: string;
  readonly actions: readonly string[];
  readonly message: string;
}
const text = (value: unknown) => value == null ? '' : String(value);

// Provider gating and saved-result visibility match the stable facade. No profile writes.
export function projectOnboardingAI(input: {
  actionOwner?: string;
  completed: boolean;
  provider: boolean;
  status: AIVerdictStatus;
  analysis: (AIVerdictAnalysis & { actions?: unknown }) | null | undefined;
  prefix: string;
}): OnboardingAIView | null {
  const { analysis, status } = input;
  if (!input.completed || !input.provider && !(analysis?.status === 'ok' && analysis.dot)) return null;
  const rawDot = analysis?.dot;
  const dot: OnboardingAIDot = rawDot === 'green' || rawDot === 'yellow' || rawDot === 'red' ? rawDot : 'gray';
  return {
    actionOwner: input.actionOwner || '', status, dot, prefix: input.prefix,
    tip: text(analysis?.tip || ''), detail: text(analysis?.detail || ''),
    actions: Array.isArray(analysis?.actions) ? analysis.actions.map(text) : [],
    message: status === 'analyzing' ? 'Synthesizing your setup…'
      : status === 'error' ? analysis?.errorMessage ? `Analysis failed — ${analysis.errorMessage}` : 'Analysis failed.'
      : 'Get a contextual read on your skin type, lighting environment, and goals.',
  };
}
