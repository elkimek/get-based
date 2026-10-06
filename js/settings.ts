// settings.js — Settings modal (profile, display, AI provider, privacy)
import { isDebugMode, setDebugMode, setAnalyticsEnabled, showNotification, showConfirmDialog } from './utils.js';
import { applyAccentOverride, setTimeFormat } from './theme.js';
import { switchUnitSystem, toggleAltUnits, switchRangeMode } from './data.js';
import { getAIProvider, hasAIProvider, setOllamaPIIModel } from './api.js';
import { renderEncryptionSection, renderBackupSection, loadBackupSnapshots, hydrateProtectionSettings, disposeSettingsProtection } from './crypto.js';
import { renderSyncSection, renderMessengerSection, hydrateSettingsSyncPanel, disposeMessengerSection } from './settings-sync-panel.js';
import { getAiSettingsView } from './ai-settings-component.js';
import type { AiProviderId } from './ai-settings-contract.js';
import { renderWearablesSettingsSection } from './wearables-settings-panel.js';
import { disposeWearablesSettings } from './wearables-settings-component.js';
import { setProductRecsEnabled } from './recommendations.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  configureSettingsProviderBridgeDeps,
  disposeSettingsProviderPanels,
  initSettingsProviderPanels,
  hydrateAiSettings,
  showCLIAgentProviderBridge,
  setSettingsProviderHadProvider,
  switchAIProviderBridge,
  testPIIOllamaConnectionBridge,
} from './settings-provider-bridge.js';
import { disposeSettingsRecords, mountSettingsRecords } from './settings-records-component.js';
import { mountSettingsShell, selectSettingsShellTab } from './settings-shell.js';
import { requestSettingsFrame, settingsMediaMatches } from './settings-runtime.js';
import { configureSettingsModuleBridge } from './settings-runtime-bridge.js';
import { closestSettingsTarget, getSettingsProxyToggle } from './settings-event-target.js';
import { disposeVoiceSettingsPanel } from './settings-voice-component.js';
import { mountPrivacySettingsPanel, disposePrivacySettingsPanel } from './settings-privacy-panel.js';
import {
  renderDisplaySettingsPanel,
  mountDisplaySettingsPanel,
  disposeDisplaySettingsPanel,
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
  refreshAIUsageSection,
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
  buildNutritionAISettingsSnapshot,
  renderNutritionAISettings,
  setNutritionAIRouteFromValue,
} from './nutrition-ai-settings.js';
import {
  getAppExtensionSettingsPolicy,
  handleAppExtensionSettingsAction,
  notifyAppExtensionSettings,
  renderAppExtensionSettingsSlot,
} from './app-extension-runtime.js';
import { disposeNutritionAISettings, getNutritionAISettingsView, mountNutritionAISettings } from './nutrition-ai-settings-component.js';
import type { SettingsOperations, SettingsSnapshot } from '../types/settings.js';
const settingsWindow = window as unknown as Record<string, unknown>;

