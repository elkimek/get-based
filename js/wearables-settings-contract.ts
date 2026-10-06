// Public presentation values only; connection credentials never enter snapshots.
export type WearablesSettingsAction = 'connect' | 'pick-apple-health-file' | 'sync-now' | 'backfill' | 'disconnect' | 'manual-dashboard' | 'manual-disconnect';
export interface WearablesAction {
  action: WearablesSettingsAction;
  adapter?: string | undefined;
  label: string;
  ariaLabel?: string | undefined;
  title?: string | undefined;
  hint?: string | undefined;
  tone?: 'primary' | 'secondary' | 'danger';
}
export interface WearablesRow {
  id: string;
  name: string;
  connected: boolean;
  wordmark: boolean;
  iconLight?: string | undefined;
  iconDark?: string | undefined;
  mono?: string | undefined;
  status: string;
  updated: string;
  tone: 'secondary' | 'success' | 'danger';
  detail: 'none' | 'setup' | 'legacy' | 'unavailable' | 'oauth' | 'apple' | 'manual';
  startOpen: boolean;
  identity: string;
  meta: string;
  notices: string[];
  explanation: string;
  docsUrl?: string | undefined;
  docsLabel?: string | undefined;
  manageAccessUrl?: string | undefined;
  primaryAction?: WearablesAction | undefined;
  actions: WearablesAction[];
}
export interface WearablesSettingsSnapshot {
  profileId: string;
  stripHidden: boolean;
  groups: { id: string; title: string; hint: string; rows: WearablesRow[] }[];
}
export interface WearablesImportProgress { message: string; percent: number; failed?: boolean }
export interface WearablesSettingsComponentView {
  update(snapshot: WearablesSettingsSnapshot): void;
  setManualCounts(message: string): void;
  setPending(adapterId: string, pending: boolean): void;
  setImportProgress(progress: WearablesImportProgress | null): void;
}
export interface WearablesSettingsView extends WearablesSettingsComponentView {
  isCurrent(): boolean;
  profileId: string;
}
