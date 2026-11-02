export const AI_PROVIDER_IDS = ['ppq', 'routstr', 'openrouter', 'venice', 'custom', 'ollama', 'cli'] as const;
export type AiProviderId = typeof AI_PROVIDER_IDS[number];

export interface AiProviderChoice {
  id: AiProviderId;
  label: string;
  asset?: string;
  path?: string;
}

export interface AiSettingsSnapshot {
  enabled: boolean;
  chatControlsEnabled: boolean;
  hideProviders: boolean;
  activeProvider: string;
  choices: readonly AiProviderChoice[];
}

export interface AiSettingsActions {
  pause(enabled: boolean): unknown;
  chatControls(enabled: boolean): unknown;
  select(provider: AiProviderId, button: HTMLButtonElement): unknown;
}

export interface AiSettingsComponentView {
  getSnapshot(): AiSettingsSnapshot;
  setEnabled(enabled: boolean): void;
  setChatControlsEnabled(enabled: boolean): void;
  setChatControlsError(message: string): void;
  setSelected(provider: string): void;
  setProviderStatus(phase: 'loading' | 'ready' | 'error'): void;
  setPauseError(message: string): void;
  /** Stable slot whose descendants belong to the selected provider's adapter. */
  getProviderHost(): HTMLElement | null;
}

export interface AiSettingsView extends AiSettingsComponentView {
  isCurrent(): boolean;
}
