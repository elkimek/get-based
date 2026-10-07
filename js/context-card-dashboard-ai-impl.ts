import { configureRuntimeFunctions } from './runtime-callbacks.js';
// context-card-dashboard-ai-impl.js - lazy AI context modal and DNA picker implementation

import { pickFolderForBackup } from './backup.js';
import { showEnableEncryptionModal } from './crypto.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { showSyncSetupModal } from './settings-sync-panel.js';
import { openDataProtectionView } from './data-protection-picker-view.js';

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

export function openDataProtectionPicker() {
  return openDataProtectionView({
    encryption: () => dashboardAIDataProtectionDeps.showEnableEncryptionModal(),
    sync: () => dashboardAISyncSetupHandler(),
    backup: () => dashboardAIDataProtectionDeps.pickFolderForBackup(),
  });
}

export { openContextHub as openContextModal, openContextHub as openPersonalizeAIPicker } from './context-hub-view.js';
