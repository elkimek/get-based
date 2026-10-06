// Public display state only; credentials are read from a private live field on submit.
export type OpenRouterTone = 'secondary' | 'success' | 'warning' | 'danger';
export interface OpenRouterStatus { text: string; tone: OpenRouterTone }
export interface OpenRouterModelState {
  selectedModel: string;
  modelDisplay: string;
  groups: readonly { label: string; options: readonly { value: string; label: string }[] }[];
  pricing: OpenRouterStatus;
}
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
