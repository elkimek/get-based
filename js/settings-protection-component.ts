// Settings owns mounting/disposal; asynchronous reads may update only their originating view.
import EncryptionSettings, { mount, unmount, flushSync } from './components/EncryptionSettings.svelte.native.js';
import BackupSettings, { mount as mountBackup, unmount as unmountBackup, flushSync as flushBackup } from './components/BackupSettings.svelte.native.js';
import { registerFolderBackupPresentation, refreshFolderBackupPresentation, disposeFolderBackupPresentation } from './backup-folder-presentation.js';
import type { EncryptionSettingsSnapshot, BackupSettingsSnapshot, BackupSettingsView, FolderBackupSnapshot, ProtectionView } from './settings-protection-contract.js';
let encryption: ProtectionView<EncryptionSettingsSnapshot> | null = null;
let encryptionHost: HTMLElement | null = null;
let backup: BackupSettingsView | null = null;
let backupHost: HTMLElement | null = null;
let backupView: BackupSettingsView | null = null;
export function disposeSettingsProtection(): void {
  if (encryption) void unmount(encryption);
  if (backup) void unmountBackup(backup);
  disposeFolderBackupPresentation();
  flushSync(); flushBackup();
  encryption = null; encryptionHost = null; backup = null; backupHost = null; backupView = null;
}
export function refreshEncryptionSettings(snapshot: EncryptionSettingsSnapshot): void {
  const host = document.querySelector<HTMLElement>('[data-encryption-settings-root]');
  if (!host) return;
  if (encryption && encryptionHost === host) { flushSync(() => encryption?.refresh(snapshot)); return; }
  if (encryption) { void unmount(encryption); flushSync(); }
  encryptionHost = host; encryption = mount(EncryptionSettings, { target: host, props: { initial: snapshot } }); flushSync();
}
export function refreshBackupSettings(snapshot: BackupSettingsSnapshot): void {
  const host = document.querySelector<HTMLElement>('[data-backup-settings-root]');
  if (!host) return;
  if (backup && backupHost === host) { flushBackup(() => backup?.refresh(snapshot)); return; }
  if (backup) { void unmountBackup(backup); flushBackup(); }
  backupHost = host; backup = mountBackup(BackupSettings, { target: host, props: { initial: snapshot } }); flushBackup();
  const owner = backup;
  backupView = {
    refresh: next => flushBackup(() => owner.refresh(next)),
    refreshFolder: next => flushBackup(() => owner.refreshFolder(next)),
    setSnapshots: rows => flushBackup(() => owner.setSnapshots(rows)),
    toggleSnapshots: () => flushBackup(() => owner.toggleSnapshots()),
  };
}
export function getBackupSettingsView(): BackupSettingsView | null { return backupHost?.isConnected ? backupView : null; }
export function refreshFolderBackupSettings(snapshot: FolderBackupSnapshot): void { refreshFolderBackupPresentation(snapshot); }
registerFolderBackupPresentation({
  refresh: snapshot => getBackupSettingsView()?.refreshFolder(snapshot),
  dispose: () => {},
});
