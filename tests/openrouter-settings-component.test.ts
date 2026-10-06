// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { disposeOpenRouterSettings, getOpenRouterSettingsView, mountOpenRouterSettings } from '../js/openrouter-settings-component.js';
import type { OpenRouterSettingsSnapshot } from '../js/openrouter-settings-contract.js';
const snapshot: OpenRouterSettingsSnapshot = { connected: true, models: { selectedModel: 'model-a', modelDisplay: 'Model A', groups: [{ label: 'Recommended', options: [{ value: 'model-a', label: 'Model A' },{ value: 'model-b', label: 'Model B' }] }], pricing: { text: '$1.00/M in · $2.00/M out', tone: 'secondary' } } };
function mounted(initial = snapshot) { const host = document.createElement('section'); document.body.append(host); return { host, view: mountOpenRouterSettings(host, initial) }; }
afterEach(() => { disposeOpenRouterSettings(); document.body.replaceChildren(); });
it('escapes catalog attributes and status text while preserving public controls', () => {
  const { view } = mounted({ ...snapshot, models: { ...snapshot.models, groups: [{ label: '<img src=x>', options: [{ value: 'model" onclick="unsafe', label: '<svg onload=unsafe>' }] }] } });
  view.setSaveState({ pending: false, text: '<img src=x onerror=unsafe>', tone: 'danger' });
  expect(document.querySelector('svg,img,[onclick]')).toBeNull();
  expect(document.querySelector('optgroup option')!.textContent).toBe('<svg onload=unsafe>');
  expect(document.querySelector('#openrouter-key-status')!.textContent).toBe('<img src=x onerror=unsafe>');
  expect(document.querySelector('#openrouter-key-input')!.getAttribute('type')).toBe('password');
  expect(document.querySelector('label[for="openrouter-key-input"]')).not.toBeNull();
});
it('reads the live autofilled field and preserves private edits through catalog refresh', () => {
  const { view } = mounted(); view.setStoredKey('stored-synthetic-key');
  const input = document.querySelector('#openrouter-key-input') as HTMLInputElement;
  input.value = 'autofilled-private-key'; expect(view.readKey()).toBe('autofilled-private-key');
  input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  view.setModels({ ...snapshot.models, pricing: { text: 'Free', tone: 'success' } });
  expect(document.querySelector('#openrouter-key-input')).toBe(input); expect(document.activeElement).toBe(input); expect(view.readKey()).toBe('autofilled-private-key');
  expect(JSON.stringify(view.getModels())).not.toContain('autofilled-private-key');
});
it('owns save pending, balance and model health without replacing the selected control', () => {
  const { view } = mounted(); const select = document.querySelector('#openrouter-model-select')!; (select as HTMLElement).focus();
  view.setSaveState({ pending: true, text: 'Validating...', tone: 'secondary' });
  expect((document.querySelector('#save-openrouter-key-btn') as HTMLButtonElement).disabled).toBe(true);
  view.setBalance({ text: 'Balance: $0.25', tone: 'warning' }); expect(document.querySelector('#or-balance')!.textContent).toBe('Balance: $0.25');
  view.setModels({ ...snapshot.models, selectedModel: 'model-b' }); expect(document.querySelector('#openrouter-model-select')).toBe(select); expect(document.activeElement).toBe(select);
  expect((select as HTMLSelectElement).value).toBe('model-b');
  view.setModelCheck('error','Offline model'); expect(document.querySelector('#openrouter-model-health')!.getAttribute('title')).toBe('Offline model');
});
it('keeps manual model IDs selected and preserves connectivity status through pricing refresh', () => {
  const { view } = mounted(); const models = { ...snapshot.models, selectedModel: 'custom/model' };
  view.setModels(models); view.setModelCheck('success','Model responding');
  expect((document.querySelector('#openrouter-model-select') as HTMLSelectElement).value).toBe('__custom');
  expect((document.querySelector('#openrouter-custom-model') as HTMLInputElement).value).toBe('custom/model');
  view.setModels({ ...models, pricing: { text: 'Free', tone: 'success' } }); expect(document.querySelector('#openrouter-model-health')!.textContent).toBe('✓');
  view.setModels(snapshot.models); expect(document.querySelector('option[value="__custom"]')).toBeNull(); expect((document.querySelector('#openrouter-custom-model') as HTMLInputElement).value).toBe('');
});
it('clears retained private fields and rejects old replies on replacement and close', () => {
  const { host, view } = mounted(); view.setStoredKey('PRIVATE OLD KEY'); const input = document.querySelector('#openrouter-key-input') as HTMLInputElement;
  host.replaceChildren(); const next = mountOpenRouterSettings(host, snapshot); expect(input.value).toBe('');
  view.setBalance({ text: 'STALE BALANCE', tone: 'danger' }); expect(host.textContent).not.toContain('STALE BALANCE'); expect(view.readKey()).toBe('');
  next.setStoredKey('NEXT PRIVATE KEY'); const nextInput = document.querySelector('#openrouter-key-input') as HTMLInputElement;
  disposeOpenRouterSettings(); expect(nextInput.value).toBe(''); expect(getOpenRouterSettingsView()).toBeNull();
});
it('retains unconfigured OAuth and password-manager contracts without exposing a credential in markup', () => {
  const { view, host } = mounted({ ...snapshot, connected: false, models: { ...snapshot.models, groups: [] } }); view.setStoredKey('PRIVATE FIELD');
  expect(host.innerHTML).not.toContain('PRIVATE FIELD'); expect(document.querySelector('[autocomplete="username"]')).not.toBeNull(); expect(document.querySelector('[autocomplete="new-password"]')).not.toBeNull();
  expect(document.querySelector('[data-provider-panel-action="start-openrouter-oauth"]')!.textContent).toBe('Connect with OpenRouter');
  expect(document.querySelector('[data-provider-panel-action="remove-openrouter-key"]')).toBeNull();
});
