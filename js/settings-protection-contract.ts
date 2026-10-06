// Presentation contains labels and capabilities, never backup payloads or directory handles.
export interface EncryptionSettingsSnapshot { enabled: boolean }
export interface FolderBackupSnapshot { supported: boolean; folderName: string | null; permissionLost: boolean; lastBackupLabel: string }
export interface BackupSettingsSnapshot { encrypted: boolean; autoStatus: string; folder: FolderBackupSnapshot }
export interface BackupSnapshotRow { id: string | number | null; dateLabel: string; profileCount: string; encrypted: boolean }
export interface ProtectionView<T> { refresh(snapshot: T): void }
export interface BackupSettingsView extends ProtectionView<BackupSettingsSnapshot> {
  refreshFolder(snapshot: FolderBackupSnapshot): void;
  setSnapshots(rows: readonly BackupSnapshotRow[]): void;
  toggleSnapshots(): void;
}
