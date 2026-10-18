// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountWalletWithdraw, disposeWalletWithdraw, getWalletWithdrawView } from '../js/wallet-withdraw-component.js';
import { createWalletWithdrawController } from '../js/wallet-withdraw-controller.js';
const mint = 'https://mint.original.test'; const token = 'cashuAPRIVATE_OUTGOING_TOKEN'; const invoice = 'lnbcPRIVATE_INVOICE';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture() {
  const host = document.createElement('div'); document.body.append(host); let active = true; const clears: (() => void)[] = [];
  const deps = { view: getWalletWithdrawView, isActive: () => active, mint: vi.fn(async () => mint), balance: vi.fn(async (): Promise<unknown> => 1500),
    maximum: vi.fn(async (_mint: string): Promise<unknown> => 1468), quote: vi.fn(async (_invoice: string, _mint: string): Promise<unknown> => ({ quote: 'PRIVATE_QUOTE', amount: 123, fee_reserve: 4 })),
    execute: vi.fn(async (_quote: string, _mint: string): Promise<unknown> => ({ paid: true })), address: vi.fn(async (_address: string, amount: number, _mint: string): Promise<unknown> => ({ paid: true, amount })),
    send: vi.fn(async (amount: number, _mint: string): Promise<unknown> => ({ token, amount, remaining: 1500 - amount })), recover: vi.fn(async (): Promise<unknown> => token),
    tokenMint: vi.fn(async (_token: string): Promise<unknown> => mint), receive: vi.fn(async (_token: string): Promise<unknown> => ({ received: 500, balance: 1500 })), clearRecovery: vi.fn(async () => {}),
    writeClipboard: vi.fn(async (_token: string) => {}), scheduleClear: (clear: () => void) => { clears.push(clear); }, refreshBalance: vi.fn(), notify: vi.fn() };
  const controller = createWalletWithdrawController(deps);
  const actions = { lightning: () => controller.mode('lightning'), token: () => controller.mode('token'), maximum: controller.maximum, quote: controller.quote, execute: () => controller.execute(), send: controller.send, copy: controller.copy, recover: controller.recover, reclaim: controller.reclaim, close: disposeWalletWithdraw };
  const view = mountWalletWithdraw(host, actions);
  const replace = () => { const nextHost = document.createElement('div'); document.body.append(nextHost); return { host: nextHost, view: mountWalletWithdraw(nextHost, actions) }; };
  const destination = (text: string) => { const input = host.querySelector<HTMLInputElement>('#routstr-withdraw-input')!; input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); return input; };
  return { host, view, deps, controller, clears, replace, destination, deactivate: () => { active = false; } };
}
afterEach(() => { disposeWalletWithdraw(); document.body.replaceChildren(); vi.restoreAllMocks(); });
it('owns private invoice, quote and token ports and requires the displayed quote before execution', async () => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('lightning'); const originalInput = f.destination(invoice); await f.controller.quote();
  expect(originalInput.value).toBe(''); expect(f.deps.quote).toHaveBeenCalledExactlyOnceWith(invoice, mint); expect(f.host.textContent).toContain('Fee reserve');
  expect(JSON.stringify(f.view.getState())).not.toContain(invoice); expect(f.host.innerHTML).not.toContain('PRIVATE_QUOTE');
  await f.controller.execute('another-quote'); expect(f.deps.execute).not.toHaveBeenCalled(); await f.controller.execute();
  expect(f.deps.execute).toHaveBeenCalledExactlyOnceWith('PRIVATE_QUOTE', mint); expect(f.view.readQuote()).toBeNull(); expect(f.host.textContent).toContain('Withdrawn');
  await f.controller.mode('token'); await f.controller.send(500); expect(f.deps.send).toHaveBeenCalledExactlyOnceWith(500, mint);
  expect(f.view.readToken()).toBe(token); expect(JSON.stringify(f.view.getState())).not.toContain(token); expect(f.host.querySelector('[data-clipboard-text]')).toBeNull();
});
it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid token amount %s without a transaction', async amount => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('token'); await f.controller.send(amount);
  expect(f.deps.send).not.toHaveBeenCalled(); expect(f.view.getState().status.tone).toBe('danger');
});
it('reads autofilled destination and amount through private ports and binds address payment to its mint', async () => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('lightning'); f.destination('alice@example.test');
  f.host.querySelector<HTMLInputElement>('#routstr-withdraw-amount')!.value = '42'; await f.controller.quote();
  expect(f.deps.address).toHaveBeenCalledExactlyOnceWith('alice@example.test', 42, mint);
  expect(f.view.getState()).toMatchObject({phase: 'paid', amount: 42});
});
it.each(['edited', 'mint', 'owner', 'provider'] as const)('discards late quotes after %s changes', async change => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('lightning'); f.destination(invoice);
  const reply = deferred<unknown>(); f.deps.quote.mockReturnValue(reply.promise); const pending = f.controller.quote(); await vi.waitFor(() => expect(f.deps.quote).toHaveBeenCalled());
  if (change === 'edited') f.destination('lnbcEDITED'); if (change === 'mint') f.deps.mint.mockResolvedValue('https://other.mint.test'); if (change === 'owner') f.replace(); if (change === 'provider') f.deactivate();
  reply.resolve({ quote: 'PRIVATE_QUOTE', amount: 123, fee_reserve: 4 }); await pending; expect(getWalletWithdrawView()?.readQuote()).toBeNull(); expect(f.deps.execute).not.toHaveBeenCalled();
});
it('does not overwrite a draft with a late maximum response', async () => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('lightning'); f.destination('alice@example.test');
  const reply = deferred<unknown>(); f.deps.maximum.mockReturnValue(reply.promise); const pending = f.controller.maximum(); await vi.waitFor(() => expect(f.deps.maximum).toHaveBeenCalled());
  f.host.querySelector<HTMLInputElement>('#routstr-withdraw-amount')!.value = '77'; reply.resolve(1468); await pending; expect(f.view.readDraft().amount).toBe('77');
});
it('finishes an accepted send once after closure without disclosing its token in a replacement owner', async () => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('token'); const reply = deferred<unknown>(); f.deps.send.mockReturnValue(reply.promise);
  const pending = f.controller.send(500); await vi.waitFor(() => expect(f.deps.send).toHaveBeenCalled()); const next = f.replace(); await f.controller.load(next.view); await f.controller.send(500);
  reply.resolve({ token, amount: 500, remaining: 1000 }); await pending;
  expect(f.deps.send).toHaveBeenCalledOnce(); expect(f.deps.refreshBalance).toHaveBeenCalledOnce(); expect(next.view.readToken()).toBe(''); expect(next.view.getState().pending).toBe(false); expect(next.host.textContent).not.toContain(token);
});
it('keeps replacement controls pending until their own balance read finishes after an accepted send', async () => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('token'); const sent = deferred<unknown>(); f.deps.send.mockReturnValue(sent.promise);
  const sending = f.controller.send(500); await vi.waitFor(() => expect(f.deps.send).toHaveBeenCalled());
  const next = f.replace(); const balance = deferred<unknown>(); f.deps.balance.mockReturnValue(balance.promise); const loading = f.controller.load(next.view);
  await vi.waitFor(() => expect(f.deps.balance).toHaveBeenCalledTimes(3)); sent.resolve({ token, amount: 500, remaining: 1000 }); await sending;
  expect(next.view.getState().pending).toBe(true); expect(next.host.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
  balance.resolve(1000); await loading; expect(next.view.getState().pending).toBe(false); expect(next.view.getState().balance).toBe(1000); expect(next.view.readToken()).toBe('');
});
it('scrubs retained input and token DOM nodes on actual disposal', async () => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('lightning'); const input = f.destination(invoice); disposeWalletWithdraw(); expect(input.value).toBe('');
  const next = f.replace(); await f.controller.load(next.view); await f.controller.mode('token'); await f.controller.send(500); const text = next.host.querySelector<HTMLTextAreaElement>('textarea')!;
  disposeWalletWithdraw(); expect(text.value).toBe(''); expect(next.view.readToken()).toBe('');
});
it('retains recovery after copying and clears the clipboard after closure', async () => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('token'); await f.controller.send(500); await f.controller.copy();
  expect(f.deps.clearRecovery).not.toHaveBeenCalled(); expect(f.deps.writeClipboard).toHaveBeenCalledExactlyOnceWith(token); disposeWalletWithdraw(); f.clears[0]!();
  expect(f.deps.writeClipboard).toHaveBeenLastCalledWith('');
});
it('offers manual selection on clipboard failure without losing the outgoing token', async () => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('token'); await f.controller.send(500); f.deps.writeClipboard.mockRejectedValue(new Error(token)); await f.controller.copy();
  expect(f.view.readToken()).toBe(token); expect(f.host.textContent).toContain('Select the token text'); expect(f.host.textContent).not.toContain('Error'); expect(f.deps.clearRecovery).not.toHaveBeenCalled();
});
it('reclaims an original-mint recovery token and clears its record only after accepted receive', async () => {
  const f = fixture(); await f.controller.load(f.view); f.deps.tokenMint.mockResolvedValue('https://old.mint.test'); await f.controller.recover();
  expect(f.view.getState().mint).toBe('https://old.mint.test'); expect(f.view.readToken()).toBe(token); const reply = deferred<unknown>(); f.deps.receive.mockReturnValue(reply.promise);
  const pending = f.controller.reclaim(); await vi.waitFor(() => expect(f.deps.receive).toHaveBeenCalledExactlyOnceWith(token)); expect(f.deps.clearRecovery).not.toHaveBeenCalled();
  reply.resolve({ received: 500, balance: 1500 }); await pending; expect(f.deps.clearRecovery).toHaveBeenCalledOnce(); expect(f.view.readToken()).toBe('');
});
it.each([false, 'PAID', undefined])('does not claim a payment succeeded for paid=%s', async paid => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('lightning'); f.destination(invoice); await f.controller.quote(); f.deps.execute.mockResolvedValue({ paid }); await f.controller.execute();
  expect(f.view.getState().phase).toBe('quote'); expect(f.deps.notify).not.toHaveBeenCalled(); expect(f.deps.clearRecovery).not.toHaveBeenCalled(); expect(f.host.textContent).toContain('awaiting confirmation');
});

