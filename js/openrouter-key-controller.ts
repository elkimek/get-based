import type { OpenRouterSettingsSnapshot, OpenRouterSettingsView } from './openrouter-settings-contract.js';

export interface OpenRouterKeyServices {
  currentProvider(): string;
  currentKey(): string;
  validate(key: string): Promise<{ valid: boolean; error?: string | undefined }>;
  activate(): Promise<unknown>;
  save(key: string): Promise<unknown>;
  loadModels(key: string): Promise<unknown>;
  snapshot(): OpenRouterSettingsSnapshot;
  clearOAuth(): void;
  committed(): void;
}
let pending = false;
let pendingView: OpenRouterSettingsView | null = null;
export function isOpenRouterKeySavePending(): boolean { return pending; }
export async function saveOpenRouterSettingsKey(view: OpenRouterSettingsView | null, services: OpenRouterKeyServices): Promise<void> {
  if (!view?.isCurrent()) return;
  if (pending && view === pendingView) return;
  if (pending) { view.setSaveState({ pending: false, text: 'An earlier key update is still finishing. Please retry shortly.', tone: 'secondary' }); return; }
  const key = view.readKey().trim();
  if (!key) { view.setSaveState({ pending: false, text: 'Please enter an API key', tone: 'danger' }); return; }
  let expectedKey = services.currentKey();
  const current = () => view.isCurrent() && services.currentProvider() === 'openrouter' && services.currentKey() === expectedKey;
  pending = true;
  pendingView = view;
  let message = 'Validating...';
  let tone: 'secondary' | 'success' | 'danger' = 'secondary';
  const status = () => view.setSaveState({ pending: true, text: message, tone });
  status();
  try {
    const result = await services.validate(key);
    if (!current()) return;
    if (!result.valid) { message = result.error || 'Connection could not be verified.'; tone = 'danger'; return; }
    message = 'Connection verified — waiting for activation…'; status();
    if (!await services.activate()) { message = 'Connection verified — AI not activated'; return; }
    if (!current()) return;
    await services.save(key);
    expectedKey = key;
    // The accepted durable write can finish after close. Only its current view
    // and still-matching credential may continue with OAuth, model reads or UI.
    if (!view.isCurrent() || services.currentProvider() !== 'openrouter' || services.currentKey() !== key) return;
    services.clearOAuth();
    message = 'Connected — loading models…'; status();
    view.refresh(services.snapshot());
    await services.loadModels(key);
    if (!view.isCurrent() || services.currentProvider() !== 'openrouter' || services.currentKey() !== key) return;
    view.refresh(services.snapshot());
    message = '✓ Connected'; tone = 'success';
    services.committed();
  } catch {
    message = 'Could not finish this key update. Please retry.'; tone = 'danger';
  } finally {
    pending = false;
    pendingView = null;
    if (current()) view.setSaveState({ pending: false, text: message, tone });
    else if (view.isCurrent()) view.setSaveState({ pending: false, text: 'Key settings changed. Review them before retrying.', tone: 'secondary' });
  }
}
