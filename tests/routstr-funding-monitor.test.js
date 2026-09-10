// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../js/utils.js', () => ({ escapeHTML: x => x, escapeAttr: x => x, showNotification: vi.fn() }));
import { createFundingMonitor } from '../js/provider-wallet-funding-recovery.js';
import { showNotification } from '../js/utils.js';
let monitor;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); document.body.innerHTML = '<div id="routstr-wfund-status" data-quote="new" data-mint="https://mint.test"><a>current QR</a><div id="routstr-wfund-poll"></div></div>'; });
afterEach(() => { monitor?.stop(); vi.useRealTimers(); });
const result = (extra = {}) => ({ mint: 'https://mint.test', checked: 2, pending: 1, recovered: 0, balance: 0, failed: 0, results: [], ...extra });
const runtime = check => ({ cashuHasWalletSeed: async () => true, cashuRecoverPendingFunding: check });
const settle = () => vi.advanceTimersByTimeAsync(0);

it('automatically credits an older invoice without replacing the newer QR', async () => {
  const refresh = vi.fn();
  monitor = createFundingMonitor(runtime(vi.fn().mockResolvedValue(result({ recovered: 500, balance: 500, results: [{ quote: 'old', paid: true, minted: 500, fee: 0 }, { quote: 'new', paid: false }] }))), refresh);
  monitor.start(); await settle();
  expect(refresh).toHaveBeenCalledWith(500);
  expect(document.querySelector('a').textContent).toBe('current QR');
  expect(showNotification).toHaveBeenCalledWith('Wallet funded ⚡ 500 sats', 'success');
});
it('continues checking without a deposit panel and resumes persisted invoices on start', async () => {
  document.body.innerHTML = '';
  const check = vi.fn().mockResolvedValueOnce(result()).mockResolvedValue(result({ recovered: 500, balance: 500, pending: 0 }));
  const refresh = vi.fn(); monitor = createFundingMonitor(runtime(check), refresh);
  monitor.start(); await settle(); await vi.advanceTimersByTimeAsync(3000);
  expect(check).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenLastCalledWith(500);
});
it('backs off through repeated failures and recovers on connectivity restoration', async () => {
  const check = vi.fn().mockRejectedValue(new Error('offline'));
  monitor = createFundingMonitor(runtime(check), vi.fn()); monitor.start();
  await settle(); await vi.advanceTimersByTimeAsync(6000 + 12000 + 24000 + 48000);
  expect(check).toHaveBeenCalledTimes(5);
  expect(document.body.textContent).toContain('Retrying automatically');
  check.mockResolvedValue(result({ pending: 0, recovered: 500, balance: 500, results: [{ quote: 'new', paid: true, minted: 500, fee: 0 }] }));
  window.dispatchEvent(new Event('online')); await settle();
  expect(document.body.textContent).toContain('+500 sats added');
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Payment received');
  expect(document.querySelector('a')).toBeNull();
});
it('single-flights slow checks even during repeated starts and focus events', async () => {
  let resolve;
  const check = vi.fn(() => new Promise(r => { resolve = r; }));
  monitor = createFundingMonitor(runtime(check), vi.fn()); monitor.start(); await settle();
  monitor.start(); window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(9000);
  expect(check).toHaveBeenCalledTimes(1);
  resolve(result()); await settle(); await vi.advanceTimersByTimeAsync(3000);
  expect(check).toHaveBeenCalledTimes(2);
});
it('does not overwrite a withdrawal UI or an invoice from another mint', async () => {
  const check = vi.fn().mockResolvedValue(result({ mint: 'https://other.test', recovered: 10, results: [{ quote: 'new', paid: true, minted: 10 }] }));
  monitor = createFundingMonitor(runtime(check), vi.fn()); monitor.start(); await settle();
  expect(document.querySelector('a')).not.toBeNull();
  document.body.innerHTML = '<div id="routstr-wfund-status">Withdrawal confirmation</div>';
  await vi.advanceTimersByTimeAsync(3000);
  expect(document.body.textContent).toBe('Withdrawal confirmation');
});
