// context-card-dashboard-ai.js - cold-safe AI context and data protection facade

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { pickFolderForBackup } from './backup.js';
import { showEnableEncryptionModal } from './crypto.js';
import { getLensSummary, openKnowledgeBaseModal } from './lens.js';
import { state } from './state.js';
import { getDataProtectionStatus } from './data-protection-status.js';
import { showSyncSetupModal } from './settings-sync-panel.js';
import { showNotification } from './utils.js';
import {
  renderDashboardLensRow, renderDashboardKnowledgeRow,
  renderDashboardPersonalizeCta, renderDashboardProtectionPill,
} from './dashboard-ai-cta-presentation.js';
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

function runDashboardAIAction(name: keyof DashboardAIModule, isCurrent: () => boolean = () => true) {
  const run = (module: DashboardAIModule) => {
    if (!isCurrent()) return false;
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Dashboard AI action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, []) as unknown;
  };
  return invokeCachedModule(dashboardAIModuleLoader, loadDashboardAIModule, run, (err) => {
    if (!isCurrent()) return false;
    console.error(`[context-cards] Could not run ${String(name)}:`, err);
    showNotification('Dashboard context tools could not be loaded. Try again.', 'error');
    return false;
  });
}

export function triggerDNAFilePicker() {
  return runDashboardAIAction('triggerDNAFilePicker');
}

let protectionOpenRequest = 0;
export function openDataProtectionPicker() {
  const ticket = ++protectionOpenRequest, profile = state.currentProfile, origin = state.importedData;
  const modal = typeof document === 'undefined' ? null : document.getElementById('detail-modal');
  const content = modal?.firstElementChild, surface = typeof document === 'undefined' ? null : document.getElementById('main-content')?.firstElementChild;
  return runDashboardAIAction('openDataProtectionPicker', () => ticket === protectionOpenRequest
    && state.currentProfile === profile && state.importedData === origin
    && (typeof document === 'undefined' || (document.getElementById('detail-modal') === modal
      && modal?.firstElementChild === content && document.getElementById('main-content')?.firstElementChild === surface)));
}

let contextOpenRequest = 0;
export function openContextModal() {
  const ticket = ++contextOpenRequest, profile = state.currentProfile, origin = state.importedData;
  const modal = typeof document === 'undefined' ? null : document.getElementById('detail-modal');
  const content = modal?.firstElementChild, surface = typeof document === 'undefined' ? null : document.getElementById('main-content')?.firstElementChild;
  return runDashboardAIAction('openContextModal', () => ticket === contextOpenRequest
    && state.currentProfile === profile && state.importedData === origin
    && (typeof document === 'undefined' || (document.getElementById('detail-modal') === modal
      && modal?.firstElementChild === content && document.getElementById('main-content')?.firstElementChild === surface)));
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

  const lensRow = lens ? renderDashboardLensRow(lens, dashboardAIActionAttrs) : '';
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
  return renderDashboardKnowledgeRow(summary, dashboardAIActionAttrs);
}

function renderPersonalizeAICta(lensSet: boolean, kbSet: boolean) {
  return renderDashboardPersonalizeCta(lensSet, kbSet, dashboardAIActionAttrs);
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
      return renderDashboardProtectionPill('encryption', dashboardAIActionAttrs);
    }
    if (only === 'sync') {
      return renderDashboardProtectionPill('sync', dashboardAIActionAttrs);
    }
    return renderDashboardProtectionPill('backup', dashboardAIActionAttrs);
  }

  return renderDashboardProtectionPill('multiple', dashboardAIActionAttrs);
}
