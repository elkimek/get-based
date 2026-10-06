// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createPpqAccountController } from '../js/ppq-account-controller.js';
import { disposePpqSettings, mountPpqSettings } from '../js/ppq-settings-component.js';
import type { PpqSettingsSnapshot } from '../js/ppq-settings-contract.js';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(release => { resolve = release; }); return { promise, resolve }; }
function setup() {
  let provider = 'ppq', key = '', creditId = '', busy = false;
  const snapshot = (): PpqSettingsSnapshot => ({ connected: !!key, mode: { enabled: false, available: false, active: false }, models: { selectedModel: 'a', modelDisplay: 'A', groups: [], pricing: { text: '', tone: 'secondary' } } });
  const host = document.createElement('div'); document.body.append(host); const view = mountPpqSettings(host, snapshot());
  const create = vi.fn(async () => ({ api_key: 'PRIVATE KEY', credit_id: 'PRIVATE CREDIT' }));
  const save = vi.fn(async (next: string) => { key = next; }); const saveCredit = vi.fn((next: string) => { creditId = next; });
  const load = vi.fn(async () => {}); const activate = vi.fn(async () => true);
  const controller = createPpqAccountController({ view: () => view.isCurrent() ? view : null, provider: () => provider, key: () => key, creditId: () => creditId, busy: () => busy, create, saveKey: save, saveCreditId: saveCredit, loadModels: load, activate, snapshot });
  return { host, view, controller, create, save, saveCredit, load, activate, key: () => key, creditId: () => creditId, replace: (next = 'replacement') => { key = next; }, provider: (next: string) => { provider = next; }, busy: () => { busy = true; } };
}
afterEach(() => { disposePpqSettings(); document.body.replaceChildren(); });
it('reveals durably stored recovery credentials before catalog work and preserves declined activation', async () => {
  const s = setup(); const gate = deferred<void>(); s.load.mockReturnValueOnce(gate.promise); s.activate.mockResolvedValueOnce(false);
  const work = s.controller.create(); await vi.waitFor(() => expect(s.view.readAccount()?.apiKey).toBe('PRIVATE KEY'));
  expect(s.key()).toBe('PRIVATE KEY'); expect(s.creditId()).toBe('PRIVATE CREDIT'); expect(s.activate).not.toHaveBeenCalled();
  expect(s.controller.isPending()).toBe(true); gate.resolve(); await work;
  expect(s.view.readAccount()?.activated).toBe(false); expect(s.controller.isPending()).toBe(false);
});
it('retains the only recovery credentials and visible failure state when catalog work fails', async () => {
  const s = setup(); s.load.mockRejectedValueOnce(new Error('PRIVATE EXCEPTION')); await s.controller.create();
  expect(s.view.readAccount()?.apiKey).toBe('PRIVATE KEY'); expect(s.host.textContent).toContain('Could not finish account creation');
  expect(s.host.textContent).not.toContain('PRIVATE EXCEPTION'); expect(s.activate).not.toHaveBeenCalled(); expect(s.controller.isPending()).toBe(false);
});
it('preserves an explicitly created account after close without catalog, consent or stale UI follow-up', async () => {
  const s = setup(); const gate = deferred<{ api_key: string; credit_id: string }>(); s.create.mockReturnValueOnce(gate.promise);
  const work = s.controller.create(); disposePpqSettings(); gate.resolve({ api_key: 'CLOSED KEY', credit_id: 'CLOSED CREDIT' }); await work;
  expect(s.key()).toBe('CLOSED KEY'); expect(s.creditId()).toBe('CLOSED CREDIT'); expect(s.load).not.toHaveBeenCalled(); expect(s.activate).not.toHaveBeenCalled(); expect(s.view.readAccount()).toBeNull();
});
it('never overwrites a replacement account and rejects duplicate creation and other account work', async () => {
  const s = setup(); const gate = deferred<{ api_key: string; credit_id: string }>(); s.create.mockReturnValueOnce(gate.promise);
  const work = s.controller.create(); await s.controller.create(); expect(s.create).toHaveBeenCalledOnce();
  s.replace(); gate.resolve({ api_key: 'STALE KEY', credit_id: 'STALE CREDIT' }); await work; expect(s.save).not.toHaveBeenCalled(); expect(s.saveCredit).not.toHaveBeenCalled(); expect(s.host.querySelector<HTMLButtonElement>('[data-provider-panel-action="create-ppq-account"]')!.disabled).toBe(false);
  const next = setup(); next.busy(); await next.controller.create(); expect(next.create).not.toHaveBeenCalled();
});
it('rejects malformed creation responses and never echoes credential-bearing exceptions', async () => {
  const s = setup(); s.create.mockResolvedValueOnce({ api_key: '', credit_id: 'CREDIT' }); await s.controller.create(); expect(s.save).not.toHaveBeenCalled();
  s.create.mockRejectedValueOnce(new Error('PRIVATE ERROR')); await s.controller.create(); expect(s.host.textContent).not.toContain('PRIVATE ERROR'); expect(s.host.textContent).toContain('Could not create this account');
});
it('does not reveal credentials or invoke activation after provider replacement during catalog loading', async () => {
  const s = setup(); const gate = deferred<void>(); s.load.mockReturnValueOnce(gate.promise); const work = s.controller.create();
  await vi.waitFor(() => expect(s.view.readAccount()).not.toBeNull()); s.provider('venice'); s.view.hideAccount(); gate.resolve(); await work;
  expect(s.activate).not.toHaveBeenCalled(); expect(s.view.readAccount()).toBeNull(); expect(s.key()).toBe('PRIVATE KEY');
});

it('reveals recovery details when encrypted storage rejects the created anonymous account', async () => {
  const s = setup(); s.save.mockRejectedValueOnce(new Error('PRIVATE STORAGE FAILURE')); await s.controller.create();
  expect(s.key()).toBe(''); expect(s.creditId()).toBe(''); expect(s.saveCredit).not.toHaveBeenCalled(); expect(s.load).not.toHaveBeenCalled(); expect(s.activate).not.toHaveBeenCalled();
  expect(s.view.readAccount()).toEqual({ apiKey: 'PRIVATE KEY', creditId: 'PRIVATE CREDIT', activated: false });
  expect(s.host.textContent).toContain('Copy the displayed recovery details before closing'); expect(s.host.textContent).not.toContain('PRIVATE STORAGE FAILURE');
  expect(s.host.querySelector('[data-clipboard-text]')).toBeNull(); expect(s.controller.isPending()).toBe(false);
});
