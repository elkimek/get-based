import type { ProviderSettingsModels, ProviderSettingsStatus } from './provider-settings-contract.js';
/** Display state excludes credentials and the editable endpoint. */
export interface CustomSettingsSnapshot { connected: boolean; models: ProviderSettingsModels }
export interface CustomConnection { url: string; key: string }
export interface CustomSettingsActions { save(): unknown; remove(): unknown; select(model: string): unknown; apply(): unknown }
export interface CustomSettingsComponentView {
  refresh(snapshot: CustomSettingsSnapshot): void;
  setModels(models: ProviderSettingsModels): void; getModels(): ProviderSettingsModels;
  setSaveState(state: ProviderSettingsStatus & { pending: boolean }): void;
  readConnection(): CustomConnection; setConnection(connection: CustomConnection): void;
  readManualModel(): string; clearPrivateFields(): void;
}
export interface CustomSettingsView extends CustomSettingsComponentView { isCurrent(): boolean }
export const CUSTOM_SETTINGS_HOST = '<div data-custom-settings-host></div>';
