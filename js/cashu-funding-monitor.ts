import { createFundingCoordinator } from './cashu-funding-coordinator.js';
type NativeWallet = typeof import('./cashu-wallet.js');
type FundingRecovery = Awaited<ReturnType<NativeWallet['recoverPendingFunding']>>;
type PendingFundingQuote = FundingRecovery['pendingQuotes'][number];
type FundingCheckError = FundingRecovery['errors'][number];
type FundingHint = Pick<PendingFundingQuote, 'mint' | 'quote'>;
type FundingCancel = Awaited<ReturnType<NativeWallet['subscribeFundingQuotes']>>;
export interface FundingRecoveryRuntime {
  cashuRecoverPendingFunding?: NativeWallet['recoverPendingFunding'] | null | undefined;
  cashuRecoverPendingWalletOperation?: NativeWallet['recoverPendingWalletOperation'] | null | undefined;
}
export interface FundingMonitorRuntime {
  cashuHasWalletSeed: NativeWallet['hasWalletSeed'];
  cashuRecoverPendingFunding: NativeWallet['recoverPendingFunding'];
  cashuSubscribeFundingQuotes?: NativeWallet['subscribeFundingQuotes'] | null | undefined;
}
export interface FundingMonitorResult {
  results: unknown[];
  mint?: unknown; recovered?: unknown; failed?: unknown;
}
interface FundingSubscription {
  key: string; retryAt: number; confirmed: boolean;
  cancel?: FundingCancel; connecting?: boolean;
}
export type FundingInvoice = Pick<Awaited<ReturnType<NativeWallet['createFundingInvoice']>>, 'invoice' | 'amount' | 'quote'> & { mint?: unknown };

