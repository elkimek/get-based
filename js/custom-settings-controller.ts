import type { CustomSettingsSnapshot, CustomSettingsView } from './custom-settings-contract.js';
export interface CustomSettingsServices {
  provider(): string; url(): string; key(): string;
  validate(url: string, key: string): Promise<{ valid: boolean; error?: string | undefined }>;
  activate(url: string): Promise<unknown>;
  persist(url: string, key: string): Promise<unknown>;
  load(url: string, key: string, isCurrent: () => boolean): Promise<unknown>;
  snapshot(): CustomSettingsSnapshot; notify(text: string, tone: 'success' | 'info'): void;
}
export function createCustomSettingsController() {
  let pending = false;
  let pendingView: CustomSettingsView | null = null;
  function isPending(): boolean { return pending; }
  async function save(view: CustomSettingsView | null, services: CustomSettingsServices): Promise<void> {
    if (!view?.isCurrent() || services.provider() !== 'custom') return;
    if (pending) {
      if (view !== pendingView) view.setSaveState({ pending: false, text: 'An earlier connection update is finishing. Retry shortly.', tone: 'secondary' });
      return;
    }
    const candidate = view.readConnection();
    const url = candidate.url.trim().replace(/\/+$/, ''), key = candidate.key.trim();
    if (!url || !key) { view.setSaveState({ pending: false, text: !url ? 'Please enter a base URL' : 'Please enter an API key', tone: 'danger' }); return; }
    const previousUrl = services.url(), previousKey = services.key();
    const unchanged = () => view.isCurrent() && services.provider() === 'custom' && services.url() === previousUrl && services.key() === previousKey;
    const candidateUnchanged = () => { const next = view.readConnection(); return next.url.trim().replace(/\/+$/, '') === url && next.key.trim() === key; };
    pending = true; pendingView = view;
    let text = 'Validating...', tone: 'secondary' | 'success' | 'danger' = 'secondary';
    const status = () => view.setSaveState({ pending: true, text, tone }); status();
    try {
      const result = await services.validate(url, key);
      if (!unchanged() || !candidateUnchanged()) { text = 'Connection settings changed. Review them before retrying.'; return; }
      if (!result.valid) { text = (result.error || 'Connection could not be verified.').split(key).join('[redacted]'); tone = 'danger'; return; }
      text = 'Connection verified — waiting for activation…'; status();
      if (!await services.activate(url)) { text = 'Connection verified — AI not activated'; return; }
      if (!unchanged() || !candidateUnchanged()) { text = 'Connection settings changed. Review them before retrying.'; return; }
      await services.persist(url, key);
      const current = () => view.isCurrent() && services.provider() === 'custom' && services.url() === url && services.key() === key;
      if (!current()) return;
      text = 'Connected — loading models…'; status(); view.refresh(services.snapshot());
      await services.load(url, key, current);
      if (!current()) return;
      view.refresh(services.snapshot()); text = '✓ Connected'; tone = 'success'; services.notify('Connected', 'success');
    } catch { text = 'Could not finish this connection update. Please retry.'; tone = 'danger'; }
    finally {
      pending = false; pendingView = null;
      if (view.isCurrent() && services.provider() === 'custom') {
        const storedMatches = services.url() === url && services.key() === key || unchanged();
        view.setSaveState({ pending: false, text: storedMatches ? text : 'Connection settings changed. Review them before retrying.', tone: storedMatches ? tone : 'secondary' });
      }
    }
  }
  async function remove(view: CustomSettingsView | null, services: CustomSettingsServices): Promise<void> {
    if (!view?.isCurrent() || services.provider() !== 'custom' || pending) return;
    pending = true; pendingView = view; view.setSaveState({ pending: true, text: 'Removing connection…', tone: 'secondary' });
    try {
      await services.persist('', '');
      if (!view.isCurrent() || services.provider() !== 'custom' || services.url() || services.key()) return;
      view.clearPrivateFields(); view.refresh(services.snapshot()); view.setSaveState({ pending: false, text: 'Not connected', tone: 'secondary' });
    } catch { if (view.isCurrent()) view.setSaveState({ pending: false, text: 'Could not remove this connection. Please retry.', tone: 'danger' }); }
    finally { pending = false; pendingView = null; }
  }
  return { save, remove, isPending };
}
