// context-card-dashboard-ai.js - cold-safe AI context and data protection facade

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { getFolderBackupState, pickFolderForBackup } from './backup.js';
import { getEncryptionEnabled, showEnableEncryptionModal } from './crypto.js';
import { getLensSummary, openKnowledgeBaseModal } from './lens.js';
import { state } from './state.js';
import { isSyncEnabled } from './sync.js';
import { showSyncSetupModal } from './settings-sync-panel.js';
import { escapeHTML, showNotification } from './utils.js';
import {
  configureDashboardAIActionDelegates,
  dashboardAIActionAttrs,
  installDashboardAIActionDelegates,
} from './context-card-dashboard-ai-actions.js';
import { openInterpretiveLensEditorRuntime } from './context-cards-runtime.js';

type DashboardAIModule = typeof import('./context-card-dashboard-ai-impl.js');
interface DashboardAIProtectionUpdates { pickFolderForBackup?: unknown; showEnableEncryptionModal?: unknown }
interface DataProtectionReader { encryption?: unknown; sync?: unknown; backup?: unknown; backupSupported?: unknown }

const dashboardAIModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadDashboardAIRetryModule() : import('./context-card-dashboard-ai-impl.js'),
  module => {
    module.configureDashboardAISyncSetup(dashboardAISyncSetupHandler);
    module.configureDashboardAIDataProtectionDeps(dashboardAIDataProtectionDeps);
    return module;
  },
);

let dashboardAISyncSetupHandler: () => unknown = showSyncSetupModal;
const dashboardAIDataProtectionDeps: { pickFolderForBackup: () => unknown; showEnableEncryptionModal: () => unknown } = { pickFolderForBackup, showEnableEncryptionModal };

export function isDashboardAIModuleLoaded() {
  return dashboardAIModuleLoader.module !== null;
}

function loadDashboardAIRetryModule(): Promise<typeof import('./context-card-dashboard-ai-impl.js')> {
  return import('./context-card-dashboard-ai-impl.js?lazy-retry=1' as './context-card-dashboard-ai-impl.js');
}

export function loadDashboardAIModule() {
  return dashboardAIModuleLoader.load();
}

export function configureDashboardAISyncSetup(handler: unknown = showSyncSetupModal) {
  dashboardAISyncSetupHandler = typeof handler === 'function' ? handler as () => unknown : showSyncSetupModal;
  dashboardAIModuleLoader.module?.configureDashboardAISyncSetup(dashboardAISyncSetupHandler);
}

export function configureDashboardAIDataProtectionDeps(deps: unknown = {}) {
  const previous = { ...dashboardAIDataProtectionDeps };
  if (typeof (deps as DashboardAIProtectionUpdates).pickFolderForBackup === 'function') dashboardAIDataProtectionDeps.pickFolderForBackup = (deps as DashboardAIProtectionUpdates).pickFolderForBackup as () => unknown;
  if (typeof (deps as DashboardAIProtectionUpdates).showEnableEncryptionModal === 'function') dashboardAIDataProtectionDeps.showEnableEncryptionModal = (deps as DashboardAIProtectionUpdates).showEnableEncryptionModal as () => unknown;
  dashboardAIModuleLoader.module?.configureDashboardAIDataProtectionDeps(deps);
  return previous;
}

function runDashboardAIAction(name: keyof DashboardAIModule) {
  const run = (module: DashboardAIModule) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Dashboard AI action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, []) as unknown;
  };
  return invokeCachedModule(dashboardAIModuleLoader, loadDashboardAIModule, run, (err) => {
    console.error(`[context-cards] Could not run ${String(name)}:`, err);
    showNotification('Dashboard context tools could not be loaded. Try again.', 'error');
    return false;
  });
}

export function triggerDNAFilePicker() {
  return runDashboardAIAction('triggerDNAFilePicker');
}

export function openDataProtectionPicker() {
  return runDashboardAIAction('openDataProtectionPicker');
}

export function openContextModal() {
  return runDashboardAIAction('openContextModal');
}

export function openPersonalizeAIPicker() {
  return runDashboardAIAction('openPersonalizeAIPicker');
}

configureDashboardAIActionDelegates({
  'open-interpretive-lens': () => openInterpretiveLensEditorRuntime(),
  'open-knowledge-base': () => openKnowledgeBaseModal(),
  'open-personalize-ai-picker': () => openContextModal(),
  'enable-encryption': () => dashboardAIDataProtectionDeps.showEnableEncryptionModal(),
  'setup-sync': () => dashboardAISyncSetupHandler(),
  'setup-backup': () => dashboardAIDataProtectionDeps.pickFolderForBackup(),
  'open-data-protection-picker': () => openDataProtectionPicker(),
});

if (typeof document !== 'undefined') installDashboardAIActionDelegates();

export { installDashboardAIActionDelegates };

