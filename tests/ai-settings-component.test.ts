// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { disposeAiSettings, getAiSettingsView, mountAiSettings } from '../js/ai-settings-component.js';
import { buildAiSettingsSnapshot } from '../js/ai-settings-presentation.js';
import type { AiSettingsActions } from '../js/ai-settings-contract.js';

function mounted(options: { backend?: string; provider?: string; hideProviders?: boolean } = {}, actions: AiSettingsActions = { pause: vi.fn(), select: vi.fn() }) {
  const host = document.createElement('section');
  document.body.append(host);
  const snapshot = buildAiSettingsSnapshot({ enabled: true, backend: options.backend || 'direct', provider: options.provider || 'venice', hideProviders: options.hideProviders || false });
  return { host, actions, view: mountAiSettings(host, snapshot, actions) };
}
afterEach(() => { disposeAiSettings(); document.body.replaceChildren(); });

it('renders the seven provider contracts with exactly one active selection', () => {
  mounted({ backend: 'codex', provider: 'custom' });
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.ai-provider-btn')];
  expect(buttons.map(button => button.dataset.provider)).toEqual(['ppq','routstr','openrouter','venice','custom','ollama','cli']);
  expect(buttons.map(button => button.textContent?.trim())).toEqual(['PPQ','Routstr','OpenRouter','Venice','Custom','Local models','CLI agents']);
  expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  expect(document.querySelector('[aria-pressed="true"]')?.getAttribute('data-provider')).toBe('cli');
  expect(buttons.at(-1)?.dataset.settingsAction).toBe('show-cli-agent-provider');
  expect(document.querySelectorAll('img')).toHaveLength(4);
  expect(document.querySelectorAll('img:not([alt=""])')).toHaveLength(0);
});
it('owns dispatch once, forwards the actual button and suppresses legacy delegates', () => {
  const select = vi.fn(), pause = vi.fn(); mounted({}, { select, pause });
  const click = vi.fn(), change = vi.fn();
  document.body.addEventListener('click',click); document.body.addEventListener('change',change);
  const button = document.querySelector<HTMLButtonElement>('[data-provider="cli"]')!;
  button.querySelector('path')!.dispatchEvent(new MouseEvent('click',{ bubbles: true }));
  expect(select).toHaveBeenCalledExactlyOnceWith('cli',button);
  const checkbox = document.querySelector<HTMLInputElement>('#ai-pause-toggle')!;
  checkbox.click(); expect(pause).toHaveBeenCalledExactlyOnceWith(false);
  expect(checkbox.checked).toBe(true); // Owner has not accepted a persisted change.
  expect(click).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
  document.body.removeEventListener('click',click); document.body.removeEventListener('change',change);
});
it('preserves child ownership, private edits and focus through parent updates', () => {
  const { view } = mounted(), panel = view.getProviderHost()!;
  const secret = document.createElement('input'); secret.type = 'password'; secret.value = 'PRIVATE DRAFT';
  panel.append(secret); secret.focus();
  view.setSelected('openrouter'); view.setProviderStatus('error'); view.setPauseError('Storage unavailable'); view.setEnabled(false);
  expect(view.getProviderHost()).toBe(panel); expect(panel.firstElementChild).toBe(secret);
  expect(secret.value).toBe('PRIVATE DRAFT'); expect(document.activeElement).toBe(secret);
  expect(JSON.stringify(view.getSnapshot())).not.toContain(secret.value);
  expect(panel.getAttribute('aria-busy')).toBe('false');
  view.setProviderStatus('loading'); expect(panel.getAttribute('aria-busy')).toBe('true');
  view.setProviderStatus('ready'); expect(document.body.textContent).not.toContain('Loading provider settings');
});
it('honors extension provider visibility while keeping feature controls available', () => {
  mounted({ hideProviders: true });
  expect(document.querySelector<HTMLElement>('#ai-provider-settings')!.hidden).toBe(true);
  expect(document.querySelector('#ai-pause-toggle')).not.toBeNull();
});
it('rejects retained actions and refreshes after a replacement or close', () => {
  const select = vi.fn(), pause = vi.fn(), old = mounted({}, { select, pause });
  const button = old.host.querySelector<HTMLButtonElement>('[data-provider="cli"]')!;
  const checkbox = old.host.querySelector<HTMLInputElement>('#ai-pause-toggle')!;
  const next = mounted({ provider: 'openrouter' });
  button.click(); checkbox.click(); old.view.setSelected('cli'); old.view.setEnabled(false);
  expect(select).not.toHaveBeenCalled(); expect(pause).not.toHaveBeenCalled();
  expect(next.view.getSnapshot().activeProvider).toBe('openrouter'); expect(next.view.getSnapshot().enabled).toBe(true);
  disposeAiSettings(); expect(next.view.isCurrent()).toBe(false); expect(getAiSettingsView()).toBeNull();
});
