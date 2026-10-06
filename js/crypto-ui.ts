// crypto-ui.ts — Encryption dialogs, nudges, delegates, and settings UI owner.

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

interface CryptoUiDeps {
  changeEncryptionPassphrase: ((oldPassphrase: string, newPassphrase: string) => Promise<void>) | null;
  clearEncryptionSession: (() => void) | null;
  disableEncryptionStorage: (() => Promise<void>) | null;
  getEncryptionEnabled(): boolean;
  migrateEncryptionStorage: (() => Promise<void>) | null;
  prepareEncryption: ((passphrase: string) => Promise<void>) | null;
  unlockEncryption: ((passphrase: string) => Promise<void>) | null;
}
const cryptoUiDeps: CryptoUiDeps = {
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
    if (Object.hasOwn(cryptoUiDeps, key) && typeof value === 'function') {
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

let failCount = 0;

function focusInitialPassphraseInput(overlay: HTMLElement, input: HTMLInputElement): void {
  setTimeout(() => {
    if (input.isConnected && overlay.style.display !== 'none' && !overlay.contains(document.activeElement)) input.focus();
  }, 50);
}

function ensurePassphraseOverlay(): HTMLElement {
  let overlay = document.getElementById('passphrase-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'passphrase-overlay';
    overlay.className = 'passphrase-overlay';
    document.body.appendChild(overlay);
  }
  return overlay;
}

function hidePassphraseOverlay(overlay: HTMLElement) {
  overlay.style.display = 'none';
  overlay.innerHTML = '';
}

export function showPassphraseModal(onSuccess: (value?: undefined) => unknown) {
  let overlay = ensurePassphraseOverlay();
  failCount = 0;
  renderPassphraseForm(overlay, onSuccess);
}

function renderPassphraseForm(overlay: HTMLElement, onSuccess: (value?: undefined) => unknown) {
  overlay.innerHTML = `
    <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Enter passphrase">
      <div class="passphrase-icon">&#128274;</div>
      <h3 class="passphrase-title">Unlock getbased</h3>
      <p class="passphrase-desc">Your data is encrypted. Enter your passphrase to continue.</p>
      <input type="password" class="passphrase-input" id="passphrase-unlock-input" placeholder="Passphrase" autocomplete="current-password" autofocus>
      <div class="passphrase-error" id="passphrase-error"></div>
      <button class="passphrase-btn passphrase-btn-primary" id="passphrase-unlock-btn">Unlock</button>
      <button class="passphrase-btn passphrase-btn-link" id="passphrase-forgot-btn">Forgot passphrase?</button>
    </div>`;
  const input = (document.getElementById('passphrase-unlock-input') as HTMLInputElement | null);
  const button = (document.getElementById('passphrase-unlock-btn') as HTMLButtonElement | null);
  const errorElement = document.getElementById('passphrase-error');
  const forgotButton = (document.getElementById('passphrase-forgot-btn') as HTMLButtonElement | null);
  if (!input || !button || !errorElement || !forgotButton) return;
  overlay.style.display = 'flex';

  const attemptUnlock = async () => {
    const passphrase = input.value;
    if (!passphrase) { errorElement.textContent = 'Please enter your passphrase'; return; }
    button.disabled = true;
    button.textContent = 'Decrypting...';
    errorElement.textContent = '';

    if (failCount >= 3) {
      errorElement.textContent = 'Too many attempts. Please wait...';
      await new Promise(resolve => setTimeout(resolve, 5000));
      errorElement.textContent = '';
    }

    try {
      await cryptoUiDeps.unlockEncryption?.(passphrase);
      hidePassphraseOverlay(overlay);
      onSuccess();
    } catch {
      failCount++;
      input.value = '';
      errorElement.textContent = `Wrong passphrase (attempt ${failCount})`;
      button.disabled = false;
      button.textContent = 'Unlock';
      input.focus();
    }
  };

  button.addEventListener('click', attemptUnlock);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') attemptUnlock();
  });

  forgotButton.addEventListener('click', () => {
    // Inline confirm inside the passphrase overlay (can't use showConfirmDialog — it's behind this z-index)
    const dialog = ((overlay.querySelector('.passphrase-dialog')) as HTMLElement | null);
    if (!dialog) return;
    dialog.innerHTML = `
      <div class="passphrase-icon">&#9888;&#65039;</div>
      <h3 class="passphrase-title">Erase All Data?</h3>
      <p class="passphrase-desc">If you forgot your passphrase, the only option is to <strong>erase all data</strong> and start fresh. This cannot be undone.</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="passphrase-btn passphrase-btn-secondary" id="passphrase-forgot-cancel">Go Back</button>
        <button class="passphrase-btn passphrase-btn-primary" id="passphrase-forgot-confirm" style="background:var(--red)">Erase Everything</button>
      </div>`;
    document.getElementById('passphrase-forgot-cancel')?.addEventListener('click', () => {
      renderPassphraseForm(overlay, onSuccess);
    });
    document.getElementById('passphrase-forgot-confirm')?.addEventListener('click', async () => {
      const confirmButton = ((
        document.getElementById('passphrase-forgot-confirm')
      ) as HTMLButtonElement | null);
      if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Erasing…';
      }
      try {
        const { eraseAllLocalAppData } = await import('./data-wipe.js');
        await eraseAllLocalAppData();
      } catch (error) {
        console.error('[crypto] Local data erasure was incomplete:', error);
        const message = document.createElement('div');
        message.className = 'passphrase-error';
        message.setAttribute('role', 'alert');
        message.textContent = `${getErrorMessage(error, 'Could not erase all local data.')} Close other Get Based tabs and try again.`;
        dialog.appendChild(message);
        if (confirmButton) {
          confirmButton.disabled = false;
          confirmButton.textContent = 'Retry Erase';
        }
        return;
      }
      cryptoUiDeps.clearEncryptionSession?.();
      hidePassphraseOverlay(overlay);
      location.reload();
    });
  });

  focusInitialPassphraseInput(overlay, input);
}

