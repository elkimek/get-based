// Stable UI facade; wallet-wide coordination remains independent of the view.
import { createFundingMonitor as createWalletMonitor } from './cashu-funding-monitor.js';
import type { FundingMonitorRuntime, FundingMonitorResult, FundingRecoveryRuntime, FundingInvoice } from './cashu-funding-monitor.js';
import { getWalletFundingView } from './wallet-funding-component.js';
import { applyWalletFundingResult, showWalletFundingDelay } from './wallet-funding-presentation.js';
import { validateLightningInvoice } from './routstr-validation.js';
import { ensureQRCode } from './provider-qr.js';
import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import type { WalletFundingView } from './wallet-funding-contract.js';
export type { FundingMonitorRuntime, FundingMonitorResult, FundingRecoveryRuntime, FundingInvoice } from './cashu-funding-monitor.js';

export function createFundingMonitor(runtime: FundingMonitorRuntime, refreshBalance: () => unknown, onResult: (result: FundingMonitorResult) => unknown = () => {}, isActive: () => boolean = () => true) {
  return createWalletMonitor(runtime, refreshBalance, result => {
    onResult(result); applyWalletFundingResult(result);
    const recovered = Number(result.recovered);
    if (Number.isFinite(recovered) && recovered > 0) showNotification('Wallet funded ⚡ ' + recovered.toLocaleString() + ' sats', 'success');
  }, isActive, showWalletFundingDelay);
}

export async function recoverPendingWalletFunding(walletRuntime: FundingRecoveryRuntime, refreshBalance: () => unknown, onResult: (result: FundingMonitorResult) => void = () => {}) {
  const view = getWalletFundingView();
  if (!view || view.getState().pending) return;
  let recoveryNote = '';
  const setStatus = (text: string, tone: 'secondary' | 'danger' | 'success' = 'secondary') => {
    view.setState({ ...view.getState(), pending: false, status: { text: text + (recoveryNote ? '\n' + recoveryNote : ''), tone } });
  };
  if (typeof walletRuntime.cashuRecoverPendingFunding !== 'function') return setStatus('Pending deposit recovery is unavailable.', 'danger');
  view.setState({ ...view.getState(), pending: true, status: { text: 'Checking pending deposits and token imports…', tone: 'secondary' } });
  try {
    const operationRecovery = typeof walletRuntime.cashuRecoverPendingWalletOperation === 'function'
      ? await walletRuntime.cashuRecoverPendingWalletOperation() : { recovered: 0, pending: false, results: [] };
    const imports = operationRecovery.results?.filter(item => item.pending && item.operation === 'receive') || [];
    if (imports.length) {
      const mints = [...new Set(imports.map(item => item.mint).filter((mint): mint is string => typeof mint === 'string'))];
      const location = mints.length ? ' at ' + mints.slice(0, 3).join(', ') + (mints.length > 3 ? ' and other mints' : '') : '';
      recoveryNote = 'Token import' + location + ' is still awaiting reconciliation. Saved recovery data is retained.';
    } else if (operationRecovery.pending) recoveryNote = 'A wallet operation is still awaiting reconciliation. Saved recovery data is retained.';
    // Reconciliation was explicitly requested and continues if the view closes.
    const result = await walletRuntime.cashuRecoverPendingFunding();
    if (Array.isArray(result.results)) { onResult(result); applyWalletFundingResultToOwner(view, result); }
    if (!result.checked && operationRecovery.recovered > 0) {
      setStatus('✓ +' + operationRecovery.recovered.toLocaleString() + ' sats recovered from an interrupted wallet operation.', 'success'); refreshBalance(); return;
    }
    if (!result.checked) return setStatus('No pending Lightning deposits found.');
    if (result.recovered > 0) {
      const extra = [result.cleared > 0 ? result.cleared + ' completed or expired deposit cleared.' : '', result.failed > 0 ? result.failed + ' deposit check failed. Try again.' : ''].filter(Boolean).join('\n');
      setStatus('✓ +' + result.recovered.toLocaleString() + ' sats recovered to wallet.' + (extra ? '\n' + extra : ''), 'success');
      showNotification('Recovered ⚡ ' + result.recovered.toLocaleString() + ' sats', 'success'); refreshBalance(); return;
    }
    if (result.failed > 0) {
      const failures = result.errors?.slice(0, 3).map(error => 'Pending invoice' + (error.mint ? ' at ' + error.mint : '') + ': ' + (error.message || 'Unable to check pending deposit') + '. Recovery record retained.').join('\n');
      return setStatus((failures || 'Unable to check pending deposit.') + '\nPending invoices are checked at their original mints, regardless of the selected mint. Use Check pending deposits to retry.', 'danger');
    }
    if (result.cleared > 0) return setStatus(result.cleared + ' completed or expired deposit cleared.');
    setStatus('Pending Lightning deposit is not paid yet.');
  } catch (error) { setStatus(getErrorMessage(error, 'Unable to check pending deposits. Recovery data is retained.'), 'danger'); }
}
function applyWalletFundingResultToOwner(view: WalletFundingView, result: FundingMonitorResult): void {
  if (view === getWalletFundingView()) applyWalletFundingResult(result);
}

/** Captures the initiating owner and private invoice identity before QR work. */
export async function renderFundingInvoice(result: FundingInvoice) {
  const view = getWalletFundingView(); if (!view) return;
  validateLightningInvoice(result.invoice, result.amount);
  if (typeof result.mint !== 'string' || typeof result.quote !== 'string' || !result.quote) throw new Error('Invalid funding invoice identity');
  const payment = { invoice: result.invoice, amount: result.amount, quote: result.quote, mint: result.mint, qrImage: '' };
  view.showInvoice(payment);
  view.setState({ ...view.getState(), phase: 'invoice', pending: false, amount: result.amount, credited: 0, status: { text: '', tone: 'secondary' }, poll: 'Waiting for payment… Deposits are credited automatically.' });
  try {
    const makeQr = await ensureQRCode(); const qr = makeQr(0, 'L'); qr.addData(result.invoice.toUpperCase()); qr.make();
    const qrImage = 'data:image/svg+xml,' + encodeURIComponent(qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }));
    // A paid/terminal result, another invoice or a replacement view invalidates QR work.
    const current = view.readInvoice();
    if (current?.quote === payment.quote && current.mint === payment.mint && current.invoice === payment.invoice && view.getState().phase === 'invoice') view.showInvoice({ ...payment, qrImage });
  } catch {} // Copyable text and the wallet link still work without the QR vendor.
}