/** One wallet-wide loop, independent of the currently visible invoice/panel. */
export function createFundingMonitor(runtime: FundingMonitorRuntime, refreshBalance: () => unknown, onResult: (result: FundingMonitorResult) => unknown = (_result) => {}, isActive: () => boolean = () => true, onDelay: () => void = () => {}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let enabled = false;
  let leader = false;
  let failures = 0;
  let notBefore = 0;
  let recheckRequested = false;
  let refreshingBalance = false;
  const canRun = () => enabled && leader && isActive();
  const subscriptions = new Map<string, FundingSubscription>();
  const notified = new Map<string, FundingHint>();
  const quoteKey = (item: FundingHint) => item.mint + '\n' + item.quote;

  function displayResult(result: unknown) {
    if (!enabled || !result || !Array.isArray((result as FundingMonitorResult).results)) return;
    onResult(result as FundingMonitorResult);
    // Both the leader and followers refresh from local proofs only.
    if (!refreshingBalance) {
      refreshingBalance = true;
      void Promise.resolve().then(() => refreshBalance()).catch(() => {}).finally(() => { refreshingBalance = false; });
    }
  }

  function closeSubscriptions() {
    for (const entry of subscriptions.values()) entry.cancel?.();
    subscriptions.clear();
    notified.clear();
  }

  function syncSubscriptions(quotes: PendingFundingQuote[], errors: FundingCheckError[] = []) {
    if (typeof runtime.cashuSubscribeFundingQuotes !== 'function') return;
    const groups = new Map<string, string[]>();
    for (const item of quotes) {
      if (!groups.has(item.mint)) groups.set(item.mint, []);
      groups.get(item.mint)!.push(item.quote);
    }
    for (const [mint, entry] of subscriptions) {
      if (!groups.has(mint)) { entry.cancel?.(); subscriptions.delete(mint); }
    }
    for (const [mint, ids] of groups) {
      const key = [...new Set(ids)].sort().join('\n');
      const previous = subscriptions.get(mint);
      const retry = Math.max(0, ...errors.filter(error => error.mint === mint).map(error => Number(error.retryAfterMs) || 0));
      if (retry) {
        previous?.cancel?.();
        subscriptions.set(mint, { key, retryAt: Date.now() + retry, confirmed: false });
        continue;
      }
      if (previous && (previous.retryAt > Date.now() || (previous.key === key && (previous.cancel || previous.connecting)))) continue;
      previous?.cancel?.();
      const entry: FundingSubscription = { key, cancel: (null), connecting: true, confirmed: false, retryAt: 0 };
      subscriptions.set(mint, entry);
      const failed = (error: unknown) => {
        if (subscriptions.get(mint) !== entry) return;
        const wasConfirmed = entry.confirmed;
        entry.cancel?.();
        entry.cancel = null;
        entry.connecting = false;
        entry.confirmed = false;
        entry.retryAt = Date.now() + Math.max(300000, Number((error as {retryAfterMs?: unknown} | null | undefined)?.retryAfterMs) || 0);
        if (wasConfirmed) {
          for (const quote of ids) { const item = { mint, quote }; notified.set(quoteKey(item), item); }
          wakeLocal();
        }
      };
      void Promise.resolve().then(() => canRun() ? (runtime.cashuSubscribeFundingQuotes as NativeWallet['subscribeFundingQuotes'])(mint, ids, update => {
        if (!canRun() || subscriptions.get(mint) !== entry || !ids.includes(update?.quote)) return;
        entry.confirmed = true;
        if (/^(PAID|ISSUED|EXPIRED|CANCELLED|CANCELED)$/.test(String(update.state).toUpperCase())) {
          const item = { mint, quote: update.quote };
          // A notification never credits funds directly or bypasses HTTP limits.
          if (!notified.has(quoteKey(item))) { notified.set(quoteKey(item), item); wakeLocal(); }
        }
      }, failed) : null).then(cancel => {
        if (!canRun() || subscriptions.get(mint) !== entry || entry.retryAt) { cancel?.(); return; }
        entry.connecting = false;
        entry.cancel = cancel;
        if (!cancel) entry.retryAt = Date.now() + 300000;
      }).catch(failed);
    }
  }

  const coordinator = createFundingCoordinator(active => {
    leader = active;
    if (active) wakeLocal();
    else {
      if (timer) clearTimeout(timer);
      timer = null;
      closeSubscriptions();
    }
  }, displayResult, () => wakeLocal());

  async function tick() {
    if (!canRun() || running) return;
    if (notBefore > Date.now()) { timer = setTimeout(tick, Math.min(2147483647, notBefore - Date.now())); return; }
    running = true;
    recheckRequested = false;
    let delay = 30000;
    try {
      if (await runtime.cashuHasWalletSeed() && canRun()) {
        const hints = [...notified.values()];
        notified.clear();
        let result: FundingRecovery;
        try {
          result = await runtime.cashuRecoverPendingFunding({ automatic: true, shouldContinue: canRun, notified: hints, subscribedMints: [...subscriptions].filter(([, entry]) => entry.confirmed).map(([mint]) => mint) });
        } catch (error) { for (const hint of hints) notified.set(quoteKey(hint), hint); throw error; }
        if (!canRun()) return;
        for (const hint of hints) {
          if (result.results?.some(item => quoteKey(item) === quoteKey(hint) && item.state === 'WAITING')) notified.set(quoteKey(hint), hint);
        }
        displayResult(result);
        coordinator.publish(result);
        syncSubscriptions(result.pendingQuotes || [], result.errors || []);
        failures = result.failed ? failures + 1 : 0;
        // Per-quote pacing and per-mint budgets are persisted by the wallet.
        // These scans are local when no quote is due. Hidden tabs scan slowly.
        delay = document.visibilityState === 'hidden' ? 60000 : result.pending || result.failed ? 5000 : 30000;
      }
    } catch (error) {
      delay = Math.max(Number((error as {retryAfterMs?: unknown} | null | undefined)?.retryAfterMs) || 0, Math.min(60000, 5000 * 2 ** Math.min(++failures, 4)));
      notBefore = Date.now() + delay;
      onDelay();
    } finally {
      running = false;
      if (canRun()) timer = setTimeout(tick, Math.min(2147483647, Math.max(notBefore - Date.now(), recheckRequested ? 0 : delay, 0)));
    }
  }
  function wakeLocal() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (running) { recheckRequested = true; return; }
    void tick();
  }
  const wake = () => coordinator.wake();
  const suspend = () => coordinator.stop();
  const resume = () => { if (enabled) coordinator.start(); };
  return {
    start({ recheck = false }: { recheck?: unknown } = {}) {
      if (!isActive()) return;
      if (!enabled) {
        enabled = true;
        globalThis.addEventListener?.('online', wake);
        globalThis.addEventListener?.('focus', wake);
        globalThis.addEventListener?.('pagehide', suspend);
        globalThis.addEventListener?.('pageshow', resume);
        coordinator.start();
      } else if (recheck) wake();
    },
    stop() {
      enabled = false;
      if (timer) clearTimeout(timer);
      timer = null;
      recheckRequested = false;
      coordinator.stop();
      closeSubscriptions();
      globalThis.removeEventListener?.('online', wake);
      globalThis.removeEventListener?.('focus', wake);
      globalThis.removeEventListener?.('pagehide', suspend);
      globalThis.removeEventListener?.('pageshow', resume);
    },
  };
}
