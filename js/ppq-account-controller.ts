import type { PpqSettingsView, PpqSettingsSnapshot } from './ppq-settings-contract.js';
export interface PpqAccountServices {
  view(): PpqSettingsView | null;
  provider(): string;
  key(): string;
  creditId(): string;
  busy(): boolean;
  create(): Promise<{ success?: boolean; api_key: string; credit_id: string }>;
  saveKey(key: string): Promise<unknown>;
  saveCreditId(id: string): void;
  loadModels(key: string): Promise<unknown>;
  activate(): Promise<boolean>;
  snapshot(): PpqSettingsSnapshot;
}
export function createPpqAccountController(services: PpqAccountServices) {
  let pending = false;
  async function create(): Promise<void> {
    const view = services.view();
    if (!view || services.provider() !== 'ppq' || services.key() || pending || services.busy()) return;
    const initialKey = services.key(); const initialCreditId = services.creditId();
    let expectedKey = initialKey; let expectedCreditId = initialCreditId;
    const accountCurrent = () => services.key() === expectedKey && services.creditId() === expectedCreditId;
    const current = () => view.isCurrent() && services.view() === view && services.provider() === 'ppq' && accountCurrent();
    pending = true;
    view.setSaveState({ pending: true, text: 'Creating account…', tone: 'secondary' });
    let failed = false;
    let created = false;
    let persisted = false;
    try {
      const result = await services.create();
      if (typeof result.api_key !== 'string' || !result.api_key || typeof result.credit_id !== 'string' || !result.credit_id) throw new Error('Account creation failed');
      if (!accountCurrent()) return;
      created = true;
      // The account is anonymous: expose its only recovery details even if an
      // encrypted write fails. The private view port never serializes them.
      if (current()) view.showAccount({ apiKey: result.api_key, creditId: result.credit_id, activated: false });
      // Creation was explicitly requested. Preserve its accepted anonymous
      // account even after close, but do not overwrite another configured key.
      await services.saveKey(result.api_key); expectedKey = result.api_key;
      if (!accountCurrent()) return;
      services.saveCreditId(result.credit_id); expectedCreditId = result.credit_id;
      persisted = true;
      if (!current()) return;
      view.refresh(services.snapshot()); view.setStoredKey(result.api_key);
      // Reveal the durably stored account before model/consent work. A network
      // failure must never hide the account's only recovery credentials.
      view.showAccount({ apiKey: result.api_key, creditId: result.credit_id, activated: false });
      await services.loadModels(result.api_key);
      if (!current()) return;
      const activated = await services.activate();
      if (!current()) return;
      view.refresh(services.snapshot());
      view.showAccount({ apiKey: result.api_key, creditId: result.credit_id, activated });
    } catch {
      failed = true;
      if (current()) view.setSaveState({ pending: false, text: !created ? 'Could not create this account. Please retry.' : !persisted ? 'Could not save this account. Copy the displayed recovery details before closing.' : 'Could not finish account creation. Your stored account is retained.', tone: 'danger' });
    } finally {
      pending = false;
      if (current() && !failed) view.setSaveState({ pending: false, text: services.key() ? '✓ Connected' : 'No key set', tone: services.key() ? 'success' : 'secondary' });
      else if (!current() && view.isCurrent()) view.setSaveState({ pending: false, text: 'Account settings changed. Review them before retrying.', tone: 'secondary' });
    }
  }
  return { create, isPending: () => pending };
}
