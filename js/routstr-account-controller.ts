import type { RoutstrSettingsView } from './routstr-settings-contract.js';
import { getErrorMessage } from './caught-error.js';
export interface RoutstrAccountServices {
  view(): RoutstrSettingsView | null; provider(): string; backend(): string; node(): string; key(node: string): string;
  validate(value: string): Promise<{ valid: boolean; error?: string; warning?: string | undefined }>;
  activate(): Promise<boolean>;
  save(value: string, node: string, expectedKey: string): Promise<unknown>;
  redeem(token: string, node: string, expectedKey: string): Promise<{ api_key?: unknown }>;
  models(current: () => boolean): Promise<unknown>;
  connected(warning?: string): void; removed(): void;
  writeClipboard(value: string): Promise<void>; scheduleClear(clear: () => void): void;
}
/** Presentation owns drafts and receipts; accepted writes stay in existing locked domain services. */
export function createRoutstrAccountController(services: RoutstrAccountServices) {
  let pending = false;
  function capture() {
    const view = services.view(), node = services.node();
    if (!view || !node || services.provider() !== 'routstr' || services.backend() !== 'direct') return null;
    const account = view.readAccount(); let expectedKey = services.key(node);
    if (!account || account.node !== node || account.key !== expectedKey) return null;
    const current = () => view.isCurrent() && services.view() === view && services.provider() === 'routstr' && services.backend() === 'direct' && services.node() === node && services.key(node) === expectedKey;
    return { view, node, current, expected: () => expectedKey, accept: (key: string) => { expectedKey = key; } };
  }
  async function save(): Promise<void> {
    const owner = capture(); if (!owner || pending) return;
    const { view, node, current } = owner, draft = view.readCredential();
    let value = draft.trim(); if (value.startsWith('cashu:')) value = value.slice(6);
    const sameDraft = () => current() && view.readCredential() === draft;
    const status = (text: string, tone: 'secondary' | 'success' | 'danger' = 'secondary') => { if (current()) view.setConnection({ ...view.getConnection(), pending: true, text, tone }); };
    if (!value) { view.setConnection({ ...view.getConnection(), pending: false, text: 'Please enter a key or Cashu token', tone: 'danger' }); return; }
    pending = true; status('Validating…');
    try {
      const result = await services.validate(value); if (!sameDraft()) return;
      if (!result.valid) { status(result.error || 'Invalid key or token', 'danger'); return; }
      status('Key format accepted — waiting for activation…');
      const activated = await services.activate(); if (!sameDraft()) return;
      if (!activated) { status('Key format accepted — AI not activated'); return; }
      const token = value.startsWith('cashu'); let key = value;
      if (token) {
        status('Converting token to session key…');
        const result = await services.redeem(value, node, owner.expected());
        if (typeof result.api_key !== 'string' || !/^sk-[A-Za-z0-9_-]+$/.test(result.api_key)) throw new Error('Node did not return a valid account key. Check deposit recovery before retrying.');
        key = result.api_key;
      } else await services.save(key, node, owner.expected());
      owner.accept(key); if (!current()) return;
      view.setAccount({ node, key }); view.setCredential('');
      // Reveal the durably stored session before catalog work can fail or wait.
      if (token) view.showReceipt({ node, key });
      status('Connected — loading models…', 'success');
      await services.models(current); if (!current()) return;
      status('✓ Connected', 'success'); if (!token) services.connected(result.warning);
    } catch (error) { status(getErrorMessage(error, 'Could not connect. Your key or token and existing recovery records are retained.'), 'danger'); }
    finally {
      pending = false;
      if (current()) view.setConnection({ ...view.getConnection(), pending: false });
      else if (view.isCurrent() && services.view() === view) view.setConnection({ ...view.getConnection(), pending: false, text: 'Node or account settings changed. Review them before retrying.', tone: 'secondary' });
    }
  }
  async function remove(): Promise<void> {
    const owner = capture(); if (!owner || pending || !owner.expected()) return;
    pending = true; const { view, current, node } = owner;
    view.setConnection({ ...view.getConnection(), pending: true, text: 'Removing session key…', tone: 'secondary' });
    try {
      await services.save('', node, owner.expected()); owner.accept('');
      if (!current()) return;
      view.setCredential(''); view.hideReceipt(); view.setAccount({ node, key: '' });
      view.setConnection({ ...view.getConnection(), pending: false, text: 'Session key removed from this device', tone: 'secondary' });
      services.removed();
    } catch { if (current()) view.setConnection({ ...view.getConnection(), text: 'Could not remove the Routstr key. Try again.', tone: 'danger' }); }
    finally { pending = false; if (view.isCurrent() && services.view() === view) view.setConnection({ ...view.getConnection(), pending: false }); }
  }
  async function copy(): Promise<void> {
    const owner = capture(), receipt = owner?.view.readReceipt(); if (!owner || !receipt || receipt.node !== owner.node || receipt.key !== owner.expected()) return;
    try {
      await services.writeClipboard(receipt.key);
      services.scheduleClear(() => { void services.writeClipboard('').catch(() => {}); });
      if (owner.current() && owner.view.readReceipt()?.key === receipt.key) owner.view.setConnection({ ...owner.view.getConnection(), copied: true });
    } catch { if (owner.current()) owner.view.setConnection({ ...owner.view.getConnection(), text: 'Clipboard copy failed. Select and copy the session key manually.', tone: 'danger' }); }
  }
  function acknowledge(): void {
    const owner = capture(), receipt = owner?.view.readReceipt();
    if (owner?.current() && receipt?.node === owner.node && receipt.key === owner.expected()) { owner.view.hideReceipt(); owner.view.setConnection({ ...owner.view.getConnection(), text: '✓ Connected', tone: 'success' }); }
  }
  return { save, remove, copy, acknowledge, isPending: () => pending };
}
