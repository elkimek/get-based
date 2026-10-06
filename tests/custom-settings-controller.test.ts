import { expect, it, vi } from 'vitest';
import { createCustomSettingsController } from '../js/custom-settings-controller.js';
import type { CustomSettingsServices } from '../js/custom-settings-controller.js';
import type { CustomSettingsView } from '../js/custom-settings-contract.js';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  let current = true, provider = 'custom', url = 'https://old.test/v1', key = 'OLD';
  let candidate = { url: ' https://new.test/v1/ ', key: ' SECRET ' };
  const snapshot = { connected: true, models: { selectedModel: '', modelDisplay: '', groups: [], pricing: { text: '', tone: 'secondary' as const } } };
  const view: CustomSettingsView = { isCurrent: () => current, readConnection: () => candidate, setConnection: next => { candidate = next; }, readManualModel: () => '', clearPrivateFields: vi.fn(), getModels: () => snapshot.models, setModels: vi.fn(), refresh: vi.fn(), setSaveState: vi.fn() };
  const services: CustomSettingsServices = { provider: () => provider, url: () => url, key: () => key,
    validate: vi.fn(async () => ({ valid: true })), activate: vi.fn(async () => true), persist: vi.fn(async (nextUrl, nextKey) => { url = nextUrl; key = nextKey; }), load: vi.fn(async () => {}), snapshot: () => snapshot, notify: vi.fn() };
  return { view, services, controller: createCustomSettingsController(), close: () => { current = false; }, provider: () => { provider = 'venice'; }, account: () => { key = 'REPLACEMENT'; }, endpoint: () => { url = 'https://replaced.test/v1'; } };
}
it.each(['close','provider','account','endpoint','draft'] as const)('rejects validation completing after %s changes', async change => {
  const f = fixture(), result = deferred<{ valid: boolean }>(); f.services.validate = vi.fn(() => result.promise);
  const pending = f.controller.save(f.view, f.services);
  if (change === 'draft') f.view.setConnection({ url: 'https://different.test', key: 'OTHER' }); else f[change]();
  result.resolve({ valid: true }); await pending; expect(f.services.activate).not.toHaveBeenCalled(); expect(f.services.persist).not.toHaveBeenCalled();
});
it('preserves exact normalized endpoint consent, saves once, then loads with owner/account guard', async () => {
  const f = fixture(); await f.controller.save(f.view, f.services);
  expect(f.services.validate).toHaveBeenCalledExactlyOnceWith('https://new.test/v1', 'SECRET'); expect(f.services.activate).toHaveBeenCalledExactlyOnceWith('https://new.test/v1');
  expect(f.services.persist).toHaveBeenCalledExactlyOnceWith('https://new.test/v1', 'SECRET'); expect(f.services.load).toHaveBeenCalledTimes(1);
  const current = vi.mocked(f.services.load).mock.calls[0]![2]; expect(current()).toBe(true); f.close(); expect(current()).toBe(false);
});
it('does not persist denied consent and rejects consent completing after endpoint replacement', async () => {
  const a = fixture(); a.services.activate = vi.fn(async () => false); await a.controller.save(a.view, a.services); expect(a.services.persist).not.toHaveBeenCalled();
  const b = fixture(), consent = deferred<boolean>(); b.services.activate = vi.fn(() => consent.promise); const pending = b.controller.save(b.view, b.services);
  await vi.waitFor(() => expect(b.services.activate).toHaveBeenCalled()); b.endpoint(); consent.resolve(true); await pending; expect(b.services.persist).not.toHaveBeenCalled();
});
it('single-flights saves/removals across remounts and finishes accepted persistence after closure', async () => {
  const a = fixture(), b = fixture(), write = deferred<void>(); a.services.persist = vi.fn(() => write.promise);
  const pending = a.controller.save(a.view, a.services); await vi.waitFor(() => expect(a.services.persist).toHaveBeenCalled()); a.close();
  await a.controller.save(b.view, b.services); await a.controller.remove(b.view, b.services); expect(b.services.persist).not.toHaveBeenCalled();
  write.resolve(); await pending; expect(a.services.load).not.toHaveBeenCalled(); expect(a.controller.isPending()).toBe(false);
});
it('reports failures without leaking a key and allows retry without losing drafts', async () => {
  const f = fixture(); f.services.validate = vi.fn(async () => ({ valid: false, error: 'Invalid SECRET' })); await f.controller.save(f.view, f.services);
  expect(vi.mocked(f.view.setSaveState).mock.calls.at(-1)![0].text).toBe('Invalid [redacted]'); expect(f.view.readConnection().key).toContain('SECRET');
  f.services.validate = vi.fn(async () => { throw new Error('PRIVATE-ERROR'); }); await f.controller.save(f.view, f.services);
  expect(vi.mocked(f.view.setSaveState).mock.calls.at(-1)![0].text).not.toContain('PRIVATE'); expect(f.controller.isPending()).toBe(false);
});
it('removal waits for durability, scrubs owned private fields, and preserves failed connection state', async () => {
  const a = fixture(); await a.controller.remove(a.view, a.services); expect(a.services.persist).toHaveBeenCalledExactlyOnceWith('', ''); expect(a.view.clearPrivateFields).toHaveBeenCalledTimes(1);
  const b = fixture(); b.services.persist = vi.fn(async () => { throw new Error('PRIVATE'); }); await b.controller.remove(b.view, b.services); expect(b.view.clearPrivateFields).not.toHaveBeenCalled(); expect(vi.mocked(b.view.setSaveState).mock.calls.at(-1)![0].pending).toBe(false);
});
