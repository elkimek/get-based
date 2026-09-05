// @ts-check
// settings.js — Settings modal (profile, display, AI provider, privacy)
import { isDebugMode, setDebugMode, setAnalyticsEnabled, showNotification, showConfirmDialog } from './utils.js';
import { applyAccentOverride, setTimeFormat } from './theme.js';
import { switchUnitSystem, toggleAltUnits, switchRangeMode } from './data.js';
import { getAIProvider, hasAIProvider, isAIPaused, setOllamaPIIModel } from './api.js';
import { renderEncryptionSection, renderBackupSection, loadBackupSnapshots } from './crypto.js';
import { renderSyncSection, renderMessengerSection, hydrateSettingsSyncPanel } from './settings-sync-panel.js';
import { getChatBackend } from './agent-chat-settings.js';
import { controlCLICompanion, copyCLIAgentLoginCommand, copyCLICompanionRunCommand, copyCLICompanionStartCommand, copyCLICompanionUpdateCommand, refreshDetectedAgentList, renderCLIAgentProviderPanel, setCLIAgentEffort, setCLIAgentModel, setCLIAgentProviderFilter, setCLIAgentTarget, setCLICompanionPlatform, testLocalCodex, toggleLocalCodex } from './settings-cli-agent-panel.js';
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
import { requestSettingsFrame, settingsMediaMatches } from './settings-runtime.js';
import { configureSettingsModuleBridge } from './settings-runtime-bridge.js';
import { closestSettingsTarget, getSettingsProxyToggle } from './settings-event-target.js';
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
  withdrawCloudAIConsentFromSettings,
  withdrawAIRouteConfirmationsFromSettings,
} from './settings-privacy.js';
import { loadImportUI, loadPdfImport } from './import-loader.js';
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
import {
  hydrateVoiceSettingsPanel,
  installVoiceSettingsPanel,
  renderVoiceSettingsPanel,
} from './settings-voice-panel.js';
import {
  renderNutritionAISettings,
  setNutritionAIRouteFromValue,
} from './nutrition-ai-settings.js';
import {
  getAppExtensionSettingsPolicy,
  handleAppExtensionSettingsAction,
  notifyAppExtensionSettings,
  renderAppExtensionSettingsSlot,
} from './app-extension-runtime.js';
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

