import type { WalletSeedView } from './wallet-seed-contract.js';
interface WalletSeedDependencies {
  view(): WalletSeedView | null; isActive(): boolean;
  hasSeed(): Promise<unknown>; generate(): Promise<unknown>; mnemonic(): Promise<unknown>; restore(words: string): Promise<unknown>;
  refresh(): unknown; notify(text: string, tone: 'success' | 'error'): void;
  writeClipboard(text: string): Promise<void>; scheduleClear(clear: () => void): void;
  close(view: WalletSeedView): void;
}
const normalize = (words: string) => words.trim().toLowerCase().split(/\s+/).join(' ');
const validWords = (value: unknown): value is string => typeof value === 'string' && /^[a-z]+(?: [a-z]+){11}$/.test(normalize(value));
function restoreError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  // Never echo provider exceptions, which may contain private words or requests.
  if (/Cannot replace the wallet seed/.test(message)) return 'Cannot replace the wallet seed while funds or recovery records exist. Back up and empty this wallet first.';
  if (/Invalid mnemonic/.test(message)) return 'Invalid mnemonic — check your words.';
  if (/restore was incomplete/.test(message)) return 'Wallet restore was incomplete and made no proof changes. Retry when the mint is available.';
  return 'Wallet restore could not be confirmed. Local funds and recovery records are retained; check the selected mint and retry.';
}
export function createWalletSeedController(deps: WalletSeedDependencies) {
  let generating: Promise<unknown> | null = null;
  let restoring = false;
  let continuation: { view: WalletSeedView; after(): unknown } | null = null;
  const current = (view: WalletSeedView) => deps.isActive() && view.isCurrent() && deps.view() === view;
  const message = (view: WalletSeedView, text: string, tone: 'secondary' | 'danger' | 'success' = 'secondary') => {
    if (current(view)) view.setState({ ...view.getState(), pending: false, status: { text, tone } });
  };
  async function load(view: WalletSeedView): Promise<void> {
    try {
      const words = await deps.mnemonic();
      if (!current(view)) return;
      if (words && !validWords(words)) throw new Error('Invalid stored wallet seed');
      view.setMnemonic(validWords(words) ? normalize(words) : '');
      view.setState({ mode: words ? 'manage' : 'missing', pending: false, status: { text: '', tone: 'secondary' } });
    } catch { message(view, 'Local wallet setup unavailable. Close this panel and try again.', 'danger'); }
  }
  async function ensure(view: WalletSeedView, after: () => unknown): Promise<boolean> {
    try {
      const ready = await deps.hasSeed();
      if (!current(view)) return false;
      if (ready === true) {
        deps.close(view);
        try { await after(); } catch { deps.notify('Wallet setup completed, but the next action could not start. Open it again to continue.', 'error'); }
        return true;
      }
      if (!generating) generating = deps.generate();
      const operation = generating;
      let result: unknown;
      try { result = await operation; } finally { if (generating === operation) generating = null; }
      if (!current(view)) return false;
      const words = (result as { mnemonic?: unknown } | null)?.mnemonic;
      if (!validWords(words)) throw new Error('Invalid generated wallet seed');
      view.setMnemonic(normalize(words));
      view.setState({ mode: 'onboarding', pending: false, status: { text: '', tone: 'secondary' } });
      continuation = { view, after };
      return false;
    } catch { message(view, 'Could not prepare this device’s wallet seed. Close this panel and try again.', 'danger'); return false; }
  }
  async function acknowledge(): Promise<void> {
    const next = continuation;
    if (!next || !current(next.view) || !next.view.isAcknowledged() || next.view.getState().pending || next.view.getState().mode !== 'onboarding') return;
    continuation = null;
    deps.close(next.view); deps.refresh();
    try { await next.after(); } catch { deps.notify('Wallet setup completed, but the next action could not start. Open it again to continue.', 'error'); }
  }
  async function restore(): Promise<void> {
    const view = deps.view(); if (!view || !current(view) || view.getState().pending) return;
    if (restoring) { message(view, 'A wallet restore is already in progress. Wait for it to finish before retrying.', 'danger'); return; }
    const words = normalize(view.readRestore());
    if (words.split(' ').length !== 12) { message(view, 'Enter exactly 12 words', 'danger'); return; }
    if (!validWords(words)) { message(view, 'Invalid mnemonic — check your words.', 'danger'); return; }
    restoring = true;
    view.setState({ ...view.getState(), pending: true, status: { text: 'Restoring from mint… (this may take a moment)', tone: 'secondary' } });
    try {
      // Once accepted, the locked service preserves its proof and recovery journals
      // even when the initiating panel closes. Only its owner receives private UI.
      const result = await deps.restore(words) as { balance?: unknown } | null;
      if (!result || typeof result.balance !== 'number' || !Number.isSafeInteger(result.balance) || result.balance < 0) throw new Error('Invalid restore receipt');
      if (current(view)) {
        view.clearRestore(); view.setMnemonic(words);
        view.setState({ mode: 'manage', pending: false, status: { text: '✓ Restored! Balance: ⚡ ' + result.balance.toLocaleString() + ' sats', tone: 'success' } });
      }
      deps.notify('Wallet restored', 'success'); deps.refresh();
    } catch (error) { message(view, restoreError(error), 'danger'); }
    finally { restoring = false; if (current(view)) view.setState({ ...view.getState(), pending: false }); }
  }
  async function copy(): Promise<void> {
    const view = deps.view(); if (!view || !current(view) || view.getState().pending) return;
    const words = view.readMnemonic(); if (!words) return;
    try {
      await deps.writeClipboard(words);
      // The clear survives panel disposal; replacement only suppresses feedback.
      deps.scheduleClear(() => { void deps.writeClipboard('').catch(() => {}); });
      if (current(view) && view.readMnemonic() === words) view.setCopied();
    } catch { message(view, 'Clipboard copy failed. Reveal the seed phrase to select and copy it manually.', 'danger'); }
  }
  function reset(): void { continuation = null; }
  return { load, ensure, acknowledge, restore, copy, reset };
}
