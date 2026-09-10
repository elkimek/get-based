// @ts-check
// provider-wallet-funding-recovery.js - Pending Lightning funding recovery UI

import { validateLightningInvoice } from './routstr-validation.js';
import { ensureQRCode } from './provider-qr.js';
import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { createFundingCoordinator } from './cashu-funding-coordinator.js';

export async function recoverPendingWalletFunding(walletRuntime, refreshBalance) {
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!statusEl) return;
  const setStatus = (htmlMessage, color = 'var(--text-muted)', center = false) => {
    statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:' + color + (center ? ';text-align:center' : '') + '">' + htmlMessage + '</div>';
  };
  if (typeof walletRuntime.cashuRecoverPendingFunding !== 'function') return setStatus('Pending deposit recovery is unavailable.', 'var(--red)');
  statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Checking pending Lightning deposits\u2026</div>';
  try {
    const operationRecovery = typeof walletRuntime.cashuRecoverPendingWalletOperation === 'function'
      ? await walletRuntime.cashuRecoverPendingWalletOperation()
      : { recovered: 0 };
    const result = await walletRuntime.cashuRecoverPendingFunding();
    if (!result.checked && operationRecovery.recovered > 0) {
      setStatus('\u2713 +' + operationRecovery.recovered.toLocaleString() + ' sats recovered from an interrupted wallet operation.', 'var(--green)', true);
      refreshBalance();
      return;
    }
    if (!result.checked) return setStatus(operationRecovery.pending ? 'A wallet operation is still awaiting reconciliation. Retry its original token or check again when the mint is reachable.' : 'No pending Lightning deposits found.');
    if (result.recovered > 0) {
      const extra = [
        result.cleared > 0 ? result.cleared + ' completed or expired deposit cleared.' : '',
        result.failed > 0 ? '<span style="color:var(--red)">' + result.failed + ' deposit check failed. Try again.</span>' : ''
      ].filter(Boolean).join('<br>');
      setStatus('\u2713 +' + result.recovered.toLocaleString() + ' sats recovered to wallet.' + (extra ? '<br>' + extra : ''), 'var(--green)', true);
      showNotification('Recovered \u26a1 ' + result.recovered.toLocaleString() + ' sats', 'success');
      refreshBalance();
      return;
    }
    if (result.failed > 0) return setStatus(escapeHTML(result.errors?.[0]?.message || 'Unable to check pending deposit'), 'var(--red)');
    if (result.cleared > 0) return setStatus(result.cleared + ' completed or expired deposit cleared.');
    setStatus('Pending Lightning deposit is not paid yet.');
  } catch (e) {
    setStatus(escapeHTML(getErrorMessage(e, String(e))), 'var(--red)');
  }
}

function renderFundingPaid(status, credited) {
  const confirmation = document.createElement('div');
  confirmation.setAttribute('role', 'status');
  confirmation.style.cssText = 'margin-top:8px;text-align:center';
  const amount = document.createElement('div');
  amount.style.cssText = 'font-size:12px;font-weight:600;margin-bottom:4px';
  amount.textContent = '⚡ ' + credited.toLocaleString() + ' sats';
  const card = document.createElement('div');
  card.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;box-sizing:border-box;width:220px;height:220px;border:1px solid var(--green);border-radius:8px;background:rgba(34,197,94,0.08);color:var(--green)';
  const check = document.createElement('span');
  check.setAttribute('aria-hidden', 'true');
  check.style.cssText = 'display:flex;align-items:center;justify-content:center;width:72px;height:72px;border:2px solid currentColor;border-radius:50%;font-size:42px;line-height:1';
  check.textContent = '✓';
  const title = document.createElement('strong');
  title.style.cssText = 'font-size:12px';
  title.textContent = 'Payment received';
  card.append(check, title);
  const detail = document.createElement('div');
  detail.style.cssText = 'margin-top:8px;font-size:11px;color:var(--green)';
  detail.textContent = '+' + credited.toLocaleString() + ' sats added to wallet';
  confirmation.append(amount, card, detail);
  status.replaceChildren(confirmation);
}

