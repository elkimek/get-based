// @ts-check
// settings.js — Settings modal (profile, display, AI provider, privacy)

import { state } from './state.js';
import { escapeHTML, escapeAttr, isDebugMode, setDebugMode, isPIIReviewEnabled, isAnalyticsEnabled, setAnalyticsEnabled, showNotification, showConfirmDialog } from './utils.js';
import { getTheme, setTheme, isSunsetMode, setSunsetMode, isCrtEffectsEnabled, setCrtEffectsEnabled, supportsCrtEffects, getTimeFormat, setTimeFormat, THEMES } from './theme.js';
import { switchUnitSystem, toggleAltUnits, switchRangeMode } from './data.js';
import { getAIProvider, isAIPaused, getOllamaPIIUrl, getOllamaPIIModel, setOllamaPIIModel } from './api.js';
import { isOllamaPIIEnabled, setOllamaPIIEnabled, getOllamaConfig, checkOpenAICompatible } from './pii.js';
import { renderEncryptionSection, renderBackupSection, loadBackupSnapshots } from './crypto.js';
import { renderSyncSection, renderMessengerSection, hydrateSettingsSyncPanel } from './settings-sync-panel.js';
import { renderWearablesSettingsSection } from './wearables-settings-panel.js';
import { isProductRecsEnabled, setProductRecsEnabled } from './recommendations.js';
import { closeModalOverlay, openModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { installSettingsProviderBridge, switchAIProviderBridge } from './settings-provider-bridge.js';
import { loadPdfImport } from './import-loader.js';
import { startGuidedTour } from './tour.js';
import {
  confirmDisablePIIReview,
  refreshDataEntriesSection,
  removeImportedEntryFromSettings,
  renameImportedEntryDateFromSettings,
  renderAIUsageSection,
  renderDataEntriesSection,
  resetCurrentProfileUsage,
} from './settings-data.js';

/** @typedef {Window & typeof globalThis & Record<string, any>} SettingsWindow */

const settingsWindow = /** @type {SettingsWindow} */ (window);

/**
 * @typedef {{
 *   exportAllDataJSON: () => Promise<void> | void,
 *   exportClientJSON: (profileId?: string | null) => Promise<void> | void,
 *   getActiveProfileId: () => string | null,
 *   openProfileShareModal: (profileId?: string) => void,
 * }} SettingsRuntime
 */

/** @type {SettingsRuntime} */
const settingsRuntime = {
  exportAllDataJSON: () => settingsWindow.exportAllDataJSON?.(),
  exportClientJSON: (profileId) => settingsWindow.exportClientJSON?.(profileId),
  getActiveProfileId: () => settingsWindow.getActiveProfileId?.() || null,
  openProfileShareModal: (profileId) => settingsWindow.openProfileShareModal?.(profileId),
};

/** @param {Partial<SettingsRuntime>} [runtime] */
export function configureSettingsRuntime(runtime = {}) {
  Object.assign(settingsRuntime, runtime);
}

installSettingsProviderBridge();

export {
  confirmDisablePIIReview,
  refreshDataEntriesSection,
  removeImportedEntryFromSettings,
  renameImportedEntryDateFromSettings,
  renderDataEntriesSection,
  resetCurrentProfileUsage,
};

// ═══════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════
let _activeSettingsTab = 'display';

const ACCENT_STORAGE_KEY = 'labcharts-accent-override';
const THEME_DEFAULT_ACCENTS = {
  dark: { color: '#4f8cff', light: '#6ba0ff', fill: 'rgba(79, 140, 255, 0.10)', gradient: 'linear-gradient(135deg, #4f8cff 0%, #6366f1 100%)' },
  light: { color: '#3b7cf5', light: '#2b6ce5', fill: 'rgba(59,124,245,0.10)', gradient: 'linear-gradient(135deg, #3b7cf5 0%, #5b5bf6 100%)' },
  cyberterm: { color: '#4ade80', light: '#6df09a', fill: 'rgba(74,222,128,0.10)', gradient: 'linear-gradient(135deg, #4ade80 0%, #4ade80 100%)' },
  glass: { color: '#c986ff', light: '#e0a5ff', fill: 'rgba(201,134,255,0.10)', gradient: 'linear-gradient(135deg, #c986ff 0%, #6ec4ff 100%)' },
  'synth-sunrise': { color: '#ff2bd6', light: '#ff6ce0', fill: 'rgba(255,43,214,0.10)', gradient: 'linear-gradient(135deg, #ff7a18 0%, #ff2bd6 50%, #7c3aed 100%)' },
  neuromancer: { color: '#00e5ff', light: '#5cf2ff', fill: 'rgba(0,229,255,0.10)', gradient: 'linear-gradient(135deg, #00e5ff 0%, #ff2bd6 100%)' },
};
const TWEAK_ACCENTS = [
  { id: '', label: 'Theme default' },
  { id: 'blue', label: 'Blue', color: '#4f8cff', light: '#6ba0ff', fill: 'rgba(79, 140, 255, 0.10)', gradient: 'linear-gradient(135deg, #4f8cff 0%, #6366f1 100%)' },
  { id: 'green', label: 'Green', color: '#34d399', light: '#6ee7b7', fill: 'rgba(52, 211, 153, 0.12)', gradient: 'linear-gradient(135deg, #34d399 0%, #14b8a6 100%)' },
  { id: 'amber', label: 'Amber', color: '#f59e0b', light: '#fbbf24', fill: 'rgba(245, 158, 11, 0.12)', gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)' },
  { id: 'rose', label: 'Rose', color: '#f43f5e', light: '#fb7185', fill: 'rgba(244, 63, 94, 0.12)', gradient: 'linear-gradient(135deg, #f43f5e 0%, #d946ef 100%)' },
  { id: 'cyan', label: 'Cyan', color: '#06b6d4', light: '#22d3ee', fill: 'rgba(6, 182, 212, 0.12)', gradient: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)' },
];

function accentSwatchSpec(accent, theme = getTheme()) {
  return accent?.id ? accent : (THEME_DEFAULT_ACCENTS[theme] || THEME_DEFAULT_ACCENTS.dark);
}

function renderThemeButton(t, currentTheme, ctx = 'settings') {
  const id = escapeAttr(t.id);
  const label = escapeHTML(t.label);
  const active = currentTheme === t.id ? ' active' : '';
  const isTweaks = ctx === 'tweaks';
  const className = isTweaks ? 'tweaks-theme-btn' : 'settings-theme-btn';
  const actionAttr = isTweaks
    ? 'data-tweaks-action="select-theme"'
    : 'data-settings-action="select-theme"';
  const labelClass = isTweaks ? '' : ' class="settings-theme-label"';
  return `
    <button type="button" class="${className}${active}" data-theme-id="${id}" ${actionAttr}>
      <span class="settings-theme-swatch settings-theme-swatch-${id}" aria-hidden="true"></span>
      <span${labelClass}>${label}</span>
    </button>
  `;
}

function getAccentOverride() {
  const value = localStorage.getItem(ACCENT_STORAGE_KEY) || '';
  return TWEAK_ACCENTS.some(a => a.id === value) ? value : '';
}

export function applyAccentOverride(id = getAccentOverride()) {
  const root = document.documentElement;
  const props = ['--accent', '--accent-light', '--accent-fill', '--accent-gradient', '--shadow-glow', '--ref-band', '--ref-border'];
  const setProp = (prop, value) => {
    if (root.style?.setProperty) root.style.setProperty(prop, value);
    else if (root.style) root.style[prop] = value;
  };
  const removeProp = (prop) => {
    if (root.style?.removeProperty) root.style.removeProperty(prop);
    else if (root.style) delete root.style[prop];
  };
  if (isSunsetMode()) {
    props.forEach(removeProp);
    return;
  }
  const accent = TWEAK_ACCENTS.find(a => a.id === id);
  if (!accent || !accent.id) {
    props.forEach(removeProp);
    return;
  }
  setProp('--accent', accent.color);
  setProp('--accent-light', accent.light);
  setProp('--accent-fill', accent.fill || 'color-mix(in srgb, var(--accent) 10%, transparent)');
  setProp('--accent-gradient', accent.gradient);
  setProp('--shadow-glow', `0 0 0 1px ${accent.color}, 0 4px 12px ${accent.fill}`);
  setProp('--ref-band', accent.fill);
  setProp('--ref-border', accent.color);
}

function refreshVisualSurfaces() {
  window.updateSettingsUI?.();
  window.updateTweaksUI?.();
  scheduleChartThemeRefresh();
  if (document.getElementById('settings-modal')?.classList.contains('show')) {
    window.refreshSettingsWearables?.();
  }
}

let chartThemeRefreshFrame = 0;
let chartThemeRefreshTimer = 0;
function scheduleChartThemeRefresh() {
  if (chartThemeRefreshFrame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(chartThemeRefreshFrame);
  if (chartThemeRefreshTimer) clearTimeout(chartThemeRefreshTimer);
  const refresh = () => window.refreshChartThemeColors?.({ batchSize: 4 });
  if (typeof window.requestAnimationFrame === 'function') {
    chartThemeRefreshFrame = window.requestAnimationFrame(() => {
      chartThemeRefreshFrame = 0;
      chartThemeRefreshTimer = setTimeout(() => {
        chartThemeRefreshTimer = 0;
        refresh();
      }, 0);
    });
  } else {
    chartThemeRefreshTimer = setTimeout(() => {
      chartThemeRefreshTimer = 0;
      refresh();
    }, 0);
  }
}

let themeChangeFrame = 0;
let themeChangeTimer = 0;
let pendingThemeId = '';
function markThemeControls(themeId) {
  const buttons = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.settings-theme-btn,.tweaks-theme-btn')));
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeId === themeId);
  });
}
function applyThemeChange(themeId) {
  setTheme(themeId);
  applyAccentOverride();
  refreshVisualSurfaces();
}
function scheduleThemeChange(themeId) {
  pendingThemeId = themeId;
  markThemeControls(themeId);
  if (themeChangeFrame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(themeChangeFrame);
  if (themeChangeTimer) clearTimeout(themeChangeTimer);
  const commit = () => {
    themeChangeTimer = 0;
    applyThemeChange(pendingThemeId);
  };
  if (typeof window.requestAnimationFrame === 'function') {
    themeChangeFrame = window.requestAnimationFrame(() => {
      themeChangeFrame = window.requestAnimationFrame(() => {
        themeChangeFrame = 0;
        commit();
      });
    });
  } else {
    themeChangeTimer = setTimeout(commit, 0);
  }
}

settingsWindow.handleThemeChange = scheduleThemeChange;

/**
 * @param {Event} event
 * @param {string} selector
 * @param {Element} root
 * @returns {HTMLElement | null}
 */
function closestWithin(event, selector, root) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  return el instanceof HTMLElement && root.contains(el) ? el : null;
}

