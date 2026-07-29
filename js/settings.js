// @ts-check
// settings.js — Settings modal (profile, display, AI provider, privacy)

import { isDebugMode, setDebugMode, setAnalyticsEnabled, showNotification, showConfirmDialog } from './utils.js';
import { applyAccentOverride, setTimeFormat } from './theme.js';
import { switchUnitSystem, toggleAltUnits, switchRangeMode } from './data.js';
import { getAIProvider, hasAIProvider, isAIPaused, setOllamaPIIModel } from './api.js';
import { renderEncryptionSection, renderBackupSection, loadBackupSnapshots } from './crypto.js';
import { renderSyncSection, renderMessengerSection, hydrateSettingsSyncPanel } from './settings-sync-panel.js';
import { renderWearablesSettingsSection } from './wearables-settings-panel.js';
import { setProductRecsEnabled } from './recommendations.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  configureSettingsProviderBridgeDeps,
  initSettingsProviderPanels,
  renderAIProviderPanelBridge,
  setSettingsProviderHadProvider,
  switchAIProviderBridge,
  testPIIOllamaConnectionBridge,
  toggleAIPauseBridge,
} from './settings-provider-bridge.js';
import {
  requestSettingsFrame,
  settingsMediaMatches,
} from './settings-runtime.js';
import { configureSettingsModuleBridge } from './settings-runtime-bridge.js';
import {
  closestSettingsTarget,
  getSettingsProxyToggle,
} from './settings-event-target.js';
import {
  renderDisplaySettingsPanel,
  updateDisplaySettingsPanel,
} from './settings-display-panel.js';
import {
  closeTweaksPanel,
  configureSettingsTweaksRuntime,
  openTweaksPanel,
  scheduleSettingsThemeChange,
  selectTweaksAccent,
  selectTweaksTheme,
  toggleTweaksCrtEffects,
  toggleTweaksSunsetMode,
  updateTweaksUI,
} from './settings-tweaks.js';
import {
  installSunDataSourceDelegates,
  renderPrivacyAnalyticsSection,
  renderPrivacySection,
  renderSunDataSourceSettings,
  toggleOllamaPII,
  togglePrivacyConfigure,
  updatePrivacyStatusCard,
} from './settings-privacy.js';
import { loadPdfImport } from './import-loader.js';
import { startGuidedTour } from './tour.js';
import { getActiveProfileId } from './profile.js';
import { openChangelog } from './changelog.js';
import { updateChatNudgeRuntime } from './chat-runtime.js';
import { isPIIEligibleModel } from './local-ai-discovery.js';
import {
  confirmDisablePIIReview,
  refreshDataEntriesSection,
  removeImportedEntryFromSettings,
  renameImportedEntryDateFromSettings,
  renderAIUsageSection,
  renderDataEntriesSection,
  resetCurrentProfileUsage,
} from './settings-data.js';
import {
  openImportBenchmarksModal,
  renderImportBenchmarksEntrySection,
} from './settings-import-benchmark-controller.js';
import {
  isWearablesStylesheetLoaded,
  loadWearablesStylesheetForAction,
} from './wearables-runtime.js';

/** @typedef {Window & typeof globalThis & Record<string, any>} SettingsWindow */

const settingsWindow = /** @type {SettingsWindow} */ (window);

/**
 * @typedef {{
 *   clearAllData: () => Promise<void> | void,
 *   exportAllDataJSON: () => Promise<void> | void,
 *   exportClientJSON: (profileId?: string | null) => Promise<void> | void,
 *   getActiveProfileId: () => string | null,
 *   navigate: (view: string) => void,
 *   openFeedbackModal: () => void,
 *   openProfileShareModal: (profileId?: string) => void,
 *   clearDashboardWidgets: () => void,
 *   resetDashboardWidgets: () => void,
 *   toggleDashboardOrganizeMode: (force?: boolean) => void,
 *   refreshMobileDashboardActiveTab: () => void,
 * }} SettingsRuntime
 */

