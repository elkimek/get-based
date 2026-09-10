// @ts-check
// provider-wallet-funding-recovery.js - Pending Lightning funding recovery UI

import { validateLightningInvoice } from './routstr-validation.js';
import { ensureQRCode } from './provider-qr.js';
import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';

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
  title.style.cssText = 'font-size:16px';
  title.textContent = 'Payment received';
  card.append(check, title);
  const detail = document.createElement('div');
  detail.style.cssText = 'margin-top:8px;font-size:12px;color:var(--green)';
  detail.textContent = '+' + credited.toLocaleString() + ' sats added to wallet';
  confirmation.append(amount, card, detail);
  status.replaceChildren(confirmation);
}

/** One wallet-wide loop, independent of the currently visible invoice/panel. */
export function createFundingMonitor(runtime, refreshBalance, onResult = (_result) => {}) {
  let timer = null;
  let running = false;
  let enabled = false;
  let failures = 0;
  async function tick() {
    if (!enabled || running) return;
    running = true;
    let delay = 30000;
    try {
      if (await runtime.cashuHasWalletSeed()) {
        const result = await runtime.cashuRecoverPendingFunding();
        onResult(result);
        await refreshBalance(result.balance);
        const status = document.getElementById('routstr-wfund-status');
        const displayed = result.results?.find(item => item.quote === status?.dataset.quote && result.mint === status?.dataset.mint);
        if (displayed?.paid && status) {
          const credited = Math.max(0, Number(displayed.minted) - Number(displayed.fee || 0));
          renderFundingPaid(status, credited);
          delete status.dataset.quote;
        } else if (displayed && /^(EXPIRED|CANCELLED|CANCELED)$/.test(String(displayed.state).toUpperCase()) && status) {
          status.textContent = 'This invoice expired or was cancelled. Request a new invoice to deposit.';
          delete status.dataset.quote;
        }
        if (result.recovered > 0) {
          showNotification('Wallet funded ⚡ ' + result.recovered.toLocaleString() + ' sats', 'success');
        }
        if (result.failed) throw new Error('Pending deposit check failed');
        failures = 0;
        delay = result.pending ? 3000 : 30000;
        const poll = document.getElementById('routstr-wfund-poll');
        if (poll) poll.textContent = displayed?.state === 'ISSUED'
          ? 'Payment received. Recovering wallet balance…'
          : 'Waiting for payment… Deposits are credited automatically.';
      }
    } catch {
      delay = Math.min(60000, 3000 * 2 ** Math.min(++failures, 5));
      const poll = document.getElementById('routstr-wfund-poll');
      if (poll) poll.textContent = 'Payment confirmation delayed. Retrying automatically…';
    } finally {
      running = false;
      if (enabled) timer = setTimeout(tick, delay);
    }
  }
  function wake() {
    if (timer) clearTimeout(timer);
    timer = null;
    void tick();
  }
  return {
    start() {
      if (!enabled) {
        enabled = true;
        globalThis.addEventListener?.('online', wake);
        globalThis.addEventListener?.('focus', wake);
      }
      // Refreshes made by the loop must not schedule a second in-flight check.
      if (!running) wake();
    },
    stop() {
      enabled = false;
      if (timer) clearTimeout(timer);
      timer = null;
      globalThis.removeEventListener?.('online', wake);
      globalThis.removeEventListener?.('focus', wake);
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
    <div style="margin-top:6px"><button class="import-btn import-btn-secondary" style="font-size:10px;padding:2px 8px" data-routstr-wallet-action="copy-clipboard" data-clipboard-text="${escapeAttr(result.invoice)}" data-copied-text="✓ Copied">${escapeHTML(result.invoice.slice(0, 20))}… copy</button></div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:4px" id="routstr-wfund-poll">Waiting for payment… Deposits are credited automatically.</div>
  </div>`;
}