/**
 * @param {Event} event
 * @param {string} selector
 * @param {Element} root
 * @returns {HTMLInputElement | null}
 */
function toggleInputFromProxyClick(event, selector, root) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (target.matches(selector)) return null;
  const toggle = target.closest('.toggle-switch');
  if (!toggle || !root.contains(toggle)) return null;
  const input = toggle.querySelector(selector);
  if (!(input instanceof HTMLInputElement) || input.disabled) return null;
  return input;
}

function applySettingsToggle(actionEl) {
  if (actionEl instanceof HTMLInputElement && actionEl.disabled) return false;

  const action = actionEl.dataset.settingsAction;
  const checked = actionEl instanceof HTMLInputElement && actionEl.checked;
  if (action === 'set-product-recs') {
    setProductRecsEnabled(checked);
    settingsWindow.navigate?.('dashboard');
    return true;
  }
  if (action === 'set-debug-mode') {
    setDebugMode(checked);
    return true;
  }
  if (action === 'toggle-ai-pause') {
    settingsWindow.toggleAIPause?.(checked);
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

function applyTweaksToggle(actionEl) {
  if (actionEl instanceof HTMLInputElement && actionEl.disabled) return false;

  const action = actionEl.dataset.tweaksAction;
  if (action === 'toggle-sunset') {
    toggleTweaksSunsetMode(actionEl instanceof HTMLInputElement && actionEl.checked);
    return true;
  }
  if (action === 'toggle-crt') {
    toggleTweaksCrtEffects(actionEl instanceof HTMLInputElement && actionEl.checked);
    return true;
  }
  return false;
}

function isTweaksToggleAction(actionEl) {
  return actionEl.dataset.tweaksAction === 'toggle-sunset'
    || actionEl.dataset.tweaksAction === 'toggle-crt';
}

async function handleSettingsClick(event) {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  const toggleInput = toggleInputFromProxyClick(event, '[data-settings-action]', modal);
  if (toggleInput && isSettingsToggleAction(toggleInput)) {
    event.preventDefault();
    toggleInput.checked = !toggleInput.checked;
    applySettingsToggle(toggleInput);
    return;
  }

  const tabButton = closestWithin(event, '[data-settings-tab]', modal);
  if (tabButton) {
    event.preventDefault();
    switchSettingsTab(tabButton.dataset.settingsTab || 'display');
    return;
  }

  const actionEl = closestWithin(event, '[data-settings-action]', modal);
  if (!actionEl) return;

  const action = actionEl.dataset.settingsAction;
  if (!action) return;

  if (action === 'close') {
    event.preventDefault();
    closeSettingsModal();
  } else if (action === 'select-theme') {
    event.preventDefault();
    scheduleThemeChange(actionEl.dataset.themeId || 'dark');
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
    setTimeout(() => settingsWindow.openChangelog?.(true), 300);
  } else if (action === 'switch-ai-provider') {
    event.preventDefault();
    switchAIProviderBridge(actionEl.dataset.provider || 'openrouter');
  } else if (action === 'toggle-privacy-configure') {
    event.preventDefault();
    togglePrivacyConfigure();
  } else if (action === 'test-pii-ollama') {
    event.preventDefault();
    settingsWindow.testPIIOllamaConnection?.();
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
    settingsWindow.clearAllData?.();
  } else if (action === 'reset-profile-usage') {
    event.preventDefault();
    resetCurrentProfileUsage();
  }
}

function handleSettingsChange(event) {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  const actionEl = closestWithin(event, '[data-settings-action]', modal);
  if (!actionEl) return;

  if (isSettingsToggleAction(actionEl)) {
    applySettingsToggle(actionEl);
    return;
  }

  const action = actionEl.dataset.settingsAction;
  if (action === 'set-pii-model') {
    setOllamaPIIModel(actionEl instanceof HTMLSelectElement ? actionEl.value : '');
    updatePrivacyStatusCard();
  }
}

function installSettingsDelegates(modal) {
  if (!modal || modal.dataset.delegatedActions === '1') return;
  modal.dataset.delegatedActions = '1';
  modal.addEventListener('click', handleSettingsClick);
  modal.addEventListener('change', handleSettingsChange);
}

let sunDataSourceDelegatesInstalled = false;

function closestSunDataSourceControl(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-sun-source-action]');
  return el instanceof HTMLElement && el.closest('#sun-data-source-section') ? el : null;
}

function handleSunDataSourceChange(event) {
  const el = closestSunDataSourceControl(event);
  if (!el) return;
  const action = el.dataset.sunSourceAction;
  if (action === 'set-meteo-mode') {
    const mode = (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) ? el.value || 'auto' : 'auto';
    setMeteoMode(mode);
  } else if (action === 'save-meteo-selfhost') {
    saveMeteoSelfhost();
  } else if (action === 'toggle-meteo-rounding') {
    toggleMeteoRounding(el instanceof HTMLInputElement && el.checked);
  }
}

function installSunDataSourceDelegates() {
  if (sunDataSourceDelegatesInstalled || typeof document === 'undefined') return;
  sunDataSourceDelegatesInstalled = true;
  document.addEventListener('change', handleSunDataSourceChange);
}

function handleTweaksClick(event) {
  const overlay = document.getElementById('tweaks-panel-overlay');
  if (!overlay) return;

  const toggleInput = toggleInputFromProxyClick(event, '[data-tweaks-action]', overlay);
  if (toggleInput && isTweaksToggleAction(toggleInput)) {
    event.preventDefault();
    toggleInput.checked = !toggleInput.checked;
    applyTweaksToggle(toggleInput);
    return;
  }

  if (event.target === overlay) {
    closeTweaksPanel();
    return;
  }

  const actionEl = closestWithin(event, '[data-tweaks-action]', overlay);
  if (!actionEl) return;

  const action = actionEl.dataset.tweaksAction;
  if (!action) return;

  if (action === 'close') {
    event.preventDefault();
    closeTweaksPanel();
  } else if (action === 'select-theme') {
    event.preventDefault();
    selectTweaksTheme(actionEl.dataset.themeId || 'dark');
  } else if (action === 'select-accent') {
    event.preventDefault();
    selectTweaksAccent(actionEl.dataset.accentId || '');
  } else if (action === 'reset-dashboard') {
    event.preventDefault();
    settingsWindow.resetDashboardWidgets?.();
    closeTweaksPanel();
  } else if (action === 'clear-dashboard') {
    event.preventDefault();
    settingsWindow.clearDashboardWidgets?.();
    closeTweaksPanel();
  } else if (action === 'organize-dashboard') {
    event.preventDefault();
    settingsWindow.toggleDashboardOrganizeMode?.(true);
    closeTweaksPanel();
  } else if (action === 'send-feedback') {
    event.preventDefault();
    closeTweaksPanel();
    settingsWindow.openFeedbackModal?.();
  }
}

function handleTweaksChange(event) {
  const overlay = document.getElementById('tweaks-panel-overlay');
  if (!overlay) return;
  const actionEl = closestWithin(event, '[data-tweaks-action]', overlay);
  if (!actionEl) return;

  if (isTweaksToggleAction(actionEl)) {
    applyTweaksToggle(actionEl);
  }
}

function installTweaksDelegates(overlay) {
  if (!overlay || overlay.dataset.delegatedActions === '1') return;
  overlay.dataset.delegatedActions = '1';
  overlay.addEventListener('click', handleTweaksClick);
  overlay.addEventListener('change', handleTweaksChange);
}

export function selectTweaksTheme(themeId) {
  if (themeChangeFrame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(themeChangeFrame);
  if (themeChangeTimer) clearTimeout(themeChangeTimer);
  themeChangeFrame = 0;
  themeChangeTimer = 0;
  pendingThemeId = themeId;
  markThemeControls(themeId);
  applyThemeChange(themeId);
}

export function selectTweaksAccent(accentId) {
  const next = TWEAK_ACCENTS.some(a => a.id === accentId) ? accentId : '';
  if (next) localStorage.setItem(ACCENT_STORAGE_KEY, next);
  else localStorage.removeItem(ACCENT_STORAGE_KEY);
  applyAccentOverride(next);
  refreshVisualSurfaces();
}

export function toggleTweaksSunsetMode(enabled) {
  setSunsetMode(!!enabled);
  applyAccentOverride();
  refreshVisualSurfaces();
}

export function toggleTweaksCrtEffects(enabled) {
  setCrtEffectsEnabled(!!enabled);
  refreshVisualSurfaces();
}

export function updateTweaksUI() {
  const panel = document.getElementById('tweaks-panel');
  if (!panel) return;
  const theme = getTheme();
  const accentId = getAccentOverride();
  const sunset = isSunsetMode();
  const crtEffects = isCrtEffectsEnabled();
  const crtSupported = supportsCrtEffects(theme);
  panel.classList.toggle('sunset-active', sunset);
  panel.classList.toggle('crt-active', crtEffects);
  panel.classList.toggle('crt-supported', crtSupported);
  const sunsetToggle = /** @type {HTMLInputElement | null} */ (panel.querySelector('#tweaks-sunset-mode'));
  if (sunsetToggle) sunsetToggle.checked = sunset;
  const crtRow = /** @type {HTMLElement | null} */ (panel.querySelector('#tweaks-crt-effects-row'));
  if (crtRow) crtRow.hidden = !crtSupported;
  const crtToggle = /** @type {HTMLInputElement | null} */ (panel.querySelector('#tweaks-crt-effects'));
  if (crtToggle) {
    crtToggle.checked = crtEffects;
    crtToggle.disabled = !crtSupported;
  }
  const themeButtons = /** @type {HTMLElement[]} */ (Array.from(panel.querySelectorAll('.tweaks-theme-btn')));
  themeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.themeId === theme));
  const accentButtons = /** @type {HTMLElement[]} */ (Array.from(panel.querySelectorAll('.tweaks-accent-btn')));
  accentButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accentId === accentId);
    if (btn.dataset.accentId === '') {
      const swatch = /** @type {HTMLElement | null} */ (btn.querySelector('.tweaks-accent-swatch'));
      const spec = accentSwatchSpec(null, theme);
      swatch?.style.setProperty('--tweak-accent', spec.color);
      swatch?.style.setProperty('--tweak-gradient', spec.gradient);
    }
  });
}

