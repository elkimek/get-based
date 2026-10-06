// Display values only. Recovery words never belong in a panel snapshot.
export interface SyncDeletionRow { id: string; name: string; dateLabel: string }
export interface SyncSettingsSnapshot {
  enabled: boolean;
  configured: boolean;
  paused: boolean;
  relay: string;
  blocker: string | null;
  deletions: readonly SyncDeletionRow[];
}
export interface SyncSettingsView {
  isCurrent(): boolean;
  refresh(snapshot: SyncSettingsSnapshot): void;
  setRelay(connected: boolean | null): void;
  setIdentity(code: string | null, unavailable?: boolean): void;
  setMnemonicStatus(ready: boolean, message?: string, warning?: boolean): void;
  toggleMnemonic(value: string): void;
  clearSecrets(): void;
}
export type SyncSettingsComponentView = Omit<SyncSettingsView, 'isCurrent'>;
