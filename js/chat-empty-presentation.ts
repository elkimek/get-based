// Pure empty-state display choices. Onboarding services retain routing and writes.
import { projectOnboardingProgress } from './chat-onboarding-presentation.js';

export type ChatEmptyKind = 'paused' | 'complete' | 'partial' | 'handoff' | 'initial' | 'nudge' | 'general';

export interface ChatEmptyAction {
  label: string;
  action?: string;
  prompt?: string;
  focus?: string;
  step?: number;
  primary?: boolean;
}

export interface ChatEmptyInput {
  kind: ChatEmptyKind;
  personalityLabel: string;
  name?: string;
  icon?: string;
  greeting?: string;
  connected: boolean;
  filled?: number;
  skipped?: boolean;
  prompts?: readonly string[];
}

const prompt = (label: string, value: string): ChatEmptyAction => ({ label, action: 'use-prompt', prompt: value });

function contextHandoff(name: string, filled: number, skipped = false): string {
  if (skipped) return `Context cards are skipped for now, ${name}. You can add them later from Profile Context when they are useful.`;
  return filled > 0 ? `Context is saved for now, ${name}.` : `Context cards are saved for later, ${name}.`;
}

export function projectChatEmpty(input: ChatEmptyInput) {
  const { kind, name = '', connected, filled = 0 } = input;
  const next = connected
    ? 'Next, import labs or ask what to test when you are ready.'
    : 'Next, connect AI when you are ready to import labs or explore optional tips.';
  const actions: ChatEmptyAction[] = [];
  let body = '';
  let strong = '';
  let label = '';

  if (kind === 'paused') {
    body = `${name}, AI features are currently paused. Turn them back on to chat, get insights, and import PDFs with AI.`;
    actions.push({ label: 'Enable AI', action: 'resume-ai', primary: true });
  } else if (kind === 'complete' || kind === 'handoff') {
    label = kind === 'complete' ? 'Context complete' : 'Setup ready';
    body = kind === 'complete'
      ? `${name}, your context cards are complete. ${next}`
      : `${contextHandoff(name, filled, input.skipped)} ${next}`;
    if (connected) {
      actions.push({ label: 'Import a lab file', action: 'start-lab-import', primary: true });
      actions.push(prompt('Just tell me what to test', kind === 'complete'
        ? 'Based on my full profile, what blood tests should I get and why?'
        : "I don't have any labs yet. Based on my profile, what blood tests should I get and why?"));
      if (kind === 'complete') {
        actions.push(prompt('Analyze my lifestyle', 'What can you tell about my health from my lifestyle info?'));
      }
    } else {
      actions.push({ label: 'Connect AI to import labs', action: 'request-lab-import-provider', primary: true });
    }
    actions.push({ label: kind === 'complete' ? 'Review context cards' : 'Add context cards', step: 4 });
  } else if (kind === 'partial' || kind === 'initial') {
    if (kind === 'partial') {
      body = `${filled >= 6 ? 'Almost there' : filled >= 3 ? 'Nice progress' : 'Good start'}, ${name}! You've filled ${filled} of 9 context areas.`;
    } else {
      strong = 'Add optional context.';
      body = 'These cards improve lab interpretation. Fill any that matter now; everything is optional.';
    }
  } else if (kind === 'nudge') {
    body = "I can see your lab results — nice! 👋 I can already analyze these, but if you fill in a few lifestyle cards I'll give you much more personalized insights.";
    actions.push(
      { label: '📋 Fill in lifestyle cards', action: 'set-onboarding-focus', focus: 'cards' },
      prompt('Analyze my results now', 'What are my most concerning results?'),
    );
  } else {
    actions.push(...(input.prompts || []).map(value => prompt(value, value)));
  }

  const contextCards = kind === 'initial' || kind === 'partial';
  return {
    ...input, body, strong, label, actions, contextCards,
    progress: contextCards ? projectOnboardingProgress(4, connected) : null,
    progressPercent: kind === 'partial' ? Math.round(filled / 9 * 100) : null,
    continueLabel: connected ? 'Continue to import' : 'Continue',
  };
}

export type ChatEmptyView = ReturnType<typeof projectChatEmpty>;
