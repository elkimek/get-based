// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ provider: 'openrouter', key: 'synthetic-key', model: 'model-a', balance: vi.fn(), pricing: vi.fn(), models: vi.fn(async (): Promise<{ id: string; name: string }[]> => []), smoke: vi.fn(), consent: vi.fn(async () => true) }));
vi.mock('../js/api.js', async original => ({
  ...await original<typeof import('../js/api.js')>(),
  getAIProvider: () => state.provider, setAIProvider: (value: string) => { state.provider = value; },
  getOpenRouterKey: () => state.key, getOpenRouterModel: () => state.model, setOpenRouterModel: (value: string) => { state.model = value; },
  getOpenRouterModelDisplay: () => state.model, getOpenRouterBalance: state.balance,
  fetchOpenRouterModels: state.models, fetchOpenRouterModelPricing: state.pricing,
  getVeniceKey: () => 'synthetic-venice-key', fetchVeniceModels: vi.fn(async () => []), getVeniceBalance: vi.fn(async () => null),
  hasAIProvider: () => true,
}));
vi.mock('../js/cloud-ai-consent.js', async original => ({ ...await original<typeof import('../js/cloud-ai-consent.js')>(), requestAIProviderActivation: state.consent }));
import { mountOpenRouterSettings, disposeOpenRouterSettings } from '../js/openrouter-settings-component.js';
import { buildOpenRouterSettingsSnapshot } from '../js/openrouter-settings-view.js';
import { refreshOpenRouterBalance, initSettingsModelFetch, switchAIProvider, toggleAIPause, configureProviderPanelDeps } from '../js/provider-panels.js';
import { applyCustomOpenRouterModel, onOpenRouterDropdownChange } from '../js/provider-model-controls.js';
import { configureProviderModelControlsRuntimeDeps } from '../js/provider-model-controls-runtime.js';
const previous = configureProviderModelControlsRuntimeDeps({ callClaudeAPI: state.smoke });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function host() { const target = document.createElement('div'); target.id = 'ai-provider-panel'; document.body.append(target); const view = mountOpenRouterSettings(target, buildOpenRouterSettingsSnapshot()); return { target, view }; }
afterEach(() => { disposeOpenRouterSettings(); document.body.replaceChildren(); vi.clearAllMocks(); state.provider = 'openrouter'; state.model = 'model-a'; state.key = 'synthetic-key'; configureProviderModelControlsRuntimeDeps(previous); configureProviderModelControlsRuntimeDeps({ callClaudeAPI: state.smoke }); });
it('retains a saved manual choice when its persisted catalog is damaged', () => {
  for (const cached of ['null', '{}', '[null, {"id": 7}, {"id": "valid", "name": "Visible model"}]']) {
    localStorage.setItem('labcharts-openrouter-models', cached);
    const snapshot = buildOpenRouterSettingsSnapshot();
    expect(snapshot.models.selectedModel).toBe('model-a');
    expect(snapshot.models.groups.flatMap(group => group.options).map(option => option.value)).toEqual(cached.startsWith('[') ? ['valid'] : []);
  }
  localStorage.removeItem('labcharts-openrouter-models');
});
it('accepts the latest balance response and rejects older results', async () => {
  host(); const old = deferred<{ remaining: number }>(); const next = deferred<{ remaining: number }>();
  state.balance.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const first = refreshOpenRouterBalance(); const second = refreshOpenRouterBalance();
  next.resolve({ remaining: 2 }); await second; old.resolve({ remaining: 0.01 }); await first;
  expect(document.querySelector('#or-balance')!.textContent).toBe('Balance: $2.00');
});
it('rejects balance replies after key or view replacement and renders retryable current failures', async () => {
  const { target } = host(); const old = deferred<{ remaining: number }>(); state.balance.mockReturnValueOnce(old.promise);
  const work = refreshOpenRouterBalance(); disposeOpenRouterSettings(); mountOpenRouterSettings(target, buildOpenRouterSettingsSnapshot()); old.resolve({ remaining: 10 }); await work;
  expect(document.querySelector('#or-balance')!.textContent).toBe('Balance: loading...');
  state.balance.mockRejectedValueOnce(new Error('offline')); await refreshOpenRouterBalance(); expect(document.querySelector('#or-balance')!.textContent).toBe('Balance: unavailable');
});
it('does not apply a loaded catalog to a replaced provider view', async () => {
  const { target } = host(); const old = deferred<{ id: string; name: string }[]>(); state.models.mockReturnValueOnce(old.promise); state.balance.mockResolvedValueOnce(null);
  initSettingsModelFetch(); disposeOpenRouterSettings(); mountOpenRouterSettings(target, buildOpenRouterSettingsSnapshot());
  old.resolve([{ id: 'stale-model', name: 'STALE MODEL' }]); await old.promise; await Promise.resolve();
  expect(target.textContent).not.toContain('STALE MODEL'); expect(document.querySelector('#openrouter-model-select')).toBeNull();
});
it('does not fetch pricing or update health for an old manual-model probe after the model changes', async () => {
  const { view } = host(); view.setModels({ ...view.getModels(), groups: [{ label: '', options: [{ value: 'model-a', label: 'A' },{ value: 'model-b', label: 'B' }] }] });
  const old = deferred<unknown>(); state.smoke.mockReturnValueOnce(old.promise);
  const work = applyCustomOpenRouterModel('custom/model'); onOpenRouterDropdownChange('model-b'); old.resolve({}); await work;
  expect(state.pricing).not.toHaveBeenCalled(); expect(document.querySelector('#openrouter-model-health')!.textContent).toBe(''); expect(state.model).toBe('model-b');
});
it('rejects manual-model replies after the initiating credential or provider changes', async () => {
  for (const change of ['key','provider']) {
    const { view } = host(); view.setModels({ ...view.getModels(), groups: [{ label: '', options: [{ value: 'model-a', label: 'A' }] }] });
    const old = deferred<unknown>(); state.smoke.mockReturnValueOnce(old.promise); const work = applyCustomOpenRouterModel('custom/model');
    if (change === 'key') state.key = 'replacement'; else state.provider = 'venice';
    old.resolve({}); await work; expect(state.pricing).not.toHaveBeenCalled(); disposeOpenRouterSettings(); document.body.replaceChildren(); state.key = 'synthetic-key'; state.provider = 'openrouter';
  }
});
it('does not roll back a newer provider selection after old consent is declined', async () => {
  host(); const old = deferred<boolean>(); state.consent.mockReturnValueOnce(old.promise).mockResolvedValueOnce(true);
  const first = switchAIProvider('venice');
  await vi.waitFor(() => expect(state.consent).toHaveBeenCalledOnce());
  const second = switchAIProvider('openrouter'); await second;
  old.resolve(false); await first; expect(state.provider).toBe('openrouter');
});
it('restores the initiating selection when its view closes during consent without rewriting its replacement', async () => {
  const { target } = host(); const old = deferred<boolean>(); state.consent.mockReturnValueOnce(old.promise); let current = true;
  const work = switchAIProvider('venice', { isCurrent: () => current }); current = false; target.textContent = 'CLI replacement'; old.resolve(true); await work;
  expect(state.provider).toBe('openrouter'); expect(target.textContent).toBe('CLI replacement');
});

it('retains the public pause helper and its configured focus refresh port', () => {
  const refresh = vi.fn(), previous = configureProviderPanelDeps({ loadFocusCard: refresh });
  const stored = localStorage.getItem('labcharts-ai-paused');
  try {
    toggleAIPause(false); expect(localStorage.getItem('labcharts-ai-paused')).toBe('true');
    toggleAIPause(true); expect(localStorage.getItem('labcharts-ai-paused')).toBe('false');
    expect(refresh).toHaveBeenCalledTimes(2);
  } finally {
    configureProviderPanelDeps(previous);
    if (stored === null) localStorage.removeItem('labcharts-ai-paused'); else localStorage.setItem('labcharts-ai-paused',stored);
  }
});
