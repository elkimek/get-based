// Public display state only; credentials are read from a private live field on submit.
import type { ProviderSettingsStatus as OpenRouterStatus, ProviderSettingsModels as OpenRouterModelState } from './provider-settings-contract.js';
export type { ProviderSettingsTone as OpenRouterTone, ProviderSettingsStatus as OpenRouterStatus, ProviderSettingsModels as OpenRouterModelState } from './provider-settings-contract.js';
export interface OpenRouterSettingsSnapshot {
  connected: boolean;
  models: OpenRouterModelState;
}
export interface OpenRouterSaveState extends OpenRouterStatus { pending: boolean }
export interface OpenRouterSettingsComponentView {
  refresh(snapshot: OpenRouterSettingsSnapshot): void;
  setModels(models: OpenRouterModelState): void;
  getModels(): OpenRouterModelState;
  setSaveState(state: OpenRouterSaveState): void;
  setBalance(status: OpenRouterStatus): void;
  setModelCheck(state: 'idle' | 'pending' | 'success' | 'error', message?: string): void;
  readKey(): string;
  setStoredKey(key: string): void;
  clearKey(): void;
}
export interface OpenRouterSettingsView extends OpenRouterSettingsComponentView { isCurrent(): boolean }
export const OPENROUTER_SETTINGS_HOST = '<div data-openrouter-settings-host></div>';
