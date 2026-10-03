// settings-tweaks.js - Theme, accent, visual-mode, and dashboard quick controls.

import { refreshChartThemeColors } from './charts.js';
import {
  openModalOverlay,
  removeModalOverlay,
} from './modal-lifecycle.js';
import {
  cancelSettingsFrame,
  refreshSettingsRuntimeSurfaces,
  requestSettingsFrame,
  settingsMediaMatches,
} from './settings-runtime.js';
import {
  accentSwatchSpec,
  applyAccentOverride,
  getAccentOverride,
  getTheme,
  isCrtEffectsEnabled,
  isSunsetMode,
  setAccentOverride,
  setCrtEffectsEnabled,
  setSunsetMode,
  setTheme,
  supportsCrtEffects,
  THEMES,
  TWEAK_ACCENTS,
} from './theme.js';
import { escapeAttr, escapeHTML } from './utils.js';
import {
  closestSettingsTarget,
  getSettingsProxyToggle,
} from './settings-event-target.js';

interface SettingsTweaksCalls {
  clearDashboardWidgets(): unknown; openFeedbackModal(): unknown;
  resetDashboardWidgets(): unknown; toggleDashboardOrganizeMode(force?: boolean): unknown;
  updateSettingsUI(): unknown;
}

const settingsTweaksRuntime: SettingsTweaksCalls = {
  clearDashboardWidgets: () => {},
  openFeedbackModal: () => {},
  resetDashboardWidgets: () => {},
  toggleDashboardOrganizeMode: () => {},
  updateSettingsUI: () => {},
};

export function configureSettingsTweaksRuntime(runtime: unknown = {}) {
  Object.assign(settingsTweaksRuntime, runtime);
}

function renderThemeButton(theme: typeof THEMES[number], currentTheme: unknown) {
  const id = escapeAttr(theme.id);
  const label = escapeHTML(theme.label);
  const active = currentTheme === theme.id ? ' active' : '';
  return `
    <button type="button" class="tweaks-theme-btn${active}" data-theme-id="${id}" data-tweaks-action="select-theme">
      <span class="settings-theme-swatch settings-theme-swatch-${id}" aria-hidden="true"></span>
      <span>${label}</span>
    </button>
  `;
}

function refreshVisualSurfaces() {
  const settingsVisible = document.getElementById('settings-modal')?.classList.contains('show') === true;
  refreshSettingsRuntimeSurfaces({
    settingsVisible,
    updateSettingsUI: settingsTweaksRuntime.updateSettingsUI,
    updateTweaksUI,
  });
  scheduleChartThemeRefresh();
}

let chartThemeRefreshFrame: unknown = 0;
let chartThemeRefreshTimer: ReturnType<typeof setTimeout> | 0 = 0;
function scheduleChartThemeRefresh() {
  if (chartThemeRefreshFrame) cancelSettingsFrame(chartThemeRefreshFrame);
  if (chartThemeRefreshTimer) clearTimeout(chartThemeRefreshTimer);
  const refresh = () => refreshChartThemeColors({ batchSize: 4 });
  const frame = requestSettingsFrame(() => {
    chartThemeRefreshFrame = 0;
    chartThemeRefreshTimer = setTimeout(() => {
      chartThemeRefreshTimer = 0;
      refresh();
    }, 0);
  });
  if (frame !== null) {
    chartThemeRefreshFrame = frame;
  } else {
    chartThemeRefreshTimer = setTimeout(() => {
      chartThemeRefreshFrame = 0;
      chartThemeRefreshTimer = 0;
      refresh();
    }, 0);
  }
}

let themeChangeFrame: unknown = 0;
let themeChangeTimer: ReturnType<typeof setTimeout> | 0 = 0;
let pendingThemeId: unknown = '';
function markThemeControls(themeId: unknown) {
  const buttons = (Array.from(document.querySelectorAll('.settings-theme-btn,.tweaks-theme-btn')) as HTMLElement[]);
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeId === themeId);
  });
}

function applyThemeChange(themeId: unknown) {
  (setTheme as (theme: unknown) => ReturnType<typeof setTheme>)(themeId);
  applyAccentOverride();
  refreshVisualSurfaces();
}

export function scheduleSettingsThemeChange(themeId: unknown) {
  pendingThemeId = themeId;
  markThemeControls(themeId);
  if (themeChangeFrame) cancelSettingsFrame(themeChangeFrame);
  if (themeChangeTimer) clearTimeout(themeChangeTimer);
  const commit = () => {
    themeChangeTimer = 0;
    applyThemeChange(pendingThemeId);
  };
  const frame = requestSettingsFrame(() => {
    const nextFrame = requestSettingsFrame(() => {
      themeChangeFrame = 0;
      commit();
    });
    if (nextFrame !== null) {
      themeChangeFrame = nextFrame;
    } else {
      themeChangeFrame = 0;
      commit();
    }
  });
  if (frame !== null) {
    themeChangeFrame = frame;
  } else {
    themeChangeTimer = setTimeout(() => {
      themeChangeFrame = 0;
      commit();
    }, 0);
  }
}

