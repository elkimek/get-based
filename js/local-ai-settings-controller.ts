import type { LocalAiSettingsView } from './local-ai-settings-contract.js';
import type { LocalAiModel, LocalAiDiscoveryError } from './local-ai-provider-shared.js';
export interface LocalAiDiscoveryView {
  available: boolean; models: unknown[]; modelDetails?: LocalAiModel[]; provider?: string; baseUrl?: string;
  error?: LocalAiDiscoveryError | null; openai?: { error?: LocalAiDiscoveryError | null };
}
export interface LocalAiConnectionConfig extends Record<string, unknown> { url: string; model: string; mode: string; apiKey: string }
export interface LocalAiConnectionServices {
  config(): LocalAiConnectionConfig; selectedModel(): string; context(): string;
  normalize(url: string): { url?: string; error?: string };
  mixedContent(url: string): boolean; sharesMachine(previous: string, next: string): boolean;
  preflight(url: string, key: string): Promise<string | null>;
  discover(url: string, key: string): Promise<LocalAiDiscoveryView>;
  release(config: LocalAiConnectionConfig, previous: LocalAiDiscoveryView, next: LocalAiDiscoveryView, view: LocalAiSettingsView, isCurrent: () => boolean): Promise<boolean>;
  activate(url: string, model: string): Promise<boolean>;
  persist(config: LocalAiConnectionConfig, selectedModel: string): Promise<unknown>;
  present(view: LocalAiSettingsView, result: LocalAiDiscoveryView): Promise<unknown>;
  errorText(result: LocalAiDiscoveryView): string;
  committed(): void;
}
export function sameLocalAiConnection(a: LocalAiConnectionConfig, b: LocalAiConnectionConfig): boolean {
  return a.url === b.url && a.apiKey === b.apiKey && a.model === b.model && a.mode === b.mode;
}
/** One accepted connection update may finish persistence after Settings closes. */
export function createLocalAiConnectionController() {
  let pending = false;
  let pendingView: LocalAiSettingsView | null = null;
  async function test(view: LocalAiSettingsView | null, services: LocalAiConnectionServices): Promise<void> {
    if (!view?.isCurrent()) return;
    if (pending) {
      if (view !== pendingView) view.setStatus('testing', 'An earlier connection update is finishing. Retry shortly.');
      return;
    }
    const draft = view.readConnection();
    const normalized = services.normalize(draft.url);
    if (normalized.error || !normalized.url) { view.setStatus('disconnected', normalized.error || 'Enter a valid Local AI URL'); return; }
    const url = normalized.url, apiKey = draft.apiKey.trim();
    if (services.mixedContent(url)) {
      view.setStatus('disconnected', 'Browser mixed-content rules block an HTTP LAN server from an HTTPS page. Use HTTPS for the server, localhost, or an encrypted local tunnel.');
      return;
    }
    const config = { ...services.config() }, selected = services.selectedModel(), context = services.context();
    const ownsView = () => view.isCurrent() && services.context() === context;
    const ownsDraft = () => { const next = view.readConnection(); return next.url === draft.url && next.apiKey === draft.apiKey; };
    const current = () => ownsView() && ownsDraft() && sameLocalAiConnection(config, services.config()) && selected === services.selectedModel();
    const previousUrl = services.normalize(config.url).url || config.url;
    pending = true; pendingView = view;
    let status: 'testing' | 'connected' | 'disconnected' = 'testing';
    let text = 'Testing...';
    view.setStatus(status, text, true);
    // Observe failures immediately even when a later preflight exits early.
    const previousDiscovery = previousUrl !== url && services.sharesMachine(previousUrl, url)
      ? services.discover(previousUrl, config.apiKey).catch(() => null) : Promise.resolve(null);
    try {
      const help = await services.preflight(url, apiKey);
      if (!current()) { text = 'Connection settings changed. Review them before retrying.'; return; }
      if (help) { status = 'disconnected'; text = help; return; }
      const result = await services.discover(url, apiKey);
      if (!current()) { text = 'Connection settings changed. Review them before retrying.'; return; }
      const models = result.models.filter((model): model is string => typeof model === 'string' && !!model);
      if (!result.available || !models.length) {
        await services.present(view, result);
        status = 'disconnected'; text = result.available ? 'Connected but no text-generation models were found.' : services.errorText(result);
        return;
      }
      const previous = await previousDiscovery;
      if (!current()) { text = 'Connection settings changed. Review them before retrying.'; return; }
      if (previous && !await services.release(config, previous, result, view, current)) {
        status = 'disconnected'; text = view.getStatus().text;
        return;
      }
      if (!current()) { text = 'Connection settings changed. Review them before retrying.'; return; }
      const model = models.includes(selected) ? selected : models[0]!;
      if (!await services.activate(url, model)) { status = 'connected'; text = 'Connection verified — AI not activated'; return; }
      if (!current()) { text = 'Connection settings changed. Review them before retrying.'; return; }
      const accepted = { ...config, url, model, mode: result.provider || 'openai-compatible', apiKey };
      await services.persist(accepted, model);
      const committed = () => ownsView() && sameLocalAiConnection(accepted, services.config()) && services.selectedModel() === model;
      if (!committed()) return;
      await services.present(view, result);
      if (!committed()) return;
      status = 'connected'; text = 'Connection verified'; services.committed();
      // Presentation includes the provider/model/location details.
      text = view.getStatus().text;
    } catch {
      status = 'disconnected'; text = 'Not connected — check URL and ensure your server is running';
    } finally {
      pending = false; pendingView = null;
      if (ownsView()) {
        if (text) view.setStatus(status, text);
        else view.setStatus(status, view.getStatus().text);
      }
    }
  }
  return { test, isPending: () => pending };
}
