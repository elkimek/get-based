// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ provider: 'ppq', key: 'SYNTHETIC KEY', credit: 'SYNTHETIC CREDIT', balance: vi.fn(), models: vi.fn(async () => []), consent: vi.fn(async () => true), validate: vi.fn(async () => ({ valid: true })), confirm: vi.fn(async (_message: string) => false) }));
vi.mock('../js/api-provider-storage.js', async original => ({ ...await original<typeof import('../js/api-provider-storage.js')>(), getPpqKey: () => state.key, getPpqCreditId: () => state.credit }));
vi.mock('../js/api.js', async original => ({
  ...await original<typeof import('../js/api.js')>(), getAIProvider: () => state.provider, getPpqKey: () => state.key, getPpqCreditId: () => state.credit,
  getPpqBalance: state.balance, fetchPpqModels: state.models, validatePpqKey: state.validate, savePpqKey: vi.fn(async (key: string) => { state.key = key; }),
}));
vi.mock('../js/crypto.js', async original => ({ ...await original<typeof import('../js/crypto.js')>(), updateKeyCache: (_name: string, value: string | null) => { state.key = value || ''; } }));
vi.mock('../js/utils.js', async original => ({ ...await original<typeof import('../js/utils.js')>(), showConfirmDialog: state.confirm, showNotification: vi.fn() }));
import { disposePpqSettings, mountPpqSettings } from '../js/ppq-settings-component.js';
import { buildPpqSettingsSnapshot } from '../js/ppq-settings-view.js';
import { configurePpqPanels, refreshPpqBalance, initSettingsPpqPanel, handleRemovePpqKey, handleSavePpqKey } from '../js/provider-ppq-panels.js';
import { togglePpqPrivateMode } from '../js/provider-model-controls.js';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(release => { resolve = release; }); return { promise, resolve }; }
function mounted() { const host = document.createElement('div'); document.body.append(host); return { host, view: mountPpqSettings(host, buildPpqSettingsSnapshot()) }; }
beforeEach(() => { state.provider = 'ppq'; state.key = 'SYNTHETIC KEY'; state.credit = 'SYNTHETIC CREDIT'; configurePpqPanels({ requestProviderActivation: state.consent, returnToChatIfOnboarding: () => {} }); });
afterEach(() => { disposePpqSettings(); document.body.replaceChildren(); localStorage.clear(); vi.clearAllMocks(); });
it('accepts only the latest balance and rejects a replaced account credit ID or view', async () => {
  const s = mounted(); const old = deferred<number>(); const next = deferred<number>(); state.balance.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const first = refreshPpqBalance(); const second = refreshPpqBalance(); next.resolve(2); await second; old.resolve(0); await first;
  expect(s.host.querySelector('#ppq-balance')!.textContent).toBe('Balance: $2.00'); expect(s.view.getTopup().open).toBe(false);
  const credit = deferred<number>(); state.balance.mockReturnValueOnce(credit.promise); const work = refreshPpqBalance(); state.credit = 'OTHER CREDIT'; credit.resolve(9); await work;
  expect(s.host.textContent).not.toContain('$9.00');
  const replaced = deferred<number>(); state.balance.mockReturnValueOnce(replaced.promise); const pending = refreshPpqBalance(); disposePpqSettings(); mountPpqSettings(s.host, buildPpqSettingsSnapshot()); replaced.resolve(10); await pending;
  expect(s.host.textContent).not.toContain('$10.00'); state.balance.mockRejectedValueOnce(new Error('PRIVATE ERROR')); await refreshPpqBalance(); expect(s.host.textContent).toContain('Balance: unavailable'); expect(s.host.textContent).not.toContain('PRIVATE ERROR');
});
it('updates catalog controls in place and passes an account guard before domain cache writes', async () => {
  const s = mounted(); const field = s.host.querySelector<HTMLInputElement>('#ppq-key-input')!; field.value = 'PRIVATE DRAFT'; field.focus();
  const gate = deferred<never[]>(); state.models.mockReturnValueOnce(gate.promise); state.balance.mockResolvedValueOnce(2);
  initSettingsPpqPanel(); const ownership = state.models.mock.calls[0] as unknown as [string, { isCurrent(): boolean }]; expect(ownership[1].isCurrent()).toBe(true);
  localStorage.setItem('labcharts-ppq-private-models', JSON.stringify([{ id: 'private/glm-5-2' }])); gate.resolve([]); await gate.promise; await Promise.resolve();
  expect(s.host.querySelector('#ppq-key-input')).toBe(field); expect(field.value).toBe('PRIVATE DRAFT'); expect(document.activeElement).toBe(field); expect(s.host.querySelector('#ppq-private-toggle')).not.toBeNull();
  state.credit = 'OTHER CREDIT'; expect(ownership[1].isCurrent()).toBe(false);
});
it('does not remove a replaced credential after the funded-account confirmation has opened', async () => {
  const s = mounted(); state.balance.mockResolvedValueOnce(1.25); const gate = deferred<boolean>(); state.confirm.mockReturnValueOnce(gate.promise);
  localStorage.setItem('labcharts-ppq-key', 'KEEP'); localStorage.setItem('labcharts-ppq-models', 'KEEP'); const work = handleRemovePpqKey();
  await vi.waitFor(() => expect(state.confirm).toHaveBeenCalled()); expect(state.confirm.mock.calls[0]![0]).toContain('$1.25 remaining');
  state.key = 'OTHER KEY'; gate.resolve(true); await work; expect(localStorage.getItem('labcharts-ppq-key')).toBe('KEEP'); expect(localStorage.getItem('labcharts-ppq-models')).toBe('KEEP');
  expect(s.host.querySelector<HTMLButtonElement>('#save-ppq-key-btn')!.disabled).toBe(false);
});
it('blocks removal during validation and stops key save before consent after account replacement', async () => {
  const s = mounted(); s.view.setStoredKey('NEXT KEY'); const gate = deferred<{ valid: boolean }>(); state.validate.mockReturnValueOnce(gate.promise);
  const work = handleSavePpqKey(); await handleRemovePpqKey(); expect(state.balance).not.toHaveBeenCalled(); expect(state.confirm).not.toHaveBeenCalled();
  state.credit = 'OTHER CREDIT'; gate.resolve({ valid: true }); await work; expect(state.consent).not.toHaveBeenCalled(); expect(state.key).toBe('SYNTHETIC KEY');
});
it('retains private intent and separate model slots without claiming capability from a malformed catalog', () => {
  localStorage.setItem('labcharts-ppq-model', 'regular-b'); localStorage.setItem('labcharts-ppq-models', JSON.stringify([{ id: 'regular-a' }, { id: 'regular-b' }]));
  localStorage.setItem('labcharts-ppq-private-models', JSON.stringify([{ id: 'private/a' }, { id: 'private/b' }])); localStorage.setItem('labcharts-ppq-model-private', 'private/b');
  const s = mounted(); togglePpqPrivateMode(true); expect(localStorage.getItem('labcharts-ppq-model-regular')).toBe('regular-b'); expect(s.host.querySelector<HTMLSelectElement>('#ppq-model-select')!.value).toBe('private/b');
  togglePpqPrivateMode(false); expect(s.host.querySelector<HTMLSelectElement>('#ppq-model-select')!.value).toBe('regular-b');
  localStorage.setItem('labcharts-ppq-private-models', '{bad'); togglePpqPrivateMode(true); expect(localStorage.getItem('labcharts-ppq-private-mode')).toBe('on');
  expect(s.host.textContent).toContain('Private mode remains enabled'); expect(s.host.querySelector<HTMLElement>('#ppq-private-indicator')!.hidden).toBe(true);
});
it('shows generic removal errors and re-enables key controls without hiding the error', async () => {
  const s = mounted(); state.balance.mockRejectedValueOnce(new Error('PRIVATE ERROR')); await handleRemovePpqKey();
  expect(s.host.textContent).toContain('Could not remove this key. Please retry.'); expect(s.host.textContent).not.toContain('PRIVATE ERROR'); expect(s.host.querySelector<HTMLButtonElement>('#save-ppq-key-btn')!.disabled).toBe(false);
});
