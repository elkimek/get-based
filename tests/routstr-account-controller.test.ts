// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRoutstrAccountController } from '../js/routstr-account-controller.js';
import { disposeRoutstrSettings, mountRoutstrSettings } from '../js/routstr-settings-component.js';
import { initialRoutstrSettingsState } from '../js/routstr-settings-contract.js';
import type { RoutstrSettingsView } from '../js/routstr-settings-contract.js';
const node = 'https://original.test';
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  let selected = node, provider = 'routstr', backend = 'direct', view: RoutstrSettingsView;
  const keys = new Map<string,string>([[node, '']]);
  const services = { view: () => view, provider: () => provider, backend: () => backend, node: () => selected, key: (node: string) => keys.get(node) || '',
    validate: vi.fn(async (_value: string): Promise<{ valid: boolean; error?: string }> => ({ valid: true })), activate: vi.fn(async () => true),
    save: vi.fn(async (value: string, node: string, expected: string) => { if ((keys.get(node) || '') !== expected) throw new Error('changed'); keys.set(node,value); }),
    redeem: vi.fn(async (_value: string, node: string, expected: string): Promise<{ api_key?: unknown }> => { if ((keys.get(node) || '') !== expected) throw new Error('changed'); keys.set(node,'sk-CREATED'); return { api_key: 'sk-CREATED' }; }),
    models: vi.fn(async (_current: () => boolean) => {}), connected: vi.fn(), removed: vi.fn(), writeClipboard: vi.fn(async (_value: string) => {}), scheduleClear: vi.fn() };
  const controller = createRoutstrAccountController(services);
  function mount() { const host = document.body.appendChild(document.createElement('div')); view = mountRoutstrSettings(host, initialRoutstrSettingsState(selected, !!services.key(selected)), { wallet: () => {}, node: () => {}, mints: () => {}, refreshWallet: () => {}, refreshNode: () => {}, refunds: () => {}, copyRecovery: () => {}, reclaimRecovery: () => {}, account: { save: controller.save, remove: controller.remove, copy: controller.copy, acknowledge: controller.acknowledge } }, { node: selected, key: services.key(selected) }); return { host, view }; }
  const owned = mount();
  return { ...owned, services, controller, keys, mount, selected: (value: string) => { selected = value; }, provider: () => { provider = 'custom'; }, backend: () => { backend = 'codex'; } };
}
afterEach(() => { disposeRoutstrSettings(); document.body.replaceChildren(); vi.restoreAllMocks(); });
it('owns synchronous controls, plain-text errors and encrypted-save/captured node arguments', async () => {
  const f = fixture(); f.view.setCredential('not-a-key'); f.services.validate.mockResolvedValue({ valid: false, error: '<img src=x onerror=unsafe>' }); await f.controller.save();
  expect(f.services.save).not.toHaveBeenCalled(); expect(f.host.querySelector('img,[onerror]')).toBeNull(); expect(f.view.getConnection()).toMatchObject({ pending: false, tone: 'danger' });
  f.services.validate.mockResolvedValue({ valid: true }); f.view.setCredential(' sk-PRIVATE '); await f.controller.save();
  expect(f.services.save).toHaveBeenCalledExactlyOnceWith('sk-PRIVATE', node, ''); expect(f.view.readCredential()).toBe(''); expect(f.view.readAccount()).toEqual({ node, key: 'sk-PRIVATE' }); expect(f.view.getConnection().text).toBe('✓ Connected'); expect(f.services.connected).toHaveBeenCalledOnce();
});
it.each(['close','replace','node','key','provider','backend','draft'])('rejects validation and consent replies after %s changes', async change => {
  for (const stage of ['validate','activate'] as const) {
    const f = fixture(), reply = deferred<boolean>(); f.view.setCredential('sk-PRIVATE');
    if (stage === 'validate') f.services.validate.mockImplementation(async () => ({ valid: await reply.promise })); else f.services.activate.mockImplementation(() => reply.promise);
    const pending = f.controller.save(); await vi.waitFor(() => expect(f.services[stage]).toHaveBeenCalledOnce());
    if (change === 'close') disposeRoutstrSettings(); if (change === 'replace') f.mount(); if (change === 'node') f.selected('https://replacement.test'); if (change === 'key') f.keys.set(node,'sk-OTHER'); if (change === 'provider') f.provider(); if (change === 'backend') f.backend(); if (change === 'draft') f.view.setCredential('sk-NEW-DRAFT');
    reply.resolve(true); await pending; expect(f.services.save).not.toHaveBeenCalled(); expect(f.services.redeem).not.toHaveBeenCalled(); expect(f.services.models).not.toHaveBeenCalled();
  }
});
it('keeps refused consent and persistence failures editable without losing the private draft', async () => {
  const f = fixture(); f.view.setCredential('sk-PRIVATE'); f.services.activate.mockResolvedValue(false); await f.controller.save(); expect(f.view.getConnection().text).toContain('not activated'); expect(f.view.readCredential()).toBe('sk-PRIVATE'); expect(f.services.save).not.toHaveBeenCalled();
  f.services.activate.mockResolvedValue(true); f.services.save.mockRejectedValue(new Error('encrypted write failed')); await f.controller.save(); expect(f.view.getConnection()).toMatchObject({ pending: false, text: 'encrypted write failed', tone: 'danger' }); expect(f.view.readCredential()).toBe('sk-PRIVATE'); expect(f.services.models).not.toHaveBeenCalled();
});
it('reveals a private receipt before catalog replies and retains it after catalog failure', async () => {
  const f = fixture(), models = deferred<void>(); f.services.models.mockImplementation(() => models.promise); f.view.setCredential('cashu:cashuA-PRIVATE-TOKEN'); const pending = f.controller.save();
  await vi.waitFor(() => expect(f.services.models).toHaveBeenCalledOnce()); expect(f.services.redeem).toHaveBeenCalledExactlyOnceWith('cashuA-PRIVATE-TOKEN',node,''); expect(f.view.readReceipt()).toEqual({ node, key: 'sk-CREATED' });
  const field = f.host.querySelector<HTMLTextAreaElement>('#routstr-session-key-receipt')!; expect(field.value).toBe('sk-CREATED'); expect(f.host.innerHTML).not.toContain('sk-CREATED'); expect(JSON.stringify(f.view.getState()) + JSON.stringify(f.view.getConnection())).not.toContain('sk-CREATED'); expect(f.host.querySelector('[data-key],[data-token],[data-clipboard-text]')).toBeNull();
  models.reject(new Error('catalog unavailable')); await pending; expect(f.view.readReceipt()?.key).toBe('sk-CREATED'); expect(f.view.getConnection().pending).toBe(false);
  disposeRoutstrSettings(); expect(field.value).toBe(''); expect(f.view.readReceipt()).toBeNull(); expect(f.view.readCredential()).toBe('');
});
it.each([{}, {api_key: 'cashuA-PRIVATE'}, {api_key: 7}])('rejects malformed conversion replies without storing a token as credential: %j', async response => {
  const f = fixture(); f.services.redeem.mockResolvedValue(response); f.view.setCredential('cashuA-PRIVATE'); await f.controller.save(); expect(f.services.save).not.toHaveBeenCalled(); expect(f.services.redeem).toHaveBeenCalledOnce(); expect(f.services.models).not.toHaveBeenCalled(); expect(f.view.readReceipt()).toBeNull(); expect(f.view.getConnection().text).toContain('recovery');
});
it('single-flights accepted conversion across close/remount and completes only its captured durable account', async () => {
  const f = fixture(), reply = deferred<{api_key: string}>(); f.view.setCredential('cashuA-PRIVATE'); f.services.redeem.mockImplementation(async (_token, node) => { const result = await reply.promise; f.keys.set(node,result.api_key); return result; });
  const pending = f.controller.save(); await vi.waitFor(() => expect(f.services.redeem).toHaveBeenCalledOnce()); f.selected('https://replacement.test'); const next = f.mount(); next.view.setCredential('sk-NEW'); await f.controller.save(); expect(f.services.save).not.toHaveBeenCalled(); reply.resolve({api_key:'sk-CREATED'}); await pending;
  expect(f.keys.get(node)).toBe('sk-CREATED'); expect(f.keys.get('https://replacement.test')).toBeUndefined(); expect(f.services.models).not.toHaveBeenCalled(); expect(next.view.readCredential()).toBe('sk-NEW'); expect(next.view.readReceipt()).toBeNull();
});
it('rejects a late model reply without notification or onboarding for a replacement node/account', async () => {
  const f = fixture(), reply = deferred<void>(); f.view.setCredential('sk-PRIVATE'); f.services.models.mockImplementation(() => reply.promise); const pending = f.controller.save(); await vi.waitFor(() => expect(f.services.models).toHaveBeenCalledOnce()); const owns = f.services.models.mock.calls[0]![0]; f.keys.set(node,'sk-REPLACEMENT'); expect(owns()).toBe(false); reply.resolve(); await pending; expect(f.services.connected).not.toHaveBeenCalled();
});
it('copies a receipt privately, schedules clearing after close, rejects stale acknowledgements and scrubs retired controls', async () => {
  const f = fixture(); f.view.setCredential('cashuA-PRIVATE'); await f.controller.save(); const reply = deferred<void>(); f.services.writeClipboard.mockImplementation(() => reply.promise); const pending = f.controller.copy();
  const held = f.host.querySelector<HTMLTextAreaElement>('textarea')!; const acknowledge = [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'I’ve saved it')!; f.mount(); acknowledge.click(); reply.resolve(); await pending;
  expect(held.value).toBe(''); expect(f.services.connected).not.toHaveBeenCalled(); expect(f.services.writeClipboard).toHaveBeenCalledExactlyOnceWith('sk-CREATED'); expect(f.services.scheduleClear).toHaveBeenCalledOnce(); f.services.writeClipboard.mockResolvedValue(); (f.services.scheduleClear.mock.calls[0]![0] as () => void)(); expect(f.services.writeClipboard).toHaveBeenLastCalledWith('');
});
it('acknowledges only the current saved receipt and keeps failed clipboard fallback selectable', async () => {
  const f = fixture(); f.view.setCredential('cashuA-PRIVATE'); await f.controller.save(); f.services.writeClipboard.mockRejectedValue(new Error('denied')); await f.controller.copy(); expect(f.view.getConnection().text).toContain('Select and copy'); expect(f.view.readReceipt()?.key).toBe('sk-CREATED'); f.controller.acknowledge(); expect(f.view.readReceipt()).toBeNull(); expect(f.services.connected).not.toHaveBeenCalled(); expect(document.activeElement).toBe(f.host.querySelector('summary')); expect(f.view.getConnection().text).toBe('✓ Connected');
});
it('removes only the captured node key, and ignores a late removal on another node', async () => {
  const f = fixture(); f.keys.set(node,'sk-ORIGINAL'); f.keys.set('https://other.test','sk-OTHER'); f.view.setAccount({ node, key:'sk-ORIGINAL' }); const reply = deferred<void>(); f.services.save.mockImplementation(async (value, node, expected) => { await reply.promise; if (f.keys.get(node) !== expected) throw new Error('changed'); f.keys.set(node,value); });
  const pending = f.controller.remove(); f.selected('https://other.test'); reply.resolve(); await pending; expect(f.services.save).toHaveBeenCalledExactlyOnceWith('', node,'sk-ORIGINAL'); expect(f.keys.get(node)).toBe(''); expect(f.keys.get('https://other.test')).toBe('sk-OTHER'); expect(f.services.removed).not.toHaveBeenCalled();
});

it('keeps the user-opened connection disclosure and editable draft visible through pending and failed saves', async () => {
  const f = fixture(), details = f.host.querySelector('details')!;
  f.host.querySelector<HTMLElement>('summary')!.click(); await new Promise(resolve => setTimeout(resolve,0)); expect(details.open).toBe(true);
  f.view.setCredential('sk-PRIVATE'); const reply = deferred<{valid:boolean}>(); f.services.validate.mockImplementation(() => reply.promise);
  const pending = f.controller.save(); expect(details.open).toBe(true); expect(f.host.querySelector<HTMLButtonElement>('#save-routstr-key-btn')!.disabled).toBe(true);
  reply.resolve({valid:true}); f.services.save.mockRejectedValue(new Error('failed')); await pending;
  expect(details.open).toBe(true); expect(f.view.readCredential()).toBe('sk-PRIVATE'); expect(f.host.querySelector<HTMLButtonElement>('#save-routstr-key-btn')!.disabled).toBe(false);
});