/** One wallet-wide loop, independent of the currently visible invoice/panel. */
export function createFundingMonitor(runtime, refreshBalance, onResult = (_result) => {}) {
  let timer = null;
  let running = false;
  let enabled = false;
  let leader = false;
  let failures = 0;
  let notBefore = 0;
  let recheckRequested = false;
  let refreshingBalance = false;
  const subscriptions = new Map();
  const notified = new Map();
  const quoteKey = item => item.mint + '\n' + item.quote;

  function displayResult(result) {
    if (!enabled || !result || !Array.isArray(result.results)) return;
    onResult(result);
    const status = document.getElementById('routstr-wfund-status');
    const displayed = result.results.find(item => item.quote === status?.dataset.quote && (item.mint || result.mint) === status?.dataset.mint);
    if (displayed?.paid && status) {
      renderFundingPaid(status, Math.max(0, Number(displayed.minted) - Number(displayed.fee || 0)));
      delete status.dataset.quote;
    } else if (displayed && /^(EXPIRED|CANCELLED|CANCELED)$/.test(String(displayed.state).toUpperCase()) && status) {
      status.textContent = 'This invoice expired or was cancelled. Request a new invoice to deposit.';
      delete status.dataset.quote;
    }
    if (result.recovered > 0) showNotification('Wallet funded ⚡ ' + result.recovered.toLocaleString() + ' sats', 'success');
    // Both the leader and followers refresh from local proofs only.
    if (!refreshingBalance) {
      refreshingBalance = true;
      void Promise.resolve().then(() => refreshBalance()).catch(() => {}).finally(() => { refreshingBalance = false; });
    }
    const poll = document.getElementById('routstr-wfund-poll');
    if (poll) poll.textContent = result.failed
      ? 'Payment confirmation delayed. Retrying automatically…'
      : displayed?.state === 'ISSUED' ? 'Payment received. Recovering wallet balance…'
      : 'Waiting for payment… Deposits are credited automatically.';
  }

  function closeSubscriptions() {
    for (const entry of subscriptions.values()) entry.cancel?.();
    subscriptions.clear();
    notified.clear();
  }

  function syncSubscriptions(quotes, errors = []) {
    if (typeof runtime.cashuSubscribeFundingQuotes !== 'function') return;
    const groups = new Map();
    for (const item of quotes) {
      if (!groups.has(item.mint)) groups.set(item.mint, []);
      groups.get(item.mint).push(item.quote);
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
      const entry = { key, cancel: /** @type {null | (() => void)} */ (null), connecting: true, confirmed: false, retryAt: 0 };
      subscriptions.set(mint, entry);
      const failed = error => {
        if (subscriptions.get(mint) !== entry) return;
        const wasConfirmed = entry.confirmed;
        entry.cancel?.();
        entry.cancel = null;
        entry.connecting = false;
        entry.confirmed = false;
        entry.retryAt = Date.now() + Math.max(300000, Number(error?.retryAfterMs) || 0);
        if (wasConfirmed) {
          for (const quote of ids) { const item = { mint, quote }; notified.set(quoteKey(item), item); }
          wakeLocal();
        }
      };
      void Promise.resolve().then(() => runtime.cashuSubscribeFundingQuotes(mint, ids, update => {
        if (!leader || !enabled || subscriptions.get(mint) !== entry || !ids.includes(update?.quote)) return;
        entry.confirmed = true;
        if (/^(PAID|ISSUED|EXPIRED|CANCELLED|CANCELED)$/.test(String(update.state).toUpperCase())) {
          const item = { mint, quote: update.quote };
          // A notification never credits funds directly or bypasses HTTP limits.
          if (!notified.has(quoteKey(item))) { notified.set(quoteKey(item), item); wakeLocal(); }
        }
      }, failed)).then(cancel => {
        if (!leader || !enabled || subscriptions.get(mint) !== entry || entry.retryAt) { cancel?.(); return; }
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
    if (!enabled || !leader || running) return;
    if (notBefore > Date.now()) { timer = setTimeout(tick, Math.min(2147483647, notBefore - Date.now())); return; }
    running = true;
    recheckRequested = false;
    let delay = 30000;
    try {
      if (await runtime.cashuHasWalletSeed()) {
        const hints = [...notified.values()];
        notified.clear();
        let result;
        try {
          result = await runtime.cashuRecoverPendingFunding({ automatic: true, notified: hints, subscribedMints: [...subscriptions].filter(([, entry]) => entry.confirmed).map(([mint]) => mint) });
        } catch (error) { for (const hint of hints) notified.set(quoteKey(hint), hint); throw error; }
        if (!enabled || !leader) return;
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
      delay = Math.max(Number(/** @type {{retryAfterMs?: number}} */ (error)?.retryAfterMs) || 0, Math.min(60000, 5000 * 2 ** Math.min(++failures, 4)));
      notBefore = Date.now() + delay;
      const poll = document.getElementById('routstr-wfund-poll');
      if (poll) poll.textContent = 'Payment confirmation delayed. Retrying automatically…';
    } finally {
      running = false;
      if (enabled && leader) timer = setTimeout(tick, Math.min(2147483647, Math.max(notBefore - Date.now(), recheckRequested ? 0 : delay, 0)));
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
    start({ recheck = false } = {}) {
      if (!enabled) {
        enabled = true;
        globalThis.addEventListener?.('online', wake);
        globalThis.addEventListener?.('focus', wake);
        globalThis.addEventListener?.('pagehide', suspend);
        globalThis.addEventListener?.('pageshow', resume);
        coordinator.start();
      } else if (!running || recheck) wake();
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

export async function renderFundingInvoice(result) {
  const status = document.getElementById('routstr-wfund-status');
  if (!status) return;
  validateLightningInvoice(result.invoice, result.amount);
  let qrSvg = '';
  try {
    const makeQr = await ensureQRCode();
    const qr = makeQr(0, 'L');
    qr.addData(result.invoice.toUpperCase());
    qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  } catch {} // The copyable invoice still works if the QR library is unavailable.
  if (status !== document.getElementById('routstr-wfund-status')) return;
  status.dataset.quote = result.quote;
  status.dataset.mint = result.mint;
  status.innerHTML = `<div style="margin-top:8px;text-align:center">
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">⚡ ${result.amount.toLocaleString()} sats</div>
    ${qrSvg ? `<a href="${escapeAttr('lightning:' + result.invoice)}" style="display:inline-block;background:#fff;padding:10px;border-radius:8px;width:220px;height:220px">${qrSvg}</a>` : ''}
    <div style="margin-top:6px"><button class="import-btn import-btn-secondary"  data-routstr-wallet-action="copy-clipboard" data-clipboard-text="${escapeAttr(result.invoice)}" data-copied-text="✓ Copied">${escapeHTML(result.invoice.slice(0, 20))}… copy</button></div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:4px" id="routstr-wfund-poll">Waiting for payment… Deposits are credited automatically.</div>
  </div>`;
}
