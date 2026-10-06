import type { LocalAiModel } from './local-ai-provider-shared.js';

export interface AdvisorModel extends LocalAiModel { name: string; size?: number; contextLength?: number; maxContextLength?: number; vramAllocated?: number; quantLevel?: string; paramSize?: string }
export type LocalAiTone = 'secondary' | 'success' | 'warning' | 'danger';
export interface LocalAiAdvisorRow {
  name: string; active: boolean; best: boolean; badge: string; verdict: string; tone: LocalAiTone;
  size: string; details: string; fitness: string; fitnessNote: string; fitnessTone: LocalAiTone;
}
export interface LocalAiAdvisor {
  local: boolean; chips: string[]; rows: LocalAiAdvisorRow[];
  suggestion: { model: string; command: string | null; note: string } | null;
  override: number | null; overridePlaceholder: string; overrideLabel: string; overrideOpen: boolean;
}
/** Presentation state excludes the editable server address and API credential. */
export interface LocalAiSettingsSnapshot {
  locationCopy: string; insecureRemote: boolean; selectedModel: string;
  pricing: { text: string; tone: LocalAiTone };
  models: { value: string; label: string }[]; advisor: LocalAiAdvisor | null;
}
export interface LocalAiConnection { url: string; apiKey: string }
export interface LocalAiSettingsActions {
  test(): unknown; select(model: string): unknown; copy(command: string): unknown;
  applyOverride(value: string): unknown; clearOverride(): unknown;
}
export interface LocalAiSettingsComponentView {
  refresh(snapshot: LocalAiSettingsSnapshot): void;
  setStatus(status: 'testing' | 'connected' | 'disconnected', text: string, pending?: boolean): void;
  setAdvisor(advisor: LocalAiAdvisor | null, models?: LocalAiSettingsSnapshot['models']): void;
  getSnapshot(): LocalAiSettingsSnapshot;
  getStatus(): { status: 'testing' | 'connected' | 'disconnected'; text: string };
  readConnection(): LocalAiConnection; setConnection(connection: LocalAiConnection): void;
  clearPrivateFields(): void;
}
export interface LocalAiSettingsView extends LocalAiSettingsComponentView { isCurrent(): boolean }
export const LOCAL_AI_SETTINGS_HOST = '<div data-local-ai-settings-host></div>';