function validatePassphrase(passphrase: string) {
  if (passphrase.length < 8) return { valid: false, message: 'At least 8 characters' };
  if (!/[a-z]/.test(passphrase)) return { valid: false, message: 'At least 1 lowercase letter' };
  if (!/[A-Z]/.test(passphrase)) return { valid: false, message: 'At least 1 uppercase letter' };
  if (!/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(passphrase)) return { valid: false, message: 'At least 1 special character' };
  return { valid: true, message: '' };
}

function getPassphraseStrength(passphrase: string) {
  let score = 0;
  if (passphrase.length >= 8) score++;
  if (/[a-z]/.test(passphrase)) score++;
  if (/[A-Z]/.test(passphrase)) score++;
  if (/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(passphrase)) score++;
  return score;
}

export function showEnableEncryptionModal(): void | Promise<void | false> {
  if (needsDataProtectionStylesheet()) {
    return runWithDataProtectionStylesheet(() => showEnableEncryptionModal());
  }
  let overlay = ensurePassphraseOverlay();
  overlay.innerHTML = `
    <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Set encryption passphrase">
      <div class="passphrase-icon">&#128274;</div>
      <h3 class="passphrase-title">Enable Encryption</h3>
      <p class="passphrase-desc">Set a passphrase to encrypt your medical data at rest. <strong>If you forget this passphrase, your data cannot be recovered.</strong></p>
      <input type="password" class="passphrase-input" id="passphrase-set-input" placeholder="Enter passphrase" autocomplete="new-password" autofocus>
      <input type="password" class="passphrase-input" id="passphrase-confirm-input" placeholder="Confirm passphrase" autocomplete="new-password">
      <div class="passphrase-strength" id="passphrase-strength">
        <div class="passphrase-strength-bars">
          <div class="passphrase-strength-bar" data-index="0"></div>
          <div class="passphrase-strength-bar" data-index="1"></div>
          <div class="passphrase-strength-bar" data-index="2"></div>
          <div class="passphrase-strength-bar" data-index="3"></div>
        </div>
        <ul class="passphrase-rules" id="passphrase-rules">
          <li data-rule="length">At least 8 characters</li>
          <li data-rule="lower">At least 1 lowercase letter</li>
          <li data-rule="upper">At least 1 uppercase letter</li>
          <li data-rule="special">At least 1 special character</li>
        </ul>
      </div>
      <div class="passphrase-error" id="passphrase-set-error"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="passphrase-btn passphrase-btn-secondary" id="passphrase-set-cancel">Cancel</button>
        <button class="passphrase-btn passphrase-btn-primary" id="passphrase-set-btn">Enable Encryption</button>
      </div>
    </div>`;
  const passphraseInput = (document.getElementById('passphrase-set-input') as HTMLInputElement | null);
  const confirmInput = (document.getElementById('passphrase-confirm-input') as HTMLInputElement | null);
  const button = (document.getElementById('passphrase-set-btn') as HTMLButtonElement | null);
  const cancelButton = (document.getElementById('passphrase-set-cancel') as HTMLButtonElement | null);
  const errorElement = document.getElementById('passphrase-set-error');
  if (!passphraseInput || !confirmInput || !button || !cancelButton || !errorElement) return;
  overlay.style.display = 'flex';

  const strengthBars = ((overlay.querySelectorAll('.passphrase-strength-bar')) as NodeListOf<HTMLElement>);
  const ruleItems = overlay.querySelectorAll('.passphrase-rules li');
  const barColors = ['var(--red)', 'var(--orange)', 'var(--yellow)', 'var(--green)'];
  let migrationStarted = false;

  const updateStrengthMeter = () => {
    const passphrase = passphraseInput.value;
    const score = getPassphraseStrength(passphrase);
    strengthBars.forEach((bar, index) => {
      bar.style.background = index < score ? barColors[score - 1]! : 'var(--border)';
    });
    const checks = [
      passphrase.length >= 8,
      /[a-z]/.test(passphrase),
      /[A-Z]/.test(passphrase),
      /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(passphrase),
    ];
    ruleItems.forEach((item, index) => item.classList.toggle('met', checks[index]!));
  };
  passphraseInput.addEventListener('input', updateStrengthMeter);

  cancelButton.addEventListener('click', () => {
    hidePassphraseOverlay(overlay);
  });

  button.addEventListener('click', async () => {
    const passphrase = passphraseInput.value;
    const confirmation = confirmInput.value;
    if (!passphrase) { errorElement.textContent = 'Please enter a passphrase'; return; }
    const validation = validatePassphrase(passphrase);
    if (!validation.valid) { errorElement.textContent = validation.message; return; }
    if (passphrase !== confirmation) { errorElement.textContent = 'Passphrases do not match'; return; }

    button.disabled = true;
    button.textContent = 'Encrypting...';
    errorElement.textContent = '';

    try {
      if (!migrationStarted) {
        await cryptoUiDeps.prepareEncryption?.(passphrase);
        migrationStarted = true;
      }
      await cryptoUiDeps.migrateEncryptionStorage?.();
      hidePassphraseOverlay(overlay);
      showNotification('Encryption enabled \u2014 keep your passphrase safe', 'success');
      hydrateProtectionSettings();
    } catch (error) {
      errorElement.textContent = 'Encryption failed: ' + getErrorMessage(error);
      button.disabled = false;
      button.textContent = migrationStarted ? 'Retry Encryption' : 'Enable Encryption';
    }
  });

  confirmInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') button.click();
  });

  focusInitialPassphraseInput(overlay, passphraseInput);
}

