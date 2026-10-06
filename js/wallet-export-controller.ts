import type { WalletExportView } from './wallet-export-contract.js';
interface ExportDependencies {
  view(): WalletExportView | null; isActive(): boolean; mint(): Promise<string>;
  export(mint: string): Promise<unknown>; writeClipboard(token: string): Promise<void>;
  scheduleClear(clear: () => void): void; notify(text: string, tone: 'success' | 'info'): void;
}
export function createWalletExportController(deps: ExportDependencies) {
  let preparing = false; let copying = false;
  const current = (view: WalletExportView) => deps.isActive() && view.isCurrent() && deps.view() === view;
  const message = (view: WalletExportView, text: string) => { if (current(view)) view.setState({ ...view.getState(), pending: false, status: { text, tone: 'danger' } }); };
  async function copy(): Promise<void> {
    const view = deps.view(); const token = view?.readToken();
    if (!view || !token || !current(view) || copying || view.getState().pending) return;
    copying = true;
    try {
      const mint = await deps.mint(); if (!current(view)) return;
      if (mint !== view.getState().mint) { view.clearPrivateFields(); view.setState({ ...view.getState(), phase: 'error', copied: false }); message(view, 'Wallet mint changed. Refresh export to copy the selected mint’s funds.'); return; }
      await deps.writeClipboard(token);
      deps.scheduleClear(() => { void deps.writeClipboard('').catch(() => {}); });
      if (current(view) && view.readToken() === token) view.setState({ ...view.getState(), copied: true, status: { text: 'Wallet backup copied to clipboard (clears in 60s)', tone: 'success' } });
      deps.notify('Wallet backup copied to clipboard (clears in 60s)', 'success');
    } catch { message(view, 'Clipboard copy failed. Open Token text to select and copy it manually.'); }
    finally { copying = false; }
  }
  async function prepare(view: WalletExportView): Promise<void> {
    if (!current(view)) return;
    if (preparing) { view.setState({ ...view.getState(), phase: 'error' }); message(view, 'A wallet export is already in progress. Refresh export when it finishes.'); return; }
    preparing = true; view.clearPrivateFields(); view.setState({ ...view.getState(), phase: 'loading', pending: true, copied: false, status: { text: 'Preparing wallet export…', tone: 'secondary' } });
    try {
      const mint = await deps.mint(); if (!current(view)) return;
      view.setState({ ...view.getState(), mint });
      const token = await deps.export(mint); if (!current(view)) return;
      if (mint !== await deps.mint() || !current(view)) { if (current(view)) { view.setState({ ...view.getState(), phase: 'error' }); message(view, 'Wallet mint changed. Refresh export to use the selected mint.'); } return; }
      if (token == null || token === '') { view.setState({ ...view.getState(), phase: 'empty', pending: false, status: { text: 'Wallet is empty', tone: 'secondary' } }); deps.notify('Wallet is empty', 'info'); return; }
      if (typeof token !== 'string') throw new Error('Invalid export response');
      view.showToken(token); view.setState({ ...view.getState(), phase: 'ready', pending: false, status: { text: '', tone: 'secondary' } });
      await copy();
    } catch { if (current(view)) { view.setState({ ...view.getState(), phase: 'error' }); message(view, 'Wallet export unavailable. Funds and recovery records are preserved. Refresh export to try again.'); } }
    finally { preparing = false; if (current(view)) view.setState({ ...view.getState(), pending: false }); }
  }
  return { prepare, copy };
}
