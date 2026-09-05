// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { configureChatOnboarding, _renderProviderQuiz } from '../js/chat-onboarding.js';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  configureChatOnboarding({ openSettingsModal: () => {} });
});

it('puts card payment first and recommends it, with CLI prerequisites and a terminal icon', () => {
  document.body.innerHTML = _renderProviderQuiz('', 'Test');
  const choices = document.querySelectorAll('[data-chat-provider-branch]');
  expect(choices[0].getAttribute('data-chat-provider-branch')).toBe('card');
  expect(document.querySelectorAll('.chat-quiz-recommended')).toHaveLength(1);
  expect(choices[0].textContent).toContain('Recommended');
  const cli = document.querySelector('[data-chat-provider-branch="cli"]');
  expect(cli.textContent).toContain('Requires an installed CLI, sign-in, and getbased Companion');
  expect(cli.querySelector('svg')).not.toBeNull();
});

it('waits for lazy Settings to render before selecting CLI agents', async () => {
  vi.useFakeTimers();
  let finishLoading;
  const selected = vi.fn();
  const opening = new Promise(resolve => { finishLoading = resolve; });
  const openSettingsModal = vi.fn(() => opening.then(() => {
    const button = document.createElement('button');
    button.dataset.settingsAction = 'show-cli-agent-provider';
    button.addEventListener('click', selected);
    document.body.append(button);
  }));
  configureChatOnboarding({ openSettingsModal });
  document.body.innerHTML = _renderProviderQuiz('cli', 'Test');
  document.querySelector('[data-chat-provider="cli"]').click();
  await vi.advanceTimersByTimeAsync(300);
  expect(openSettingsModal).toHaveBeenCalledWith('ai');
  expect(selected).not.toHaveBeenCalled();
  finishLoading();
  await vi.advanceTimersByTimeAsync(0);
  expect(selected).toHaveBeenCalledOnce();
});
