// @ts-check
// crypto-ui.js — Encryption dialogs, nudges, delegates, and settings UI owner.

import { getErrorMessage } from './caught-error.js';
import { escapeAttr, escapeHTML, showConfirmDialog, showNotification } from './utils.js';
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
  renderFolderBackupSection,
  restoreAutoBackup,
} from './backup.js';

/** @type {Record<string, any>} */
const cryptoUiDeps = {
  changeEncryptionPassphrase: null,
  clearEncryptionSession: null,
  disableEncryptionStorage: null,
  getEncryptionEnabled: () => false,
  migrateEncryptionStorage: null,
  prepareEncryption: null,
  unlockEncryption: null,
};

export function configureCryptoUi(deps = {}) {
  const previous = { ...cryptoUiDeps };
  for (const [key, value] of Object.entries(deps || {})) {
    if (Object.hasOwn(cryptoUiDeps, key) && typeof value === 'function') {
      cryptoUiDeps[key] = value;
    }
  }
  return previous;
}

const needsDataProtectionStylesheet = () => typeof document !== 'undefined'
  && !!document.querySelector('[data-data-protection-stylesheet-anchor]')
  && !isDataProtectionStylesheetLoaded();

function runWithDataProtectionStylesheet(action) {
  if (!needsDataProtectionStylesheet()) return action();
  return loadDataProtectionStylesheetForAction().then(loaded => {
    if (loaded) return action();
    showNotification('Data protection controls could not be loaded. Try again.', 'error');
    return false;
  });
}

const cryptoActionDelegateRoots = new WeakSet();
const CRYPTO_ACTION_DELEGATE_KEY = Symbol.for('getbased.cryptoActionDelegatesInstalled');
const CRYPTO_ACTION_ATTR = 'data-crypto-action';
const CRYPTO_ACTION_SELECTOR = `[${CRYPTO_ACTION_ATTR}]`;

function cryptoActionAttrs(action, attrs = {}) {
  let html = `${CRYPTO_ACTION_ATTR}="${escapeAttr(action)}"`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const attr = key.replace(/[A-Z]/g, character => '-' + character.toLowerCase());
    html += ` data-crypto-${attr}="${escapeAttr(String(value))}"`;
  }
  return html;
}

function closestCryptoAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(CRYPTO_ACTION_SELECTOR)
      : null
  );
}

function readSnapshotActionId(actionElement) {
  const raw = actionElement.dataset.cryptoSnapshotId;
  if (raw == null) return null;
  if (actionElement.dataset.cryptoSnapshotIdType === 'number') {
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  }
  return raw;
}

function handleCryptoActionClick(event) {
  const actionElement = closestCryptoAction(event.target);
  if (!actionElement || !event.currentTarget?.contains?.(actionElement)) return;
  const action = actionElement.getAttribute(CRYPTO_ACTION_ATTR);
  if (action === 'change-passphrase') changePassphrase();
  else if (action === 'disable-encryption') disableEncryption();
  else if (action === 'enable-encryption') showEnableEncryptionModal();
  else if (action === 'export-backup') exportEncryptedBackup();
  else if (action === 'toggle-backup-snapshots') toggleBackupSnapshots();
  else if (action === 'restore-auto-backup') {
    const id = readSnapshotActionId(actionElement);
    if (id == null) return;
    restoreAutoBackup(id);
  } else {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function handleCryptoActionKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionElement = closestCryptoAction(event.target);
  if (!actionElement || actionElement.getAttribute('role') !== 'button') return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  handleCryptoActionClick(event);
}

function handleCryptoActionChange(event) {
  const actionElement = closestCryptoAction(event.target);
  if (!actionElement || !event.currentTarget?.contains?.(actionElement)) return;
  if (actionElement.getAttribute(CRYPTO_ACTION_ATTR) !== 'import-backup') return;
  const fileInput = /** @type {HTMLInputElement} */ (actionElement);
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  importEncryptedBackup(file);
  fileInput.value = '';
  event.stopPropagation();
}

export function installCryptoActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || cryptoActionDelegateRoots.has(root) || root[CRYPTO_ACTION_DELEGATE_KEY]) return;
  cryptoActionDelegateRoots.add(root);
  Object.defineProperty(root, CRYPTO_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  root.addEventListener('click', handleCryptoActionClick);
  root.addEventListener('keydown', handleCryptoActionKeydown);
  root.addEventListener('change', handleCryptoActionChange);
}

