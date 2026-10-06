// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ provider: 'venice', key: 'synthetic-key', balance: vi.fn(), models: vi.fn(async () => []), consent: vi.fn(async () => true), validate: vi.fn(async () => ({ valid: true })) }));
vi.mock('../js/api.js', async original => ({
  ...await original<typeof import('../js/api.js')>(),
  getAIProvider: () => state.provider, getVeniceKey: () => state.key,
  getVeniceBalance: state.balance, fetchVeniceModels: state.models,
  validateVeniceKey: state.validate,
  saveVeniceKey: vi.fn(async (key: string) => { state.key = key; }),
}));
vi.mock('../js/cloud-ai-consent.js', async original => ({ ...await original<typeof import('../js/cloud-ai-consent.js')>(), requestAIProviderActivation: state.consent }));
import { mountVeniceSettings, disposeVeniceSettings } from '../js/venice-settings-component.js';
import { buildVeniceSettingsSnapshot } from '../js/venice-settings-view.js';
import { refreshVeniceBalance, initSettingsModelFetch, handleSaveVeniceKey, handleRemoveVeniceKey } from '../js/provider-panels.js';
import { toggleVeniceE2EE, onVeniceModelDropdownChange } from '../js/provider-model-controls.js';
import { configureProviderModelControlsRuntimeDeps } from '../js/provider-model-controls-runtime.js';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(release => { resolve = release; }); return { promise, resolve }; }
function host() { const target = document.createElement('div'); document.body.append(target); return { target, view: mountVeniceSettings(target, buildVeniceSettingsSnapshot()) }; }
afterEach(() => { disposeVeniceSettings(); document.body.replaceChildren(); localStorage.clear(); vi.clearAllMocks(); state.provider = 'venice'; state.key = 'synthetic-key'; });
it('keeps the latest balance and rejects earlier responses, replaced credentials and replaced views', async () => {
  const { target } = host(); const old = deferred<{ diem: number }>(); const next = deferred<{ diem: number }>();
  state.balance.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const first = refreshVeniceBalance(); const second = refreshVeniceBalance();
  next.resolve({ diem: 2 }); await second; old.resolve({ diem: 0.01 }); await first;
  expect(target.querySelector('#venice-balance')!.textContent).toBe('Balance: $2.00');
  const replaced = deferred<{ diem: number }>(); state.balance.mockReturnValueOnce(replaced.promise);
  const third = refreshVeniceBalance(); disposeVeniceSettings(); mountVeniceSettings(target, buildVeniceSettingsSnapshot());
  replaced.resolve({ diem: 10 }); await third; expect(target.querySelector('#venice-balance')!.textContent).toBe('Balance: loading...');
  const credential = deferred<{ diem: number }>(); state.balance.mockReturnValueOnce(credential.promise);
  const fourth = refreshVeniceBalance(); state.key = 'replacement'; credential.resolve({ diem: 100 }); await fourth;
  expect(target.querySelector('#venice-balance')!.textContent).toBe('Balance: refreshing...');
  state.balance.mockRejectedValueOnce(new Error('synthetic failure')); await refreshVeniceBalance();
  expect(target.querySelector('#venice-balance')!.textContent).toBe('Balance: unavailable');
});
it('rejects a fetched catalog and its credential ownership predicate after key or view replacement', async () => {
  const { target } = host(); const old = deferred<never[]>(); state.models.mockReturnValueOnce(old.promise); state.balance.mockResolvedValueOnce(null);
  initSettingsModelFetch(); const ownership = state.models.mock.calls[0] as unknown as [string, { isCurrent(): boolean }];
  expect(ownership[0]).toBe('synthetic-key'); expect(ownership[1].isCurrent()).toBe(true);
  state.key = 'new-key'; expect(ownership[1].isCurrent()).toBe(false);
  disposeVeniceSettings(); mountVeniceSettings(target, buildVeniceSettingsSnapshot());
  localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'stale', name: 'STALE CATALOG' }]));
  old.resolve([]); await old.promise; await Promise.resolve(); expect(target.textContent).not.toContain('STALE CATALOG');
});
it('restores separate regular and encrypted selections and retains domain capability gates', () => {
  const clear = vi.fn(); const previous = configureProviderModelControlsRuntimeDeps({ clearE2EESession: clear });
  try {
    localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'regular-a' }, { id: 'regular-b' }]));
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-a' }, { id: 'e2ee-b' }]));
    localStorage.setItem('labcharts-venice-model', 'regular-b'); localStorage.setItem('labcharts-venice-model-e2ee', 'e2ee-b');
    const { target } = host();
    toggleVeniceE2EE(true); expect(localStorage.getItem('labcharts-venice-model-regular')).toBe('regular-b');
    expect(localStorage.getItem('labcharts-venice-model')).toBe('e2ee-b');
    expect(target.querySelector<HTMLSelectElement>('#venice-model-select')!.value).toBe('e2ee-b');
    expect(target.querySelector<HTMLElement>('#venice-e2ee-indicator')!.hidden).toBe(false);
    onVeniceModelDropdownChange('e2ee-a'); expect(localStorage.getItem('labcharts-venice-model-e2ee')).toBe('e2ee-a');
    onVeniceModelDropdownChange('e2ee-a'); expect(clear).toHaveBeenCalledOnce();
    toggleVeniceE2EE(false); expect(target.querySelector<HTMLSelectElement>('#venice-model-select')!.value).toBe('regular-b');
    expect(clear).toHaveBeenCalledTimes(2); expect(target.querySelector<HTMLElement>('#venice-e2ee-indicator')!.hidden).toBe(true);
  } finally { configureProviderModelControlsRuntimeDeps(previous); }
});
it('does not remove a credential during a pending validation or continue saving after provider replacement', async () => {
  const { view } = host(); view.setStoredKey('new-synthetic-key'); const gate = deferred<{ valid: boolean }>();
  state.validate.mockReturnValueOnce(gate.promise); localStorage.setItem('labcharts-venice-key', 'KEEP');
  const work = handleSaveVeniceKey(); handleRemoveVeniceKey(); expect(localStorage.getItem('labcharts-venice-key')).toBe('KEEP');
  state.provider = 'openrouter'; gate.resolve({ valid: true }); await work;
  expect(state.consent).not.toHaveBeenCalled(); expect(state.key).toBe('synthetic-key');
});

it('retains encrypted intent with a corrupted catalog without claiming confirmed encrypted-model checks', () => {
  localStorage.setItem('labcharts-venice-model', 'e2ee-a');
  localStorage.setItem('labcharts-venice-e2ee', 'on');
  localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-a' }]));
  const { target } = host();
  localStorage.setItem('labcharts-venice-e2ee-models', '{bad json');
  toggleVeniceE2EE(true);
  expect(localStorage.getItem('labcharts-venice-e2ee')).toBe('on');
  expect(localStorage.getItem('labcharts-venice-model')).toBe('e2ee-a');
  expect(target.querySelector<HTMLInputElement>('#venice-e2ee-toggle')!.checked).toBe(true);
  expect(target.querySelector<HTMLElement>('#venice-e2ee-indicator')!.hidden).toBe(true);
  expect(target.textContent).toContain('Encrypted mode remains enabled');
});
