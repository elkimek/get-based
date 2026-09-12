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

it('does not check or subscribe when Routstr is inactive, including during async startup', async () => {
  let active = false;
  let seedReady;
  const check = vi.fn().mockResolvedValue(result());
  const subscribe = vi.fn();
  monitor = createFundingMonitor({ ...runtime(check), cashuHasWalletSeed: () => new Promise(r => { seedReady = r; }), cashuSubscribeFundingQuotes: subscribe }, vi.fn(), () => {}, () => active);
  monitor.start(); await settle();
  expect(check).not.toHaveBeenCalled();
  active = true; monitor.start(); await settle();
  active = false; seedReady(true); await settle();
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(120000);
  expect(check).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
});

it('stops subscriptions and rejects queued checks when the provider changes', async () => {
  let active = true;
  let options;
  const cancel = vi.fn();
  const check = vi.fn(async value => { options = value; return result({pendingQuotes:[{mint:'https://mint.test',quote:'new'}]}); });
  monitor = createFundingMonitor({ ...runtime(check), cashuSubscribeFundingQuotes: async () => cancel }, vi.fn(), () => {}, () => active);
  monitor.start(); await settle();
  expect(options.shouldContinue()).toBe(true);
  active = false; monitor.stop(); await settle();
  expect(options.shouldContinue()).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(120000);
  expect(check).toHaveBeenCalledTimes(1);
  active = true; monitor.start(); await settle();
  expect(check).toHaveBeenCalledTimes(2);
});

it('automatically credits an older invoice without replacing the newer QR', async () => {
  const refresh = vi.fn();
  monitor = createFundingMonitor(runtime(vi.fn().mockResolvedValue(result({ recovered: 500, balance: 500, results: [{ quote: 'old', paid: true, minted: 500, fee: 0 }, { quote: 'new', paid: false }] }))), refresh);
  monitor.start(); await settle();
  expect(refresh).toHaveBeenCalledWith();
  expect(document.querySelector('a').textContent).toBe('current QR');
  expect(showNotification).toHaveBeenCalledWith('Wallet funded ⚡ 500 sats', 'success');
});
it('continues checking without a deposit panel and resumes persisted invoices on start', async () => {
  document.body.innerHTML = '';
  const check = vi.fn().mockResolvedValueOnce(result()).mockResolvedValue(result({ recovered: 500, balance: 500, pending: 0 }));
  const refresh = vi.fn(); monitor = createFundingMonitor(runtime(check), refresh);
  monitor.start(); await settle(); await vi.advanceTimersByTimeAsync(5000);
  expect(check).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenLastCalledWith();
});
it('backs off through repeated failures and recovers on connectivity restoration', async () => {
  const check = vi.fn().mockRejectedValue(new Error('offline'));
  monitor = createFundingMonitor(runtime(check), vi.fn()); monitor.start();
  await settle(); await vi.advanceTimersByTimeAsync(10000 + 20000 + 40000 + 60000);
  expect(check).toHaveBeenCalledTimes(5);
  expect(document.body.textContent).toContain('Retrying automatically');
  check.mockResolvedValue(result({ pending: 0, recovered: 500, balance: 500, results: [{ quote: 'new', paid: true, minted: 500, fee: 0 }] }));
  window.dispatchEvent(new Event('online')); await settle();
  expect(check).toHaveBeenCalledTimes(5);
  await vi.advanceTimersByTimeAsync(60000);
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
  resolve(result()); await settle(); await vi.advanceTimersByTimeAsync(5000);
  expect(check).toHaveBeenCalledTimes(2);
});
it('does not overwrite a withdrawal UI or an invoice from another mint', async () => {
  const check = vi.fn().mockResolvedValue(result({ mint: 'https://other.test', recovered: 10, results: [{ quote: 'new', paid: true, minted: 10 }] }));
  monitor = createFundingMonitor(runtime(check), vi.fn()); monitor.start(); await settle();
  expect(document.querySelector('a')).not.toBeNull();
  document.body.innerHTML = '<div id="routstr-wfund-status">Withdrawal confirmation</div>';
  await vi.advanceTimersByTimeAsync(5000);
  expect(document.body.textContent).toBe('Withdrawal confirmation');
});

it('matches each recovered quote to its own mint when several mints are monitored', async () => {
  const check = vi.fn().mockResolvedValue(result({ recovered: 10, results: [{ quote: 'new', mint: 'https://other.test', paid: true, minted: 10, fee: 0 }] }));
  monitor = createFundingMonitor(runtime(check), vi.fn()); monitor.start(); await settle();
  expect(document.querySelector('a')).not.toBeNull();
  check.mockResolvedValue(result({ mint: 'https://other.test', recovered: 10, results: [{ quote: 'new', mint: 'https://mint.test', paid: true, minted: 10, fee: 0 }] }));
  await vi.advanceTimersByTimeAsync(5000);
  expect(document.querySelector('a')).toBeNull();
  expect(document.body.textContent).toContain('Payment received');
});