if (typeof document !== 'undefined') installCryptoActionDelegates();

let failCount = 0;

export function showPassphraseModal(onSuccess) {
  let overlay = document.getElementById('passphrase-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'passphrase-overlay';
    overlay.className = 'passphrase-overlay';
    document.body.appendChild(overlay);
  }
  failCount = 0;
  renderPassphraseForm(overlay, onSuccess);
}

function renderPassphraseForm(overlay, onSuccess) {
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
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-unlock-input'));
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-unlock-btn'));
  const errorElement = document.getElementById('passphrase-error');
  const forgotButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-forgot-btn'));
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
      overlay.style.display = 'none';
      overlay.innerHTML = '';
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
    const dialog = /** @type {HTMLElement | null} */ (overlay.querySelector('.passphrase-dialog'));
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
      const confirmButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById('passphrase-forgot-confirm')
      );
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
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      location.reload();
    });
  });

  setTimeout(() => input.focus(), 50);
}

function validatePassphrase(passphrase) {
  if (passphrase.length < 8) return { valid: false, message: 'At least 8 characters' };
  if (!/[a-z]/.test(passphrase)) return { valid: false, message: 'At least 1 lowercase letter' };
  if (!/[A-Z]/.test(passphrase)) return { valid: false, message: 'At least 1 uppercase letter' };
  if (!/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(passphrase)) return { valid: false, message: 'At least 1 special character' };
  return { valid: true, message: '' };
}

function getPassphraseStrength(passphrase) {
  let score = 0;
  if (passphrase.length >= 8) score++;
  if (/[a-z]/.test(passphrase)) score++;
  if (/[A-Z]/.test(passphrase)) score++;
  if (/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(passphrase)) score++;
  return score;
}

export function showEnableEncryptionModal() {
  if (needsDataProtectionStylesheet()) {
    return runWithDataProtectionStylesheet(() => showEnableEncryptionModal());
  }
  let overlay = document.getElementById('passphrase-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'passphrase-overlay';
    overlay.className = 'passphrase-overlay';
    document.body.appendChild(overlay);
  }
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
  const passphraseInput = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-set-input'));
  const confirmInput = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-confirm-input'));
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-set-btn'));
  const cancelButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-set-cancel'));
  const errorElement = document.getElementById('passphrase-set-error');
  if (!passphraseInput || !confirmInput || !button || !cancelButton || !errorElement) return;
  overlay.style.display = 'flex';

  const strengthBars = /** @type {NodeListOf<HTMLElement>} */ (overlay.querySelectorAll('.passphrase-strength-bar'));
  const ruleItems = overlay.querySelectorAll('.passphrase-rules li');
  const barColors = ['var(--red)', 'var(--orange)', 'var(--yellow)', 'var(--green)'];
  let migrationStarted = false;

  const updateStrengthMeter = () => {
    const passphrase = passphraseInput.value;
    const score = getPassphraseStrength(passphrase);
    strengthBars.forEach((bar, index) => {
      bar.style.background = index < score ? barColors[score - 1] : 'var(--border)';
    });
    const checks = [
      passphrase.length >= 8,
      /[a-z]/.test(passphrase),
      /[A-Z]/.test(passphrase),
      /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(passphrase),
    ];
    ruleItems.forEach((item, index) => item.classList.toggle('met', checks[index]));
  };
  passphraseInput.addEventListener('input', updateStrengthMeter);

  cancelButton.addEventListener('click', () => {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
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
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      showNotification('Encryption enabled \u2014 keep your passphrase safe', 'success');
      const section = document.getElementById('encryption-section');
      if (section) section.innerHTML = renderEncryptionSection();
    } catch (error) {
      errorElement.textContent = 'Encryption failed: ' + getErrorMessage(error);
      button.disabled = false;
      button.textContent = migrationStarted ? 'Retry Encryption' : 'Enable Encryption';
    }
  });

  confirmInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') button.click();
  });

  setTimeout(() => passphraseInput.focus(), 50);
}

