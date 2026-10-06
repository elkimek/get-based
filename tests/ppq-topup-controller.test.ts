// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPpqTopupController, type PpqTopupServices } from '../js/ppq-topup-controller.js';
import { disposePpqSettings, mountPpqSettings } from '../js/ppq-settings-component.js';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(release => { resolve = release; }); return { promise, resolve }; }
function setup() {
  let key = 'KEY', creditId = 'CREDIT', provider = 'ppq';
  const host = document.createElement('div'); document.body.append(host);
  const view = mountPpqSettings(host, { connected: true, mode: { enabled: false, available: false, active: false }, models: { selectedModel: 'a', modelDisplay: 'A', groups: [], pricing: { text: '', tone: 'secondary' } } });
  const create = vi.fn<PpqTopupServices['create']>(async () => ({ lightning_invoice: 'privateInvoice', invoice_id: 'PRIVATE-ID', expires_at: Date.now() / 1000 + 300 }));
  const status = vi.fn<PpqTopupServices['status']>(async () => ({ status: 'pending' }));
  const qr = vi.fn(async () => 'data:image/svg+xml,<svg/>'); const balance = vi.fn(async () => {}); const received = vi.fn(); const returnToChat = vi.fn(); const error = vi.fn();
  const controller = createPpqTopupController({ view: () => view.isCurrent() ? view : null, key: () => key, creditId: () => creditId, provider: () => provider, create, status, qr, refreshBalance: balance, received, returnToChat, error });
  controller.picker(true);
  return { host, view, controller, create, status, qr, balance, received, returnToChat, error, replaceKey: () => { key = 'OTHER'; }, replaceCredit: () => { creditId = 'OTHER'; }, replaceProvider: () => { provider = 'venice'; } };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { disposePpqSettings(); document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); });
