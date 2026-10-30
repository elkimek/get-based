// Settings owns mounting/disposal; asynchronous reads may update only their originating view.
import { createRetryingModuleLoader } from './retrying-module-loader.js';
import { state } from './state.js';
import { PROTECTION_DESCRIPTION, PROTECTION_PRIMARY } from './settings-protection-classes.js';
import { registerFolderBackupPresentation, refreshFolderBackupPresentation, disposeFolderBackupPresentation } from './backup-folder-presentation.js';
import type { EncryptionSettingsSnapshot, BackupSettingsSnapshot, BackupSettingsView, BackupSnapshotRow, FolderBackupSnapshot, ProtectionView } from './settings-protection-contract.js';
let encryption: ProtectionView<EncryptionSettingsSnapshot> | null = null;
let encryptionHost: HTMLElement | null = null;
let backup: BackupSettingsView | null = null;
let backupHost: HTMLElement | null = null;
let backupView: BackupSettingsView | null = null;
let backupProfile: string | null = null;
let backupRows: readonly BackupSnapshotRow[] = [];
type EncryptionPresentation = typeof import('./components/EncryptionSettings.svelte.native.js');
type BackupPresentation = typeof import('./components/BackupSettings.svelte.native.js');
const encryptionPresentation = createRetryingModuleLoader<EncryptionPresentation>(retry => retry
  ? import('./components/EncryptionSettings.svelte.native.js?lazy-retry=1' as './components/EncryptionSettings.svelte.native.js')
  : import('./components/EncryptionSettings.svelte.native.js'));
const backupPresentation = createRetryingModuleLoader<BackupPresentation>(retry => retry
  ? import('./components/BackupSettings.svelte.native.js?lazy-retry=1' as './components/BackupSettings.svelte.native.js')
  : import('./components/BackupSettings.svelte.native.js'));
export async function prepareSettingsProtection(): Promise<void> { await Promise.all([encryptionPresentation.load(), backupPresentation.load()]); }
let revisions = new WeakMap<HTMLElement, object>();
let folderVersion = 0;
let latestFolder: { snapshot: FolderBackupSnapshot; profile: string } | null = null;
function rememberFolder(snapshot: FolderBackupSnapshot) { folderVersion++; latestFolder = { snapshot, profile: state.currentProfile }; }
function captureHost(host: HTMLElement, selector: string) {
  const revision = {}, profile = state.currentProfile; revisions.set(host, revision);
  return () => state.currentProfile === profile && host.isConnected && document.querySelector(selector) === host && revisions.get(host) === revision;
}
function loading(host: HTMLElement) { const status = document.createElement('p'); status.className = PROTECTION_DESCRIPTION; status.setAttribute('role', 'status'); status.textContent = 'Loading protection controls…'; host.replaceChildren(status); }
function failed(host: HTMLElement, retry: () => void) {
  const status = document.createElement('p'); status.className = PROTECTION_DESCRIPTION; status.setAttribute('role', 'alert'); status.textContent = 'Protection controls could not be loaded.';
  const button = document.createElement('button'); button.type = 'button'; button.className = PROTECTION_PRIMARY; button.textContent = 'Retry'; button.addEventListener('click', retry); host.replaceChildren(status, button);
}
export function disposeSettingsProtection(): void {
  revisions = new WeakMap();
  latestFolder = null; folderVersion++;
  if (encryption) void encryptionPresentation.module!.unmount(encryption);
  if (backup) void backupPresentation.module!.unmount(backup);
  disposeFolderBackupPresentation();
  encryptionPresentation.module?.flushSync(); backupPresentation.module?.flushSync();
  encryption = null; encryptionHost = null; backup = null; backupHost = null; backupView = null; backupProfile = null; backupRows = [];
}
export function refreshEncryptionSettings(snapshot: EncryptionSettingsSnapshot): void {
  const host = document.querySelector<HTMLElement>('[data-encryption-settings-root]');
  if (!host) return;
  const current = captureHost(host, '[data-encryption-settings-root]'), module = encryptionPresentation.module;
  if (!module) {
    loading(host); void encryptionPresentation.load().then(() => { if (current()) refreshEncryptionSettings(snapshot); }).catch(() => { if (current()) failed(host, () => { if (current()) refreshEncryptionSettings(snapshot); }); }); return;
  }
  if (encryption && encryptionHost === host) { module.flushSync(() => encryption?.refresh(snapshot)); return; }
  if (encryption) { void module.unmount(encryption); module.flushSync(); }
  host.replaceChildren(); encryptionHost = host; encryption = module.mount(module.default, { target: host, props: { initial: snapshot } }); module.flushSync();
}
export function refreshBackupSettings(snapshot: BackupSettingsSnapshot): void {
  const host = document.querySelector<HTMLElement>('[data-backup-settings-root]');
  if (!host) return;
  const current = captureHost(host, '[data-backup-settings-root]'), module = backupPresentation.module;
  if (backupHost !== host || backupProfile !== state.currentProfile || !backupView) {
    if (backup) { void module!.unmount(backup); module!.flushSync(); }
    backup = null; backupHost = host; backupProfile = state.currentProfile; backupRows = [];
    const profile = backupProfile;
    const owns = () => backupView === owner && state.currentProfile === profile && host.isConnected && document.querySelector('[data-backup-settings-root]') === host;
    const update = (action: (view: BackupSettingsView) => void) => { if (owns() && backup) backupPresentation.module!.flushSync(() => action(backup!)); };
    const owner: BackupSettingsView = {
      refresh: next => { if (owns()) refreshBackupSettings(next); },
      refreshFolder: next => { if (owns()) { rememberFolder(next); update(view => view.refreshFolder(next)); } },
      setSnapshots: rows => { if (owns()) { backupRows = rows; update(view => view.setSnapshots(rows)); } },
      toggleSnapshots: () => update(view => view.toggleSnapshots()),
    };
    backupView = owner;
  }
  if (!module) {
    const version = folderVersion, profile = state.currentProfile;
    const latestSnapshot = () => folderVersion > version && latestFolder?.profile === profile ? { ...snapshot, folder: latestFolder.snapshot } : snapshot;
    loading(host); void backupPresentation.load().then(() => {
      if (current()) refreshBackupSettings(latestSnapshot());
    }).catch(() => { if (current()) failed(host, () => { if (current()) refreshBackupSettings(latestSnapshot()); }); }); return;
  }
  if (backup && backupHost === host) { module.flushSync(() => backup?.refresh(snapshot)); return; }
  host.replaceChildren(); backup = module.mount(module.default, { target: host, props: { initial: snapshot } });
  module.flushSync(() => backup!.setSnapshots(backupRows));
}
/** The current owner accepts summaries before its presentation finishes loading. */
export function getBackupSettingsView(): BackupSettingsView | null { return backupHost?.isConnected && backupProfile === state.currentProfile && document.querySelector('[data-backup-settings-root]') === backupHost ? backupView : null; }
export function refreshFolderBackupSettings(snapshot: FolderBackupSnapshot): void { refreshFolderBackupPresentation(snapshot); }
registerFolderBackupPresentation({
  refresh: snapshot => { const view = getBackupSettingsView(); if (view) view.refreshFolder(snapshot); else rememberFolder(snapshot); },
  dispose: () => {},
});
