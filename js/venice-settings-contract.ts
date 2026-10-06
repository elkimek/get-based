// Presentation state excludes credentials and raw provider metadata.
import type { ProviderSettingsStatus as VeniceStatus, ProviderSettingsModels as VeniceModelState, ProviderSettingsMode as VeniceModeState } from './provider-settings-contract.js';
export type { ProviderSettingsTone as VeniceTone, ProviderSettingsStatus as VeniceStatus, ProviderSettingsModels as VeniceModelState, ProviderSettingsMode as VeniceModeState } from './provider-settings-contract.js';
export interface VeniceSettingsSnapshot {
  connected: boolean;
  models: VeniceModelState;
  mode: VeniceModeState;
}
export interface VeniceSaveState extends VeniceStatus { pending: boolean }
export interface VeniceSettingsComponentView {
  refresh(snapshot: VeniceSettingsSnapshot): void;
  setModels(models: VeniceModelState): void;
  getModels(): VeniceModelState;
  setMode(mode: VeniceModeState): void;
  setSaveState(state: VeniceSaveState): void;
  setBalance(status: VeniceStatus): void;
  readKey(): string;
  setStoredKey(key: string): void;
  clearKey(): void;
}
export interface VeniceSettingsView extends VeniceSettingsComponentView { isCurrent(): boolean }
export const VENICE_SETTINGS_HOST = '<div data-venice-settings-host></div>';
