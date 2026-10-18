// crypto-ui.ts — Encryption dialogs, nudges, delegates, and settings UI owner.

import { openUnlockDialog, openEnableDialog, openChangeDialog } from './passphrase-controller.js';
import { openPassphraseDialog, isPassphraseDialogVisible } from './passphrase-component.js';
import type { PassphraseServices } from './passphrase-controller.js';
import type { PassphraseOwner } from './passphrase-contract.js';
import { getErrorMessage } from './caught-error.js';
import { showConfirmDialog, showNotification } from './utils.js';
import { getBackupSettingsSnapshot, getBackupSnapshotRows } from './settings-protection-view.js';
import { disposeSettingsProtection, getBackupSettingsView, refreshEncryptionSettings, refreshBackupSettings } from './settings-protection-component.js';
export { disposeSettingsProtection };
import {
  isDataProtectionStylesheetLoaded,
  loadDataProtectionStylesheetForAction,
} from './modal-lifecycle.js';
import {
  exportEncryptedBackup,
  getAutoBackupSnapshots,
  getFolderBackupState,
  importEncryptedBackup,
  MAX_SNAPSHOTS,
  restoreAutoBackup,
} from './backup.js';

interface CryptoUiDeps extends PassphraseServices {
  disableEncryptionStorage: (() => Promise<void>) | null;
  getEncryptionEnabled(): boolean;
}
const cryptoUiDeps: CryptoUiDeps = {
  eraseAllLocalAppData: null,
  reloadApp: () => location.reload(),
  changeEncryptionPassphrase: null,
  clearEncryptionSession: null,
  disableEncryptionStorage: null,
  getEncryptionEnabled: () => false,
  migrateEncryptionStorage: null,
  prepareEncryption: null,
  unlockEncryption: null,
};

export function configureCryptoUi(deps: Partial<CryptoUiDeps> | Record<string, unknown> | null = {}) {
  const previous = { ...cryptoUiDeps };
  for (const [key, value] of Object.entries(deps || {})) {
    if (Object.hasOwn(cryptoUiDeps, key) && (typeof value === 'function' || (value === null && key !== 'getEncryptionEnabled' && key !== 'reloadApp'))) {
      (cryptoUiDeps as unknown as Record<string, CryptoUiDeps[keyof CryptoUiDeps]>)[key] = value as CryptoUiDeps[keyof CryptoUiDeps];
    }
  }
  return previous;
}

const needsDataProtectionStylesheet = () => typeof document !== 'undefined'
  && !!document.querySelector('[data-data-protection-stylesheet-anchor]')
  && !isDataProtectionStylesheetLoaded();

function runWithDataProtectionStylesheet(action: () => void | Promise<void | false>): void | Promise<void | false> {
  if (!needsDataProtectionStylesheet()) return action();
  return loadDataProtectionStylesheetForAction().then<void | false>(loaded => {
    if (loaded) return action();
    showNotification('Data protection controls could not be loaded. Try again.', 'error');
    return false;
  });
}

const cryptoActionDelegateRoots = new WeakSet<CryptoDelegateRoot>();
const CRYPTO_ACTION_DELEGATE_KEY = Symbol.for('getbased.cryptoActionDelegatesInstalled');
type CryptoDelegateRoot = (Document | HTMLElement) & { [CRYPTO_ACTION_DELEGATE_KEY]?: boolean };
const CRYPTO_ACTION_ATTR = 'data-crypto-action';
const CRYPTO_ACTION_SELECTOR = `[${CRYPTO_ACTION_ATTR}]`;

function closestCryptoAction(target: EventTarget | null) {
  return ((
    target && typeof (target as Element).closest === 'function'
      ? (target as Element).closest(CRYPTO_ACTION_SELECTOR)
      : null
  ) as HTMLElement | null);
}

