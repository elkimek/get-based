import type { BackupSettingsSnapshot, BackupSnapshotRow, FolderBackupSnapshot } from './settings-protection-contract.js';
interface FolderState { supported: boolean; folderName: string | null; permissionLost: boolean; lastBackup: string | null }
interface SnapshotSummary { id?: unknown; createdAt: string; encrypted: boolean; snapshot?: { profiles?: readonly unknown[] } | null }
export function getFolderBackupSnapshot(state: FolderState): FolderBackupSnapshot {
  return { supported: state.supported, folderName: state.folderName, permissionLost: state.permissionLost,
    lastBackupLabel: state.lastBackup ? new Date(state.lastBackup).toLocaleString() : 'never' };
}
export function getBackupSettingsSnapshot(encrypted: boolean, lastAuto: string | null, folder: FolderState): BackupSettingsSnapshot {
  return { encrypted, autoStatus: lastAuto ? `Last auto-backup: ${new Date(lastAuto).toLocaleString()}` : 'No auto-backups yet',
    folder: getFolderBackupSnapshot(folder) };
}
export function getBackupSnapshotRows(snapshots: readonly SnapshotSummary[], limit: number): readonly BackupSnapshotRow[] {
  return snapshots.slice(0, limit).map(snapshot => ({
    id: typeof snapshot.id === 'string' || typeof snapshot.id === 'number' ? snapshot.id : null,
    dateLabel: new Date(snapshot.createdAt).toLocaleString(),
    profileCount: snapshot.snapshot?.profiles ? String(snapshot.snapshot.profiles.length) : '?',
    encrypted: !!snapshot.encrypted,
  }));
}