export function closeTweaksPanel() {
  const overlay = document.getElementById('tweaks-panel-overlay');
  if (overlay) removeModalOverlay(overlay);
}

export function openTweaksPanel() {
  closeTweaksPanel();
  const currentTheme = getTheme();
  const currentAccent = getAccentOverride();
  const currentSunset = isSunsetMode();
  const currentCrtEffects = isCrtEffectsEnabled();
  const currentCrtSupported = supportsCrtEffects(currentTheme);
  const themeButtons = THEMES.map(t => renderThemeButton(t, currentTheme, 'tweaks')).join('');
  const accentButtons = TWEAK_ACCENTS.map(a => {
    const swatch = accentSwatchSpec(a, currentTheme);
    return `
    <button type="button" class="tweaks-accent-btn${currentAccent === a.id ? ' active' : ''}" data-accent-id="${escapeAttr(a.id)}" data-tweaks-action="select-accent" title="${escapeAttr(a.label)}" aria-label="${escapeAttr(a.label)}">
      <span class="tweaks-accent-swatch" style="--tweak-accent:${escapeAttr(swatch.color)};--tweak-gradient:${escapeAttr(swatch.gradient)}"></span>
    </button>`;
  }).join('');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="tweaks-overlay" id="tweaks-panel-overlay">
      <aside class="tweaks-panel" id="tweaks-panel" role="dialog" aria-modal="true" aria-label="Tweaks">
        <div class="tweaks-head">
          <div>
            <div class="gb-modal-kicker">Controls</div>
            <div class="gb-modal-title">Tweaks</div>
          </div>
          <button class="modal-close" aria-label="Close" data-tweaks-action="close">&times;</button>
        </div>
        <div class="tweaks-body">
          <section class="tweaks-section">
            <div class="tweaks-section-title">Theme world</div>
            <div class="tweaks-theme-grid">${themeButtons}</div>
          </section>
          <section class="tweaks-section">
            <div class="tweaks-section-title">Accent color</div>
            <div class="tweaks-accent-row">${accentButtons}</div>
          </section>
          <section class="tweaks-section">
            <div class="tweaks-section-title">Visual modes</div>
            <div class="tweaks-option-row">
              <div class="settings-copy">
                <div class="settings-copy-title">Sunset mode</div>
                <div class="settings-copy-desc">Warm high-contrast palette for red blue-blocking glasses.</div>
              </div>
              <label class="toggle-switch" title="Use warm tokens that remain legible through red lenses">
                <input type="checkbox" id="tweaks-sunset-mode" ${currentSunset ? 'checked' : ''} data-tweaks-action="toggle-sunset">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="tweaks-option-row" id="tweaks-crt-effects-row"${currentCrtSupported ? '' : ' hidden'}>
              <div class="settings-copy">
                <div class="settings-copy-title">CRT effects</div>
                <div class="settings-copy-desc">Scanlines and phosphor glow for Terminal, Synth Sunrise, and Neuromancer.</div>
              </div>
              <label class="toggle-switch" title="Apply CRT scanline effects to terminal-style themes">
                <input type="checkbox" id="tweaks-crt-effects" ${currentCrtEffects ? 'checked' : ''}${currentCrtSupported ? '' : ' disabled'} data-tweaks-action="toggle-crt">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </section>
          <section class="tweaks-section">
            <div class="tweaks-section-title">Dashboard</div>
            <div class="tweaks-action-grid">
              <button type="button" data-tweaks-action="reset-dashboard">Reset layout</button>
              <button type="button" data-tweaks-action="clear-dashboard">Clear all widgets</button>
              <button type="button" data-tweaks-action="organize-dashboard">Organize widgets</button>
              <button type="button" data-tweaks-action="send-feedback">Send feedback</button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  `);
  const overlay = document.getElementById('tweaks-panel-overlay');
  installTweaksDelegates(overlay);
  updateTweaksUI();
  if (overlay) {
    openModalOverlay(overlay, {
      initialFocus: '#tweaks-panel button',
      focusDelay: 0,
      scrollLock: window.matchMedia?.('(max-width: 768px)').matches === true,
    });
  }
}

applyAccentOverride();
if (typeof window !== 'undefined') {
  window.addEventListener('labcharts-themechange', () => applyAccentOverride());
}
installSunDataSourceDelegates();

export function openSettingsModal(tab) {
  settingsWindow._settingsHadProvider = !!settingsWindow.hasAIProvider?.();
  const overlay = document.getElementById('settings-modal-overlay');
  const modal = document.getElementById('settings-modal');
  const provider = getAIProvider();
  // Legacy v1.27 tab id 'integrations' — same redirect as switchSettingsTab.
  // Older deep-links / tour steps / external links may still pass it.
  if (tab === 'integrations') tab = 'wearables';
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

    <!-- Display Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'display' ? ' active' : ''}" data-tab-panel="display">
      <div class="settings-row">
        <div class="settings-section">
          <label class="settings-label">Unit System</label>
          <div class="unit-toggle">
            <button class="unit-toggle-btn${state.unitSystem === 'EU' ? ' active' : ''}" data-unit="EU" data-settings-action="switch-unit">EU (SI)</button>
            <button class="unit-toggle-btn${state.unitSystem === 'US' ? ' active' : ''}" data-unit="US" data-settings-action="switch-unit">US</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label" title="When on, the marker detail view also shows values in the alternate unit system (e.g. mg/dL alongside mmol/L). Useful for cross-checking against a lab report printed in the other system.">Alternate Units</label>
          <div class="unit-toggle">
            <button class="unit-toggle-btn${!state.showAltUnits ? ' active' : ''}" data-alt-units="off" data-settings-action="toggle-alt-units">Off</button>
            <button class="unit-toggle-btn${state.showAltUnits ? ' active' : ''}" data-alt-units="on" data-settings-action="toggle-alt-units">Show both</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label">Range Display</label>
          <div class="range-toggle">
            <button class="range-toggle-btn${state.rangeMode === 'optimal' ? ' active' : ''}" data-range="optimal" data-settings-action="switch-range">Optimal</button>
            <button class="range-toggle-btn${state.rangeMode === 'reference' ? ' active' : ''}" data-range="reference" data-settings-action="switch-range">Reference</button>
            <button class="range-toggle-btn${state.rangeMode === 'both' ? ' active' : ''}" data-range="both" data-settings-action="switch-range">Both</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label">Time Format</label>
          <div class="unit-toggle">
            <button class="time-toggle-btn${getTimeFormat() === '24h' ? ' active' : ''}" data-timefmt="24h" data-settings-action="set-time-format">24h</button>
            <button class="time-toggle-btn${getTimeFormat() === '12h' ? ' active' : ''}" data-timefmt="12h" data-settings-action="set-time-format">12h (AM/PM)</button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-action-row">
            <div class="settings-copy">
              <div class="settings-copy-title">Appearance</div>
              <div class="settings-copy-desc">Themes, accent color, and dashboard layout live in the quick Tweaks panel.</div>
            </div>
            <button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="open-tweaks">Open Tweaks</button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-action-row">
            <div class="settings-copy">
              <label class="settings-label">Tips & Recommendations</label>
              <div class="settings-copy-desc">Supplement, food, and lifestyle guidance on markers</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="settings-product-recs" ${isProductRecsEnabled() ? 'checked' : ''} data-settings-action="set-product-recs">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-action-row">
            <div class="settings-copy">
              <label class="settings-label">Verbose console logging</label>
              <div class="settings-copy-desc">Adds detailed log output and reveals diagnostic UI in the sync popover. No data leaves your device.</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="debug-mode-toggle" ${isDebugMode() ? 'checked' : ''} data-settings-action="set-debug-mode">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-group-title">Resources</div>
      <div class="settings-links-row">
        <a href="/docs" class="settings-link-btn">Documentation</a>
        <button class="settings-link-btn" data-settings-action="start-guided-tour">Guided Tour</button>
        <button class="settings-link-btn" data-settings-action="open-changelog">What's New</button>
      </div>

      <div style="margin-top:16px;text-align:center;font-size:11px;color:var(--text-muted);font-family:var(--font-mono);opacity:0.6">v${escapeHTML(settingsWindow.APP_VERSION || '')} · <span id="settings-commit-hash">···</span></div>
    </div>

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
        <div id="ai-provider-panel">${settingsWindow.renderAIProviderPanel(provider)}</div>
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
  settingsWindow.initSettingsOllamaCheck();
  settingsWindow.initSettingsModelFetch();
  loadBackupSnapshots();
  loadSettingsCommitHash();
  hydrateSettingsSyncPanel();
  // Always fire so wearables Manual-row reading counts populate on first paint
  // (whether the user lands on the Integrations tab or switches into it).
  document.dispatchEvent(new CustomEvent('settings:wearables-rendered'));
  scrollActiveSettingsTabIntoView();
}

function scrollActiveSettingsTabIntoView() {
  requestAnimationFrame(() => {
    const bar = document.querySelector('#settings-modal .settings-tabs-bar');
    const active = /** @type {HTMLElement | null | undefined} */ (bar?.querySelector('.settings-tab-btn.active'));
    if (!bar || !active || window.matchMedia('(min-width: 721px)').matches) return;
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
    const short = sha.slice(0, 7);
    const e = document.getElementById('settings-commit-hash');
    if (!e) return;
    // Show branch suffix on previews so BETA testers can tell main from a feature branch.
    const suffix = ref && ref !== 'main' ? ` <span style="color:var(--text-muted);opacity:0.7">(${ref})</span>` : '';
    e.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${short}" target="_blank" rel="noopener" style="color:var(--text-muted);text-decoration:none">${short}</a>${suffix}`;
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
    settingsWindow.initSettingsOllamaCheck();
    settingsWindow.initSettingsModelFetch();
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

export function renderPrivacySection() {
  const piiUrl = getOllamaPIIUrl();
  const piiEnabled = isOllamaPIIEnabled();
  return `<div class="settings-action-row privacy-overview-row">
      <div class="privacy-overview-icon" aria-hidden="true">&#128274;</div>
      <div class="settings-copy">
        <div class="settings-copy-title">Personal details are scrubbed before AI analysis</div>
        <div class="settings-copy-desc">Names, dates of birth, ID numbers, and addresses are replaced before lab PDFs, EMF assessments, image imports, or chat context leave this device. Lab values and interpretation context are preserved.</div>
      </div>
    </div>
    <div class="privacy-status-card" id="privacy-status-card">
      <div class="privacy-status-icon" id="privacy-status-icon">&#128274;</div>
      <div class="privacy-status-body">
        <div class="privacy-status-title" id="privacy-status-title">Checking...</div>
        <div class="privacy-status-detail" id="privacy-status-detail"></div>
      </div>
    </div>
    <div class="privacy-configure-toggle" data-settings-action="toggle-privacy-configure">
      <span class="privacy-configure-arrow" id="privacy-configure-arrow">&#9654;</span>
      Configure Local AI
    </div>
    <div class="privacy-configure-body" id="privacy-configure-body" style="display:none">
      <div id="pii-model-section">
        <div class="local-ai-status" id="pii-local-status">
          <span class="local-ai-status-dot" id="pii-local-dot"></span>
          <span id="pii-local-status-text">Click Test to check</span>
        </div>
        <div style="margin-top:8px">
          <label style="font-size:12px;color:var(--text-muted)">Server address</label>
          <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
            <input type="text" class="api-key-input" id="pii-local-url-input" value="${piiUrl}" placeholder="http://localhost:11434" style="flex:1">
            <button class="import-btn import-btn-secondary" data-settings-action="test-pii-ollama" style="white-space:nowrap">Test</button>
          </div>
        </div>
        <div id="pii-model-dropdown" style="margin-top:8px;display:none">
          <label style="font-size:12px;color:var(--text-muted)">Privacy model <span style="font-size:11px">(can be a smaller, faster model)</span></label>
          <select class="api-key-input" id="pii-model-select" style="margin-top:4px" data-settings-action="set-pii-model"></select>
        </div>
      </div>
    </div>
    <div class="settings-action-row privacy-setting-row">
      <div class="settings-copy">
        <div class="settings-copy-title">Use local AI for privacy protection</div>
        <div class="settings-copy-desc">Requires a local AI server. When disabled, regex pattern matching is used instead.</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="pii-local-toggle" ${piiEnabled ? 'checked' : ''} data-settings-action="toggle-pii-local">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="settings-action-row privacy-setting-row">
      <div class="settings-copy">
        <div class="settings-copy-title">Review obfuscated text before sending to AI</div>
        <div class="settings-copy-desc">Pause after privacy protection runs so you can inspect what the AI is about to receive.</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="pii-review-toggle" ${isPIIReviewEnabled() ? 'checked' : ''} data-settings-action="toggle-pii-review">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;
}

function renderPrivacyAnalyticsSection() {
  return `<div class="settings-action-row">
    <div class="settings-copy">
      <div class="settings-copy-title">Send anonymous usage stats</div>
      <div class="settings-copy-desc">I track cookieless pageviews and outbound affiliate clicks only. No health data, viewed records, user identity, or health context is sent.</div>
      <div class="privacy-setting-note">Takes effect on next launch.</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="analytics-toggle" ${isAnalyticsEnabled() ? 'checked' : ''} data-settings-action="set-analytics">
      <span class="toggle-slider"></span>
    </label>
  </div>`;
}

function _renderMeteoModeOption(mode, label, desc) {
  const cur = (typeof window !== 'undefined' && window.getMeteoConfig) ? window.getMeteoConfig().mode : 'auto';
  const checked = cur === mode;
  return `<label style="display:flex;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;${checked ? 'background:var(--bg-card);border-color:var(--accent);' : ''}">
    <input type="radio" name="meteo-mode" value="${mode}" ${checked ? 'checked' : ''} data-sun-source-action="set-meteo-mode" style="margin-top:3px">
    <span>
      <span style="font-size:13px;font-weight:500;color:var(--text-primary)">${label}</span>
      <br><span style="font-size:11px;color:var(--text-muted);line-height:1.4">${desc}</span>
    </span>
  </label>`;
}

// Render the Sun Data Source settings block. Lives on the Light & Sun
// page (called from views.showLight) — moved out of Settings → Privacy
// in v1.7.x because the URL/bearer/mode fields are feature config, not
// privacy posture. The `Round location to ~11 km grid` toggle inside is
// privacy-flavored but stays here for cohesion (one place to configure
// the data source).
export function renderSunDataSourceSettings() {
  const cfg = (typeof window !== 'undefined' && window.getMeteoConfig) ? window.getMeteoConfig() : { mode: 'auto', selfhostUrl: '', selfhostBearer: '', privacyRounding: 0.1 };
  return `<div class="local-ai-settings" id="sun-data-source-section">
    <h4 style="margin:0 0 6px 0;font-size:13px;color:var(--text-primary)">☀ Sun data source</h4>
    <div class="ai-provider-desc" style="margin-bottom:10px">Where the Light &amp; Sun lens fetches UV / ozone / atmosphere data. Lat/lon defaults to your country (no automatic geolocation). Manual entry always works.</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${_renderMeteoModeOption('auto', 'Default — best accuracy', 'Real ozone + aerosols from CAMS, clouds + temperature from Open-Meteo, automatically merged. Falls back to Open-Meteo only if CAMS is unreachable. Pick this unless you have a specific reason not to.')}
      ${_renderMeteoModeOption('open-meteo', 'Open-Meteo only', 'Skip CAMS. Slightly noisier UV math (no real ozone DU), but only one upstream sees your lat/lon. Faster too.')}
      ${_renderMeteoModeOption('selfhost', 'Self-hosted server', 'You run your own getbased-uvdata box. Lat/lon never leaves your infrastructure. Paste the URL + bearer below.')}
      ${_renderMeteoModeOption('manual', 'UV meter / manual entry', 'Type the UV index yourself per session — most accurate if you own a UV meter (Solarmeter 6.5R, Hocoma, EMR-Tek). No network calls at all.')}
    </div>
    <div id="meteo-selfhost-fields" style="margin-top:10px;${cfg.mode === 'selfhost' ? '' : 'display:none'}">
      <label style="font-size:12px;color:var(--text-muted)">Server URL</label>
      <input type="text" class="api-key-input" id="meteo-selfhost-url" value="${escapeAttr(cfg.selfhostUrl || '')}" placeholder="https://meteo.example.com" style="width:100%;margin-top:4px" data-sun-source-action="save-meteo-selfhost">
      <label style="font-size:12px;color:var(--text-muted);margin-top:8px;display:block">Bearer token (optional)</label>
      <input type="password" class="api-key-input" id="meteo-selfhost-bearer" value="${escapeAttr(cfg.selfhostBearer || '')}" placeholder="••••••••" style="width:100%;margin-top:4px" data-sun-source-action="save-meteo-selfhost">
    </div>
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-top:14px">
      <span style="font-size:13px">Round location to ~11 km grid before sending<br><span style="font-size:11px;color:var(--text-muted)">Default ON. Stops the data source from seeing your exact address. Disable for slightly sharper UV math.</span></span>
      <label class="toggle-switch" style="margin-top:2px">
        <input type="checkbox" id="meteo-privacy-rounding" ${(cfg.privacyRounding ?? 0.1) > 0 ? 'checked' : ''} data-sun-source-action="toggle-meteo-rounding">
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>`;
}

function setMeteoMode(mode) {
  if (!settingsWindow.getMeteoConfig || !settingsWindow.saveMeteoConfig) return;
  const cfg = settingsWindow.getMeteoConfig();
  cfg.mode = mode;
  settingsWindow.saveMeteoConfig(cfg);
  const fields = document.getElementById('meteo-selfhost-fields');
  if (fields) fields.style.display = mode === 'selfhost' ? '' : 'none';
}

function saveMeteoSelfhost() {
  if (!settingsWindow.getMeteoConfig || !settingsWindow.saveMeteoConfig) return;
  const cfg = settingsWindow.getMeteoConfig();
  const url = /** @type {HTMLInputElement | null} */ (document.getElementById('meteo-selfhost-url'))?.value?.trim() || '';
  const bearer = /** @type {HTMLInputElement | null} */ (document.getElementById('meteo-selfhost-bearer'))?.value?.trim() || '';
  cfg.selfhostUrl = url;
  cfg.selfhostBearer = bearer;
  settingsWindow.saveMeteoConfig(cfg);
}

function toggleMeteoRounding(enabled) {
  if (!settingsWindow.getMeteoConfig || !settingsWindow.saveMeteoConfig) return;
  const cfg = settingsWindow.getMeteoConfig();
  cfg.privacyRounding = enabled ? 0.1 : 0;
  settingsWindow.saveMeteoConfig(cfg);
}

if (typeof window !== 'undefined') {
  window.renderSunDataSourceSettings = renderSunDataSourceSettings;
}

export function togglePrivacyConfigure() {
  const body = document.getElementById('privacy-configure-body');
  const arrow = document.getElementById('privacy-configure-arrow');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arrow) arrow.innerHTML = open ? '&#9654;' : '&#9660;';
}

export function toggleOllamaPII(enabled) {
  setOllamaPIIEnabled(enabled);
  updatePrivacyStatusCard();
  if (enabled) {
    // Expand the configure panel so user can set up Ollama
    const body = document.getElementById('privacy-configure-body');
    const arrow = document.getElementById('privacy-configure-arrow');
    if (body) body.style.display = 'block';
    if (arrow) arrow.innerHTML = '&#9660;';
  }
}

export async function updatePrivacyStatusCard(enhanced) {
  const icon = document.getElementById('privacy-status-icon');
  const title = document.getElementById('privacy-status-title');
  const detail = document.getElementById('privacy-status-detail');
  const card = document.getElementById('privacy-status-card');
  if (!title || !detail || !card) return;
  // If opt-in is off, always show basic
  if (!isOllamaPIIEnabled()) { enhanced = false; }
  // If not passed explicitly, check PII Ollama
  else if (enhanced === undefined) {
    try {
      const piiUrl = getOllamaPIIUrl();
      const config = getOllamaConfig();
      const result = await checkOpenAICompatible(piiUrl, config.apiKey);
      enhanced = result.available && result.models.length > 0;
    } catch { enhanced = false; }
  }
  if (enhanced) {
    const model = getOllamaPIIModel();
    card.className = 'privacy-status-card privacy-status-enhanced';
    if (icon) icon.innerHTML = '&#128274;';
    title.textContent = 'Enhanced protection';
    detail.textContent = `Local AI (${model}) understands context and language, so it reliably finds and replaces all personal info — including uncommon formats and non-English text.`;
  } else {
    card.className = 'privacy-status-card privacy-status-basic';
    if (icon) icon.innerHTML = '&#128274;';
    title.textContent = 'Basic protection';
    detail.innerHTML = 'Regex pattern matching catches common formats (names on labeled lines, IDs, emails, phone numbers). May miss unusual layouts or non-English personal data.<br><span style="margin-top:4px;display:inline-block">Set up Local AI for enhanced protection — a local server that reliably catches all personal info.</span>';
  }
}

export function updateSettingsUI() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  // Scope by data-attribute so the shared `.unit-toggle-btn` style class can be
  // reused for the Alternate Units row without the Unit System updater
  // accidentally deactivating it (its buttons lack a data-unit attribute).
  const unitButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.unit-toggle-btn[data-unit]')));
  unitButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.unit === state.unitSystem));
  const rangeButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.range-toggle-btn')));
  rangeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.range === state.rangeMode));
  const altUnitButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.unit-toggle-btn[data-alt-units]')));
  altUnitButtons.forEach(btn => btn.classList.toggle('active', (btn.dataset.altUnits === 'on') === !!state.showAltUnits));
  const theme = getTheme();
  const themeButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.settings-theme-btn')));
  themeButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeId === theme);
  });
  const timeFmt = getTimeFormat();
  const timeButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.time-toggle-btn')));
  timeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.timefmt === timeFmt));
}

export function closeSettingsModal() {
  closeModalOverlay('settings-modal-overlay');
  if (settingsWindow.updateChatNudge) settingsWindow.updateChatNudge();
  settingsWindow.refreshMobileDashboardActiveTab?.();
}

Object.assign(window, {
  openSettingsModal,
  closeSettingsModal,
  switchSettingsTab,
  renderPrivacySection,
  togglePrivacyConfigure,
  toggleOllamaPII,
  confirmDisablePIIReview,
  updatePrivacyStatusCard,
  updateSettingsUI,
  renderDataEntriesSection,
  refreshDataEntriesSection,
  removeImportedEntry: removeImportedEntryFromSettings,
  renameImportedEntryDate: renameImportedEntryDateFromSettings,
  removeImportedEntryFromSettings,
  renameImportedEntryDateFromSettings,
  resetCurrentProfileUsage,
  openTweaksPanel,
  closeTweaksPanel,
  selectTweaksTheme,
  selectTweaksAccent,
  toggleTweaksSunsetMode,
  toggleTweaksCrtEffects,
  applyAccentOverride,
  scheduleChartThemeRefresh,
  updateTweaksUI,
});