it('checks a displayed invoice no faster than five seconds after each completed request', async () => {
  const check = vi.fn().mockResolvedValue(result());
  monitor = createFundingMonitor(runtime(check), vi.fn());
  monitor.start(); await settle();
  await vi.advanceTimersByTimeAsync(4999);
  expect(check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(check).toHaveBeenCalledTimes(2);
});

it('queues an immediate check when an invoice is created during an older idle scan', async () => {
  document.body.innerHTML = '';
  let resolve;
  const check = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(result({ pending: 0 }));
  monitor = createFundingMonitor(runtime(check), vi.fn());
  monitor.start(); await settle();
  monitor.start({ recheck: true });
  expect(check).toHaveBeenCalledTimes(1);
  resolve(result({ checked: 0, pending: 0 }));
  await settle(); await vi.advanceTimersByTimeAsync(1);
  expect(check).toHaveBeenCalledTimes(2);
});

it('shows the committed payment and continues polling while a balance refresh is slow', async () => {
  let finishRefresh;
  const refresh = vi.fn(() => new Promise(resolve => { finishRefresh = resolve; }));
  const check = vi.fn().mockResolvedValueOnce(result({ recovered: 500, results: [{ quote: 'new', paid: true, minted: 500, fee: 0 }] })).mockResolvedValue(result());
  monitor = createFundingMonitor(runtime(check), refresh);
  monitor.start(); await settle();
  expect(document.body.textContent).toContain('Payment received');
  await vi.advanceTimersByTimeAsync(5000);
  expect(check).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(1);
  finishRefresh(); await settle();
});

it('uses notifications as verification hints and unsubscribes after settlement', async () => {
  const mint = 'https://mint.test';
  let update;
  const cancel = vi.fn();
  const subscribe = vi.fn(async (_mint, _ids, cb) => { update = cb; cb({ quote: 'new', state: 'UNPAID' }); return cancel; });
  const check = vi.fn().mockResolvedValue(result({ pendingQuotes: [{ mint, quote: 'new' }] }));
  monitor = createFundingMonitor({ ...runtime(check), cashuSubscribeFundingQuotes: subscribe }, vi.fn());
  monitor.start(); await settle();
  expect(subscribe).toHaveBeenCalledTimes(1);
  update({ quote: 'unknown', state: 'PAID' }); await settle();
  expect(check).toHaveBeenCalledTimes(1);
  update({ quote: 'new', state: 'PAID' }); await settle();
  expect(check.mock.lastCall[0]).toMatchObject({ notified: [{ mint, quote: 'new' }], subscribedMints: [mint] });
  expect(document.querySelector('a')).not.toBeNull();
  check.mockResolvedValue(result({ pending: 0, recovered: 12, pendingQuotes: [], results: [{ mint, quote: 'new', paid: true, minted: 12, fee: 0 }] }));
  await vi.advanceTimersByTimeAsync(5000);
  expect(document.body.textContent).toContain('Payment received');
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('falls back when notifications fail and does not reconnect on each poll', async () => {
  let fail;
  const cancel = vi.fn();
  const subscribe = vi.fn(async (_mint, _ids, update, error) => { fail = error; update({ quote: 'new', state: 'UNPAID' }); return cancel; });
  const check = vi.fn().mockResolvedValue(result({ pendingQuotes: [{ mint: 'https://mint.test', quote: 'new' }] }));
  monitor = createFundingMonitor({ ...runtime(check), cashuSubscribeFundingQuotes: subscribe }, vi.fn());
  monitor.start(); await settle();
  fail(new Error('Socket closed'));
  await vi.advanceTimersByTimeAsync(15000);
  expect(check).toHaveBeenCalledTimes(5);
  expect(check.mock.lastCall[0].subscribedMints).toEqual([]);
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('does not let repeated focus or new-invoice wakeups override Retry-After', async () => {
  const check = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { retryAfterMs: 120000 })).mockResolvedValue(result({ pending: 0 }));
  monitor = createFundingMonitor(runtime(check), vi.fn());
  monitor.start(); await settle();
  for (let i = 0; i < 10; i++) { monitor.start({ recheck: true }); window.dispatchEvent(new Event('focus')); }
  await vi.advanceTimersByTimeAsync(119999);
  expect(check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(check).toHaveBeenCalledTimes(2);
});
