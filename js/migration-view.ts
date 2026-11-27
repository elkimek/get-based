import type { MigrationInventory } from './migration-portable.js';
export interface MigrationSummary extends MigrationInventory { sourceOrigin: string; files: number; encrypted: boolean; syncRecovery: boolean }
export interface MigrationSavedSnapshot { index: number; date: string; encrypted: boolean }
export type MigrationHandoffMode = 'idle' | 'sending' | 'sent' | 'receiving' | 'ready';
export interface MigrationViewState {
  recoveryOnly: boolean;
  legacySyncBlocked: boolean;
  downloadKind: 'migration' | 'snapshot' | null;
  handoffMode: MigrationHandoffMode;
  handoffOrigin: string | null;
  initialDestinationUrl: string;
  busy: boolean; status: string; error: string; pending: boolean; complete: boolean;
  sourceEncrypted: boolean; summary: MigrationSummary | null; snapshots: MigrationSavedSnapshot[];
}
export interface MigrationActions {
  transfer(destinationUrl: string, original: string, options?: {allowMissingLegacySync?: boolean}): Promise<void>;
  restoreHandoff(original: string): Promise<void>;
  export(password: string, original: string, options?: {allowMissingLegacySync?: boolean}): Promise<void>;
  inspect(file: File | null, password: string): Promise<void>;
  restore(password: string, original: string): Promise<void>;
  download(): void; cancel(): void; snapshot(index: number): Promise<void>; recoveryWords(): Promise<void>;
}
export const initialMigrationView = (): MigrationViewState => ({
  recoveryOnly: false, legacySyncBlocked: false, downloadKind: null,
  handoffMode: 'idle', handoffOrigin: null, initialDestinationUrl: '',
  busy: false, status: '', error: '', pending: false,
  complete: false, sourceEncrypted: false, summary: null, snapshots: [],
});
