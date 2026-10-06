import type { ProviderSettingsModels, ProviderSettingsMode } from './provider-settings-contract.js';
/** Catalog presentation contains no credentials or raw provider metadata. */
export interface RoutstrModelSettingsSnapshot {
  connected: boolean;
  models: ProviderSettingsModels;
  mode: ProviderSettingsMode;
}
export interface RoutstrModelSettingsComponentView {
  refresh(snapshot: RoutstrModelSettingsSnapshot): void;
  getModels(): ProviderSettingsModels;
  setModels(models: ProviderSettingsModels): void;
  setMode(mode: ProviderSettingsMode): void;
}
export interface RoutstrModelSettingsView extends RoutstrModelSettingsComponentView { isCurrent(): boolean }