export function maybeShowEncryptionNudge() {
  if (cryptoUiDeps.getEncryptionEnabled()) return;
  if (localStorage.getItem('labcharts-encryption-nudge-dismissed')) return;
  if (needsDataProtectionStylesheet()) {
    return void runWithDataProtectionStylesheet(() => maybeShowEncryptionNudge());
  }
  setTimeout(() => {
    let overlay = document.getElementById('passphrase-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'passphrase-overlay';
      overlay.className = 'passphrase-overlay';
      document.body.appendChild(overlay);
    }
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
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    });
    enableButton.addEventListener('click', () => {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
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
  const hasAnyData = profileList.some(profile => {
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

    let nudgeOverlay = document.getElementById('passphrase-overlay');
    if (!nudgeOverlay) {
      nudgeOverlay = document.createElement('div');
      nudgeOverlay.id = 'passphrase-overlay';
      nudgeOverlay.className = 'passphrase-overlay';
      document.body.appendChild(nudgeOverlay);
    }
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
      nudgeOverlay.style.display = 'none';
      nudgeOverlay.innerHTML = '';
    });
    downloadButton.addEventListener('click', () => {
      nudgeOverlay.style.display = 'none';
      nudgeOverlay.innerHTML = '';
      exportEncryptedBackup();
    });
  }, 500);
}

export async function disableEncryption() {
  if (!await showConfirmDialog('Disable encryption? Your data will be stored in plaintext.')) return;
  try {
    await cryptoUiDeps.disableEncryptionStorage?.();
    showNotification('Encryption disabled', 'info');
    const section = document.getElementById('encryption-section');
    if (section) section.innerHTML = renderEncryptionSection();
  } catch (error) {
    showNotification('Failed to disable encryption: ' + getErrorMessage(error), 'error');
  }
}

export async function changePassphrase() {
  if (needsDataProtectionStylesheet()) {
    return runWithDataProtectionStylesheet(() => changePassphrase());
  }
  let overlay = document.getElementById('passphrase-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'passphrase-overlay';
    overlay.className = 'passphrase-overlay';
    document.body.appendChild(overlay);
  }
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
  const oldInput = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-old-input'));
  const newInput = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-new1-input'));
  const confirmationInput = /** @type {HTMLInputElement | null} */ (document.getElementById('passphrase-new2-input'));
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-change-btn'));
  const cancelButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('passphrase-change-cancel'));
  const errorElement = document.getElementById('passphrase-change-error');
  if (!oldInput || !newInput || !confirmationInput || !button || !cancelButton || !errorElement) return;
  overlay.style.display = 'flex';

  cancelButton.addEventListener('click', () => {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
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
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      showNotification('Passphrase changed successfully', 'success');
    } catch {
      errorElement.textContent = 'Current passphrase is incorrect';
      button.disabled = false;
      button.textContent = 'Change Passphrase';
    }
  });

  setTimeout(() => oldInput.focus(), 50);
}

