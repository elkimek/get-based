import type { MigrationInventory } from './migration-portable.js';
export interface MigrationSummary extends MigrationInventory { sourceOrigin: string; files: number; encrypted: boolean; syncRecovery: boolean }
export interface MigrationSavedSnapshot { index: number; date: string; encrypted: boolean }
export interface MigrationViewState {
  downloadKind: 'migration' | 'snapshot' | null;
  busy: boolean; status: string; error: string; pending: boolean; complete: boolean;
  sourceEncrypted: boolean; summary: MigrationSummary | null; snapshots: MigrationSavedSnapshot[];
}
export interface MigrationActions {
  export(password: string, original: string): Promise<void>;
  inspect(file: File | null, password: string): Promise<void>;
  restore(password: string, original: string): Promise<void>;
  download(): void; cancel(): void; snapshot(index: number): Promise<void>; recoveryWords(): Promise<void>;
}
export const initialMigrationView = (): MigrationViewState => ({downloadKind: null, busy: false, status: '', error: '', pending: false,
  complete: false, sourceEncrypted: false, summary: null, snapshots: []});
