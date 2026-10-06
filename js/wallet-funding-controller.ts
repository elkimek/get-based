import { validateLightningInvoice } from './routstr-validation.js';
import type { WalletFundingInvoice, WalletFundingView } from './wallet-funding-contract.js';
import type { WalletFundingResult } from './wallet-funding-presentation.js';
interface FundingDependencies {
  view(): WalletFundingView | null; isActive(): boolean; mint(): Promise<string>;
  createInvoice(amount: number): Promise<unknown>; receiveToken(token: string): Promise<unknown>;
  renderInvoice(invoice: WalletFundingInvoice): Promise<void>; startMonitor(): void;
  refreshBalance(): unknown; notify(text: string, tone: 'success' | 'error'): void;
  writeClipboard(text: string): Promise<void>; close(view: WalletFundingView): void;
}
export function createWalletFundingController(deps: FundingDependencies) {
  let pending: Promise<boolean> | null = null;
  let receiving = false;
  let cached: WalletFundingInvoice | null = null;
  const current = (view: WalletFundingView) => deps.isActive() && view.isCurrent() && deps.view() === view;
  const message = (view: WalletFundingView, text: string, tone: 'secondary' | 'danger' = 'secondary') => {
    if (current(view)) view.setState({ ...view.getState(), pending: false, status: { text, tone } });
  };
  async function showCached(view: WalletFundingView): Promise<void> {
    const invoice = cached;
    if (!invoice) return;
    const mint = await deps.mint();
    if (current(view) && invoice === cached && mint === invoice.mint) await deps.renderInvoice(invoice);
  }
  function acceptResult(result: WalletFundingResult): void {
    if (!cached) return;
    const invoice = cached;
    const terminal = result.results.some(value => {
      const item = value as { quote?: unknown; mint?: unknown; paid?: unknown; state?: unknown } | null;
      return item?.quote === invoice.quote && (item.mint || result.mint) === invoice.mint && (item.paid || /^(EXPIRED|CANCELLED|CANCELED)$/.test(String(item.state).toUpperCase()));
    });
    if (terminal) cached = null;
  }
  function fund(amount: number): Promise<boolean> {
    if (pending) return pending;
    const view = deps.view();
    if (!view || !current(view) || receiving || view.getState().pending) return Promise.resolve(false);
    if (!Number.isSafeInteger(amount) || amount < 100) { message(view, 'Minimum 100 sats. Enter a whole number of sats.', 'danger'); return Promise.resolve(false); }
    if (cached?.amount === amount && view.getState().phase === 'invoice' && view.readInvoice()?.quote === cached.quote && view.readInvoice()?.mint === cached.mint) return Promise.resolve(true);
    view.clearInvoice(); view.setState({ ...view.getState(), phase: 'pending', pending: true, status: { text: 'Creating invoice…', tone: 'secondary' }, poll: '' });
    pending = (async () => {
      try {
        const mint = await deps.mint();
        if (!current(view) || mint !== await deps.mint()) return false;
        // Accepted domain operations retain their durable quote after the UI closes.
        const value = await deps.createInvoice(amount);
        const raw = value as { invoice?: unknown; quote?: unknown; mint?: unknown } | null;
        if (!raw || typeof raw.invoice !== 'string' || typeof raw.quote !== 'string' || !raw.quote) throw new Error('Invalid funding response');
        validateLightningInvoice(raw.invoice, amount);
        const invoice = { invoice: raw.invoice, quote: raw.quote, mint: typeof raw.mint === 'string' ? raw.mint : mint, amount, qrImage: '' };
        cached = invoice;
        deps.startMonitor();
        if (current(view) && cached === invoice) await deps.renderInvoice(invoice);
        return true;
      } catch { message(view, 'Could not create this invoice. Check pending deposits before retrying; any saved recovery data is retained.', 'danger'); return false; }
      finally {
        if (current(view) && view.getState().pending) view.setState({ ...view.getState(), pending: false });
        pending = null;
      }
    })();
    return pending;
  }
  function custom(): void {
    const view = deps.view(); if (!view || view.getState().pending) return;
    const amount = Number(view.readCustomAmount().trim().replace(/[,\s]/g, ''));
    void fund(amount);
  }
  async function receive(capturedToken?: string): Promise<void> {
    const view = deps.view(); if (!view || !current(view) || receiving || pending || view.getState().pending) return;
    const token = (capturedToken ?? view.readToken()).trim().replace(/^cashu:/, '');
    if (!/^cashu[AB]/.test(token)) { message(view, 'Paste a valid Cashu token (cashuA… or cashuB…)', 'danger'); return; }
    receiving = true;
    view.setState({ ...view.getState(), pending: true, status: { text: 'Depositing…', tone: 'secondary' } });
    try {
      const raw = await deps.receiveToken(token) as { received?: unknown; fee?: unknown } | null;
      if (!raw || typeof raw.received !== 'number' || !Number.isFinite(raw.received) || raw.received < 0) throw new Error('Invalid token receipt');
      // Domain proofs and import journals belong to the token’s original mint.
      if (current(view)) { view.clearToken(); deps.close(view); }
      const fee = typeof raw.fee === 'number' && raw.fee > 0 ? ' (' + raw.fee + ' fee)' : '';
      deps.notify('Wallet funded ⚡ +' + raw.received + ' sats' + fee, 'success'); deps.refreshBalance();
    } catch { message(view, 'Token deposit could not be confirmed. Check pending deposits to reconcile it. Saved recovery data is retained.', 'danger'); }
    finally { receiving = false; if (current(view)) view.setState({ ...view.getState(), pending: false }); }
  }
  async function copy(): Promise<void> {
    const view = deps.view(); const invoice = view?.readInvoice(); if (!view || !invoice || !current(view)) return;
    try { await deps.writeClipboard(invoice.invoice); if (current(view) && view.readInvoice()?.invoice === invoice.invoice) view.setCopied(); }
    catch { message(view, 'Clipboard copy failed. Open Invoice text to select and copy it manually.', 'danger'); }
  }
  return { fund, custom, receive, copy, showCached, acceptResult };
}