function readSnapshotActionId(actionElement: HTMLElement) {
  const raw = actionElement.dataset.cryptoSnapshotId;
  if (raw == null) return null;
  if (actionElement.dataset.cryptoSnapshotIdType === 'number') {
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  }
  return raw;
}

function handleCryptoActionClick(event: Event) {
  const actionElement = closestCryptoAction(event.target);
  if (!actionElement || !(event.currentTarget as Node | null)?.contains?.(actionElement)) return;
  const action = actionElement.getAttribute(CRYPTO_ACTION_ATTR);
  if (action === 'change-passphrase') changePassphrase();
  else if (action === 'disable-encryption') disableEncryption();
  else if (action === 'enable-encryption') showEnableEncryptionModal();
  else if (action === 'export-backup') exportEncryptedBackup();
  else if (action === 'toggle-backup-snapshots') toggleBackupSnapshots();
  else if (action === 'restore-auto-backup') {
    const id = readSnapshotActionId(actionElement);
    if (id == null) return;
    void restoreAutoBackup(id).catch(error => {
      showNotification('Backup restore incomplete: ' + getErrorMessage(error), 'error');
    });
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function handleCryptoActionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionElement = closestCryptoAction(event.target);
  if (!actionElement || actionElement.getAttribute('role') !== 'button') return;
  if ((event.target as Element | null)?.closest?.('button, a, input, textarea, select')) return;
  handleCryptoActionClick(event);
}

function handleCryptoActionChange(event: Event) {
  const actionElement = closestCryptoAction(event.target);
  if (!actionElement || !(event.currentTarget as Node | null)?.contains?.(actionElement)) return;
  if (actionElement.getAttribute(CRYPTO_ACTION_ATTR) !== 'import-backup') return;
  const fileInput = (actionElement as HTMLInputElement);
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  importEncryptedBackup(file);
  fileInput.value = '';
  event.stopPropagation();
}

export function installCryptoActionDelegates(root: CryptoDelegateRoot | null = typeof document !== 'undefined' ? document : null) {
  if (!root || cryptoActionDelegateRoots.has(root) || root[CRYPTO_ACTION_DELEGATE_KEY]) return;
  cryptoActionDelegateRoots.add(root);
  Object.defineProperty(root, CRYPTO_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  root.addEventListener('click', handleCryptoActionClick);
  root.addEventListener('keydown', handleCryptoActionKeydown as EventListener);
  root.addEventListener('change', handleCryptoActionChange);
}

if (typeof document !== 'undefined') installCryptoActionDelegates();

export function showPassphraseModal(onSuccess: (value?: undefined) => unknown): void {
  openUnlockDialog({ ...cryptoUiDeps },onSuccess);
}
export function showEnableEncryptionModal(): void | Promise<void | false> {
  if (needsDataProtectionStylesheet()) return runWithDataProtectionStylesheet(showEnableEncryptionModal);
  openEnableDialog({ ...cryptoUiDeps },hydrateProtectionSettings);
}

export function maybeShowEncryptionNudge() {
  if (cryptoUiDeps.getEncryptionEnabled()) return;
  if (localStorage.getItem('labcharts-encryption-nudge-dismissed')) return;
  if (needsDataProtectionStylesheet()) {
    return void runWithDataProtectionStylesheet(() => maybeShowEncryptionNudge());
  }
  setTimeout(() => {
    if (cryptoUiDeps.getEncryptionEnabled() || localStorage.getItem('labcharts-encryption-nudge-dismissed') || isPassphraseDialogVisible()) return;
    let owner: PassphraseOwner;
    owner = openPassphraseDialog('encryption-nudge', {
      submit:()=>{owner.close();showEnableEncryptionModal();},
      secondary:()=>{localStorage.setItem('labcharts-encryption-nudge-dismissed','true');owner.close();}, forgot:()=>{},
    });
  },800);
}

export function maybeShowBackupNudge() {
  if (document.getElementById('tour-overlay')) return;

  const profiles = localStorage.getItem('labcharts-profiles');
  if (!profiles) return;
  let profileList;
  try {
    profileList = JSON.parse(profiles);
    if (profileList.length === 0) return;
  } catch {
    return;
  }
  const hasAnyData = profileList.some((profile: { id?: unknown }) => {
    try {
      const data = JSON.parse(localStorage.getItem(`labcharts-${profile.id}-imported`) || '{}');
      return data.entries && data.entries.length > 0;
    } catch {
      return false;
    }
  });
  if (!hasAnyData) return;

  const folderBackupState = getFolderBackupState();
  if (folderBackupState?.folderName && !folderBackupState?.permissionLost) return;
  const snoozedUntil = localStorage.getItem('labcharts-backup-nudge-snoozed-until');
  if (snoozedUntil && Date.now() < Number(snoozedUntil)) return;

  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const lastManual = localStorage.getItem('labcharts-last-manual-backup');
  const lastFolder = localStorage.getItem('labcharts-folder-backup-last');
  const mostRecent = Math.max(
    lastManual ? new Date(lastManual).getTime() : 0,
    lastFolder ? new Date(lastFolder).getTime() : 0,
  );
  if (mostRecent > 0 && (Date.now() - mostRecent) < THIRTY_DAYS) return;

  const overlay = document.getElementById('passphrase-overlay');
  if (overlay && overlay.style.display === 'flex') return;
  if (needsDataProtectionStylesheet()) {
    void runWithDataProtectionStylesheet(() => maybeShowBackupNudge());
    return;
  }

  setTimeout(() => {
    if (isPassphraseDialogVisible()) return;
    let owner: PassphraseOwner;
    owner = openPassphraseDialog('backup-nudge', {
      submit:()=>{owner.close();exportEncryptedBackup();},
      secondary:()=>{localStorage.setItem('labcharts-backup-nudge-snoozed-until',String(Date.now()+THIRTY_DAYS));owner.close();}, forgot:()=>{},
    });
  },500);
}

export async function disableEncryption() {
  if (!await showConfirmDialog('Disable encryption? Your data will be stored in plaintext.')) return;
  try {
    await cryptoUiDeps.disableEncryptionStorage?.();
    showNotification('Encryption disabled', 'info');
    hydrateProtectionSettings();
  } catch (error) {
    showNotification('Failed to disable encryption: ' + getErrorMessage(error), 'error');
  }
}

export async function changePassphrase(): Promise<void | false> {
  if (needsDataProtectionStylesheet()) return runWithDataProtectionStylesheet(changePassphrase);
  openChangeDialog({ ...cryptoUiDeps });
}

export function hydrateProtectionSettings(): void {
  const enabled = cryptoUiDeps.getEncryptionEnabled();
  refreshEncryptionSettings({ enabled });
  refreshBackupSettings(getBackupSettingsSnapshot(enabled, localStorage.getItem('labcharts-last-autobackup'), getFolderBackupState()));
}

export function prepareEncryptionSection(): void {
  queueMicrotask(hydrateProtectionSettings);
}
export function renderEncryptionSection(): string {
  prepareEncryptionSection();
  return '<div data-encryption-settings-root data-settings-protection-view="encryption"></div>';
}

export function prepareBackupSection(): void {
  queueMicrotask(hydrateProtectionSettings);
}
export function renderBackupSection(): string {
  prepareBackupSection();
  return '<div data-backup-settings-root data-settings-protection-view="backup"></div>';
}

export async function loadBackupSnapshots(): Promise<void> {
  hydrateProtectionSettings();
  const view = getBackupSettingsView();
  if (!view) return;
  const snapshots = await getAutoBackupSnapshots();
  if (getBackupSettingsView() !== view) return;
  view.setSnapshots(getBackupSnapshotRows(snapshots, MAX_SNAPSHOTS));
}

export function toggleBackupSnapshots(): void { getBackupSettingsView()?.toggleSnapshots(); }