// Dashboard "AI personalization" zone:
//   - Full-width row for the Interpretive Lens, only if it is set.
//   - Full-width row for the Knowledge Base, only if a library is set.
//   - Inline pill CTA when Lens or KB is unset.
export function renderInterpretiveLensSection() {
  const lens = (((state.importedData as { interpretiveLens?: unknown }).interpretiveLens || '') as { trim(): unknown }).trim();
  let summary: ReturnType<typeof getLensSummary> | null; try { summary = getLensSummary(); } catch { summary = null; }
  const kbConfigured = !!(summary && summary.configured);
  const kbEnabled = !!(summary && summary.enabled);

  const lensRow = lens
    ? `<div class="lens-section" role="button" tabindex="0" aria-label="Edit Interpretive Lens" ${dashboardAIActionAttrs('open-interpretive-lens')} title="Interpretive Lens - click to edit"><span class="lens-section-icon">&#129694;</span><span class="lens-section-body"><span class="lens-section-label">Interpretive Lens</span><span class="lens-section-text">${escapeHTML(lens)}</span></span><span class="lens-section-edit">&#9998;</span></div>`
    : '';
  const kbRow = (kbConfigured || kbEnabled) ? renderKnowledgeBaseRow(summary as ReturnType<typeof getLensSummary>) : '';
  const aiCta = renderPersonalizeAICta(!!lens, kbConfigured);
  return lensRow + kbRow + aiCta + renderDataProtectionCta();
}

export function renderKnowledgeBaseSection() {
  let summary: ReturnType<typeof getLensSummary> | null; try { summary = getLensSummary(); } catch { return ''; }
  if (!summary || (!summary.configured && !summary.enabled)) return '';
  return renderKnowledgeBaseRow(summary);
}

function renderKnowledgeBaseRow(summary: ReturnType<typeof getLensSummary>) {
  const docFragment = (summary.docCount != null && summary.docCount > 0)
    ? ` &middot; ${summary.docCount} document${summary.docCount !== 1 ? 's' : ''}`
    : '';
  const rewriteFragment = summary.aiAvailable
    ? ` &middot; query rewriting ${summary.multiQueryOn ? 'on' : 'off'}`
    : '';
  const emptyEnabledFragment = (!summary.configured && summary.enabled) ? ' &middot; enabled, no documents indexed yet' : '';
  const detail = `${escapeHTML(summary.displayName)}${emptyEnabledFragment}${docFragment}${rewriteFragment}`;
  return `<div class="lens-section" role="button" tabindex="0" aria-label="Manage Knowledge Base" ${dashboardAIActionAttrs('open-knowledge-base')} title="Knowledge Base - click to manage"><span class="lens-section-icon">&#128218;</span><span class="lens-section-body"><span class="lens-section-label">Knowledge Base</span><span class="lens-section-text">${detail}</span></span><span class="lens-section-edit">&#9998;</span></div>`;
}

function renderPersonalizeAICta(lensSet: boolean, kbSet: boolean) {
  if (lensSet && kbSet) return '';
  let icon: string, label: string, action: string;
  if (!lensSet && !kbSet) {
    icon = '&#10024;';
    label = 'Personalize how AI answers';
    action = 'open-personalize-ai-picker';
  } else if (!kbSet) {
    icon = '&#128218;';
    label = 'Connect a knowledge base';
    action = 'open-knowledge-base';
  } else {
    icon = '&#129694;';
    label = 'Set an interpretive lens';
    action = 'open-interpretive-lens';
  }
  return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs(action)} aria-label="${escapeHTML(label)}">
    <span class="dashboard-cta-icon" aria-hidden="true">${icon}</span>
    <span class="dashboard-cta-plus" aria-hidden="true">+</span>
    <span>${escapeHTML(label)}</span>
  </button>`;
}

function getDataProtectionStatus() {
  let backupConfigured = false;
  let backupSupported = true;
  try {
    const backupState = getFolderBackupState();
    backupSupported = !!backupState?.supported;
    backupConfigured = !!backupState?.folderName;
  } catch { /* backup not initialised yet */ }
  return {
    encryption: !!getEncryptionEnabled(),
    sync: !!isSyncEnabled(),
    backup: backupConfigured,
    backupSupported,
  };
}

// Pure render: tests pass explicit state to avoid monkey-patching module-level
// imports, while production reads the current feature status.
export function renderDataProtectionCta(stateOverride?: unknown) {
  const protectionState = (stateOverride || getDataProtectionStatus()) as DataProtectionReader;
  const backupOk = protectionState.backup || !protectionState.backupSupported;
  const missing = [
    !protectionState.encryption ? 'encryption' : null,
    !protectionState.sync ? 'sync' : null,
    !backupOk ? 'backup' : null,
  ].filter(Boolean);
  if (missing.length === 0) return '';

  if (missing.length === 1) {
    const only = missing[0];
    if (only === 'encryption') {
      return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs('enable-encryption')} aria-label="Enable encryption">
        <span class="dashboard-cta-icon" aria-hidden="true">&#128274;</span>
        <span class="dashboard-cta-plus" aria-hidden="true">+</span>
        <span>Enable encryption</span>
      </button>`;
    }
    if (only === 'sync') {
      return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs('setup-sync')} aria-label="Set up cross-device sync">
        <span class="dashboard-cta-icon" aria-hidden="true">&#128225;</span>
        <span class="dashboard-cta-plus" aria-hidden="true">+</span>
        <span>Sync to other devices</span>
      </button>`;
    }
    return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs('setup-backup')} aria-label="Set up auto-backup">
      <span class="dashboard-cta-icon" aria-hidden="true">&#128190;</span>
      <span class="dashboard-cta-plus" aria-hidden="true">+</span>
      <span>Set up auto-backup</span>
    </button>`;
  }

  return `<button type="button" class="dashboard-cta" ${dashboardAIActionAttrs('open-data-protection-picker')} aria-label="Protect your data">
    <span class="dashboard-cta-icon" aria-hidden="true">&#128737;</span>
    <span class="dashboard-cta-plus" aria-hidden="true">+</span>
    <span>Protect your data</span>
  </button>`;
}
