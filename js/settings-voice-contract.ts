import type { VoiceKind } from '../types/voice-local.js';
import type { getVoiceSettings } from './voice-settings-storage.js';
export type VoicePreferences = ReturnType<typeof getVoiceSettings>;
export interface VoiceOption {
  id: string;
  label: string;
  group?: string;
}
export interface VoiceField {
  id: string;
  title: string;
  description: string;
  label: string;
  type: 'select' | 'text' | 'range' | 'static' | 'model' | 'hardware';
  setting?: keyof VoicePreferences;
  value?: string | number;
  options?: VoiceOption[];
  hidden?: boolean;
  disabled?: boolean;
  visible?: string;
  separate?: boolean;
  kind?: VoiceKind;
  provider?: string;
  catalogStatus?: string;
  language?: 'input' | 'output';
  openRouterModel?: VoiceKind;
}
export interface VoiceModelView {
  label: string;
  description: string;
  status: string;
  state: string;
  ready: boolean;
  busy: boolean;
  progress: boolean;
  progressPhase: 'preparing' | 'complete' | 'failed';
  progressLabel: string;
  detail?: string | undefined;
  operation: 'install-model' | 'remove-model' | null;
}
export interface VoiceConnection {
  provider: string;
  title: string;
  description: string;
  keyLabel: string;
  key: string;
  keyStatus: string;
  docs: string;
}
export interface VoiceSettingsSnapshot {
  settings: VoicePreferences;
  automatic: { text: string; state: string };
  sharedProviders: VoiceOption[];
  input: VoiceField[];
  output: VoiceField[];
  models: Record<VoiceKind, VoiceModelView>;
  connections: VoiceConnection[];
}
export interface VoiceSettingsView {
  refresh(): void;
  setTestStatus(provider: string, text: string, error: boolean): void;
  setCatalogStatus(provider: string, text: string): void;
  setKey(provider: string, key: string, status: string): void;
  setHardwareDescription(kind: VoiceKind, text: string): void;
  setModel(kind: VoiceKind, next: Partial<VoiceModelView>): void;
  setActionBusy(id: string, busy: boolean, label: string): void;
}
export function voiceActionId(action: string, provider = '', kind = ''): string {
  return `${action}:${provider}:${kind}`;
}
