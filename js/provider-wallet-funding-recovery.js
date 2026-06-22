// @ts-check
// provider-wallet-funding-recovery.js - Pending Lightning funding recovery UI

import { escapeHTML, showNotification } from './utils.js';

export async function recoverPendingWalletFunding(walletRuntime, refreshBalance) {
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!statusEl) return;
  const setStatus = (htmlMessage, color = 'var(--text-muted)', center = false) => {
    statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:' + color + (center ? ';text-align:center' : '') + '">' + htmlMessage + '</div>';
  };
  if (typeof walletRuntime.cashuRecoverPendingFunding !== 'function') return setStatus('Pending deposit recovery is unavailable.', 'var(--red)');
  statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Checking pending Lightning deposits\u2026</div>';
  try {
    const result = await walletRuntime.cashuRecoverPendingFunding();
    if (!result.checked) return setStatus('No pending Lightning deposits found.');
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
    setStatus(escapeHTML(e?.message || String(e)), 'var(--red)');
  }
}