export function maybeShowEncryptionNudge() {
  if (cryptoUiDeps.getEncryptionEnabled()) return;
  if (localStorage.getItem('labcharts-encryption-nudge-dismissed')) return;
  if (needsDataProtectionStylesheet()) {
    return void runWithDataProtectionStylesheet(() => maybeShowEncryptionNudge());
  }
  setTimeout(() => {
    let overlay = ensurePassphraseOverlay();
    overlay.innerHTML = `
      <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Enable encryption">
        <div class="passphrase-icon">&#128274;</div>
        <h3 class="passphrase-title">Protect Your Data</h3>
        <p class="passphrase-desc">Your lab results are stored in your browser's local storage, where browser extensions and anyone with filesystem access can read them. Set a passphrase to encrypt your data at rest.</p>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="passphrase-btn passphrase-btn-secondary" id="encryption-nudge-dismiss">Not Now</button>
          <button class="passphrase-btn passphrase-btn-primary" id="encryption-nudge-enable">Enable Encryption</button>
        </div>
      </div>`;
    overlay.style.display = 'flex';
    const dismissButton = document.getElementById('encryption-nudge-dismiss');
    const enableButton = document.getElementById('encryption-nudge-enable');
    if (!dismissButton || !enableButton) return;
    dismissButton.addEventListener('click', () => {
      localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
      hidePassphraseOverlay(overlay);
    });
    enableButton.addEventListener('click', () => {
      hidePassphraseOverlay(overlay);
      showEnableEncryptionModal();
    });
  }, 800);
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
    const visibleOverlay = document.getElementById('passphrase-overlay');
    if (visibleOverlay && visibleOverlay.style.display === 'flex') return;

    let nudgeOverlay = ensurePassphraseOverlay();
    nudgeOverlay.innerHTML = `
      <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Backup reminder">
        <div class="passphrase-icon">&#128190;</div>
        <h3 class="passphrase-title">Back Up Your Data</h3>
        <p class="passphrase-desc">Your lab results only exist in this browser. Download a backup to protect against data loss.</p>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="passphrase-btn passphrase-btn-secondary" id="backup-nudge-snooze">Not Now</button>
          <button class="passphrase-btn passphrase-btn-primary" id="backup-nudge-download">Download Now</button>
        </div>
      </div>`;
    nudgeOverlay.style.display = 'flex';
    const snoozeButton = document.getElementById('backup-nudge-snooze');
    const downloadButton = document.getElementById('backup-nudge-download');
    if (!snoozeButton || !downloadButton) return;
    snoozeButton.addEventListener('click', () => {
      localStorage.setItem('labcharts-backup-nudge-snoozed-until', String(Date.now() + THIRTY_DAYS));
      hidePassphraseOverlay(nudgeOverlay);
    });
    downloadButton.addEventListener('click', () => {
      hidePassphraseOverlay(nudgeOverlay);
      exportEncryptedBackup();
    });
  }, 500);
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
  if (needsDataProtectionStylesheet()) {
    return runWithDataProtectionStylesheet(() => changePassphrase());
  }
  let overlay = ensurePassphraseOverlay();
  overlay.innerHTML = `
    <div class="passphrase-dialog" role="dialog" aria-modal="true" aria-label="Change passphrase">
      <div class="passphrase-icon">&#128274;</div>
      <h3 class="passphrase-title">Change Passphrase</h3>
      <input type="password" class="passphrase-input" id="passphrase-old-input" placeholder="Current passphrase" autocomplete="current-password" autofocus>
      <input type="password" class="passphrase-input" id="passphrase-new1-input" placeholder="New passphrase" autocomplete="new-password">
      <input type="password" class="passphrase-input" id="passphrase-new2-input" placeholder="Confirm new passphrase" autocomplete="new-password">
      <div class="passphrase-error" id="passphrase-change-error"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="passphrase-btn passphrase-btn-secondary" id="passphrase-change-cancel">Cancel</button>
        <button class="passphrase-btn passphrase-btn-primary" id="passphrase-change-btn">Change Passphrase</button>
      </div>
    </div>`;
  const oldInput = (document.getElementById('passphrase-old-input') as HTMLInputElement | null);
  const newInput = (document.getElementById('passphrase-new1-input') as HTMLInputElement | null);
  const confirmationInput = (document.getElementById('passphrase-new2-input') as HTMLInputElement | null);
  const button = (document.getElementById('passphrase-change-btn') as HTMLButtonElement | null);
  const cancelButton = (document.getElementById('passphrase-change-cancel') as HTMLButtonElement | null);
  const errorElement = document.getElementById('passphrase-change-error');
  if (!oldInput || !newInput || !confirmationInput || !button || !cancelButton || !errorElement) return;
  overlay.style.display = 'flex';

  cancelButton.addEventListener('click', () => {
    hidePassphraseOverlay(overlay);
  });

  button.addEventListener('click', async () => {
    const oldPassphrase = oldInput.value;
    const newPassphrase = newInput.value;
    const confirmation = confirmationInput.value;
    if (!oldPassphrase) { errorElement.textContent = 'Enter current passphrase'; return; }
    const validation = validatePassphrase(newPassphrase);
    if (!validation.valid) { errorElement.textContent = validation.message; return; }
    if (newPassphrase !== confirmation) { errorElement.textContent = 'New passphrases do not match'; return; }

    button.disabled = true;
    button.textContent = 'Changing...';
    errorElement.textContent = '';

    try {
      await cryptoUiDeps.changeEncryptionPassphrase?.(oldPassphrase, newPassphrase);
      hidePassphraseOverlay(overlay);
      showNotification('Passphrase changed successfully', 'success');
    } catch {
      errorElement.textContent = 'Current passphrase is incorrect';
      button.disabled = false;
      button.textContent = 'Change Passphrase';
    }
  });

  focusInitialPassphraseInput(overlay, oldInput);
}

export function hydrateProtectionSettings(): void {
  const enabled = cryptoUiDeps.getEncryptionEnabled();
  refreshEncryptionSettings({ enabled });
  refreshBackupSettings(getBackupSettingsSnapshot(enabled, localStorage.getItem('labcharts-last-autobackup'), getFolderBackupState()));
}

export function renderEncryptionSection(): string {
  queueMicrotask(hydrateProtectionSettings);
  return '<div data-encryption-settings-root data-settings-protection-view="encryption"></div>';
}

export function renderBackupSection(): string {
  queueMicrotask(hydrateProtectionSettings);
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