// SETTINGS MODAL
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

  const extensionHandled = handleAppExtensionSettingsAction({
    action,
    actionEl,
    activeTab: _activeSettingsTab,
    openSettingsModal,
    refreshSettings: () => openSettingsModal(_activeSettingsTab),
    switchAIProvider: switchAIProviderBridge,
    switchSettingsTab,
  });
  if (extensionHandled === true
    || (extensionHandled instanceof Promise && await extensionHandled)) {
    event.preventDefault();
    return;
  }

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
  } else if (action === 'show-cli-agent-provider') {
    event.preventDefault();
    document.querySelectorAll('.ai-provider-btn').forEach(button => {
      const providerButton = /** @type {HTMLElement} */ (button);
      providerButton.classList.toggle('active', providerButton.dataset.provider === 'cli');
    });
    const panel = document.getElementById('ai-provider-panel');
    if (panel) panel.innerHTML = renderCLIAgentProviderPanel();
  } else if (action === 'rescan-cli-agents') {
    event.preventDefault(); void refreshDetectedAgentList({ refresh: true });
  } else if (action === 'copy-cli-companion-run') {
    event.preventDefault(); void copyCLICompanionRunCommand();
  } else if (action === 'copy-cli-companion-start') {
    event.preventDefault(); void copyCLICompanionStartCommand();
  } else if (action === 'copy-cli-companion-update') {
    event.preventDefault(); void copyCLICompanionUpdateCommand();
  } else if (action === 'copy-cli-agent-login') {
    event.preventDefault(); void copyCLIAgentLoginCommand(actionEl.dataset.value || '');
  } else if (action === 'control-cli-companion') {
    event.preventDefault(); void controlCLICompanion(actionEl.dataset.value || '');
  } else if (action === 'set-cli-companion-platform') {
    event.preventDefault(); setCLICompanionPlatform(actionEl.dataset.value || '');
  } else if (action === 'test-cli-codex') {
    event.preventDefault();
    void testLocalCodex(actionEl.dataset.value || '');
  } else if (action === 'set-cli-agent-model' || action === 'set-cli-agent-effort') {
    event.preventDefault();
    void (action === 'set-cli-agent-model' ? setCLIAgentModel : setCLIAgentEffort)(actionEl.dataset.value || '');
  } else if (action === 'set-cli-agent-provider-filter') {
    event.preventDefault();
    setCLIAgentProviderFilter(actionEl.dataset.value || '');
  } else if (action === 'set-cli-agent-target') {
    event.preventDefault();
    void setCLIAgentTarget(actionEl.dataset.value || 'local');
  } else if (action === 'toggle-privacy-configure') {
    event.preventDefault();
    togglePrivacyConfigure();
  } else if (action === 'test-pii-ollama') {
    event.preventDefault();
    void testPIIOllamaConnectionBridge();
  } else if (action === 'withdraw-cloud-ai-consent') {
    event.preventDefault();
    withdrawCloudAIConsentFromSettings();
  } else if (action === 'withdraw-ai-route-confirmations') {
    event.preventDefault();
    withdrawAIRouteConfirmationsFromSettings();
  } else if (action === 'rename-imported-entry') {
    event.preventDefault();
    void renameImportedEntryDateFromSettings(actionEl.dataset.entryDate || '');
  } else if (action === 'remove-imported-entry') {
    event.preventDefault();
    void removeImportedEntryFromSettings(actionEl.dataset.entryDate || '');
  } else if (action === 'review-import') {
    event.preventDefault();
    try {
      const { openImportReviewFromSnapshot } = await loadImportUI();
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

let nutritionAISettingsRefreshQueued = false;

function scheduleNutritionAISettingsRefresh() {
  if (nutritionAISettingsRefreshQueued) return;
  nutritionAISettingsRefreshQueued = true;
  queueMicrotask(() => {
    nutritionAISettingsRefreshQueued = false;
    refreshNutritionAISettingsSection();
  });
}

function handleSettingsChange(event) {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  const actionEl = closestSettingsTarget(event, '[data-settings-action]', modal);
  if (!actionEl) {
    const providerChange = closestSettingsTarget(event, '[data-provider-panel-change]', modal);
    if (providerChange) scheduleNutritionAISettingsRefresh();
    return;
  }

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
  } else if (action === 'set-nutrition-ai-route') {
    setNutritionAIRouteFromValue(actionEl instanceof HTMLSelectElement ? actionEl.value : '');
    showNotification('Meal photo model updated.', 'success');
  } else if (action === 'toggle-cli-codex' && actionEl instanceof HTMLInputElement) {
    void toggleLocalCodex(actionEl.checked, actionEl.dataset.agent || '');
  }
}

function refreshNutritionAISettingsSection() {
  const current = document.getElementById('nutrition-ai-model-settings');
  if (!current) return;
  const template = document.createElement('template');
  template.innerHTML = renderNutritionAISettings();
  const next = template.content.querySelector('#nutrition-ai-model-settings');
  if (next) current.replaceWith(next);
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-ai-settings-local-changed', scheduleNutritionAISettingsRefresh);
  globalThis.addEventListener('getbased:agent-model-catalog-changed', scheduleNutritionAISettingsRefresh);
  globalThis.addEventListener('getbased:agent-host-settings-changed', scheduleNutritionAISettingsRefresh);
  globalThis.addEventListener('getbased:chat-backend-changed', scheduleNutritionAISettingsRefresh);
}

function installSettingsDelegates(modal) {
  if (!modal || modal.dataset.delegatedActions === '1') return;
  modal.dataset.delegatedActions = '1';
  modal.addEventListener('click', handleSettingsClick);
  modal.addEventListener('change', handleSettingsChange);
  modal.addEventListener('submit', event => event.preventDefault());
}

installSunDataSourceDelegates();

export function openSettingsModal(tab) {
  setSettingsProviderHadProvider(hasAIProvider());
  const overlay = document.getElementById('settings-modal-overlay');
  const modal = document.getElementById('settings-modal');
  if (!overlay || !modal) return;
  const provider = getAIProvider();
  const cliAgentActive = getChatBackend() === 'codex';
  const directAIActive = !cliAgentActive;
  // Legacy v1.27 tab id 'integrations' — same redirect as switchSettingsTab.
  // Older deep-links / tour steps / external links may still pass it.
  if (tab === 'integrations') tab = 'wearables';
  if (tab === 'wearables' && !isWearablesStylesheetLoaded()) {
    return loadWearablesStylesheetForAction()
      .then(loaded => loaded ? openSettingsModal(tab) : false);
  }
  if (tab) _activeSettingsTab = tab;

  const extensionContext = { activeTab: _activeSettingsTab, provider };
  const extensionPolicy = getAppExtensionSettingsPolicy(extensionContext);
  const extensionTabs = renderAppExtensionSettingsSlot('tabs', extensionContext);
  const extensionAI = renderAppExtensionSettingsSlot('ai', extensionContext);
  const extensionPanels = renderAppExtensionSettingsSlot('panels', extensionContext);

  modal.className = 'modal settings-modal';
  modal.innerHTML = `
    <div class="gb-modal-head settings-modal-head">
      <div>
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
      <button role="tab" aria-selected="${_activeSettingsTab === 'voice'}" aria-controls="settings-tab-voice" tabindex="${_activeSettingsTab === 'voice' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'voice' ? ' active' : ''}" data-tab="voice" data-settings-tab="voice">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/></svg>
        Voice
      </button>
      ${extensionTabs}
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
      ${extensionAI}
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
      </div>

      <div id="ai-provider-settings"${extensionPolicy.hideProviderSettings ? ' hidden' : ''}>
      <div class="settings-group-title">AI providers</div>

      <div class="settings-section" id="ai-provider-advanced-section">
        <div class="settings-copy-title" style="margin-bottom:10px">Choose how getbased runs AI</div>
        <div class="ai-model-tip">Use an API provider, a locally served model, or an installed CLI agent with its existing account or configured provider.<br>Stick with the same model across imports to keep marker keys consistent.</div>
        <div class="ai-provider-toggle">
          <button class="ai-provider-btn${directAIActive && provider === 'ppq' ? ' active' : ''}" data-provider="ppq" data-settings-action="switch-ai-provider"><img class="ai-provider-logo" src="/brands/ai-provider-ppq.svg" alt=""> PPQ</button>
          <button class="ai-provider-btn${directAIActive && provider === 'routstr' ? ' active' : ''}" data-provider="routstr" data-settings-action="switch-ai-provider"><img class="ai-provider-logo" src="/brands/ai-provider-routstr.svg" alt=""> Routstr</button>
          <button class="ai-provider-btn${directAIActive && provider === 'openrouter' ? ' active' : ''}" data-provider="openrouter" data-settings-action="switch-ai-provider"><img class="ai-provider-logo" src="/brands/ai-provider-openrouter.svg" alt=""> OpenRouter</button>
          <button class="ai-provider-btn${provider === 'venice' ? ' active' : ''}" data-provider="venice" data-settings-action="switch-ai-provider"><img class="ai-provider-logo" src="/brands/ai-provider-venice.svg" alt=""> Venice</button>
          <button class="ai-provider-btn${provider === 'custom' ? ' active' : ''}" data-provider="custom" data-settings-action="switch-ai-provider"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg> Custom</button>
          <button class="ai-provider-btn${directAIActive && provider === 'ollama' ? ' active' : ''}" data-provider="ollama" data-settings-action="switch-ai-provider"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-3-8c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1s1 .45 1 1v2c0 .55-.45 1-1 1z"/></svg> Local models</button>
          <button class="ai-provider-btn${cliAgentActive ? ' active' : ''}" data-provider="cli" data-settings-action="show-cli-agent-provider"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7 4 5-4 5"/><path d="M11 17h8"/></svg> CLI agents</button>
        </div>
        <div id="ai-provider-panel">${cliAgentActive ? renderCLIAgentProviderPanel() : renderAIProviderPanelBridge()}</div>
      </div>
      </div>

      ${renderNutritionAISettings()}

      <div class="settings-group-title">Import Benchmarks</div>

      <div class="settings-section" id="import-benchmarks-section">
        ${renderImportBenchmarksEntrySection()}
      </div>

      ${extensionPolicy.hideUsage ? '' : `<div class="settings-group-title">AI Usage</div>

      <div class="settings-section" id="ai-usage-section">
        ${renderAIUsageSection()}
      </div>`}
    </div>

    ${renderVoiceSettingsPanel(_activeSettingsTab === 'voice')}

    ${extensionPanels}

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
  if (cliAgentActive) {
    modal.querySelectorAll('.ai-provider-btn').forEach(button => {
      const providerButton = /** @type {HTMLElement} */ (button);
      providerButton.classList.toggle('active', providerButton.dataset.provider === 'cli');
    });
  }
  installSettingsDelegates(modal);
  installVoiceSettingsPanel(modal);
  openModalOverlay(overlay);
  void initSettingsProviderPanels();
  loadBackupSnapshots();
  loadSettingsCommitHash();
  hydrateSettingsSyncPanel();
  // Always fire so wearables Manual-row reading counts populate on first paint
  // (whether the user lands on the Integrations tab or switches into it).
  document.dispatchEvent(new CustomEvent('settings:wearables-rendered'));
  scrollActiveSettingsTabIntoView();
  notifyAppExtensionSettings('onOpen', {
    ...extensionContext,
    openSettingsModal,
    switchAIProvider: switchAIProviderBridge,
    switchSettingsTab,
  });
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
  // Use only the deployment's same-origin public receipt. Do not make an
  // automatic GitHub request from the user's browser when it is unavailable.
  fetch('/api/commit')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(({ sha, ref }) => render(sha, ref))
    .catch(() => { const e = document.getElementById('settings-commit-hash'); if (e) e.textContent = ''; });
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
  if (tabId === 'voice') {
    hydrateVoiceSettingsPanel();
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
  notifyAppExtensionSettings('onTabChange', {
    activeTab: tabId,
    provider: getAIProvider(),
    openSettingsModal,
    switchAIProvider: switchAIProviderBridge,
    switchSettingsTab,
  });
}

export function updateSettingsUI() {
  updateDisplaySettingsPanel();
}

export function closeSettingsModal() {
  closeModalOverlay('settings-modal-overlay');
  updateChatNudgeRuntime();
  settingsRuntime.refreshMobileDashboardActiveTab();
  notifyAppExtensionSettings('onClose', { activeTab: _activeSettingsTab, provider: getAIProvider() });
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
  refreshNutritionAISettings: refreshNutritionAISettingsSection,
});
