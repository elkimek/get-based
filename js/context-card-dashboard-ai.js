// @ts-check
// context-card-dashboard-ai.js - cold-safe AI context and data protection facade

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

/** @typedef {typeof import('./context-card-dashboard-ai-impl.js')} DashboardAIModule */
/** @type {Promise<DashboardAIModule> | null} */
let dashboardAIModulePromise = null;
/** @type {DashboardAIModule | null} */
let dashboardAIModule = null;
let useDashboardAIRetryUrl = false;

let dashboardAISyncSetupHandler = showSyncSetupModal;
const dashboardAIDataProtectionDeps = { pickFolderForBackup, showEnableEncryptionModal };

export function isDashboardAIModuleLoaded() {
  return dashboardAIModule !== null;
}

/** @returns {Promise<DashboardAIModule>} */
function loadDashboardAIRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./context-card-dashboard-ai-impl.js?lazy-retry=1');
}

/** @returns {Promise<DashboardAIModule>} */
export function loadDashboardAIModule() {
  if (!dashboardAIModulePromise) {
    const load = useDashboardAIRetryUrl
      ? loadDashboardAIRetryModule()
      : import('./context-card-dashboard-ai-impl.js');
    dashboardAIModulePromise = load
      .then(module => {
        dashboardAIModule = module;
        module.configureDashboardAISyncSetup(dashboardAISyncSetupHandler);
        module.configureDashboardAIDataProtectionDeps(dashboardAIDataProtectionDeps);
        return module;
      })
      .catch(err => {
        dashboardAIModulePromise = null;
        dashboardAIModule = null;
        useDashboardAIRetryUrl = true;
        throw err;
      });
  }
  return dashboardAIModulePromise;
}

export function configureDashboardAISyncSetup(handler = showSyncSetupModal) {
  dashboardAISyncSetupHandler = typeof handler === 'function' ? handler : showSyncSetupModal;
  dashboardAIModule?.configureDashboardAISyncSetup(dashboardAISyncSetupHandler);
}

export function configureDashboardAIDataProtectionDeps(deps = {}) {
  const previous = { ...dashboardAIDataProtectionDeps };
  if (typeof deps.pickFolderForBackup === 'function') dashboardAIDataProtectionDeps.pickFolderForBackup = deps.pickFolderForBackup;
  if (typeof deps.showEnableEncryptionModal === 'function') dashboardAIDataProtectionDeps.showEnableEncryptionModal = deps.showEnableEncryptionModal;
  dashboardAIModule?.configureDashboardAIDataProtectionDeps(deps);
  return previous;
}

/** @param {keyof DashboardAIModule} name */
function runDashboardAIAction(name) {
  const run = (/** @type {DashboardAIModule} */ module) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Dashboard AI action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, []);
  };
  try {
    if (dashboardAIModule) return run(dashboardAIModule);
    return loadDashboardAIModule()
      .then(run)
      .catch(err => {
        console.error(`[context-cards] Could not run ${String(name)}:`, err);
        showNotification('Dashboard context tools could not be loaded. Try again.', 'error');
        return false;
      });
  } catch (err) {
    console.error(`[context-cards] Could not run ${String(name)}:`, err);
    showNotification('Dashboard context tools could not be loaded. Try again.', 'error');
    return false;
  }
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
  const lens = (state.importedData.interpretiveLens || '').trim();
  let summary; try { summary = getLensSummary(); } catch { summary = null; }
  const kbConfigured = !!(summary && summary.configured);
  const kbEnabled = !!(summary && summary.enabled);

  const lensRow = lens
    ? `<div class="lens-section" role="button" tabindex="0" aria-label="Edit Interpretive Lens" ${dashboardAIActionAttrs('open-interpretive-lens')} title="Interpretive Lens - click to edit"><span class="lens-section-icon">&#129694;</span><span class="lens-section-body"><span class="lens-section-label">Interpretive Lens</span><span class="lens-section-text">${escapeHTML(lens)}</span></span><span class="lens-section-edit">&#9998;</span></div>`
    : '';
  const kbRow = (kbConfigured || kbEnabled) ? renderKnowledgeBaseRow(summary) : '';
  const aiCta = renderPersonalizeAICta(!!lens, kbConfigured);
  return lensRow + kbRow + aiCta + renderDataProtectionCta();
}

export function renderKnowledgeBaseSection() {
  let summary; try { summary = getLensSummary(); } catch { return ''; }
  if (!summary || (!summary.configured && !summary.enabled)) return '';
  return renderKnowledgeBaseRow(summary);
}

function renderKnowledgeBaseRow(summary) {
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

function renderPersonalizeAICta(lensSet, kbSet) {
  if (lensSet && kbSet) return '';
  let icon, label, action;
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
export function renderDataProtectionCta(stateOverride) {
  const protectionState = stateOverride || getDataProtectionStatus();
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
