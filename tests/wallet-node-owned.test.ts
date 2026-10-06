// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountWalletNode, disposeWalletNode, getWalletNodeView } from '../js/wallet-node-component.js';
import { createWalletNodeController } from '../js/wallet-node-controller.js';
import type { WalletNodeState, WalletNodeActions } from '../js/wallet-node-contract.js';
const node = 'https://node.original.test', other = 'https://node.other.test', mint = 'https://mint.original.test';
const token = 'cashuAPRIVATE_RECOVERY', key = 'sk-private-session', id = 'pendingNodeRefund', generation = 'private-generation';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture() {
  const host = document.createElement('div'); document.body.append(host); let active = true, selected = node, session = key; const clears: (() => void)[] = [];
  let actions!: WalletNodeActions;
  const open = (mode: WalletNodeState['mode'], node = '') => { host.style.display = 'block'; return mountWalletNode(host, actions, mode, node); };
  const deps = { view: getWalletNodeView, open, close: disposeWalletNode, isActive: () => active, selected: () => selected, key: (_node: string) => session,
    mint: vi.fn(async () => mint), balance: vi.fn(async (): Promise<unknown> => 1500), inventory: vi.fn(async (): Promise<unknown> => [{ mint, balance: 1500 }]),
    accepted: vi.fn(async (_node: string) => [mint]), discover: vi.fn(async (_refresh: boolean): Promise<unknown> => [{ urls: [node], online: true, name: 'Node', modelCount: 2, models: [{ id: 'tinfoil-model' }], pubkey: 'operator', onion: 'hidden.onion' }]),
    activate: vi.fn(async (_node: string) => true), connect: vi.fn(async (_node: string, _current: () => boolean) => {}), captureFinish: vi.fn((_node: string) => vi.fn(async (_amount: number) => {})),
    deposit: vi.fn(async (_node: string, _amount: number, _key: string, _mint: string): Promise<unknown> => ({ api_key: key })), reset: vi.fn(async (_node: string, _key: string) => {}),
    hasSeed: vi.fn(async (): Promise<unknown> => true), seed: vi.fn(async (_resume: () => unknown): Promise<unknown> => false),
    refund: vi.fn(async (_node: string, _id?: string, _token?: string, _generation?: string, _key?: string): Promise<unknown> => ({ nodeUrl: node, token, recoveryId: id, generation })),
    saved: vi.fn(async (_node?: string): Promise<unknown> => [{ nodeUrl: node, token, recoveryId: id, generation, createdAt: 1 }]), tokenMint: vi.fn(async (_token: string): Promise<unknown> => mint),
    receive: vi.fn(async (_token: string): Promise<unknown> => ({ received: 100 })), finishRefund: vi.fn(async (_token: string) => {}),
    recoverDeposit: vi.fn(async (): Promise<unknown> => token), clearDeposit: vi.fn(async () => {}), refreshWallet: vi.fn(), refreshNode: vi.fn(), chooseMint: vi.fn(async (_mint: string) => {}),
    writeClipboard: vi.fn(async (_token: string) => {}), scheduleClear: (clear: () => void) => { clears.push(clear); }, notify: vi.fn() };
  const controller = createWalletNodeController(deps);
  actions = { connect: controller.connect, refresh: () => controller.browse(true), chooseMint: deps.chooseMint, deposit: controller.deposit, newSession: controller.resetSession, retry: controller.retry, copy: controller.copy, reclaim: controller.reclaim, close: disposeWalletNode };
  return { deps, controller, host, clears, view: getWalletNodeView, setSession: (next: string) => { session = next; }, select: (next: string) => { selected = next; }, deactivate: () => { active = false; } };
}
afterEach(() => { disposeWalletNode(); document.body.replaceChildren(); vi.restoreAllMocks(); });
it('discovers advertised node capabilities, ignores offline entries and keeps inert operator text', async () => {
  const f = fixture(); f.deps.discover.mockResolvedValue([{ urls: [node], online: true, name: '<img src=x onerror=alert(1)>', pubkey: '<script>bad</script>', modelCount: 1, models: [{ id: 'tinfoil-model' }], onion: 'hidden.onion' }, { urls: [other], online: false }]);
  await f.controller.browse(); expect(f.host.textContent).toContain('Advertises Private TEE'); expect(f.host.textContent).toContain('1 model'); expect(f.host.textContent).toContain('<script>bad</script>'); expect(f.host.querySelector('img,script')).toBeNull();
  expect(f.view()!.getState().nodes).toHaveLength(1); await f.controller.browse(); expect(f.view()).toBeNull();
});
it('never lets an earlier discovery replace a later one', async () => {
  const f = fixture(), reply = deferred<unknown>(); f.deps.discover.mockReturnValueOnce(reply.promise); const pending = f.controller.browse();
  await f.controller.browse(true); reply.resolve([{ urls: [other], online: true, name: 'Old reply' }]); await pending; expect(f.host.textContent).toContain('Node'); expect(f.host.textContent).not.toContain('Old reply');
});
it('keeps node session credentials outside state and deposits only the captured mint and session', async () => {
  const f = fixture(); await f.controller.depositForm(node); expect(JSON.stringify(f.view()!.getState())).not.toContain(key);
  f.host.querySelector<HTMLInputElement>('#routstr-deposit-amount')!.value = '500'; await f.controller.deposit();
  expect(f.deps.deposit).toHaveBeenCalledExactlyOnceWith(node, 500, key, mint); expect(f.deps.refreshWallet).toHaveBeenCalledOnce(); expect(f.host.textContent).toContain('Node deposit confirmed'); expect(f.view()!.readSession()).toBeNull();
});
it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid deposit %s before activation or transfer', async amount => {
  const f = fixture(); await f.controller.depositForm(node); await f.controller.deposit(amount); expect(f.deps.activate).not.toHaveBeenCalled(); expect(f.deps.deposit).not.toHaveBeenCalled();
});
it.each(['mint', 'session', 'node', 'owner', 'provider', 'amount'] as const)('discards deposit preflight after %s changes', async changed => {
  const f = fixture(); await f.controller.depositForm(node); f.host.querySelector<HTMLInputElement>('#routstr-deposit-amount')!.value = '100'; const reply = deferred<string[]>(); f.deps.accepted.mockReturnValueOnce(reply.promise); const pending = f.controller.deposit();
  if (changed === 'mint') f.deps.mint.mockResolvedValue('https://another.mint.test'); if (changed === 'session') f.setSession('sk-new-session'); if (changed === 'node') f.select(other); if (changed === 'provider') f.deactivate(); if (changed === 'owner') await f.controller.saved(); if (changed === 'amount') f.host.querySelector<HTMLInputElement>('#routstr-deposit-amount')!.value = '200';
  reply.resolve([mint]); await pending; expect(f.deps.deposit).not.toHaveBeenCalled();
});
it('requires a reviewed accepted mint while preserving every other mint balance', async () => {
  const f = fixture(); f.deps.accepted.mockResolvedValue(['https://accepted.mint.test']); await f.controller.depositForm(node);
  expect(f.view()!.getState().phase).toBe('mints'); expect(f.host.textContent).toContain('1,500'); expect(f.host.textContent).toContain('Review your choice'); expect(f.host.querySelector('#routstr-deposit-amount')).toBeNull();
  await f.controller.deposit(100); expect(f.deps.deposit).not.toHaveBeenCalled();
});
it('finishes an accepted deposit once after closure and leaves the replacement recovery view intact', async () => {
  const f = fixture(); await f.controller.depositForm(node); const reply = deferred<unknown>(); f.deps.deposit.mockReturnValue(reply.promise); const pending = f.controller.deposit(500);
  await vi.waitFor(() => expect(f.deps.deposit).toHaveBeenCalled()); await f.controller.saved(); const latest = f.view()!; await f.controller.deposit(500); reply.resolve({ api_key: key }); await pending;
  expect(f.deps.deposit).toHaveBeenCalledOnce(); expect(latest.readRecovery(0)!.token).toBe(token); expect(latest.getState().pending).toBe(false); expect(latest.getState().phase).toBe('ready');
});
it('scrubs retained amount and recovery fields when switching modes or closing', async () => {
  const f = fixture(); await f.controller.depositForm(node); const amount = f.host.querySelector<HTMLInputElement>('#routstr-deposit-amount')!; amount.value = '123'; await f.controller.saved(); expect(amount.value).toBe('');
  const text = f.host.querySelector<HTMLTextAreaElement>('textarea')!; expect(text.value).toBe(token); disposeWalletNode(); expect(text.value).toBe(''); expect(f.view()).toBeNull();
});
it('binds private saved refund retries to their original node, record and generation without credentials in DOM', async () => {
  const f = fixture(); await f.controller.saved(); const view = f.view()!; expect(JSON.stringify(view.getState())).not.toContain(token); expect(JSON.stringify(view.getState())).not.toContain(generation);
  expect(f.host.querySelector('[data-token],[data-recovery-id],[data-generation],[data-clipboard-text]')).toBeNull(); f.setSession('sk-new-session'); await f.controller.retry(0);
  expect(f.deps.refund).toHaveBeenCalledExactlyOnceWith(node, id, token, generation, undefined); expect(f.deps.receive).toHaveBeenCalledExactlyOnceWith(token); expect(f.deps.finishRefund).toHaveBeenCalledExactlyOnceWith(token);
});
it('keeps every saved card hint unique and each token safely rendered as text', async () => {
  const f = fixture(), payload = '</textarea><img src=x onerror=alert(1)>'; f.deps.saved.mockResolvedValue([{ nodeUrl: node, token: payload, recoveryId: id, generation }, { nodeUrl: other, token: payload, recoveryId: id + ':other', generation: 'another' }]);
  await f.controller.saved(); const fields = [...f.host.querySelectorAll<HTMLTextAreaElement>('textarea')]; expect(fields).toHaveLength(2); expect(fields.map(field => field.value)).toEqual([payload, payload]); expect(new Set(fields.map(field => field.getAttribute('aria-describedby'))).size).toBe(2); expect(f.host.querySelector('img')).toBeNull();
});
it('continues a seed-gated refund only while its originating account view is current', async () => {
  const f = fixture(); f.deps.hasSeed.mockResolvedValue(false); let resume!: () => unknown; f.deps.seed.mockImplementation(async next => { resume = next; return false; }); await f.controller.withdraw(node); expect(f.deps.refund).not.toHaveBeenCalled();
  f.deps.hasSeed.mockResolvedValue(true); await resume(); expect(f.deps.refund).toHaveBeenCalledOnce();
  f.deps.hasSeed.mockResolvedValue(false); await f.controller.withdraw(node); await f.controller.saved(); await resume(); expect(f.deps.refund).toHaveBeenCalledOnce();
});
it('handles a seed becoming available during setup without dropping its continuation', async () => {
  const f = fixture(); f.deps.hasSeed.mockResolvedValueOnce(false); f.deps.seed.mockImplementation(async resume => { await resume(); return true; }); await f.controller.withdraw(node); expect(f.deps.refund).toHaveBeenCalledOnce();
});
it('finishes an accepted refund after close without exposing its token in the replacement view', async () => {
  const f = fixture(), reply = deferred<unknown>(); f.deps.refund.mockReturnValue(reply.promise); const pending = f.controller.withdraw(node); await vi.waitFor(() => expect(f.deps.refund).toHaveBeenCalled());
  await f.controller.browse(true); reply.resolve({ nodeUrl: node, token, recoveryId: id, generation }); await pending; expect(f.deps.receive).toHaveBeenCalledExactlyOnceWith(token); expect(f.deps.finishRefund).toHaveBeenCalledExactlyOnceWith(token); expect(f.host.textContent).not.toContain(token); expect(f.view()!.getState().mode).toBe('browse');
});
it('retains an uncommitted refund privately across closing and reopens its original recovery', async () => {
  const f = fixture(); f.deps.receive.mockRejectedValue(new Error('secret raw response')); await f.controller.withdraw(node); expect(f.view()!.readRecovery(0)!.token).toBe(token); expect(f.host.textContent).not.toContain('secret raw response'); expect(f.deps.finishRefund).not.toHaveBeenCalled();
  disposeWalletNode(); f.deps.saved.mockResolvedValue([]); await f.controller.saved(); expect(f.view()!.readRecovery(0)).toMatchObject({ node, id, generation, token });
  f.deps.receive.mockResolvedValue({ received: 100 }); await f.controller.retry(0); expect(f.deps.finishRefund).toHaveBeenCalledOnce();
});
it('copies private recovery tokens and clears clipboard after closure without clearing the journal', async () => {
  const f = fixture(); await f.controller.saved(); await f.controller.copy(0); expect(f.deps.writeClipboard).toHaveBeenCalledExactlyOnceWith(token); disposeWalletNode(); f.clears[0]!(); expect(f.deps.writeClipboard).toHaveBeenLastCalledWith(''); expect(f.deps.finishRefund).not.toHaveBeenCalled();
});
it('preserves a rejected session for an explicit reset without automatic deposits', async () => {
  const f = fixture(); await f.controller.depositForm(node); f.deps.deposit.mockRejectedValue(Object.assign(new Error('private response'), { nodeSessionRejected: true })); await f.controller.deposit(100);
  expect(f.view()!.getState().phase).toBe('rejected'); expect(f.deps.reset).not.toHaveBeenCalled(); await f.controller.resetSession(); expect(f.deps.reset).toHaveBeenCalledExactlyOnceWith(node, key); expect(f.deps.deposit).toHaveBeenCalledOnce();
});
it('retains uncertain deposit recovery until its token is received successfully', async () => {
  const f = fixture(); await f.controller.depositForm(node); f.deps.deposit.mockRejectedValue(new Error('private response')); await f.controller.deposit(100); expect(f.view()!.getState().mode).toBe('recovery'); expect(f.view()!.readRecovery(0)!.token).toBe(token);
  f.deps.receive.mockRejectedValueOnce(new Error('pending mint')); await f.controller.reclaim(0); expect(f.deps.clearDeposit).not.toHaveBeenCalled(); await f.controller.reclaim(0); expect(f.deps.clearDeposit).toHaveBeenCalledOnce(); expect(f.view()!.readRecovery(0)).toBeNull();
});

it('never associates a failed retry token with an unrelated error record', async () => {
  const f = fixture(); f.deps.refund.mockRejectedValue(Object.assign(new Error('failed retry'), { nodeUrl: node, recoveryId: 'different-record', generation: 'different-generation' }));
  await f.controller.withdraw(node, id, token, generation); expect(f.view()!.readRecovery(0)).toMatchObject({ id, token, generation });
  f.deps.saved.mockResolvedValue([]); await f.controller.saved(); expect(f.view()!.readRecovery(0)).toMatchObject({ id, token, generation });
  expect(f.view()!.readRecovery(1)).toBeNull();
});
it('rejects callbacks from an actual retained control after its component is replaced', async () => {
  const f = fixture(); await f.controller.saved(); const button = f.host.querySelector<HTMLButtonElement>('[data-wallet-node-refund-index]')!;
  await f.controller.saved(); f.host.append(button); button.click(); await Promise.resolve(); expect(f.deps.refund).not.toHaveBeenCalled();
});