it.each([43, 50])('reports the actual confirmed address payment of %i sats', async amount => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('lightning'); f.destination('alice@example.test');
  f.host.querySelector<HTMLInputElement>('#routstr-withdraw-amount')!.value = '50';
  f.deps.address.mockResolvedValue({paid: true, amount}); await f.controller.quote();
  expect(f.deps.address).toHaveBeenCalledExactlyOnceWith('alice@example.test', 50, mint);
  expect(f.view.getState().amount).toBe(amount); expect(f.view.getState().phase).toBe('paid');
  expect(f.host.textContent).toContain(`Sent ${amount} sats`);
  if (amount < 50) expect(f.host.textContent).toContain('requested 50 sats');
  expect(f.deps.notify).toHaveBeenCalledExactlyOnceWith('Withdrawal complete', 'success');
});
it.each([
  {paid: false, amount: 43}, {paid: 'PAID', amount: 43}, {amount: 43},
  {paid: true}, {paid: true, amount: 0}, {paid: true, amount: 51},
  {paid: true, amount: 1.5}, {paid: true, amount: '43'}, {paid: true, amount: Infinity},
])('does not report an unconfirmed or invalid address result as sent: %j', async result => {
  const f = fixture(); await f.controller.load(f.view); await f.controller.mode('lightning'); f.destination('alice@example.test');
  f.host.querySelector<HTMLInputElement>('#routstr-withdraw-amount')!.value = '50';
  f.deps.address.mockResolvedValue(result); await f.controller.quote();
  expect(f.view.getState().phase).toBe('form'); expect(f.deps.notify).not.toHaveBeenCalled();
  expect(f.deps.refreshBalance).not.toHaveBeenCalled(); expect(f.deps.clearRecovery).not.toHaveBeenCalled();
  expect(f.host.textContent).toContain('awaiting confirmation'); expect(f.host.textContent).not.toContain('Sent');
});
