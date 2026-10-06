// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { clearKeyCache, updateKeyCache } from '../js/crypto-key-cache.js';
import { getRoutstrModel } from '../js/api-provider-storage.js';
import { buildRoutstrModelSettingsSnapshot, readRoutstrModels } from '../js/routstr-model-settings-view.js';
import { disposeRoutstrModelSettings, getRoutstrModelSettingsView, mountRoutstrModelSettings } from '../js/routstr-model-settings-component.js';
import { onRoutstrModelDropdownChange, toggleRoutstrPrivateMode, renderRoutstrModelDropdown } from '../js/provider-model-controls.js';
import type { RoutstrModelSettingsSnapshot } from '../js/routstr-model-settings-contract.js';
const regular = [{ id: 'claude-sonnet-4.6', name: 'Claude Sonnet' }, { id: 'gpt-6-astra', name: 'GPT' }];
const privateModels = [{ id: 'tinfoil-gemma4-31b', name: 'Gemma Private' }, { id: 'tinfoil-kimi-k2-6', name: 'Kimi Private' }];
function seed() {
  localStorage.setItem('labcharts-routstr-node', 'https://synthetic-node.test');
  updateKeyCache('labcharts-routstr-key', 'sk-PRIVATE-SYNTHETIC');
  localStorage.setItem('labcharts-routstr-models', JSON.stringify(regular));
  localStorage.setItem('labcharts-routstr-private-models', JSON.stringify(privateModels));
  localStorage.setItem('labcharts-routstr-model', regular[0]!.id);
}
function mount(initial: RoutstrModelSettingsSnapshot = buildRoutstrModelSettingsSnapshot()) {
  const panel = document.createElement('div'); panel.id = 'ai-provider-panel';
  const host = document.createElement('div'); host.dataset.routstrModelSettingsHost = ''; panel.append(host); document.body.append(panel);
  return { host, view: mountRoutstrModelSettings(host, initial) };
}
afterEach(() => { disposeRoutstrModelSettings(); clearKeyCache(); localStorage.clear(); document.body.replaceChildren(); });
it.each(['null', '{}', '{bad', '[null, {"id":7}, {"id":"tinfoil-valid","name":"Private"}, {"id":"tinfoil-valid"}, {"id":"regular"}]'])('rejects malformed, duplicate or wrong-mode cached rows without changing a saved private selection: %s', cached => {
  seed(); localStorage.setItem('labcharts-routstr-model', 'tinfoil-saved');
  localStorage.setItem('labcharts-routstr-private-models', cached);
  const snapshot = buildRoutstrModelSettingsSnapshot();
  expect(snapshot.models.selectedModel).toBe('tinfoil-saved'); expect(getRoutstrModel()).toBe('tinfoil-saved');
  expect(snapshot.mode.enabled).toBe(true); expect(snapshot.mode.active).toBe(false);
  expect(readRoutstrModels(true).map(row => row.id)).toEqual(cached.startsWith('[') ? ['tinfoil-valid'] : []);
});
it('projects pricing and modes without raw catalog fields or session keys', () => {
  seed(); localStorage.setItem('labcharts-routstr-model', privateModels[0]!.id);
  localStorage.setItem('labcharts-routstr-private-models', JSON.stringify([{ ...privateModels[0], credential: 'PRIVATE-METADATA', endpoint: 'PRIVATE-ENDPOINT' }]));
  localStorage.setItem('labcharts-routstr-pricing', JSON.stringify({ [privateModels[0]!.id]: { input: 1, output: 2 } }));
  const snapshot = buildRoutstrModelSettingsSnapshot();
  expect(snapshot.connected).toBe(true); expect(snapshot.mode).toEqual({ enabled: true, available: true, active: true });
  expect(snapshot.models.pricing.text).toBe('$1.00/M in · $2.00/M out'); expect(JSON.stringify(snapshot)).not.toContain('PRIVATE-');
});
it('preserves each mode selection through the live compatibility facade and retains selector identity and focus', () => {
  seed(); const { host } = mount(); const select = host.querySelector<HTMLSelectElement>('select')!; select.focus();
  onRoutstrModelDropdownChange(regular[1]!.id); expect(select.value).toBe(regular[1]!.id);
  toggleRoutstrPrivateMode(true); expect(select.value).toBe(privateModels[0]!.id);
  onRoutstrModelDropdownChange(privateModels[1]!.id);
  toggleRoutstrPrivateMode(false); expect(select.value).toBe(regular[1]!.id);
  toggleRoutstrPrivateMode(true); expect(select.value).toBe(privateModels[1]!.id);
  expect(host.querySelector('select')).toBe(select); expect(document.activeElement).toBe(select);
  expect(localStorage.getItem('labcharts-routstr-model-private')).toBe(privateModels[1]!.id);
  expect(localStorage.getItem('labcharts-routstr-model-regular')).toBe(regular[1]!.id);
  for (const text of ['decrypted only inside a verified Tinfoil TEE', 'session, selected model, and billing metadata', 'Web search and images are disabled']) expect(host.textContent).toContain(text);
});
it('does not silently switch the saved model during presentation or disable missing-catalog private selection', () => {
  seed(); localStorage.setItem('labcharts-routstr-model', 'tinfoil-saved'); const { host } = mount();
  renderRoutstrModelDropdown(privateModels);
  const select = host.querySelector<HTMLSelectElement>('select')!;
  expect(select.value).toBe('tinfoil-saved'); expect(select.selectedOptions[0]!.disabled).toBe(true); expect(getRoutstrModel()).toBe('tinfoil-saved');
  expect(host.querySelector<HTMLElement>('#routstr-private-indicator')!.hidden).toBe(true);
  expect(host.textContent).toContain('Private mode remains selected');
  localStorage.setItem('labcharts-routstr-models', '{}'); toggleRoutstrPrivateMode(false);
  expect(getRoutstrModel()).toBe('tinfoil-saved'); expect(host.querySelector<HTMLInputElement>('#routstr-private-toggle')!.checked).toBe(true);
});
it('escapes provider model values and labels, invalidates replaced owners and ignores their delayed updates', () => {
  seed(); const { host, view } = mount();
  view.setModels({ ...view.getModels(), selectedModel: 'saved" unsafe', groups: [{ label: '<img>', options: [{ value: 'model" onclick="unsafe', label: '<svg onload=unsafe>' }] }] });
  expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe('saved" unsafe');
  expect(host.querySelector('svg,img,[onclick]')).toBeNull(); expect(host.querySelector('optgroup option')!.textContent).toBe('<svg onload=unsafe>');
  host.replaceChildren(); const next = mountRoutstrModelSettings(host, buildRoutstrModelSettingsSnapshot());
  expect(view.isCurrent()).toBe(false); view.setModels({ ...view.getModels(), modelDisplay: 'STALE', groups: [] });
  expect(host.textContent).not.toContain('STALE'); expect(next.isCurrent()).toBe(true);
  disposeRoutstrModelSettings(); expect(getRoutstrModelSettingsView()).toBeNull(); expect(next.isCurrent()).toBe(false);
});
it('preserves a private saved ID when the private catalog is absent and renders an honest unavailable explanation', () => {
  seed(); localStorage.setItem('labcharts-routstr-model', 'tinfoil-saved'); localStorage.removeItem('labcharts-routstr-private-models');
  const { host } = mount(); expect(host.querySelector('select')).toBeNull();
  expect(host.querySelector<HTMLInputElement>('#routstr-private-toggle')!.checked).toBe(true);
  expect(host.textContent).toContain('getbased will verify the TEE before sending messages');
  expect(host.querySelector<HTMLElement>('#routstr-private-indicator')!.hidden).toBe(true);
});