/** @type {SettingsRuntime} */
const settingsRuntime = {
  clearAllData: () => {},
  exportAllDataJSON: () => {},
  exportClientJSON: () => {},
  getActiveProfileId,
  navigate: () => {},
  openFeedbackModal: () => {},
  openProfileShareModal: () => {},
  clearDashboardWidgets: () => {},
  resetDashboardWidgets: () => {},
  toggleDashboardOrganizeMode: () => {},
  refreshMobileDashboardActiveTab: () => {},
};

/** @param {Partial<SettingsRuntime>} [runtime] */
export function configureSettingsRuntime(runtime = {}) {
  Object.assign(settingsRuntime, runtime);
}

export {
  applyAccentOverride,
  closeTweaksPanel,
  confirmDisablePIIReview,
  openTweaksPanel,
  refreshDataEntriesSection,
  renderPrivacySection,
  renderSunDataSourceSettings,
  selectTweaksAccent,
  selectTweaksTheme,
  togglePrivacyConfigure,
  toggleOllamaPII,
  toggleTweaksCrtEffects,
  toggleTweaksSunsetMode,
  updateTweaksUI,
  updatePrivacyStatusCard,
  removeImportedEntryFromSettings,
  renameImportedEntryDateFromSettings,
  renderDataEntriesSection,
  resetCurrentProfileUsage,
};

// ═══════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════
let _activeSettingsTab = 'display';

function requestSettingsScrollFrame(callback) {
  const frame = requestSettingsFrame(callback);
  if (frame === null) {
    setTimeout(callback, 0);
  }
}

settingsWindow.handleThemeChange = scheduleSettingsThemeChange;

function applySettingsToggle(actionEl) {
  if (actionEl instanceof HTMLInputElement && actionEl.disabled) return false;

  const action = actionEl.dataset.settingsAction;
  const checked = actionEl instanceof HTMLInputElement && actionEl.checked;
  if (action === 'set-product-recs') {
    setProductRecsEnabled(checked);
    settingsRuntime.navigate('dashboard');
    return true;
  }
  if (action === 'set-debug-mode') {
    setDebugMode(checked);
    const usageSection = document.getElementById('ai-usage-section');
    if (usageSection) usageSection.innerHTML = renderAIUsageSection();
    return true;
  }
  if (action === 'toggle-ai-pause') {
    void toggleAIPauseBridge(checked);
    return true;
  }
  if (action === 'toggle-pii-local') {
    toggleOllamaPII(checked);
    return true;
  }
  if (action === 'toggle-pii-review') {
    if (actionEl instanceof HTMLInputElement) void confirmDisablePIIReview(actionEl);
    return true;
  }
  if (action === 'set-analytics') {
    setAnalyticsEnabled(checked);
    return true;
  }
  return false;
}

function isSettingsToggleAction(actionEl) {
  return actionEl.dataset.settingsAction === 'set-product-recs'
    || actionEl.dataset.settingsAction === 'set-debug-mode'
    || actionEl.dataset.settingsAction === 'toggle-ai-pause'
    || actionEl.dataset.settingsAction === 'toggle-pii-local'
    || actionEl.dataset.settingsAction === 'toggle-pii-review'
    || actionEl.dataset.settingsAction === 'set-analytics';
}

