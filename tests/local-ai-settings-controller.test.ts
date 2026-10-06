import { expect, it, vi } from 'vitest';
import { createLocalAiConnectionController } from '../js/local-ai-settings-controller.js';
import type { LocalAiConnectionConfig, LocalAiConnectionServices } from '../js/local-ai-settings-controller.js';
import type { LocalAiSettingsView } from '../js/local-ai-settings-contract.js';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  let current = true, context = 'ollama:direct', selected = 'old';
  let config: LocalAiConnectionConfig = { url: 'https://old.test', apiKey: 'OLD', model: 'old', mode: 'ollama' };
  let draft = { url: 'https://new.test', apiKey: ' NEW ' };
  let status = { status: 'testing' as 'testing' | 'connected' | 'disconnected', text: '' };
  const snapshot = { locationCopy: '', insecureRemote: false, selectedModel: '', pricing: { text: '', tone: 'secondary' as const }, models: [], advisor: null };
  const view: LocalAiSettingsView = { isCurrent: () => current, readConnection: () => draft, setConnection: next => { draft = next; },
    refresh: vi.fn(), setAdvisor: vi.fn(), getSnapshot: () => snapshot, getStatus: () => status, clearPrivateFields: vi.fn(),
    setStatus: vi.fn((next, text) => { status = { status: next, text }; }) };
  const services: LocalAiConnectionServices = { config: () => config, selectedModel: () => selected, context: () => context,
    normalize: url => ({ url: url.trim() }), mixedContent: () => false, sharesMachine: () => false,
    preflight: vi.fn(async () => null), discover: vi.fn(async () => ({ available: true, provider: 'ollama', models: ['new'] })), release: vi.fn(async () => true),
    activate: vi.fn(async () => true), persist: vi.fn(async (next, model) => { config = next; selected = model; }),
    present: vi.fn(async () => { view.setStatus('connected', 'Connected via Ollama (new · this device)'); }), errorText: () => 'UNAVAILABLE', committed: vi.fn() };
  return { view, services, controller: createLocalAiConnectionController(), close: () => { current = false; }, provider: () => { context = 'custom:direct'; }, backend: () => { context = 'ollama:codex'; }, account: () => { config = { ...config, apiKey: 'OTHER' }; }, endpoint: () => { config = { ...config, url: 'https://other.test' }; }, model: () => { selected = 'other'; }, draft: () => { draft = { ...draft, apiKey: 'DIFFERENT' }; } };
}
it.each(['close','provider','backend','account','endpoint','model','draft'] as const)('rejects discovery completing after %s changes', async change => {
  const f = fixture(), discovery = deferred<{ available: boolean; models: string[] }>(); f.services.discover = vi.fn(() => discovery.promise);
  const work = f.controller.test(f.view, f.services); await vi.waitFor(() => expect(f.services.discover).toHaveBeenCalled());
  f[change](); discovery.resolve({ available: true, models: ['new'] }); await work;
  expect(f.services.activate).not.toHaveBeenCalled(); expect(f.services.release).not.toHaveBeenCalled(); expect(f.services.persist).not.toHaveBeenCalled(); expect(f.services.present).not.toHaveBeenCalled();
});
it('passes the exact normalized endpoint and selected model to activation, then persists before presentation', async () => {
  const f = fixture(); await f.controller.test(f.view, f.services);
  expect(f.services.activate).toHaveBeenCalledExactlyOnceWith('https://new.test', 'new'); expect(f.services.persist).toHaveBeenCalledExactlyOnceWith({ url: 'https://new.test', apiKey: 'NEW', model: 'new', mode: 'ollama' }, 'new');
  expect(vi.mocked(f.services.persist).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.services.present).mock.invocationCallOrder[0]!);
  expect(f.view.getStatus().text).toBe('Connected via Ollama (new · this device)'); expect(f.services.committed).toHaveBeenCalledOnce();
});
it('does not persist denied activation or activation accepted after the owner closes', async () => {
  const a = fixture(); a.services.activate = vi.fn(async () => false); await a.controller.test(a.view, a.services); expect(a.services.persist).not.toHaveBeenCalled(); expect(a.view.getStatus().text).toContain('not activated');
  const b = fixture(), consent = deferred<boolean>(); b.services.activate = vi.fn(() => consent.promise); const work = b.controller.test(b.view, b.services);
  await vi.waitFor(() => expect(b.services.activate).toHaveBeenCalled()); b.close(); consent.resolve(true); await work; expect(b.services.persist).not.toHaveBeenCalled();
});
it('single-flights across remount and allows accepted persistence to finish without stale follow-up', async () => {
  const a = fixture(), b = fixture(), write = deferred<void>(); a.services.persist = vi.fn(() => write.promise);
  const work = a.controller.test(a.view, a.services); await vi.waitFor(() => expect(a.services.persist).toHaveBeenCalled()); a.close();
  await a.controller.test(b.view, b.services); expect(b.services.preflight).not.toHaveBeenCalled(); expect(b.services.persist).not.toHaveBeenCalled();
  write.resolve(); await work; expect(a.services.present).not.toHaveBeenCalled(); expect(a.services.committed).not.toHaveBeenCalled(); expect(a.controller.isPending()).toBe(false);
});
it('retains connection and selection on persistence failure and hides unexpected secret-bearing errors', async () => {
  const f = fixture(); f.services.persist = vi.fn(async () => { throw new Error('PRIVATE CREDENTIAL'); }); await f.controller.test(f.view, f.services);
  expect(f.services.config().apiKey).toBe('OLD'); expect(f.services.selectedModel()).toBe('old'); expect(f.view.readConnection().apiKey).toContain('NEW'); expect(f.services.present).not.toHaveBeenCalled(); expect(f.view.getStatus().text).not.toContain('PRIVATE');
});
it('does not save a reachable same-machine endpoint when the previous loaded backend cannot release', async () => {
  const f = fixture(); f.services.sharesMachine = () => true; f.services.release = vi.fn(async () => { f.view.setStatus('disconnected', 'Unload it manually, then retry.'); return false; });
  await f.controller.test(f.view, f.services); expect(f.services.release).toHaveBeenCalledOnce(); expect(f.services.activate).not.toHaveBeenCalled(); expect(f.services.persist).not.toHaveBeenCalled(); expect(f.view.getStatus().text).toContain('manually');
});
it.each(['empty','unavailable','cors','mixed','invalid'] as const)('keeps %s connections out of activation and persistence', async kind => {
  const f = fixture();
  if (kind === 'empty') f.services.discover = vi.fn(async () => ({ available: true, models: [] }));
  if (kind === 'unavailable') f.services.discover = vi.fn(async () => ({ available: false, models: [] }));
  if (kind === 'cors') f.services.preflight = vi.fn(async () => 'Blocked by CORS');
  if (kind === 'mixed') f.services.mixedContent = () => true;
  if (kind === 'invalid') f.services.normalize = () => ({ error: 'Invalid URL' });
  await f.controller.test(f.view, f.services); expect(f.services.activate).not.toHaveBeenCalled(); expect(f.services.persist).not.toHaveBeenCalled(); expect(f.controller.isPending()).toBe(false);
});
