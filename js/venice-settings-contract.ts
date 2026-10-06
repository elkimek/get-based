// Presentation state excludes credentials and raw provider metadata.
export type VeniceTone = 'secondary' | 'success' | 'warning' | 'danger';
export interface VeniceStatus { text: string; tone: VeniceTone }
export interface VeniceModelState {
  selectedModel: string;
  modelDisplay: string;
  groups: readonly { label: string; options: readonly { value: string; label: string }[] }[];
  pricing: VeniceStatus;
}
export interface VeniceModeState { enabled: boolean; available: boolean; active: boolean }
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