async function handleSettingsClick(event) {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  const toggleInput = getSettingsProxyToggle(event, '[data-settings-action]', modal);
  if (toggleInput && isSettingsToggleAction(toggleInput)) {
    event.preventDefault();
    toggleInput.checked = !toggleInput.checked;
    applySettingsToggle(toggleInput);
    return;
  }

  const tabButton = closestSettingsTarget(event, '[data-settings-tab]', modal);
  if (tabButton) {
    event.preventDefault();
    await switchSettingsTab(tabButton.dataset.settingsTab || 'display');
    return;
  }

  const actionEl = closestSettingsTarget(event, '[data-settings-action]', modal);
  if (!actionEl) return;

  const action = actionEl.dataset.settingsAction;
  if (!action) return;

  if (action === 'close') {
    event.preventDefault();
    closeSettingsModal();
  } else if (action === 'select-theme') {
    event.preventDefault();
    scheduleSettingsThemeChange(actionEl.dataset.themeId || 'dark');
  } else if (action === 'switch-unit') {
    event.preventDefault();
    switchUnitSystem(actionEl.dataset.unit || 'EU');
    updateSettingsUI();
  } else if (action === 'toggle-alt-units') {
    event.preventDefault();
    toggleAltUnits(actionEl.dataset.altUnits === 'on');
    updateSettingsUI();
  } else if (action === 'switch-range') {
    event.preventDefault();
    switchRangeMode(actionEl.dataset.range || 'optimal');
    updateSettingsUI();
  } else if (action === 'set-time-format') {
    event.preventDefault();
    setTimeFormat(actionEl.dataset.timefmt === '12h' ? '12h' : '24h');
    updateSettingsUI();
  } else if (action === 'open-tweaks') {
    event.preventDefault();
    closeSettingsModal();
    setTimeout(() => openTweaksPanel(), 120);
  } else if (action === 'start-guided-tour') {
    event.preventDefault();
    closeSettingsModal();
    setTimeout(() => startGuidedTour(false), 300);
  } else if (action === 'open-changelog') {
    event.preventDefault();
    closeSettingsModal();
    setTimeout(() => openChangelog(true), 300);
  } else if (action === 'switch-ai-provider') {
    event.preventDefault();
    switchAIProviderBridge(actionEl.dataset.provider || 'openrouter');
  } else if (action === 'toggle-privacy-configure') {
    event.preventDefault();
    togglePrivacyConfigure();
  } else if (action === 'test-pii-ollama') {
    event.preventDefault();
    void testPIIOllamaConnectionBridge();
  } else if (action === 'rename-imported-entry') {
    event.preventDefault();
    void renameImportedEntryDateFromSettings(actionEl.dataset.entryDate || '');
  } else if (action === 'remove-imported-entry') {
    event.preventDefault();
    void removeImportedEntryFromSettings(actionEl.dataset.entryDate || '');
  } else if (action === 'review-import') {
    event.preventDefault();
    try {
      const { openImportReviewFromSnapshot } = await loadPdfImport();
      closeSettingsModal();
      openImportReviewFromSnapshot(actionEl.dataset.snapId || '');
    } catch (err) {
      if (isDebugMode()) console.error('Review import snapshot failed:', err);
      showNotification('Could not open import review. Reload and try again.', 'error');
    }
  } else if (action === 'remove-import-snapshot') {
    event.preventDefault();
    const confirmed = await showConfirmDialog('Delete this import? This will remove all markers from this file and cannot be undone.');
    if (!confirmed) return;
    try {
      const { deleteImportSnapshot } = await loadPdfImport();
      const ok = await deleteImportSnapshot(actionEl.dataset.snapId || '');
      if (ok) refreshDataEntriesSection();
    } catch (err) {
      if (isDebugMode()) console.error('Delete import snapshot failed:', err);
      showNotification('Could not delete import. Reload and try again.', 'error');
    }
  } else if (action === 'export-client') {
    event.preventDefault();
    settingsRuntime.exportClientJSON(settingsRuntime.getActiveProfileId());
  } else if (action === 'share-profile') {
    event.preventDefault();
    closeSettingsModal();
    setTimeout(() => settingsRuntime.openProfileShareModal(), 120);
  } else if (action === 'export-all-clients') {
    event.preventDefault();
    settingsRuntime.exportAllDataJSON();
  } else if (action === 'clear-all-data') {
    event.preventDefault();
    settingsRuntime.clearAllData();
  } else if (action === 'reset-profile-usage') {
    event.preventDefault();
    resetCurrentProfileUsage();
  } else if (action === 'open-import-benchmarks') {
    event.preventDefault();
    openImportBenchmarksModal();
  }
}

