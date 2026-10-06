// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { disposeVeniceSettings, getVeniceSettingsView, mountVeniceSettings } from '../js/venice-settings-component.js';
import type { VeniceSettingsSnapshot } from '../js/venice-settings-contract.js';
const snapshot: VeniceSettingsSnapshot = {
  connected: true,
  models: { selectedModel: 'e2ee-a', modelDisplay: 'Encrypted A', groups: [{ label: '', options: [{ value: 'e2ee-a', label: 'Encrypted A' }, { value: 'e2ee-b', label: 'Encrypted B' }] }], pricing: { text: 'Free', tone: 'success' } },
  mode: { enabled: true, available: true, active: true },
};
function mounted(initial = snapshot) {
  const host = document.createElement('section'); host.id = 'settings-modal'; document.body.append(host);
  return { host, view: mountVeniceSettings(host, initial) };
}
afterEach(() => { disposeVeniceSettings(); document.body.replaceChildren(); });
it('keeps credentials out of markup and display state, supports autofill and clears replaced fields', () => {
  const { host, view } = mounted();
  view.setStoredKey('PRIVATE SYNTHETIC KEY');
  const input = host.querySelector<HTMLInputElement>('#venice-key-input')!;
  expect(host.innerHTML).not.toContain('PRIVATE SYNTHETIC KEY');
  input.value = 'PRIVATE AUTOFILL';
  expect(view.readKey()).toBe('PRIVATE AUTOFILL');
  input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  view.refresh({ ...snapshot, models: { ...snapshot.models, pricing: { text: '$1.00/M in · $2.00/M out', tone: 'secondary' } } });
  expect(host.querySelector('#venice-key-input')).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(view.readKey()).toBe('PRIVATE AUTOFILL');
  expect(JSON.stringify(view.getModels())).not.toContain('PRIVATE');
  host.replaceChildren(); const next = mountVeniceSettings(host, snapshot);
  expect(input.value).toBe(''); expect(view.readKey()).toBe('');
  view.setBalance({ text: 'STALE BALANCE', tone: 'danger' }); expect(host.textContent).not.toContain('STALE BALANCE');
  next.setStoredKey('NEXT PRIVATE KEY'); const field = host.querySelector<HTMLInputElement>('#venice-key-input')!;
  disposeVeniceSettings(); expect(field.value).toBe(''); expect(getVeniceSettingsView()).toBeNull();
});
it('retains focused selectors and the open attestation explanation through catalog and status updates', () => {
  const { host, view } = mounted();
  const select = host.querySelector<HTMLSelectElement>('#venice-model-select')!;
  const details = host.querySelector('details')!; details.open = true; select.focus();
  view.setModels({ ...snapshot.models, selectedModel: 'e2ee-b' });
  view.setBalance({ text: 'Balance: $0.25', tone: 'warning' });
  view.setSaveState({ pending: true, text: 'Validating...', tone: 'secondary' });
  expect(host.querySelector('#venice-model-select')).toBe(select); expect(select.value).toBe('e2ee-b'); expect(document.activeElement).toBe(select);
  expect(host.querySelector('details')).toBe(details); expect(details.open).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('#save-venice-key-btn')!.disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('#venice-key-input')!.disabled).toBe(true);
  expect(host.querySelector('#venice-balance')!.textContent).toBe('Balance: $0.25');
});
it('shows the saved unavailable model accurately and escapes provider labels and status text', () => {
  const { host, view } = mounted();
  view.setModels({ ...snapshot.models, selectedModel: 'saved" unsafe', groups: [{ label: '<img src=x>', options: [{ value: 'catalog" onclick="unsafe', label: '<svg onload=unsafe>' }] }] });
  const select = host.querySelector<HTMLSelectElement>('#venice-model-select')!;
  expect(select.value).toBe('saved" unsafe'); expect(select.selectedOptions[0]!.disabled).toBe(true);
  view.setSaveState({ pending: false, text: '<img onerror=unsafe>', tone: 'danger' });
  expect(host.querySelector('svg,img,[onclick]')).toBeNull();
  expect(host.querySelector('optgroup option')!.textContent).toBe('<svg onload=unsafe>');
  expect(host.querySelector('#venice-key-status')!.textContent).toBe('<img onerror=unsafe>');
});
it('preserves missing-catalog encryption preference and the complete limits and metadata disclosure', () => {
  const { host, view } = mounted({ ...snapshot, mode: { enabled: true, available: false, active: true } });
  expect(host.querySelector<HTMLInputElement>('#venice-e2ee-toggle')!.checked).toBe(true);
  expect(host.textContent).toContain('Encrypted mode remains enabled');
  for (const copy of ['TEE + GPU checked', 'Session freshness', 'encryption-key binding', 'debug mode', 'TEE, verified with DCAP', "NVIDIA's signed GPU result (NRAS)", 'they do not prove that both are running together', 'Approved code measurements', 'source of each response', 'Venice still sees your API key', 'deployment proxy relays GPU evidence to NRAS', 'NVIDIA learns', 'Web search and images are disabled']) expect(host.textContent).toContain(copy);
  view.setMode({ enabled: false, available: true, active: false });
  expect(host.querySelector<HTMLElement>('#venice-e2ee-indicator')!.hidden).toBe(true);
  expect(host.querySelector<HTMLInputElement>('#venice-e2ee-toggle')!.checked).toBe(false);
});
it('preserves labels, password-manager, provider delegates and unconfigured controls', () => {
  const { host } = mounted({ ...snapshot, connected: false, models: { ...snapshot.models, groups: [] }, mode: { enabled: false, available: false, active: false } });
  expect(host.querySelector('[autocomplete="username"]')!.getAttribute('value')).toBe('venice');
  expect(host.querySelector('#venice-key-input')!.getAttribute('autocomplete')).toBe('new-password');
  expect(host.querySelector('label[for="venice-key-input"]')).not.toBeNull();
  expect(host.querySelector('[data-provider-panel-action="save-venice-key"]')).not.toBeNull();
  expect(host.querySelector('[data-provider-panel-action="remove-venice-key"]')).toBeNull();
  expect(host.querySelector('#venice-e2ee-toggle')).toBeNull();
});
