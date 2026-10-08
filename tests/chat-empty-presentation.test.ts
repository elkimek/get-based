// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHTML } from '../js/components/ChatEmptyState.svelte.html.js';
import { projectChatEmpty, type ChatEmptyInput } from '../js/chat-empty-presentation.js';

const base = { name: 'Ada', personalityLabel: 'Guide', connected: false };

function host(kind: ChatEmptyInput['kind'], extra: Partial<ChatEmptyInput> = {}) {
  const root = document.createElement('div');
  root.innerHTML = renderHTML({ view: projectChatEmpty({ ...base, kind, ...extra }) });
  return root;
}

describe('authored empty Chat contracts', () => {
  it('keeps every context route available without requiring an AI provider', () => {
    for (const kind of ['complete', 'handoff'] as const) {
      const root = host(kind);
      expect(root.querySelector('[data-chat-empty-action="request-lab-import-provider"]')?.textContent).toBe('Connect AI to import labs');
      expect(root.querySelector('[data-chat-onboarding-action="go-onboarding-step"]')?.getAttribute('data-chat-step')).toBe('4');
      expect(root.querySelector('[data-chat-empty-action="start-lab-import"]')).toBeNull();
    }
    const initial = host('initial');
    expect(initial.querySelector('[data-chat-empty-context-slot]')).not.toBeNull();
    expect(initial.querySelector('[data-chat-empty-action="continue-after-context-cards"]')?.textContent).toBe('Continue');
    expect(initial.querySelector('[data-chat-empty-action="skip-context-cards"]')?.textContent).toBe('Skip context cards');
    expect(initial.querySelector('[data-chat-onboarding-action="go-onboarding-step"]')?.getAttribute('data-chat-step')).toBe('3');
  });

  it('retains exact connected import and prompt payloads, including paused and lab-only actions', () => {
    const complete = host('complete', { connected: true });
    expect(complete.querySelector('[data-chat-empty-action="start-lab-import"]')?.textContent).toBe('Import a lab file');
    expect([...complete.querySelectorAll('[data-prompt]')].map(node => node.getAttribute('data-prompt'))).toEqual([
      'Based on my full profile, what blood tests should I get and why?',
      'What can you tell about my health from my lifestyle info?',
    ]);
    expect(host('paused').querySelector('[data-chat-empty-action="resume-ai"]')?.textContent).toBe('Enable AI');
    expect(host('nudge').querySelector('[data-chat-empty-action="set-onboarding-focus"]')?.getAttribute('data-focus')).toBe('cards');
  });

  it('treats names, greetings and prompts as literal text and never embeds arbitrary HTML', () => {
    const literal = '<img src=x onerror=alert(1)> " &';
    for (const kind of ['paused', 'complete', 'partial', 'handoff', 'initial', 'nudge', 'general'] as const) {
      const root = host(kind, { name: literal, personalityLabel: literal, greeting: literal, icon: literal, prompts: [literal], filled: 5 });
      expect(root.querySelector('img,script')).toBeNull();
      expect(root.textContent).toContain(literal);
      expect([...root.querySelectorAll('button')].every(button => button.type === 'button')).toBe(true);
    }
    expect(host('general', { prompts: [literal] }).querySelector('[data-prompt]')?.getAttribute('data-prompt')).toBe(literal);
  });

  it('does not mutate caller prompts and retains context progress and saved/skipped distinctions', () => {
    const prompts = Object.freeze(['One', 'Two']);
    expect(projectChatEmpty({ ...base, kind: 'general', prompts }).actions.map(action => action.prompt)).toEqual(['One', 'Two']);
    expect(prompts).toEqual(['One', 'Two']);
    expect(projectChatEmpty({ ...base, kind: 'partial', filled: 5, connected: true })).toMatchObject({
      progressPercent: 56, progress: { step: 3, total: 3, label: 'Context', previousStep: 3 }, continueLabel: 'Continue to import',
    });
    expect(projectChatEmpty({ ...base, kind: 'handoff', skipped: true }).body).toContain('Context cards are skipped for now, Ada.');
    expect(projectChatEmpty({ ...base, kind: 'handoff', filled: 1 }).body).toContain('Context is saved for now, Ada.');
    expect(projectChatEmpty({ ...base, kind: 'handoff' }).body).toContain('Context cards are saved for later, Ada.');
  });
});
