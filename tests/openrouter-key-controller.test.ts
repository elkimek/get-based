import { expect, it, vi } from 'vitest';
import { saveOpenRouterSettingsKey, isOpenRouterKeySavePending, type OpenRouterKeyServices } from '../js/openrouter-key-controller.js';
import type { OpenRouterSettingsView, OpenRouterSettingsSnapshot } from '../js/openrouter-settings-contract.js';
const initial: OpenRouterSettingsSnapshot = { connected: false, models: { selectedModel: 'model-a', modelDisplay: 'Model A', groups: [], pricing: { text: 'Free', tone: 'success' } } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const state = { current: true, provider: 'openrouter', key: '' };
  const view: OpenRouterSettingsView = {
    isCurrent: () => state.current, getModels: () => initial.models,
    refresh: vi.fn(), setModels: vi.fn(), setSaveState: vi.fn(), setBalance: vi.fn(), setModelCheck: vi.fn(),
    readKey: vi.fn(() => 'synthetic-key'), setStoredKey: vi.fn(), clearKey: vi.fn(),
  };
  const services: OpenRouterKeyServices = {
    currentProvider: () => state.provider, currentKey: () => state.key,
    validate: vi.fn(async () => ({ valid: true })), activate: vi.fn(async () => true),
    save: vi.fn(async key => { state.key = key; }), loadModels: vi.fn(async () => []),
    snapshot: () => ({ ...initial, connected: !!state.key }), clearOAuth: vi.fn(), committed: vi.fn(),
  };
  return { state, view, services };
}
it('does not validate missing fields or absent views', async () => {
  const { view, services } = fixture();
  await saveOpenRouterSettingsKey(null, services);
  vi.mocked(view.readKey).mockReturnValue('  ');
  await saveOpenRouterSettingsKey(view, services);
  expect(services.validate).not.toHaveBeenCalled();
  expect(view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: 'Please enter an API key', tone: 'danger' });
});
it('validates and obtains activation before durably saving and refreshing models', async () => {
  const { state, view, services } = fixture();
  await saveOpenRouterSettingsKey(view, services);
  expect(services.save).toHaveBeenCalledWith('synthetic-key');
  expect(vi.mocked(services.validate).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(services.activate).mock.invocationCallOrder[0]!);
  expect(vi.mocked(services.activate).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(services.save).mock.invocationCallOrder[0]!);
  expect(state.key).toBe('synthetic-key'); expect(services.clearOAuth).toHaveBeenCalledOnce(); expect(services.committed).toHaveBeenCalledOnce();
  expect(view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: '✓ Connected', tone: 'success' });
  expect(isOpenRouterKeySavePending()).toBe(false);
});
it('keeps invalid credentials retryable and never persists declined activation', async () => {
  const { view, services } = fixture();
  vi.mocked(services.validate).mockResolvedValueOnce({ valid: false, error: 'Invalid key' });
  await saveOpenRouterSettingsKey(view, services);
  expect(view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: 'Invalid key', tone: 'danger' });
  vi.mocked(services.activate).mockResolvedValueOnce(false);
  await saveOpenRouterSettingsKey(view, services);
  expect(services.save).not.toHaveBeenCalled();
  expect(view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: 'Connection verified — AI not activated', tone: 'secondary' });
});
it('rejects duplicate submissions while retaining the initiating credential', async () => {
  const { view, services } = fixture(); const gate = deferred<{ valid: boolean }>();
  vi.mocked(services.validate).mockReturnValueOnce(gate.promise);
  const operation = saveOpenRouterSettingsKey(view, services);
  await saveOpenRouterSettingsKey(view, services);
  expect(services.validate).toHaveBeenCalledOnce(); expect(isOpenRouterKeySavePending()).toBe(true);
  gate.resolve({ valid: true }); await operation;
  expect(services.save).toHaveBeenCalledOnce(); expect(isOpenRouterKeySavePending()).toBe(false);
});
it('rejects a replaced view or provider after validation before asking for activation', async () => {
  for (const replacement of ['view','provider']) {
    const { state, view, services } = fixture(); const gate = deferred<{ valid: boolean }>();
    vi.mocked(services.validate).mockReturnValueOnce(gate.promise);
    const operation = saveOpenRouterSettingsKey(view, services);
    if (replacement === 'view') state.current = false; else state.provider = 'venice';
    gate.resolve({ valid: true }); await operation;
    expect(services.activate).not.toHaveBeenCalled(); expect(services.save).not.toHaveBeenCalled();
  }
});
it('does not overwrite a newly replaced stored key after activation is delayed', async () => {
  const { state, view, services } = fixture(); const gate = deferred<boolean>();
  vi.mocked(services.activate).mockReturnValueOnce(gate.promise);
  const operation = saveOpenRouterSettingsKey(view, services);
  await vi.waitFor(() => expect(services.activate).toHaveBeenCalledOnce());
  state.key = 'different-key'; gate.resolve(true); await operation;
  expect(services.save).not.toHaveBeenCalled();
  expect(view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: 'Key settings changed. Review them before retrying.', tone: 'secondary' });
});
it('releases pending on thrown validation or persistence without echoing credential-bearing errors', async () => {
  for (const step of ['validate','save'] as const) {
    const { view, services } = fixture(); vi.mocked(services[step]).mockRejectedValueOnce(new Error('synthetic-key PRIVATE'));
    await saveOpenRouterSettingsKey(view, services);
    expect(isOpenRouterKeySavePending()).toBe(false);
    expect(view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: 'Could not finish this key update. Please retry.', tone: 'danger' });
    expect(services.committed).not.toHaveBeenCalled();
  }
});
it('allows an accepted write to finish after close without starting follow-up requests or UI', async () => {
  const { state, view, services } = fixture(); const gate = deferred<void>();
  vi.mocked(services.save).mockImplementationOnce(async key => { await gate.promise; state.key = key; });
  const operation = saveOpenRouterSettingsKey(view, services);
  await vi.waitFor(() => expect(services.save).toHaveBeenCalledOnce()); state.current = false;
  const updates = vi.mocked(view.setSaveState).mock.calls.length;
  gate.resolve(); await operation;
  expect(state.key).toBe('synthetic-key'); expect(services.loadModels).not.toHaveBeenCalled(); expect(services.clearOAuth).not.toHaveBeenCalled(); expect(services.committed).not.toHaveBeenCalled();
  expect(view.setSaveState).toHaveBeenCalledTimes(updates);
});
it('keeps a committed key when catalog loading fails and releases the retry state', async () => {
  const { state, view, services } = fixture(); vi.mocked(services.loadModels).mockRejectedValueOnce(new Error('offline'));
  await saveOpenRouterSettingsKey(view, services);
  expect(state.key).toBe('synthetic-key'); expect(view.refresh).toHaveBeenCalledWith(expect.objectContaining({ connected: true }));
  expect(view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: 'Could not finish this key update. Please retry.', tone: 'danger' });
});