const settingsRuntime: SettingsSnapshot = {
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

export function configureSettingsRuntime(runtime: unknown = {}) {
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
let _activeSettingsTab: unknown = 'display';

function requestSettingsScrollFrame(callback: () => void) {
  const frame = requestSettingsFrame(callback);
  if (frame === null) {
    setTimeout(callback, 0);
  }
}

settingsWindow.handleThemeChange = scheduleSettingsThemeChange;

function applySettingsToggle(actionEl: HTMLElement) {
  if (actionEl instanceof HTMLInputElement && actionEl.disabled) return false;

  const action = actionEl.dataset.settingsAction;
  const checked = actionEl instanceof HTMLInputElement && actionEl.checked;
  if (action === 'set-product-recs') {
    setProductRecsEnabled(checked);
    (settingsRuntime as SettingsOperations).navigate('dashboard');
    return true;
  }
  if (action === 'set-debug-mode') {
    setDebugMode(checked);
    refreshAIUsageSection();
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

function isSettingsToggleAction(actionEl: HTMLElement) {
  return actionEl.dataset.settingsAction === 'set-product-recs'
    || actionEl.dataset.settingsAction === 'set-debug-mode'
    || actionEl.dataset.settingsAction === 'toggle-pii-local'
    || actionEl.dataset.settingsAction === 'toggle-pii-review'
    || actionEl.dataset.settingsAction === 'set-analytics';
}

async function handleSettingsClick(event: Event) {
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
    (settingsRuntime as SettingsOperations).exportClientJSON((settingsRuntime as SettingsOperations).getActiveProfileId());
  } else if (action === 'share-profile') {
    event.preventDefault();
    closeSettingsModal();
    setTimeout(() => (settingsRuntime as SettingsOperations).openProfileShareModal(), 120);
  } else if (action === 'export-all-clients') {
    event.preventDefault();
    (settingsRuntime as SettingsOperations).exportAllDataJSON();
  } else if (action === 'clear-all-data') {
    event.preventDefault();
    (settingsRuntime as SettingsOperations).clearAllData();
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

function handleSettingsChange(event: Event) {
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
  }
}

function refreshNutritionAISettingsSection() {
  getNutritionAISettingsView()?.refresh(buildNutritionAISettingsSnapshot());
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-ai-settings-local-changed', scheduleNutritionAISettingsRefresh);
  globalThis.addEventListener('getbased:agent-model-catalog-changed', scheduleNutritionAISettingsRefresh);
  globalThis.addEventListener('getbased:agent-host-settings-changed', scheduleNutritionAISettingsRefresh);
  globalThis.addEventListener('getbased:chat-backend-changed', scheduleNutritionAISettingsRefresh);
}

function installSettingsDelegates(modal: HTMLElement | null) {
  if (!modal || modal.dataset.delegatedActions === '1') return;
  modal.dataset.delegatedActions = '1';
  modal.addEventListener('click', handleSettingsClick);
  modal.addEventListener('change', handleSettingsChange);
  modal.addEventListener('submit', event => event.preventDefault());
}

installSunDataSourceDelegates();

let aiSelectionRequest = 0;
async function selectAiProviderFromSettings(provider: AiProviderId, actionEl: HTMLButtonElement): Promise<void> {
  const owner = getAiSettingsView(), request = ++aiSelectionRequest;
  const handled = handleAppExtensionSettingsAction({
    action:provider === 'cli' ? 'show-cli-agent-provider' : 'switch-ai-provider',actionEl,activeTab:_activeSettingsTab,
    openSettingsModal,refreshSettings:() => openSettingsModal(_activeSettingsTab),switchAIProvider:switchAIProviderBridge,switchSettingsTab,
  });
  if (handled === true || (handled instanceof Promise && await handled)) return;
  if (!owner?.isCurrent() || request !== aiSelectionRequest) return;
  if (provider === 'cli') showCLIAgentProviderBridge(); else switchAIProviderBridge(provider);
}

export function openSettingsModal(tab?: unknown): void | false | Promise<void | false> {
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

  const extensionContext = { activeTab: _activeSettingsTab, provider };
  const extensionPolicy = getAppExtensionSettingsPolicy(extensionContext);
  const extensionTabs = renderAppExtensionSettingsSlot('tabs', extensionContext);
  const extensionAI = renderAppExtensionSettingsSlot('ai', extensionContext);
  const extensionPanels = renderAppExtensionSettingsSlot('panels', extensionContext);

  disposeSettingsProviderPanels();
  disposeNutritionAISettings();
  disposeWearablesSettings();
  disposeSettingsRecords();
  disposeSettingsProtection();
  disposeMessengerSection();
  disposeVoiceSettingsPanel();
  disposePrivacySettingsPanel();
  disposeDisplaySettingsPanel();
  const legacyPanels = `
    ${renderDisplaySettingsPanel(_activeSettingsTab === 'display')}

    <!-- AI Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'ai' ? ' active' : ''}" data-tab-panel="ai" id="settings-tab-ai" role="tabpanel" aria-label="AI">
      ${extensionAI}
      <div data-ai-settings-host></div>

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
    <div class="settings-tab-panel${_activeSettingsTab === 'privacy' ? ' active' : ''}" data-tab-panel="privacy" id="settings-tab-privacy" role="tabpanel" aria-label="Privacy">
      ${renderPrivacySection()}
    </div>

    <!-- Data Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'data' ? ' active' : ''}" data-tab-panel="data" id="settings-tab-data" role="tabpanel" aria-label="Data">
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
    <div class="settings-tab-panel${_activeSettingsTab === 'wearables' ? ' active' : ''}" data-tab-panel="wearables" id="settings-tab-wearables" role="tabpanel" aria-label="Wearables">
      <div class="settings-section" id="wearables-section">
        ${renderWearablesSettingsSection()}
      </div>
    </div>

    <!-- Agent Access Tab — outgoing read permission for AI agents (MCP / Hermes / OpenClaw) -->
    <div class="settings-tab-panel${_activeSettingsTab === 'agent' ? ' active' : ''}" data-tab-panel="agent" id="settings-tab-agent" role="tabpanel" aria-label="Agent Access">
      <div class="settings-section" id="messenger-section">
        ${renderMessengerSection()}
      </div>
    </div>
`;
  mountSettingsShell(modal, { initialTab: String(_activeSettingsTab), legacyPanels, extensionTabs, onNavigateTab: switchSettingsTab });
  hydrateAiSettings(extensionPolicy.hideProviderSettings === true,selectAiProviderFromSettings);
  mountDisplaySettingsPanel();
  mountPrivacySettingsPanel();
  mountSettingsRecords();
  const mealModelHost = modal.querySelector<HTMLElement>('[data-nutrition-ai-settings-host]');
  if (mealModelHost) mountNutritionAISettings(mealModelHost, buildNutritionAISettingsSnapshot());
  hydrateProtectionSettings();
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
    const active = /** @type {HTMLElement | null | undefined} */ (bar?.querySelector('.settings-tab-btn.active') as HTMLElement | null | undefined);
    if (!bar || !active || settingsMediaMatches('(min-width: 721px)')) return;
    const padding = 12;
    const activeLeft = active.offsetLeft;
    const activeRight = activeLeft + active.offsetWidth;
    const visibleLeft = bar.scrollLeft + padding;
    const visibleRight = bar.scrollLeft + bar.clientWidth - padding;
    let target: number | null = null;
    if (activeLeft < visibleLeft) target = activeLeft - padding;
    if (activeRight > visibleRight) target = activeRight - bar.clientWidth + padding;
    if (target !== null) bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  });
}

function loadSettingsCommitHash() {
  const el = document.getElementById('settings-commit-hash');
  if (!el) return;
  const render = (sha: unknown, ref: unknown) => {
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
    .then(({ sha, ref }: { sha?: unknown; ref?: unknown }) => render(sha, ref))
    .catch(() => { const e = document.getElementById('settings-commit-hash'); if (e) e.textContent = ''; });
}

export function switchSettingsTab(tabId: unknown): void | false | Promise<void | false> {
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
  selectSettingsShellTab(String(tabId));
  const tabButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.settings-tabs-bar [role="tab"]:not([data-settings-shell-tab])')) as HTMLElement[]);
  tabButtons.forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  const tabPanels = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.settings-tab-panel')) as HTMLElement[]);
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
  disposeSettingsProviderPanels();
  disposeNutritionAISettings();
  disposeWearablesSettings();
  closeModalOverlay('settings-modal-overlay');
  updateChatNudgeRuntime();
  (settingsRuntime as SettingsOperations).refreshMobileDashboardActiveTab();
  notifyAppExtensionSettings('onClose', { activeTab: _activeSettingsTab, provider: getAIProvider() });
}

configureSettingsTweaksRuntime({
  clearDashboardWidgets: () => (settingsRuntime as SettingsOperations).clearDashboardWidgets(),
  openFeedbackModal: () => (settingsRuntime as SettingsOperations).openFeedbackModal(),
  resetDashboardWidgets: () => (settingsRuntime as SettingsOperations).resetDashboardWidgets(),
  toggleDashboardOrganizeMode: (force?: boolean) => (settingsRuntime as SettingsOperations).toggleDashboardOrganizeMode(force),
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
