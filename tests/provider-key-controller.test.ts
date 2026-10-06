import { expect, it, vi } from 'vitest';
import { createProviderKeyController, type ProviderKeyServices, type ProviderKeyView } from '../js/provider-key-controller.js';

type Snapshot = { connected: boolean };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(release => { resolve = release; });
  return { promise, resolve };
}
function fixture(provider: string) {
  const state = { provider, key: '', current: true };
  const view: ProviderKeyView<Snapshot> = {
    isCurrent: () => state.current,
    readKey: () => 'synthetic-key',
    refresh: vi.fn(),
    setSaveState: vi.fn(),
  };
  const services: ProviderKeyServices<Snapshot> = {
    currentProvider: () => state.provider,
    currentKey: () => state.key,
    validate: vi.fn(async () => ({ valid: true })),
    activate: vi.fn(async () => true),
    save: vi.fn(async key => { state.key = key; }),
    loadModels: vi.fn(async () => []),
    snapshot: () => ({ connected: !!state.key }),
    committed: vi.fn(),
  };
  return { controller: createProviderKeyController<Snapshot>(provider), state, view, services };
}
it.each(['openrouter', 'venice'])('captures %s identity before validation and rejects a late catalog reply', async provider => {
  const { controller, state, view, services } = fixture(provider);
  state.provider = 'other';
  await controller.save(view, services);
  expect(services.validate).not.toHaveBeenCalled();
  state.provider = provider;
  const gate = deferred<unknown>();
  vi.mocked(services.loadModels).mockReturnValueOnce(gate.promise);
  const work = controller.save(view, services);
  await vi.waitFor(() => expect(services.loadModels).toHaveBeenCalledOnce());
  expect(controller.isPending()).toBe(true);
  expect(view.refresh).toHaveBeenCalledOnce();
  state.key = 'replacement-key';
  gate.resolve([]);
  await work;
  expect(services.committed).not.toHaveBeenCalled();
  expect(view.refresh).toHaveBeenCalledOnce();
  expect(controller.isPending()).toBe(false);
  expect(view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: 'Key settings changed. Review them before retrying.', tone: 'secondary' });
});
it('keeps provider attempts independent and prevents a remounted view from racing an accepted write', async () => {
  const first = fixture('openrouter');
  const second = fixture('venice');
  const gate = deferred<void>();
  vi.mocked(first.services.save).mockImplementationOnce(async key => { await gate.promise; first.state.key = key; });
  const work = first.controller.save(first.view, first.services);
  await vi.waitFor(() => expect(first.services.save).toHaveBeenCalledOnce());
  first.state.current = false;
  const replacement = fixture('openrouter');
  await first.controller.save(replacement.view, replacement.services);
  expect(replacement.services.validate).not.toHaveBeenCalled();
  expect(replacement.view.setSaveState).toHaveBeenLastCalledWith({ pending: false, text: 'An earlier key update is still finishing. Please retry shortly.', tone: 'secondary' });
  await second.controller.save(second.view, second.services);
  expect(second.services.committed).toHaveBeenCalledOnce();
  expect(second.state.key).toBe('synthetic-key');
  expect(first.controller.isPending()).toBe(true);
  gate.resolve();
  await work;
  expect(first.state.key).toBe('synthetic-key');
  expect(first.services.loadModels).not.toHaveBeenCalled();
  expect(first.controller.isPending()).toBe(false);
  await first.controller.save(replacement.view, replacement.services);
  expect(replacement.services.committed).toHaveBeenCalledOnce();
});