function applyTweaksToggle(actionEl: HTMLElement) {
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

function isTweaksToggleAction(actionEl: HTMLElement) {
  return actionEl.dataset.tweaksAction === 'toggle-sunset'
    || actionEl.dataset.tweaksAction === 'toggle-crt';
}

function handleTweaksClick(event: Event) {
  const overlay = document.getElementById('tweaks-panel-overlay');
  if (!overlay) return;

  const toggleInput = getSettingsProxyToggle(event, '[data-tweaks-action]', overlay);
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

  const actionEl = closestSettingsTarget(event, '[data-tweaks-action]', overlay);
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
    settingsTweaksRuntime.resetDashboardWidgets();
    closeTweaksPanel();
  } else if (action === 'clear-dashboard') {
    event.preventDefault();
    settingsTweaksRuntime.clearDashboardWidgets();
    closeTweaksPanel();
  } else if (action === 'organize-dashboard') {
    event.preventDefault();
    settingsTweaksRuntime.toggleDashboardOrganizeMode(true);
    closeTweaksPanel();
  } else if (action === 'send-feedback') {
    event.preventDefault();
    closeTweaksPanel();
    settingsTweaksRuntime.openFeedbackModal();
  }
}

function handleTweaksChange(event: Event) {
  const overlay = document.getElementById('tweaks-panel-overlay');
  if (!overlay) return;
  const actionEl = closestSettingsTarget(event, '[data-tweaks-action]', overlay);
  if (actionEl && isTweaksToggleAction(actionEl)) applyTweaksToggle(actionEl);
}

function installTweaksDelegates(overlay: HTMLElement | null) {
  if (!overlay || overlay.dataset.delegatedActions === '1') return;
  overlay.dataset.delegatedActions = '1';
  overlay.addEventListener('click', handleTweaksClick);
  overlay.addEventListener('change', handleTweaksChange);
}

export function selectTweaksTheme(themeId: unknown) {
  if (themeChangeFrame) cancelSettingsFrame(themeChangeFrame);
  if (themeChangeTimer) clearTimeout(themeChangeTimer);
  themeChangeFrame = 0;
  themeChangeTimer = 0;
  pendingThemeId = themeId;
  markThemeControls(themeId);
  applyThemeChange(themeId);
}

export function selectTweaksAccent(accentId: unknown) {
  (setAccentOverride as (accent: unknown) => ReturnType<typeof setAccentOverride>)(accentId);
  refreshVisualSurfaces();
}

export function toggleTweaksSunsetMode(enabled: unknown) {
  setSunsetMode(!!enabled);
  applyAccentOverride();
  refreshVisualSurfaces();
}

export function toggleTweaksCrtEffects(enabled: unknown) {
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
  const sunsetToggle = (panel.querySelector('#tweaks-sunset-mode') as HTMLInputElement | null);
  if (sunsetToggle) sunsetToggle.checked = sunset;
  const crtRow = (panel.querySelector('#tweaks-crt-effects-row') as HTMLElement | null);
  if (crtRow) crtRow.hidden = !crtSupported;
  const crtToggle = (panel.querySelector('#tweaks-crt-effects') as HTMLInputElement | null);
  if (crtToggle) {
    crtToggle.checked = crtEffects;
    crtToggle.disabled = !crtSupported;
  }
  const themeButtons = (Array.from(panel.querySelectorAll('.tweaks-theme-btn')) as HTMLElement[]);
  themeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.themeId === theme));
  const accentButtons = (Array.from(panel.querySelectorAll('.tweaks-accent-btn')) as HTMLElement[]);
  accentButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accentId === accentId);
    if (btn.dataset.accentId === '') {
      const swatch = (btn.querySelector('.tweaks-accent-swatch') as HTMLElement | null);
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
  const themeButtons = THEMES.map(theme => renderThemeButton(theme, currentTheme)).join('');
  const accentButtons = TWEAK_ACCENTS.map(accent => {
    const swatch = accentSwatchSpec(accent, currentTheme);
    return `
    <button type="button" class="tweaks-accent-btn${currentAccent === accent.id ? ' active' : ''}" data-accent-id="${escapeAttr(accent.id)}" data-tweaks-action="select-accent" title="${escapeAttr(accent.label)}" aria-label="${escapeAttr(accent.label)}">
      <span class="tweaks-accent-swatch" style="--tweak-accent:${escapeAttr(swatch.color)};--tweak-gradient:${escapeAttr(swatch.gradient)}"></span>
    </button>`;
  }).join('');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="tweaks-overlay" id="tweaks-panel-overlay">
      <aside class="tweaks-panel" id="tweaks-panel" role="dialog" aria-modal="true" aria-label="Tweaks">
        <div class="tweaks-head">
          <div>
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
      scrollLock: settingsMediaMatches('(max-width: 768px)'),
    });
  }
}
