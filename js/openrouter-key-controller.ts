import type { OpenRouterSettingsSnapshot, OpenRouterSettingsView } from './openrouter-settings-contract.js';
import { createProviderKeyController, type ProviderKeyServices } from './provider-key-controller.js';

export interface OpenRouterKeyServices extends ProviderKeyServices<OpenRouterSettingsSnapshot> {
  clearOAuth(): void;
}
const controller = createProviderKeyController<OpenRouterSettingsSnapshot>('openrouter');
export function isOpenRouterKeySavePending(): boolean { return controller.isPending(); }
export function saveOpenRouterSettingsKey(view: OpenRouterSettingsView | null, services: OpenRouterKeyServices): Promise<void> {
  return controller.save(view, { ...services, beforeLoad: () => services.clearOAuth() });
}