export function renderEncryptionSection() {
  const enabled = cryptoUiDeps.getEncryptionEnabled();
  if (enabled) {
    return `<div class="encryption-status-card encryption-status-on">
      <div class="encryption-status-icon">&#128274;</div>
      <div class="encryption-status-body">
        <div class="encryption-status-title">Encryption is ON</div>
        <div class="encryption-status-detail">Your medical data, chat history, wearable history, and API keys are encrypted with AES-256-GCM. Display preferences remain unencrypted.</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="import-btn import-btn-secondary" ${cryptoActionAttrs('change-passphrase')}>Change Passphrase</button>
      <button class="import-btn import-btn-secondary" ${cryptoActionAttrs('disable-encryption')}>Disable Encryption</button>
    </div>`;
  }
  return `<div class="encryption-status-card encryption-status-off">
    <div class="encryption-status-icon">&#128275;</div>
    <div class="encryption-status-body">
      <div class="encryption-status-title">Encryption is OFF</div>
      <div class="encryption-status-detail">Your data is stored as plaintext in localStorage. Browser extensions and anyone with filesystem access can read it.</div>
    </div>
  </div>
  <button class="import-btn import-btn-primary" style="margin-top:12px" ${cryptoActionAttrs('enable-encryption')}>Enable Encryption</button>`;
}

export function renderBackupSection() {
  const lastAuto = localStorage.getItem('labcharts-last-autobackup');
  const autoStatus = lastAuto
    ? `Last auto-backup: ${new Date(lastAuto).toLocaleString()}`
    : 'No auto-backups yet';
  return `<div class="ai-provider-desc" style="margin-bottom:10px">Create a full backup of all profiles, data, and chat history. ${cryptoUiDeps.getEncryptionEnabled() ? 'Backups inherit encryption \u2014 same passphrase required to restore.' : 'Backups are unencrypted unless encryption is enabled.'}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="import-btn import-btn-primary" ${cryptoActionAttrs('export-backup')}>Download Backup</button>
    <label class="import-btn import-btn-secondary" style="cursor:pointer;display:inline-flex;align-items:center">
      Restore Backup
      <input type="file" accept=".json" style="display:none" ${cryptoActionAttrs('import-backup')}>
    </label>
  </div>
  <div class="backup-auto-status">${escapeHTML(autoStatus)}</div>
  <div class="backup-snapshots-toggle" ${cryptoActionAttrs('toggle-backup-snapshots')} id="backup-snapshots-toggle" role="button" tabindex="0" style="display:none">
    <span class="privacy-configure-arrow" id="backup-snapshots-arrow">&#9654;</span>
    Recent snapshots
  </div>
  <div class="backup-snapshot-list" id="backup-snapshot-list" style="display:none"></div>
  <div id="backup-folder-section">${renderFolderBackupSection()}</div>`;
}

export async function loadBackupSnapshots() {
  const list = document.getElementById('backup-snapshot-list');
  const toggle = document.getElementById('backup-snapshots-toggle');
  if (!list) return;
  const snapshots = await getAutoBackupSnapshots();
  if (snapshots.length === 0) {
    if (toggle) toggle.style.display = 'none';
    list.style.display = 'none';
    return;
  }
  if (toggle) toggle.style.display = '';
  const shown = snapshots.slice(0, MAX_SNAPSHOTS);
  list.innerHTML = shown.map(snapshot => {
    const date = new Date(snapshot.createdAt).toLocaleString();
    const profileCount = snapshot.snapshot?.profiles ? snapshot.snapshot.profiles.length : '?';
    const actionAttrs = cryptoActionAttrs('restore-auto-backup', {
      snapshotId: snapshot.id,
      snapshotIdType: typeof snapshot.id === 'number' ? 'number' : 'string',
    });
    return `<div class="backup-snapshot-item">
      <div class="backup-snapshot-info">
        <span class="backup-snapshot-date">${escapeHTML(date)}</span>
        <span class="backup-snapshot-meta">${profileCount} profile(s)${snapshot.encrypted ? ' \u2022 encrypted' : ''}</span>
      </div>
      <button class="import-btn import-btn-secondary" style="padding:4px 10px;font-size:12px" ${actionAttrs}>Restore</button>
    </div>`;
  }).join('');
}

export function toggleBackupSnapshots() {
  const list = document.getElementById('backup-snapshot-list');
  const arrow = document.getElementById('backup-snapshots-arrow');
  if (!list) return;
  const open = list.style.display !== 'none';
  list.style.display = open ? 'none' : 'flex';
  if (arrow) arrow.innerHTML = open ? '&#9654;' : '&#9660;';
}
