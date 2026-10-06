import { isValidExternalUrl } from './url-safety.js';
import type { WalletMintEntry, WalletMintView } from './wallet-mint-contract.js';
interface MintDependencies {
  view(): WalletMintView | null; isActive(): boolean; node(): string;
  mint(): Promise<string>; inventory(): Promise<unknown>; accepted(node: string): Promise<string[]>;
  checkMint(mint: string): Promise<'valid' | 'invalid' | 'unreachable'>; select(mint: string, expectedMint: string): Promise<unknown>;
  captureSelection(): (mint: string) => Promise<void>;
  close(view: WalletMintView): void; notify(text: string, tone: 'success' | 'info'): void;
}
const normalize = (value: string) => value.trim().replace(/\/+$/, '');
function entries(value: unknown): WalletMintEntry[] {
  if (!Array.isArray(value)) throw new Error('Invalid mint inventory');
  const rows = new Map<string, WalletMintEntry>();
  for (const raw of value as unknown[]) {
    const entry = raw as { mint?: unknown; balance?: unknown } | null;
    if (!entry || typeof entry.mint !== 'string' || !entry.mint.trim()) throw new Error('Invalid saved mint');
    const mint = normalize(entry.mint);
    rows.set(mint, { mint, balance: typeof entry.balance === 'number' && Number.isSafeInteger(entry.balance) && entry.balance >= 0 ? entry.balance : null });
  }
  return [...rows.values()];
}
function selectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/Wallet mint changed before selection/.test(message)) return 'Wallet mint changed. Reload balances before selecting another mint.';
  if (/Unable to verify the pending withdrawal/.test(message)) return 'Unable to verify the pending withdrawal at its original mint. Retry when the mint is reachable. Existing balances are preserved.';
  if (/Finish the pending wallet operation/.test(message)) return 'Finish or recover the pending wallet operation before selecting another mint. Existing balances are preserved.';
  if (/pending invoice needs recovery/.test(message)) return 'A pending invoice needs recovery before selecting another mint.';
  return 'Mint selection could not be confirmed. Existing balances and recovery records are preserved; reload balances before retrying.';
}
export function createWalletMintController(deps: MintDependencies) {
  let saving = false; let reading = 0;
  const current = (view: WalletMintView) => deps.isActive() && view.isCurrent() && deps.view() === view;
  const message = (view: WalletMintView, text: string, tone: 'danger' | 'warning' = 'danger') => { if (current(view)) view.setState({ ...view.getState(), loading: false, pending: false, status: { text, tone } }); };
  async function load(view: WalletMintView): Promise<void> {
    const request = ++reading, node = deps.node();
    const owns = () => current(view) && request === reading;
    view.setState({ ...view.getState(), loading: true, status: { text: '', tone: 'secondary' } });
    try {
      const saved = entries(await deps.inventory()); if (!owns()) return;
      const mint = normalize(await deps.mint()); if (!owns()) return;
      if (!isValidExternalUrl(mint)) throw new Error('Invalid current mint');
      if (!view.getState().mint && !view.readDraft()) view.setDraft(mint);
      view.setState({ ...view.getState(), mint, saved, accepted: [], loading: false, hints: node ? 'loading' : 'none' });
      // Local balances and selection are available before optional node discovery.
      if (!node) return;
      let accepted: string[] = [], hints: 'ready' | 'unavailable' = 'ready';
      try { accepted = await deps.accepted(node); } catch { hints = 'unavailable'; }
      if (owns()) view.setState({ ...view.getState(), accepted: deps.node() === node ? accepted : [], hints: deps.node() === node ? hints : 'unavailable' });
    } catch { if (owns()) message(view, 'Saved balances unavailable. Reload balances or reopen this panel.'); }
  }
  async function save(): Promise<void> {
    const view = deps.view(); if (!view || !current(view) || view.getState().loading || view.getState().pending) return;
    if (saving) { message(view, 'A mint selection is already in progress. Reload balances when it finishes.', 'warning'); return; }
    const mint = normalize(view.readDraft()), original = view.getState().mint;
    if (!mint || !isValidExternalUrl(mint)) { message(view, 'Enter a valid public mint URL (https://...)'); return; }
    const finish = deps.captureSelection(); saving = true;
    view.setState({ ...view.getState(), pending: true, status: { text: 'Checking mint…', tone: 'secondary' } });
    const ownsDraft = () => current(view) && normalize(view.readDraft()) === mint;
    try {
      const saved = entries(await deps.inventory()); if (!ownsDraft()) return;
      if (!saved.some(entry => entry.mint === mint)) {
        const result = await deps.checkMint(mint); if (!ownsDraft()) return;
        if (result !== 'valid') { message(view, result === 'invalid' ? 'Not a valid Cashu mint' : 'Mint not reachable. Try again when it is available.'); return; }
      }
      const selected = normalize(await deps.mint()); if (!ownsDraft()) return;
      if (selected !== original) { message(view, 'Wallet mint changed. Reload balances before selecting another mint.', 'warning'); return; }
      // The locked domain keeps balances and recovery journals. Once accepted,
      // finishing is independent of whether the initiating picker remains open.
      await deps.select(mint, original);
      const active = deps.view(); if (active && current(active)) active.setState({ ...active.getState(), mint });
      if (current(view)) deps.close(view);
      try { await finish(mint); } catch { deps.notify('Mint selected. Wallet refresh is unavailable; saved recovery records are retained.', 'info'); }
      deps.notify('Mint selected: ' + mint.replace(/^https?:\/\//, ''), 'success');
    } catch (error) { message(view, selectionError(error)); }
    finally { saving = false; if (current(view)) view.setState({ ...view.getState(), pending: false }); }
  }
  return { load, save };
}
