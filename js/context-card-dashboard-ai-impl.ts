import { configureRuntimeFunctions } from './runtime-callbacks.js';
// context-card-dashboard-ai-impl.js - lazy AI context modal and DNA picker implementation

import { getFolderBackupState, pickFolderForBackup } from './backup.js';
import { getEncryptionEnabled, showEnableEncryptionModal } from './crypto.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { isSyncEnabled } from './sync.js';
import { showSyncSetupModal } from './settings-sync-panel.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';

let dashboardAISyncSetupHandler: () => unknown = showSyncSetupModal;
const dashboardAIDataProtectionDeps: { pickFolderForBackup: () => unknown; showEnableEncryptionModal: () => unknown } = { pickFolderForBackup, showEnableEncryptionModal };
export function configureDashboardAISyncSetup(handler: unknown = showSyncSetupModal) {
  dashboardAISyncSetupHandler = typeof handler === 'function' ? handler as () => unknown : showSyncSetupModal;
}

export function configureDashboardAIDataProtectionDeps(deps: unknown = {}) {
  return configureRuntimeFunctions(dashboardAIDataProtectionDeps, deps as Partial<typeof dashboardAIDataProtectionDeps>, ["pickFolderForBackup","showEnableEncryptionModal"]);
}

// Programmatic DNA file picker. Mirrors the chat onboarding hidden-file-input
// pattern so the same handleDNAFile parser runs.
export function triggerDNAFilePicker() {
  let input = (document.getElementById('dna-dashboard-input') as HTMLInputElement | null);
  if (!input) {
    const newInput = document.createElement('input');
    newInput.type = 'file';
    newInput.id = 'dna-dashboard-input';
    newInput.accept = '.txt,.csv';
    newInput.style.display = 'none';
    newInput.addEventListener('change', () => {
      const f = newInput.files && newInput.files[0];
      if (f) getDnaModuleFunction('handleDNAFile')?.(f);
      newInput.value = '';
    });
    document.body.appendChild(newInput);
    input = newInput;
  }
  input.click();
}

function getDataProtectionStatus() {
  let backupConfigured = false;
  let backupSupported = true;
  try {
    const s = getFolderBackupState();
    backupSupported = !!s?.supported;
    backupConfigured = !!s?.folderName;
  } catch { /* backup not initialised yet */ }
  return {
    encryption: !!getEncryptionEnabled(),
    sync: !!isSyncEnabled(),
    backup: backupConfigured,
    backupSupported,
  };
}

export function openDataProtectionPicker() {
  let overlay = document.getElementById('data-protection-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'data-protection-picker-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    closeModalOverlay(overlay);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const s = getDataProtectionStatus();
  const card = (key: string, icon: string, title: string, sub: string, configured: boolean) => `
    <button type="button" class="dashboard-picker-card" data-pick="${key}" ${configured ? 'data-configured="true"' : ''}>
      <span class="dashboard-picker-icon" aria-hidden="true">${icon}</span>
      <span class="dashboard-picker-title">${title} ${configured ? '<span class="dashboard-picker-check" aria-hidden="true">&#10003;</span>' : ''}</span>
      <span class="dashboard-picker-sub">${sub}</span>
      <span class="dashboard-picker-action">${configured ? 'Configured' : 'Set up &rarr;'}</span>
    </button>`;
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Protect your data" style="max-width:560px">
    <p class="confirm-message" style="margin-bottom:14px">Protect your data</p>
    <div class="dashboard-picker-grid">
      ${card('encryption', '&#128274;', 'Encryption', 'Encrypt your data at rest with a passphrase. Browser extensions and anyone with disk access cannot read it without the passphrase.', s.encryption)}
      ${card('sync', '&#128225;', 'Cross-device Sync', 'End-to-end encrypted sync to your other devices. A 24-word mnemonic is your only key; the relay sees ciphertext.', s.sync)}
      ${s.backupSupported
        ? card('backup', '&#128190;', 'Auto-backup', 'Save daily snapshots to a local folder (Proton Drive, Dropbox, NAS, USB drive). Survives browser crashes and reinstalls.', s.backup)
        : ''}
    </div>
    <div class="confirm-actions" style="margin-top:6px">
      <button class="confirm-btn confirm-btn-cancel" id="data-protection-picker-cancel">Close</button>
    </div>
  </div>`;
  openModalOverlay(overlay, {
    initialFocus: '.dashboard-picker-card:not([data-configured="true"]),.dashboard-picker-card,#data-protection-picker-cancel',
    focusDelay: 50,
  });
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const cancelButton = (overlay.querySelector('#data-protection-picker-cancel') as HTMLButtonElement | null);
  if (cancelButton) cancelButton.onclick = close;
  overlay.querySelectorAll('.dashboard-picker-card').forEach(btn => {
    const button = (btn as HTMLButtonElement);
    button.onclick = () => {
      const pick = button.getAttribute('data-pick');
      const isConfigured = button.getAttribute('data-configured') === 'true';
      if (isConfigured) { close(); return; }
      close();
      if (pick === 'encryption') dashboardAIDataProtectionDeps.showEnableEncryptionModal();
      else if (pick === 'sync') dashboardAISyncSetupHandler();
      else if (pick === 'backup') dashboardAIDataProtectionDeps.pickFolderForBackup();
    };
  });
}

export { openContextHub as openContextModal, openContextHub as openPersonalizeAIPicker } from './context-hub-view.js';
