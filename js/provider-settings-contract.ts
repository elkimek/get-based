// Shared nonsecret presentation primitives for hosted-provider Settings.
export type ProviderSettingsTone = 'secondary' | 'success' | 'warning' | 'danger';
export interface ProviderSettingsStatus { text: string; tone: ProviderSettingsTone }
export interface ProviderSettingsModels {
  selectedModel: string;
  modelDisplay: string;
  groups: readonly { label: string; options: readonly { value: string; label: string }[] }[];
  pricing: ProviderSettingsStatus;
}
export interface ProviderSettingsMode { enabled: boolean; available: boolean; active: boolean }
