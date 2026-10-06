import { beforeEach, expect, it, vi } from 'vitest';
import { createRoutstrSettingsController } from '../js/routstr-settings-controller.js';
import { initialRoutstrSettingsState } from '../js/routstr-settings-contract.js';
import type { RoutstrRecoveryKind, RoutstrSettingsView } from '../js/routstr-settings-contract.js';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fakeView(node = '') {
  let state = initialRoutstrSettingsState(node, !!node), account = { node, key: node ? 'sk-original' : '' }, current = true;
  const tokens: Record<RoutstrRecoveryKind,string> = { deposit: '', withdraw: '' };
  const view: RoutstrSettingsView = { readCredential: () => '', setCredential: () => {}, getConnection: () => ({ pending: false, receipt: false, copied: false, text: '', tone: 'secondary' }), setConnection: () => {}, showReceipt: () => {}, readReceipt: () => null, hideReceipt: () => {}, isCurrent: () => current, getState: () => state, setState: next => { state = next; },
    readAccount: () => account, setAccount: (next, label) => { account = next; state = { ...state, node: next.node, nodeLabel: label || next.node, connected: !!next.key }; },
    showRecovery: (kind, token) => { tokens[kind] = token; state.recoveries[kind].visible = !!token; }, readRecovery: kind => tokens[kind],
    clearPrivateFields: () => { tokens.deposit = ''; tokens.withdraw = ''; }, closeMenu: () => {} };
  return { view, close: () => { current = false; view.clearPrivateFields(); } };
}
function fixture() {
  let selected = '', key = '', active = true;
  const deps = { selected: () => selected, key: () => key, isActive: () => active,
    discover: vi.fn(async () => [{ online: true, urls: ['https://synthetic-node.test'], name: 'Synthetic' }]), select: vi.fn((node: string) => { selected = node; }),
    recover: vi.fn(async (_kind: RoutstrRecoveryKind): Promise<unknown> => null), refund: vi.fn(async (): Promise<unknown> => null), receive: vi.fn(async () => {}), clear: vi.fn(async () => {}), refreshWallet: vi.fn(async () => {}), writeClipboard: vi.fn(async (_text: string) => {}), scheduleClear: vi.fn() };
  return { deps, controller: createRoutstrSettingsController(deps), selected: (value: string) => { selected = value; }, key: (value: string) => { key = value; }, active: (value: boolean) => { active = value; } };
}
beforeEach(() => vi.restoreAllMocks());
it.each(['close','node','key','provider'])('rejects discovery that completes after %s ownership changes', async change => {
  const f = fixture(), { view, close } = fakeView(), reply = deferred<Awaited<ReturnType<typeof f.deps.discover>>>(); f.deps.discover.mockImplementation(() => reply.promise);
  const pending = f.controller.initialize(view);
  if (change === 'close') close(); if (change === 'node') f.selected('https://replacement.test'); if (change === 'key') f.key('sk-replacement'); if (change === 'provider') f.active(false);
  reply.resolve([{ online: true, urls: ['https://old-node.test'], name: 'Old' }]); await pending;
  expect(f.deps.select).not.toHaveBeenCalled(); expect(view.getState().nodeLabel).not.toBe('Old');
});
it('initializes once per view, skips offline/invalid URLs and selects only a safe online node', async () => {
  const f = fixture(), { view } = fakeView(); f.deps.discover.mockResolvedValue([{ online: false, urls: ['https://offline.test'], name: 'Offline' }, { online: true, urls: ['javascript:unsafe','https://safe.test'], name: '<img>' }]);
  await Promise.all([f.controller.initialize(view), f.controller.initialize(view)]);
  expect(f.deps.select).toHaveBeenCalledExactlyOnceWith('https://safe.test'); expect(f.deps.discover).toHaveBeenCalledTimes(1); expect(f.deps.recover).toHaveBeenCalledTimes(2); expect(view.getState().nodeLabel).toBe('<img>');
});
it('does not initialize hidden/inactive providers or overwrite replacement private recovery ports', async () => {
  const f = fixture(), a = fakeView(), pending = deferred<unknown>(); f.active(false); await f.controller.initialize(a.view); expect(f.deps.recover).not.toHaveBeenCalled(); f.active(true);
  f.deps.recover.mockImplementation(() => pending.promise); const loading = f.controller.initialize(a.view); a.close(); pending.resolve('PRIVATE-OLD'); await loading; expect(a.view.readRecovery('deposit')).toBe('');
});
it('projects only the saved refund node and holds tokens outside presentation state', async () => {
  const f = fixture(), { view } = fakeView('https://selected.test'); f.selected('https://selected.test');
  f.deps.recover.mockResolvedValue('PRIVATE-TOKEN'); f.deps.refund.mockResolvedValue({ nodeUrl: 'https://original.test', token: 'PRIVATE-REFUND', key: 'PRIVATE-KEY', generation: 'PRIVATE-GEN' });
  await f.controller.initialize(view); expect(view.readRecovery('deposit')).toBe('PRIVATE-TOKEN'); expect(view.getState().refundNode).toBe('https://original.test'); expect(JSON.stringify(view.getState())).not.toContain('PRIVATE');
});
it('does not receive a replaced journal token or accept a recovery after the preflight view closes', async () => {
  const f = fixture(), a = fakeView(); a.view.showRecovery('deposit', 'PRIVATE-OLD'); f.deps.recover.mockResolvedValue('PRIVATE-NEW'); await f.controller.reclaim(a.view, 'deposit'); expect(f.deps.receive).not.toHaveBeenCalled(); expect(a.view.getState().recoveries.deposit.status.text).toContain('changed');
  const wait = deferred<unknown>(); f.deps.recover.mockImplementation(() => wait.promise); const pending = f.controller.reclaim(a.view, 'deposit'); a.close(); wait.resolve('PRIVATE-OLD'); await pending; expect(f.deps.receive).not.toHaveBeenCalled();
});
it('single-flights accepted recovery across replacement, awaits journal reconciliation, and preserves errors', async () => {
  const f = fixture(), a = fakeView(), b = fakeView(), receive = deferred<void>(); a.view.showRecovery('deposit', 'PRIVATE'); b.view.showRecovery('deposit', 'PRIVATE'); f.deps.recover.mockResolvedValue('PRIVATE'); f.deps.receive.mockImplementation(() => receive.promise);
  const pending = f.controller.reclaim(a.view, 'deposit'); await vi.waitFor(() => expect(f.deps.receive).toHaveBeenCalledTimes(1)); a.close(); await f.controller.reclaim(b.view, 'deposit'); expect(f.deps.receive).toHaveBeenCalledTimes(1); receive.resolve(); await pending; expect(f.deps.clear).toHaveBeenCalledTimes(1); expect(b.view.readRecovery('deposit')).toBe('PRIVATE');
  f.deps.receive.mockRejectedValue(new Error('PRIVATE ERROR')); await f.controller.reclaim(b.view, 'deposit'); expect(b.view.readRecovery('deposit')).toBe('PRIVATE'); expect(b.view.getState().recoveries.deposit.status.tone).toBe('danger'); expect(b.view.getState().recoveries.deposit.status.text).not.toContain('PRIVATE');
});
it('schedules clipboard clearing even when the initiating view closes during a successful copy', async () => {
  const f = fixture(), a = fakeView(), copied = deferred<void>(); a.view.showRecovery('withdraw', 'PRIVATE-TOKEN'); f.deps.writeClipboard.mockImplementation(() => copied.promise);
  const pending = f.controller.copy(a.view, 'withdraw'); a.close(); copied.resolve(); await pending; expect(f.deps.writeClipboard).toHaveBeenCalledWith('PRIVATE-TOKEN'); expect(f.deps.scheduleClear).toHaveBeenCalledTimes(1);
  f.deps.writeClipboard.mockResolvedValue(); const clear = f.deps.scheduleClear.mock.calls[0]![0] as () => void; clear(); expect(f.deps.writeClipboard).toHaveBeenLastCalledWith('');
});

it('does not clear financial pending state when copying the same private token fails', async () => {
  const f = fixture(), a = fakeView(); a.view.showRecovery('deposit', 'PRIVATE');
  a.view.setState({ ...a.view.getState(), recoveries: { ...a.view.getState().recoveries, deposit: { ...a.view.getState().recoveries.deposit, pending: true } } });
  f.deps.writeClipboard.mockRejectedValue(new Error('PRIVATE ERROR')); await f.controller.copy(a.view, 'deposit');
  expect(a.view.getState().recoveries.deposit.pending).toBe(true); expect(a.view.getState().recoveries.deposit.status.text).not.toContain('PRIVATE');
});