function handleSettingsChange(event) {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  const actionEl = closestSettingsTarget(event, '[data-settings-action]', modal);
  if (!actionEl) return;

  if (isSettingsToggleAction(actionEl)) {
    applySettingsToggle(actionEl);
    return;
  }

  const action = actionEl.dataset.settingsAction;
  if (action === 'set-pii-model') {
    const model = actionEl instanceof HTMLSelectElement ? actionEl.value : '';
    if (!isPIIEligibleModel(model)) {
      showNotification('Cloud and embedding models cannot be used for privacy protection.', 'error');
      return;
    }
    setOllamaPIIModel(model);
    updatePrivacyStatusCard();
  }
}

function installSettingsDelegates(modal) {
  if (!modal || modal.dataset.delegatedActions === '1') return;
  modal.dataset.delegatedActions = '1';
  modal.addEventListener('click', handleSettingsClick);
  modal.addEventListener('change', handleSettingsChange);
}

installSunDataSourceDelegates();

export function openSettingsModal(tab) {
  setSettingsProviderHadProvider(hasAIProvider());
  const overlay = document.getElementById('settings-modal-overlay');
  const modal = document.getElementById('settings-modal');
  if (!overlay || !modal) return;
  const provider = getAIProvider();
  // Legacy v1.27 tab id 'integrations' — same redirect as switchSettingsTab.
  // Older deep-links / tour steps / external links may still pass it.
  if (tab === 'integrations') tab = 'wearables';
  if (tab === 'wearables' && !isWearablesStylesheetLoaded()) {
    return loadWearablesStylesheetForAction()
      .then(loaded => loaded ? openSettingsModal(tab) : false);
  }
  if (tab) _activeSettingsTab = tab;

  modal.className = 'modal settings-modal';
  modal.innerHTML = `
    <div class="gb-modal-head settings-modal-head">
      <div>
        <div class="gb-modal-kicker">Controls</div>
        <div class="gb-modal-title">Settings</div>
      </div>
      <button class="modal-close" aria-label="Close" data-settings-action="close">&times;</button>
    </div>

    <div class="settings-layout">
    <div class="settings-tabs-bar" role="tablist" aria-label="Settings sections">
      <button role="tab" aria-selected="${_activeSettingsTab === 'display'}" aria-controls="settings-tab-display" tabindex="${_activeSettingsTab === 'display' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'display' ? ' active' : ''}" data-tab="display" data-settings-tab="display">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        Display
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'ai'}" aria-controls="settings-tab-ai" tabindex="${_activeSettingsTab === 'ai' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'ai' ? ' active' : ''}" data-tab="ai" data-settings-tab="ai">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
        AI
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'privacy'}" aria-controls="settings-tab-privacy" tabindex="${_activeSettingsTab === 'privacy' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'privacy' ? ' active' : ''}" data-tab="privacy" data-settings-tab="privacy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Privacy
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'data'}" aria-controls="settings-tab-data" tabindex="${_activeSettingsTab === 'data' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'data' ? ' active' : ''}" data-tab="data" data-settings-tab="data">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Data
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'wearables'}" aria-controls="settings-tab-wearables" tabindex="${_activeSettingsTab === 'wearables' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'wearables' ? ' active' : ''}" data-tab="wearables" data-settings-tab="wearables">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 2"/><path d="M9 2h6M9 22h6"/></svg>
        Wearables
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'agent'}" aria-controls="settings-tab-agent" tabindex="${_activeSettingsTab === 'agent' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'agent' ? ' active' : ''}" data-tab="agent" data-settings-tab="agent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="14" r="4"/><path d="m10.5 11 7.5-7.5M17 6l3 3M14 9l3 3"/></svg>
        Agent Access
      </button>
    </div>
    <div class="settings-content">

    ${renderDisplaySettingsPanel(_activeSettingsTab === 'display')}

    <!-- AI Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'ai' ? ' active' : ''}" data-tab-panel="ai">
      <div class="settings-group-title">Provider</div>

      <div class="settings-section">
        <div class="settings-action-row" style="margin-bottom:12px">
          <div class="settings-copy">
            <div class="settings-copy-title">AI features</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="ai-pause-toggle" ${isAIPaused() ? '' : 'checked'} data-settings-action="toggle-ai-pause">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="ai-model-tip">Use a state-of-the-art model (Claude, GPT, Gemini) for medical data.<br>Stick with the same model across imports to keep marker keys consistent.</div>
        <div class="ai-provider-toggle">
          <button class="ai-provider-btn${provider === 'ppq' ? ' active' : ''}" data-provider="ppq" data-settings-action="switch-ai-provider"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-3.2 0-7-2.4-7-7 0-3.1 2.1-5.7 4-7.6.3-.3.8-.1.8.4v2.5c0 .2.2.3.3.2C12 9.6 13.5 5.3 13.6 2.2c0-.3.4-.5.6-.2C17.3 5.7 21 10.3 21 14.5 21 19.6 17 23 12 23z"/></svg> PPQ</button>
          <button class="ai-provider-btn${provider === 'routstr' ? ' active' : ''}" data-provider="routstr" data-settings-action="switch-ai-provider"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg> Routstr</button>
          <button class="ai-provider-btn${provider === 'openrouter' ? ' active' : ''}" data-provider="openrouter" data-settings-action="switch-ai-provider"><svg class="ai-provider-logo" viewBox="0 0 512 512" fill="currentColor" stroke="currentColor"><path d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945" stroke-width="90" fill="none"/><path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z" stroke="none"/><path d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377" stroke-width="90" fill="none"/><path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z" stroke="none"/></svg> OpenRouter</button>
          <button class="ai-provider-btn${provider === 'venice' ? ' active' : ''}" data-provider="venice" data-settings-action="switch-ai-provider"><svg class="ai-provider-logo" viewBox="0 0 326 366" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M105.481 245.984C99.4744 241.518 92.2244 237.777 84.2074 235.504C76.1903 233.231 67.406 232.427 58.8167 233.38C50.2272 234.332 41.8327 237.042 34.5086 241.017C27.1847 244.991 20.931 250.231 16.0487 255.905C11.1531 261.567 6.88803 268.522 4.0314 276.35C1.17477 284.178-0.273403 292.879 0.0448796 301.515C0.36299 310.152 2.44756 318.723 5.87231 326.319C9.29724 333.916 14.0625 340.538 19.3617 345.825C24.6482 351.124 31.2704 355.889 38.867 359.314C46.4637 362.739 55.0349 364.823 63.671 365.142C72.3073 365.46 81.0085 364.012 88.8366 361.155C96.6647 358.298 103.62 354.033 109.282 349.138C114.956 344.256 120.195 338.002 124.17 330.678C128.144 323.354 130.854 314.959 131.807 306.37C132.76 297.781 131.956 288.996 129.683 280.979C127.41 272.962 123.668 265.712 119.203 259.705L133.953 244.954L144.69 255.691H150.789L158.149 248.331V242.233L147.412 231.496L163 215.908L178.588 231.496L167.851 242.233V248.331L175.211 255.691H181.31L192.047 244.954L206.797 259.705C202.332 265.712 198.59 272.962 196.317 280.979C194.044 288.996 193.24 297.781 194.193 306.37C195.146 314.959 197.856 323.354 201.83 330.678C205.805 338.002 211.044 344.256 216.718 349.138C222.38 354.033 229.335 358.298 237.163 361.155C244.991 364.012 253.693 365.46 262.329 365.142C270.965 364.823 279.536 362.739 287.133 359.314C294.73 355.889 301.352 351.124 306.638 345.825C311.937 340.538 316.703 333.916 320.128 326.319C323.552 318.723 325.637 310.152 325.955 301.515C326.273 292.879 324.825 284.178 321.969 276.35C319.112 268.522 314.847 261.567 309.951 255.905C305.069 250.231 298.815 244.991 291.491 241.017C284.167 237.042 275.773 234.332 267.183 233.38C258.594 232.427 249.81 233.231 241.793 235.504C233.776 237.777 226.526 241.518 220.519 245.984L206.042 231.484L216.773 220.753V214.655L209.151 207.032H203.052L192.315 217.769L176.721 202.186L258.473 120.434L291.567 153.528V119.095H326L292.907 86.0012L326 52.9077V46.8095L318.377 39.1865H312.279L163 188.465L13.7212 39.1865H7.62295L0 46.8095V52.9077L33.0934 86.0012L0 119.095H34.4331V153.528L67.5263 120.434L149.279 202.186L133.685 217.769L122.948 207.032H116.849L109.226 214.655V220.753L119.958 231.484L105.481 245.984ZM238.144 321.715C234.778 328.62 235.477 338.188 239.811 344.531C243.793 351.1 252.216 355.693 259.895 355.484C267.574 355.693 275.997 351.1 279.979 344.531C284.313 338.188 285.012 328.62 281.646 321.715L282.484 320.812C289.389 324.196 298.971 323.511 305.324 319.178C311.904 315.2 316.508 306.768 316.297 299.081C316.508 291.395 311.904 282.963 305.324 278.984C298.971 274.652 289.389 273.966 282.484 277.351L281.646 276.448C285.012 269.543 284.313 259.974 279.979 253.632C275.997 247.063 267.574 242.469 259.895 242.679C252.216 242.469 243.793 247.063 239.811 253.632C235.477 259.974 234.778 269.543 238.144 276.448L237.306 277.351C230.401 273.966 220.818 274.652 214.466 278.984C207.886 282.963 203.282 291.395 203.492 299.081C203.282 306.768 207.886 315.2 214.466 319.178C220.818 323.511 230.401 324.196 237.306 320.812L238.144 321.715ZM86.1857 344.531C90.52 338.188 91.2191 328.62 87.8528 321.715L88.6913 320.812C95.5956 324.196 105.178 323.511 111.531 319.178C118.11 315.2 122.715 306.768 122.504 299.081C122.715 291.395 118.11 282.963 111.531 278.984C105.178 274.652 95.5956 273.966 88.6913 277.351L87.8528 276.448C91.2191 269.543 90.52 259.974 86.1857 253.632C82.2037 247.063 73.7808 242.469 66.1018 242.679C58.423 242.469 50.0001 247.063 46.0181 253.632C41.6839 259.974 40.9847 269.543 44.351 276.448L43.5126 277.351C36.6082 273.966 27.0255 274.652 20.6731 278.984C14.0932 282.963 9.48904 291.395 9.69934 299.081C9.48904 306.768 14.0932 315.2 20.6731 319.178C27.0255 323.511 36.6082 324.196 43.5126 320.812L44.351 321.715C40.9847 328.62 41.6839 338.188 46.0181 344.531C50.0001 351.1 58.423 355.693 66.1018 355.484C73.7808 355.693 82.2037 351.1 86.1857 344.531Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M162.891 39.1864L202.078 0L221.482 19.4047V84.8147L167.742 138.555H158.04L104.3 84.8147V19.4047L123.705 0L162.891 39.1864ZM123.705 13.7213L158.04 48.0567V111.112L123.705 76.7773V13.7213ZM167.744 48.0567L202.079 13.7213V76.7773L167.744 111.112V48.0567Z"/></svg> Venice</button>
          <button class="ai-provider-btn${provider === 'custom' ? ' active' : ''}" data-provider="custom" data-settings-action="switch-ai-provider"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg> Custom</button>
          <button class="ai-provider-btn${provider === 'ollama' ? ' active' : ''}" data-provider="ollama" data-settings-action="switch-ai-provider"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-3-8c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1s1 .45 1 1v2c0 .55-.45 1-1 1z"/></svg> Local</button>
        </div>
        <div id="ai-provider-panel">${renderAIProviderPanelBridge()}</div>
      </div>

      <div class="settings-group-title">Import Benchmarks</div>

      <div class="settings-section" id="import-benchmarks-section">
        ${renderImportBenchmarksEntrySection()}
      </div>

      <div class="settings-group-title">AI Usage</div>

      <div class="settings-section" id="ai-usage-section">
        ${renderAIUsageSection()}
      </div>
    </div>

    <!-- Privacy Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'privacy' ? ' active' : ''}" data-tab-panel="privacy">
      <div class="settings-group-title">AI Privacy Protection</div>

      <div class="settings-section settings-privacy-section" id="privacy-section">
        ${renderPrivacySection()}
      </div>

      <div class="settings-group-title">Anonymous Usage Stats</div>

      <div class="settings-section" id="privacy-analytics-section">
        ${renderPrivacyAnalyticsSection()}
      </div>
    </div>

    <!-- Data Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'data' ? ' active' : ''}" data-tab-panel="data">
      <div class="settings-group-title">Security</div>

      <div class="settings-section" id="encryption-section">
        ${renderEncryptionSection()}
      </div>

      <div class="settings-group-title">Cross-Device Sync</div>

      <div class="settings-section" id="sync-section">
        ${renderSyncSection()}
      </div>

      <div class="settings-group-title">Backup &amp; Restore</div>

      <div class="settings-section" id="backup-section">
        ${renderBackupSection()}
      </div>

      <div class="settings-group-title">Imported Data</div>

      <div class="settings-section" id="data-entries-section">
        ${renderDataEntriesSection()}
      </div>
    </div>

    <!-- Wearables Tab — incoming biometric data (Oura, WHOOP, Fitbit, etc.) -->
    <div class="settings-tab-panel${_activeSettingsTab === 'wearables' ? ' active' : ''}" data-tab-panel="wearables">
      <div class="settings-section" id="wearables-section">
        ${renderWearablesSettingsSection()}
      </div>
    </div>

    <!-- Agent Access Tab — outgoing read permission for AI agents (MCP / Hermes / OpenClaw) -->
    <div class="settings-tab-panel${_activeSettingsTab === 'agent' ? ' active' : ''}" data-tab-panel="agent">
      <div class="settings-section" id="messenger-section">
        ${renderMessengerSection()}
      </div>
    </div>
    </div>
    </div>`;
  installSettingsDelegates(modal);
  openModalOverlay(overlay);
  void initSettingsProviderPanels();
  loadBackupSnapshots();
  loadSettingsCommitHash();
  hydrateSettingsSyncPanel();
  // Always fire so wearables Manual-row reading counts populate on first paint
  // (whether the user lands on the Integrations tab or switches into it).
  document.dispatchEvent(new CustomEvent('settings:wearables-rendered'));
  scrollActiveSettingsTabIntoView();
}

