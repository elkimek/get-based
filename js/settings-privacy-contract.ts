// Presentation snapshots; privacy, consent and provider services own persistence.
export interface PrivacyConsent {
  transparencyAcknowledged: boolean;
  remoteRecipients: string[];
  privateRecipients: string[];
}
export interface PrivacyPreferences {
  url: string;
  apiKey: string;
  localEnabled: boolean;
  reviewEnabled: boolean;
  analyticsEnabled: boolean;
  consent: PrivacyConsent;
}
export interface PrivacyConnectionState {
  status: 'idle' | 'testing' | 'connected' | 'disconnected';
  message: string;
  models: string[];
  selectedModel: string;
}
export interface PrivacyConnectionView {
  isCurrent(): boolean;
  update(next: Partial<PrivacyConnectionState>): void;
}
export interface PrivacySettingsView {
  setConsent(next: PrivacyConsent): void;
  setProtection(enhanced: boolean, model: string): void;
  configure(open?: boolean): void;
  setConnection(next: Partial<PrivacyConnectionState>): void;
}