it('uses a captured payment method, uppercase Lightning QR and private payment fields', async () => {
  const s = setup(); await s.controller.create(2);
  expect(s.create).toHaveBeenCalledWith(2, 'btc-lightning'); expect(s.qr).toHaveBeenCalledWith('PRIVATEINVOICE');
  expect(s.view.readPayment()).toBe('privateInvoice'); expect(JSON.stringify(s.view.getTopup())).not.toMatch(/privateInvoice|PRIVATE-ID/);
  expect(s.host.querySelector('[data-clipboard-text]')).toBeNull(); expect(s.host.querySelector('a[href^="lightning:"]')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(1000); expect(s.host.textContent).toContain('Waiting for payment… 4:59');
  s.controller.cancel(); expect(s.view.readPayment()).toBe(''); expect(s.view.getTopup().open).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it('preserves all five payment methods, schemes, minima, custom validation and invalid-method rejection', async () => {
  const s = setup();
  for (const [method, min, scheme] of [['btc-lightning', 1, 'lightning:'], ['btc', 10, 'bitcoin:'], ['xmr', 5, 'monero:'], ['ltc', 2, 'litecoin:'], ['lbtc', 2, 'bitcoin:']] as const) {
    s.controller.picker(true); s.controller.select(method); const count = s.create.mock.calls.length;
    await s.controller.create(min - 0.01); expect(s.create).toHaveBeenCalledTimes(count); expect(s.error).toHaveBeenLastCalledWith('Minimum amount is $' + min);
    await s.controller.create(min); expect(s.create).toHaveBeenLastCalledWith(min, method); expect(s.host.querySelector(`a[href^="${scheme}"]`)).not.toBeNull();
    s.controller.cancel();
  }
  s.controller.picker(true); s.controller.select('malformed'); expect(s.view.getTopup().method).toBe('btc-lightning');
  await s.controller.create(Infinity); await s.controller.create('not a number'); expect(s.create).toHaveBeenCalledTimes(5);
  s.controller.custom(); const input = s.host.querySelector<HTMLInputElement>('#ppq-custom-amount')!; input.value = '$6.25';
  s.controller.submitCustom(); await vi.advanceTimersByTimeAsync(0); expect(s.create).toHaveBeenLastCalledWith(6.25, 'btc-lightning');
});
it('ignores cancellation, replacement account credentials and replacement views during invoice creation', async () => {
  for (const replace of ['cancel', 'replaceKey', 'replaceCredit', 'replaceProvider', 'dispose'] as const) {
    const s = setup(); const gate = deferred<Awaited<ReturnType<PpqTopupServices['create']>>>(); s.create.mockReturnValueOnce(gate.promise);
    const work = s.controller.create(2);
    if (replace === 'cancel') s.controller.cancel(); else if (replace === 'dispose') disposePpqSettings(); else s[replace]();
    gate.resolve({ lightning_invoice: 'STALE PAYMENT', invoice_id: 'STALE-ID' }); await work;
    expect(s.qr).not.toHaveBeenCalled(); expect(s.view.readPayment()).toBe(''); expect(s.status).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  }
});
it('rejects canceled QR results and allows text-only fallback without changing wallet scheme', async () => {
  const s = setup(); const gate = deferred<string>(); s.qr.mockReturnValueOnce(gate.promise);
  const work = s.controller.create(2); await vi.advanceTimersByTimeAsync(0); expect(s.qr).toHaveBeenCalledOnce();
  s.controller.cancel(); gate.resolve('STALE QR'); await work; expect(s.view.readPayment()).toBe(''); expect(vi.getTimerCount()).toBe(0);
  s.controller.picker(true); s.controller.select('xmr'); s.qr.mockRejectedValueOnce(new Error('PRIVATE ERROR'));
  s.create.mockResolvedValueOnce({ payment_address: 'XMR ADDRESS', invoice_id: 'XMR-ID', crypto_amount_due: '0.03' }); await s.controller.create(5);
  expect(s.view.readPayment()).toBe('XMR ADDRESS'); expect(s.host.querySelector('img')).toBeNull(); expect(s.host.querySelector('a[href="monero:XMR ADDRESS"]')).not.toBeNull();
});
it('prevents duplicate invoice creation and overlapping polls and cancels delayed onboarding on close', async () => {
  const s = setup(); const createGate = deferred<Awaited<ReturnType<PpqTopupServices['create']>>>(); s.create.mockReturnValueOnce(createGate.promise);
  const work = s.controller.create(2); await s.controller.create(2); expect(s.create).toHaveBeenCalledOnce();
  createGate.resolve({ lightning_invoice: 'PAYMENT', invoice_id: 'ID' }); await work;
  const gate = deferred<{ status: string }>(); s.status.mockReturnValueOnce(gate.promise);
  await vi.advanceTimersByTimeAsync(3000); await vi.advanceTimersByTimeAsync(6000); expect(s.status).toHaveBeenCalledOnce();
  gate.resolve({ status: 'paid' }); await vi.advanceTimersByTimeAsync(0); expect(s.received).toHaveBeenCalledOnce(); expect(s.balance).toHaveBeenCalledOnce();
  expect(s.view.getTopup().phase).toBe('success'); expect(s.host.textContent).toContain('$2.00 added to your balance'); expect(s.view.readPayment()).toBe('');
  s.controller.clear(); await vi.advanceTimersByTimeAsync(3000); expect(s.returnToChat).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it.each(['paid', 'complete', 'settled', 'processing'])('retains accepted receipt behavior for provider status %s', async status => {
  const s = setup(); s.status.mockResolvedValueOnce({ status }); await s.controller.create(2); await vi.advanceTimersByTimeAsync(5000);
  expect(s.received).toHaveBeenCalledOnce(); expect(s.returnToChat).toHaveBeenCalledOnce(); expect(s.view.getTopup().phase).toBe('success');
});
it('rejects stale paid poll results and stale delayed returns after account changes', async () => {
  const s = setup(); const gate = deferred<{ status: string }>(); s.status.mockReturnValueOnce(gate.promise);
  await s.controller.create(2); await vi.advanceTimersByTimeAsync(3000); s.replaceCredit(); gate.resolve({ status: 'paid' }); await vi.advanceTimersByTimeAsync(1000);
  expect(s.received).not.toHaveBeenCalled(); expect(s.balance).not.toHaveBeenCalled(); expect(s.returnToChat).not.toHaveBeenCalled(); expect(s.view.readPayment()).toBe('');
  const next = setup(); next.status.mockResolvedValueOnce({ status: 'paid' }); await next.controller.create(2); await vi.advanceTimersByTimeAsync(3000);
  next.replaceKey(); await vi.advanceTimersByTimeAsync(2000); expect(next.returnToChat).not.toHaveBeenCalled();
});
it.each(['expired', 'invalid'])('stops polling and shows retryable expiry for status %s', async status => {
  const s = setup(); s.status.mockResolvedValueOnce({ status }); await s.controller.create(2); await vi.advanceTimersByTimeAsync(3000);
  expect(s.host.textContent).toContain('Invoice expired. Try again.'); expect(vi.getTimerCount()).toBe(0); expect(s.received).not.toHaveBeenCalled();
});
it('retries transient poll errors and does not reveal raw invoice-creation exceptions', async () => {
  const s = setup(); s.status.mockRejectedValueOnce(new Error('PRIVATE POLL ERROR')); s.status.mockResolvedValueOnce({ status: 'paid' });
  await s.controller.create(2); await vi.advanceTimersByTimeAsync(6000); expect(s.received).toHaveBeenCalledOnce();
  s.controller.cancel(); s.controller.picker(true); s.create.mockRejectedValueOnce(new Error('PRIVATE CREATION ERROR')); await s.controller.create(2);
  expect(s.host.textContent).toContain('Could not create this invoice. Please retry.'); expect(s.host.textContent).not.toContain('PRIVATE CREATION ERROR'); expect(s.view.getTopup().phase).toBe('error');
});
it('does not toggle a zero-balance picker closed or replace an active invoice during balance refresh', async () => {
  const s = setup(); s.controller.select('xmr'); s.controller.picker(true); expect(s.view.getTopup().method).toBe('xmr');
  await s.controller.create(5); s.controller.picker(true); expect(s.view.getTopup().phase).toBe('invoice'); expect(s.view.readPayment()).toBe('privateInvoice');
});

it('rejects incomplete invoices and permits no payment request without a current provider', async () => {
  const s = setup(); s.create.mockResolvedValueOnce({ invoice_id: 'ID' }); await s.controller.create(2);
  expect(s.qr).not.toHaveBeenCalled(); expect(s.view.getTopup().phase).toBe('error'); expect(vi.getTimerCount()).toBe(0);
  s.controller.cancel(); s.controller.picker(true); s.replaceProvider(); s.controller.select('xmr'); s.controller.custom(); await s.controller.create(2);
  expect(s.view.getTopup().method).toBe('btc-lightning'); expect(s.view.getTopup().custom).toBe(false); expect(s.create).toHaveBeenCalledOnce();
});