function scrollActiveSettingsTabIntoView() {
  requestSettingsScrollFrame(() => {
    const bar = document.querySelector('#settings-modal .settings-tabs-bar');
    const active = /** @type {HTMLElement | null | undefined} */ (bar?.querySelector('.settings-tab-btn.active'));
    if (!bar || !active || settingsMediaMatches('(min-width: 721px)')) return;
    const padding = 12;
    const activeLeft = active.offsetLeft;
    const activeRight = activeLeft + active.offsetWidth;
    const visibleLeft = bar.scrollLeft + padding;
    const visibleRight = bar.scrollLeft + bar.clientWidth - padding;
    let target = null;
    if (activeLeft < visibleLeft) target = activeLeft - padding;
    if (activeRight > visibleRight) target = activeRight - bar.clientWidth + padding;
    if (target !== null) bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  });
}

function loadSettingsCommitHash() {
  const el = document.getElementById('settings-commit-hash');
  if (!el) return;
  const render = (sha, ref) => {
    const e = document.getElementById('settings-commit-hash');
    if (!e) return;
    const fullSha = String(sha || '').trim();
    if (!/^[a-f0-9]{40}$/i.test(fullSha)) {
      e.textContent = '';
      return;
    }
    const short = fullSha.slice(0, 7);
    const link = document.createElement('a');
    link.href = `https://github.com/elkimek/get-based/commit/${fullSha}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.style.color = 'var(--text-muted)';
    link.style.textDecoration = 'none';
    link.textContent = short;
    e.replaceChildren(link);
    // Show branch suffix on previews so BETA testers can tell main from a feature branch.
    if (ref && ref !== 'main') {
      const suffix = document.createElement('span');
      suffix.style.color = 'var(--text-muted)';
      suffix.style.opacity = '0.7';
      suffix.textContent = ` (${String(ref)})`;
      e.appendChild(suffix);
    }
  };
  // Prefer the deployed SHA from Vercel (truthful on previews). Fall back to
  // main HEAD via GitHub when /api/commit isn't available (local dev, etc).
  fetch('/api/commit')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(({ sha, ref }) => render(sha, ref))
    .catch(() => fetch('https://api.github.com/repos/elkimek/get-based/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(sha => render(sha, 'main'))
      .catch(() => { const e = document.getElementById('settings-commit-hash'); if (e) e.textContent = ''; }));
}

export function switchSettingsTab(tabId) {
  // Legacy v1.27 tab id 'integrations' covered both wearables + agent access.
  // v1.30.0 split them. Land on Wearables for the back-compat redirect — most
  // pre-existing deep-links pointed at the wearable adapter rows.
  if (tabId === 'integrations') tabId = 'wearables';
  if (tabId === 'wearables' && !isWearablesStylesheetLoaded()) {
    return loadWearablesStylesheetForAction()
      .then(loaded => loaded ? switchSettingsTab(tabId) : false);
  }
  _activeSettingsTab = tabId;
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  const tabButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.settings-tab-btn')));
  tabButtons.forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  const tabPanels = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.settings-tab-panel')));
  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.tabPanel === tabId);
  });
  scrollActiveSettingsTabIntoView();
  // Re-run init for tabs that need async setup
  if (tabId === 'ai') {
    void initSettingsProviderPanels();
  }
  if (tabId === 'data') {
    refreshDataEntriesSection();
    loadBackupSnapshots();
  }
  if (tabId === 'wearables') {
    // Notify the wearables module so it can populate the Manual-row reading
    // counts on first paint, not just on details-toggle.
    document.dispatchEvent(new CustomEvent('settings:wearables-rendered'));
  }
}

export function updateSettingsUI() {
  updateDisplaySettingsPanel();
}

export function closeSettingsModal() {
  closeModalOverlay('settings-modal-overlay');
  updateChatNudgeRuntime();
  settingsRuntime.refreshMobileDashboardActiveTab();
}

configureSettingsTweaksRuntime({
  clearDashboardWidgets: () => settingsRuntime.clearDashboardWidgets(),
  openFeedbackModal: () => settingsRuntime.openFeedbackModal(),
  resetDashboardWidgets: () => settingsRuntime.resetDashboardWidgets(),
  toggleDashboardOrganizeMode: force => settingsRuntime.toggleDashboardOrganizeMode(force),
  updateSettingsUI,
});

configureSettingsModuleBridge({
  openSettingsModal,
  closeSettingsModal,
  updatePrivacyStatusCard,
  openTweaksPanel,
  closeTweaksPanel,
  applyAccentOverride,
  updateSettingsUI,
  updateTweaksUI,
});

configureSettingsProviderBridgeDeps({
  closeSettingsModal,
  openSettingsModal,
});
