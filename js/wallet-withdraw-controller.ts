import type { WalletWithdrawView, WalletWithdrawDraft } from './wallet-withdraw-contract.js';
interface WithdrawDependencies {
  view(): WalletWithdrawView | null; isActive(): boolean; mint(): Promise<string>; balance(): Promise<unknown>;
  maximum(mint: string): Promise<unknown>; quote(invoice: string, mint: string): Promise<unknown>;
  execute(quote: string, mint: string): Promise<unknown>; address(address: string, amount: number, mint: string): Promise<unknown>;
  send(amount: number, mint: string): Promise<unknown>; recover(): Promise<unknown>;
  tokenMint(token: string): Promise<unknown>; receive(token: string): Promise<unknown>; clearRecovery(): Promise<unknown>;
  writeClipboard(token: string): Promise<void>; scheduleClear(clear: () => void): void;
  refreshBalance(): unknown; notify(text: string, tone: 'success'): void;
}
function sats(value: unknown, zero = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (zero ? 0 : 1)) throw new Error('Invalid amount');
  return value;
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object') throw new Error('Invalid response'); return value as Record<string, unknown>; }
const sameDraft = (a: WalletWithdrawDraft, b: WalletWithdrawDraft) => a.destination === b.destination && a.amount === b.amount;
export function createWalletWithdrawController(deps: WithdrawDependencies) {
  let busy = false; let copying = false; let readRevision = 0; let loadingView: WalletWithdrawView | null = null;
  const current = (view: WalletWithdrawView) => deps.isActive() && view.isCurrent() && deps.view() === view;
  const status = (view: WalletWithdrawView, text: string, tone: 'secondary' | 'danger' | 'success' = 'secondary') => { if (current(view)) view.setState({ ...view.getState(), status: { text, tone } }); };
  async function original(view: WalletWithdrawView): Promise<string | null> {
    const mint = await deps.mint(); if (!current(view)) return null;
    if (mint !== view.getState().mint) { view.clearPrivateFields(); view.setState({ ...view.getState(), phase: 'form' }); status(view, 'Wallet mint changed. Reopen withdrawal for the selected mint.', 'danger'); return null; }
    return mint;
  }
  async function load(view: WalletWithdrawView): Promise<void> {
    const revision = ++readRevision; loadingView = view;
    try {
      const mint = await deps.mint(); if (!current(view) || revision !== readRevision) return;
      const balance = sats(await deps.balance(), true);
      if (!current(view) || revision !== readRevision) return;
      if (mint !== await deps.mint()) { status(view, 'Wallet mint changed. Reopen withdrawal to reload its balance.', 'danger'); return; }
      if (current(view) && revision === readRevision) view.setState({ ...view.getState(), mint, balance, status: { text: '', tone: 'secondary' } });
    } catch { status(view, 'Wallet balance unavailable. Reopen withdrawal to retry.', 'danger'); }
    finally { if (revision === readRevision) { if (loadingView === view) loadingView = null; if (current(view)) view.setState({ ...view.getState(), pending: busy }); } }
  }
  async function mode(mode: 'lightning' | 'token'): Promise<void> {
    const view = deps.view(); if (!view || !current(view) || busy) return;
    view.clearPrivateFields(); view.setState({ ...view.getState(), mode, phase: 'form', pending: true, copied: false, recovery: false, amount: 0, fee: 0 });
    await load(view);
  }
  async function maximum(): Promise<void> {
    const view = deps.view(); if (!view || !current(view) || view.getState().pending || busy) return;
    const revision = ++readRevision; const draft = view.readDraft();
    view.setState({ ...view.getState(), pending: true });
    try {
      const mint = await original(view); if (!mint) return;
      const amount = sats(await deps.maximum(mint), true);
      if (!current(view) || revision !== readRevision || !sameDraft(draft, view.readDraft())) return;
      if (mint !== await deps.mint() || !current(view) || revision !== readRevision || !sameDraft(draft, view.readDraft())) return;
      view.setAmount(amount); status(view, 'Estimated maximum; routing fees depend on the invoice.');
    } catch { status(view, 'Maximum amount unavailable. Enter an amount manually.', 'danger'); }
    finally { if (current(view) && revision === readRevision) view.setState({ ...view.getState(), pending: busy }); }
  }
  async function operation(task: (view: WalletWithdrawView) => Promise<void>): Promise<void> {
    const view = deps.view(); if (!view || !current(view) || busy || view.getState().pending) return;
    busy = true; ++readRevision; view.setState({ ...view.getState(), pending: true });
    try { await task(view); }
    catch { status(view, 'Withdrawal unavailable or awaiting confirmation. Funds and recovery records are preserved. Check outgoing recovery before retrying.', 'danger'); }
    finally { busy = false; const latest = deps.view(); if (latest && current(latest)) latest.setState({ ...latest.getState(), pending: loadingView === latest }); }
  }
  function paid(view: WalletWithdrawView, result: unknown, requested?: number): void {
    const reply = record(result);
    if (reply.paid !== true) throw new Error('Payment not confirmed');
    const address = requested === undefined ? null : {requested, sent: sats(reply.amount)};
    if (address && address.sent > address.requested) throw new Error('Invalid paid amount');
    deps.refreshBalance(); deps.notify('Withdrawal complete', 'success');
    if (current(view)) {
      const text = address === null ? '✓ Withdrawn! Lightning payment sent.'
        : `✓ Sent ${address.sent.toLocaleString()} sats${address.sent < address.requested ? ` (requested ${address.requested.toLocaleString()} sats)` : ''}. Lightning payment sent.`;
      view.clearPrivateFields(); view.setState({ ...view.getState(), phase: 'paid', ...(address === null ? {} : {amount: address.sent}), status: { text, tone: 'success' } });
    }
  }

  async function quote(): Promise<void> {
    await operation(async view => {
      const draft = view.readDraft(); const destination = draft.destination.trim();
      if (!destination) { status(view, 'Enter a Lightning invoice or address', 'danger'); return; }
      const address = destination.includes('@') && !/^ln(bc|tb|bcrt)/i.test(destination);
      if (!address && !/^ln(bc|tb|bcrt)/i.test(destination)) { status(view, 'Enter a Lightning invoice (lnbc…) or address (user@domain)', 'danger'); return; }
      let amount = 0;
      if (address) { if (!/^\d+$/.test(draft.amount) || !Number.isSafeInteger(Number(draft.amount)) || Number(draft.amount) < 1) { status(view, 'Enter a whole amount in sats', 'danger'); return; } amount = Number(draft.amount); }
      const mint = await original(view); if (!mint || !sameDraft(draft, view.readDraft())) return;
      status(view, address ? 'Withdrawing to Lightning address…' : 'Checking fee…');
      if (address) { paid(view, await deps.address(destination, amount, mint), amount); return; }
      const reply = record(await deps.quote(destination, mint)); const quoteAmount = sats(reply.amount); const fee = sats(reply.fee_reserve, true);
      if (typeof reply.quote !== 'string' || !reply.quote || !Number.isSafeInteger(quoteAmount + fee)) throw new Error('Invalid quote');
      if (!current(view) || !sameDraft(draft, view.readDraft()) || mint !== await original(view) || !sameDraft(draft, view.readDraft())) return;
      view.clearPrivateFields(); view.showQuote({ id: reply.quote, mint }); view.setState({ ...view.getState(), phase: 'quote', amount: quoteAmount, fee, status: { text: '', tone: 'secondary' } });
    });
  }
  async function execute(quoteId?: string): Promise<void> {
    await operation(async view => {
      const quote = view.readQuote(); if (!quote || view.getState().phase !== 'quote' || (quoteId !== undefined && quoteId !== quote.id)) return;
      const mint = await original(view); if (!mint || mint !== quote.mint || view.readQuote() !== quote) return;
      status(view, 'Withdrawing…'); paid(view, await deps.execute(quote.id, mint));
    });
  }
  async function send(requested?: number): Promise<void> {
    await operation(async view => {
      if (view.getState().mode !== 'token' || view.getState().phase !== 'form') return;
      const draft = view.readDraft(); const amount = requested ?? (/^\d+$/.test(draft.amount) ? Number(draft.amount) : NaN);
      if (!Number.isSafeInteger(amount) || amount < 1) { status(view, 'Enter a valid whole amount', 'danger'); return; }
      const mint = await original(view); if (!mint || !sameDraft(draft, view.readDraft())) return;
      status(view, 'Creating token…');
      const reply = record(await deps.send(amount, mint)); const sent = sats(reply.amount); const remaining = sats(reply.remaining, true);
      if (typeof reply.token !== 'string' || !reply.token) throw new Error('Invalid token');
      deps.refreshBalance(); deps.notify('⚡ ' + sent.toLocaleString() + ' sats token ready', 'success');
      if (!current(view)) return;
      view.clearPrivateFields(); view.showToken(reply.token); view.setState({ ...view.getState(), phase: 'token', balance: remaining, amount: sent, copied: false, recovery: false, status: { text: '', tone: 'secondary' } });
    });
  }
  async function copy(): Promise<void> {
    const view = deps.view(); const token = view?.readToken(); if (!view || !current(view) || !token || copying || busy) return;
    copying = true;
    try { await deps.writeClipboard(token); deps.scheduleClear(() => { void deps.writeClipboard('').catch(() => {}); }); if (current(view) && view.readToken() === token) view.setState({ ...view.getState(), copied: true, status: { text: 'Token copied (clears in 60s)', tone: 'success' } }); }
    catch { status(view, 'Clipboard copy failed. Select the token text to copy it manually.', 'danger'); }
    finally { copying = false; }
  }
  async function recover(): Promise<void> {
    await operation(async view => {
      status(view, 'Checking outgoing recovery…'); const token = await deps.recover();
      if (!current(view)) return;
      if (!token) { status(view, 'No reclaimable token is available yet. Pending payments remain recorded; retry after the mint confirms their state.'); return; }
      if (typeof token !== 'string') throw new Error('Invalid recovery token');
      const mint = await deps.tokenMint(token); if (!current(view)) return; if (typeof mint !== 'string' || !mint) throw new Error('Invalid token mint');
      view.clearPrivateFields(); view.showToken(token); view.setState({ ...view.getState(), mode: 'token', phase: 'token', mint, amount: 0, copied: false, recovery: true }); status(view, 'Recovery token ready. Keep it until delivered or recovered.');
    });
  }
  async function reclaim(): Promise<void> {
    await operation(async view => {
      const token = view.readToken(); if (!token || view.getState().phase !== 'token') return;
      status(view, 'Recovering token to wallet…'); const reply = record(await deps.receive(token)); sats(reply.received, true); const balance = sats(reply.balance, true);
      await deps.clearRecovery(); deps.refreshBalance(); deps.notify('Outgoing token recovered to wallet', 'success');
      if (current(view)) { view.clearPrivateFields(); view.setState({ ...view.getState(), phase: 'paid', balance }); status(view, 'Outgoing token recovered to wallet.', 'success'); }
    });
  }
  return { load, mode, maximum, quote, execute, send, copy, recover, reclaim };
}
