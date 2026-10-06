import { getWalletFundingView } from './wallet-funding-component.js';
export interface WalletFundingResult { results: unknown[]; mint?: unknown; recovered?: unknown; failed?: unknown }
interface FundingItem { quote?: unknown; mint?: unknown; paid?: unknown; minted?: unknown; fee?: unknown; state?: unknown }
export function applyWalletFundingResult(result: WalletFundingResult): void {
  const view = getWalletFundingView(); const invoice = view?.readInvoice();
  if (!view || !invoice) return;
  const item = result.results.find(value => {
    const row = value as FundingItem | null;
    return row?.quote === invoice.quote && (row.mint || result.mint) === invoice.mint;
  }) as FundingItem | undefined;
  if (item?.paid) {
    const credited = Number(item.minted) - Number(item.fee || 0);
    if (!Number.isFinite(credited) || credited < 0) return;
    view.clearInvoice(); view.setState({ ...view.getState(), phase: 'paid', pending: false, credited, status: { text: '', tone: 'success' }, poll: '' });
  } else if (item && /^(EXPIRED|CANCELLED|CANCELED)$/.test(String(item.state).toUpperCase())) {
    view.clearInvoice(); view.setState({ ...view.getState(), phase: 'terminal', pending: false, poll: '', status: { text: 'This invoice expired or was cancelled. Request a new invoice to deposit.', tone: 'warning' } });
  } else {
    view.setState({ ...view.getState(), poll: item?.state === 'PAUSED'
      ? 'Mint rejected this invoice check. Automatic checks paused; use Check pending deposits to retry.'
      : result.failed ? 'Payment confirmation delayed. Retrying automatically…'
      : item?.state === 'ISSUED' ? 'Payment received. Recovering wallet balance…'
      : 'Waiting for payment… Deposits are credited automatically.' });
  }
}
export function showWalletFundingDelay(): void {
  const view = getWalletFundingView();
  if (view?.readInvoice()) view.setState({ ...view.getState(), poll: 'Payment confirmation delayed. Retrying automatically…' });
}
