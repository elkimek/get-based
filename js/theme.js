// @ts-check
// theme.js — Theme management, chart colors, time format

import { showNotification } from './utils.js';

const VALID_THEMES = ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer'];
const EXTRA_THEMES = new Set(['cyberterm', 'glass', 'synth-sunrise', 'neuromancer']);
const EXTRA_THEMES_STYLESHEET_URL = new URL('../themes-extra.css', import.meta.url).href;
const CRT_EFFECT_THEMES = new Set(['cyberterm', 'synth-sunrise', 'neuromancer']);
const SUNSET_MODE_KEY = 'labcharts-sunset-mode';
const CRT_EFFECTS_KEY = 'labcharts-crt-effects';
const SUNSET_THEME_COLOR = '#120504';
const THEME_BAR_COLORS = {
  dark: '#0a0a12',
  light: '#ffffff',
  cyberterm: '#0b0d0b',
  glass: '#0a0817',
  'synth-sunrise': '#0d0524',
  neuromancer: '#050608',
};
const ACCENT_STORAGE_KEY = 'labcharts-accent-override';
const THEME_DEFAULT_ACCENTS = {
  dark: { color: '#4f8cff', light: '#6ba0ff', fill: 'rgba(79, 140, 255, 0.10)', gradient: 'linear-gradient(135deg, #4f8cff 0%, #6366f1 100%)' },
  light: { color: '#3b7cf5', light: '#2b6ce5', fill: 'rgba(59,124,245,0.10)', gradient: 'linear-gradient(135deg, #3b7cf5 0%, #5b5bf6 100%)' },
  cyberterm: { color: '#4ade80', light: '#6df09a', fill: 'rgba(74,222,128,0.10)', gradient: 'linear-gradient(135deg, #4ade80 0%, #4ade80 100%)' },
  glass: { color: '#c986ff', light: '#e0a5ff', fill: 'rgba(201,134,255,0.10)', gradient: 'linear-gradient(135deg, #c986ff 0%, #6ec4ff 100%)' },
  'synth-sunrise': { color: '#ff2bd6', light: '#ff6ce0', fill: 'rgba(255,43,214,0.10)', gradient: 'linear-gradient(135deg, #ff7a18 0%, #ff2bd6 50%, #7c3aed 100%)' },
  neuromancer: { color: '#00e5ff', light: '#5cf2ff', fill: 'rgba(0,229,255,0.10)', gradient: 'linear-gradient(135deg, #00e5ff 0%, #ff2bd6 100%)' },
};

/** @type {Promise<HTMLLinkElement> | null} */
let extraThemesStylesheetPromise = null;
let extraThemesStylesheetLoaded = false;
let useExtraThemesStylesheetRetryUrl = false;

function existingExtraThemesStylesheet() {
  if (typeof document === 'undefined') return null;
  return /** @type {HTMLLinkElement | null} */ (
    document.querySelector('link[data-extra-themes-stylesheet]')
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find(link => {
        try {
          return new URL(/** @type {HTMLLinkElement} */ (link).href).pathname === '/themes-extra.css';
        } catch {
          return false;
        }
      })
    || null
  );
}

function extraThemesStylesheetUrl() {
  if (!useExtraThemesStylesheetRetryUrl) return EXTRA_THEMES_STYLESHEET_URL;
  const retryUrl = new URL(EXTRA_THEMES_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isExtraThemesStylesheetLoaded() {
  return extraThemesStylesheetLoaded || !!existingExtraThemesStylesheet()?.sheet;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadExtraThemesStylesheet() {
  const existing = existingExtraThemesStylesheet();
  if (existing?.sheet) {
    extraThemesStylesheetLoaded = true;
    return Promise.resolve(existing);
  }
  if (!extraThemesStylesheetPromise) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Extra themes stylesheet requires a document'));
    }
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = extraThemesStylesheetUrl();
    link.dataset.extraThemesStylesheet = '';
    extraThemesStylesheetPromise = new Promise(function beginExtraThemesStylesheetLoad(resolve, reject) {
      link.addEventListener('load', function markExtraThemesStylesheetLoaded() {
        extraThemesStylesheetLoaded = true;
        resolve(link);
      }, { once: true });
      link.addEventListener('error', function rejectExtraThemesStylesheetLoad() {
        reject(new Error('Extra themes stylesheet could not be loaded'));
      }, { once: true });
      if (!link.isConnected) {
        const anchor = document.querySelector('[data-extra-themes-stylesheet-anchor]');
        const parent = anchor?.parentNode || document.head;
        parent.insertBefore(link, anchor || null);
      }
    }).catch(function resetExtraThemesStylesheetLoad(err) {
      link.remove();
      extraThemesStylesheetPromise = null;
      extraThemesStylesheetLoaded = false;
      useExtraThemesStylesheetRetryUrl = true;
      throw err;
    });
  }
  return extraThemesStylesheetPromise;
}

export const TWEAK_ACCENTS = [
  { id: '', label: 'Theme default' },
  { id: 'blue', label: 'Blue', color: '#4f8cff', light: '#6ba0ff', fill: 'rgba(79, 140, 255, 0.10)', gradient: 'linear-gradient(135deg, #4f8cff 0%, #6366f1 100%)' },
  { id: 'green', label: 'Green', color: '#34d399', light: '#6ee7b7', fill: 'rgba(52, 211, 153, 0.12)', gradient: 'linear-gradient(135deg, #34d399 0%, #14b8a6 100%)' },
  { id: 'amber', label: 'Amber', color: '#f59e0b', light: '#fbbf24', fill: 'rgba(245, 158, 11, 0.12)', gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)' },
  { id: 'rose', label: 'Rose', color: '#f43f5e', light: '#fb7185', fill: 'rgba(244, 63, 94, 0.12)', gradient: 'linear-gradient(135deg, #f43f5e 0%, #d946ef 100%)' },
  { id: 'cyan', label: 'Cyan', color: '#06b6d4', light: '#22d3ee', fill: 'rgba(6, 182, 212, 0.12)', gradient: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)' },
];

export const THEMES = [
  { id: 'dark',          label: 'Modern Minimal' },
  { id: 'light',         label: 'Soft Warm Light' },
  { id: 'cyberterm',     label: 'Cypherpunk Terminal' },
  { id: 'glass',         label: 'Glass / Liquid' },
  { id: 'synth-sunrise', label: 'Synth Sunrise' },
  { id: 'neuromancer',   label: 'Neuromancer' },
];

/** @param {Record<string, any> | null | undefined} accent */
export function accentSwatchSpec(accent, theme = getTheme()) {
  return accent?.id ? accent : (THEME_DEFAULT_ACCENTS[theme] || THEME_DEFAULT_ACCENTS.dark);
}

export function getAccentOverride() {
  if (typeof localStorage === 'undefined') return '';
  const value = localStorage.getItem(ACCENT_STORAGE_KEY) || '';
  return TWEAK_ACCENTS.some(accent => accent.id === value) ? value : '';
}

export function setAccentOverride(id) {
  const next = TWEAK_ACCENTS.some(accent => accent.id === id) ? id : '';
  if (next) localStorage.setItem(ACCENT_STORAGE_KEY, next);
  else localStorage.removeItem(ACCENT_STORAGE_KEY);
  applyAccentOverride(next);
  return next;
}

export function applyAccentOverride(id = getAccentOverride()) {
  if (typeof document === 'undefined') return;
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
  const accent = TWEAK_ACCENTS.find(option => option.id === id);
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

/**
 * @typedef {{
 *   dispatchThemeChange: (detail: Record<string, any>) => void,
 *   refreshThemeDependentsFromRuntime: (options?: { settingsModalOpen?: boolean }) => void,
 * }} ThemeRuntimeHooks
 */

function getFallbackThemeRuntimeGlobal() {
  return typeof globalThis !== 'undefined'
    ? /** @type {any} */ (globalThis)
    : null;
}

/** @type {ThemeRuntimeHooks} */
const fallbackThemeRuntime = {
  dispatchThemeChange(detail) {
    const runtime = getFallbackThemeRuntimeGlobal();
    const CustomEventCtor = runtime?.CustomEvent;
    if (!runtime || typeof CustomEventCtor !== 'function') return;
    runtime.dispatchEvent(new CustomEventCtor('labcharts-themechange', { detail }));
  },
  refreshThemeDependentsFromRuntime(options = {}) {
    const runtime = getFallbackThemeRuntimeGlobal();
    if (!runtime) return;
    runtime.applyAccentOverride?.();
    runtime.updateSettingsUI?.();
    runtime.updateTweaksUI?.();
    if (typeof runtime.scheduleChartThemeRefresh === 'function') runtime.scheduleChartThemeRefresh();
    else runtime.refreshChartThemeColors?.({ batchSize: 4 });
    if (options.settingsModalOpen) runtime.refreshSettingsWearables?.();
  },
};

/** @type {ThemeRuntimeHooks} */
let themeRuntimeHooks = fallbackThemeRuntime;

// Static imports of newly-added modules can break already-installed service
// worker clients during cache transitions. Use the split runtime when it is
// fetchable, but keep this module evaluable with the fallback above.
if (typeof globalThis !== 'undefined') {
  import('./theme-runtime.js')
    .then(runtime => {
      themeRuntimeHooks = {
        dispatchThemeChange: typeof runtime.dispatchThemeChange === 'function'
          ? runtime.dispatchThemeChange
          : fallbackThemeRuntime.dispatchThemeChange,
        refreshThemeDependentsFromRuntime: typeof runtime.refreshThemeDependentsFromRuntime === 'function'
          ? runtime.refreshThemeDependentsFromRuntime
          : fallbackThemeRuntime.refreshThemeDependentsFromRuntime,
      };
    })
    .catch(() => {});
}

function dispatchThemeChange(detail) {
  themeRuntimeHooks.dispatchThemeChange(detail);
}

function refreshThemeDependentsFromRuntime(options) {
  themeRuntimeHooks.refreshThemeDependentsFromRuntime(options);
}

export function getTimeFormat() { return localStorage.getItem('labcharts-time-format') || '24h'; }
export function setTimeFormat(fmt) { localStorage.setItem('labcharts-time-format', fmt); }

export function formatTime(time24) {
  if (!time24) return '';
  if (getTimeFormat() === '24h') return time24;
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function parseTimeInput(val) {
  if (!val) return '';
  const v = val.trim().toUpperCase();
  // 24h format: "14:30" or "8:00"
  const m24 = v.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1]), m = parseInt(m24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  // 12h format: "2:30 PM", "2:30PM", "2PM"
  const m12 = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (m12) {
    let h = parseInt(m12[1]);
    const m = parseInt(m12[2] || '0');
    const p = m12[3];
    if (p === 'AM' && h === 12) h = 0;
    else if (p === 'PM' && h !== 12) h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  return '';
}

export function getTheme() {
  const theme = localStorage.getItem('labcharts-theme') || 'dark';
  return VALID_THEMES.includes(theme) ? theme : 'dark';
}

export function getThemeColor(theme = getTheme()) {
  if (isSunsetMode()) return SUNSET_THEME_COLOR;
  return THEME_BAR_COLORS[theme] || THEME_BAR_COLORS.dark;
}

export function getThemeColorScheme(theme = getTheme()) {
  return !isSunsetMode() && theme === 'light' ? 'light' : 'dark';
}

function applyThemeChrome(theme = getTheme()) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    if (meta instanceof HTMLMetaElement) meta.content = getThemeColor(theme);
  });
  document.documentElement.style.colorScheme = getThemeColorScheme(theme);
}

export function isSunsetMode() {
  return localStorage.getItem(SUNSET_MODE_KEY) === 'true';
}

export function isCrtEffectsEnabled() {
  return localStorage.getItem(CRT_EFFECTS_KEY) === 'true';
}

export function supportsCrtEffects(theme = getTheme()) {
  return CRT_EFFECT_THEMES.has(theme);
}

function applyCrtEffectsAttr(enabled = isCrtEffectsEnabled()) {
  if (typeof document === 'undefined') return;
  if (enabled) document.documentElement.dataset.crtEffects = 'on';
  else delete document.documentElement.dataset.crtEffects;
}

export function setSunsetMode(enabled) {
  const on = !!enabled;
  if (on) localStorage.setItem(SUNSET_MODE_KEY, 'true');
  else localStorage.removeItem(SUNSET_MODE_KEY);
  if (on) document.documentElement.dataset.sunsetMode = 'on';
  else delete document.documentElement.dataset.sunsetMode;
  applyThemeChrome(getTheme());
  applyAccentOverride();
  dispatchThemeChange({ theme: getTheme(), sunsetMode: on });
}

export function setCrtEffectsEnabled(enabled) {
  const on = !!enabled;
  if (on) localStorage.setItem(CRT_EFFECTS_KEY, 'true');
  else localStorage.removeItem(CRT_EFFECTS_KEY);
  applyCrtEffectsAttr(on);
  dispatchThemeChange({ theme: getTheme(), crtEffects: on });
}

export function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) theme = 'dark';
  const stylesheetReady = EXTRA_THEMES.has(theme) && !isExtraThemesStylesheetLoaded()
    ? loadExtraThemesStylesheet()
    : null;
  localStorage.setItem('labcharts-theme', theme);
  if (theme === 'dark') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  applyThemeChrome(theme);
  applyAccentOverride();
  dispatchThemeChange({ theme });
  if (stylesheetReady) {
    return stylesheetReady
      .then(function refreshLoadedExtraTheme() {
        if (getTheme() !== theme) return true;
        applyAccentOverride();
        dispatchThemeChange({ theme, extraThemesStylesheetLoaded: true });
        refreshThemeDependents();
        return true;
      })
      .catch(function recoverFromExtraThemeLoadFailure(err) {
        console.error('Failed to load extra theme presentation', err);
        if (getTheme() !== theme) return false;
        localStorage.setItem('labcharts-theme', 'dark');
        delete document.documentElement.dataset.theme;
        applyThemeChrome('dark');
        applyAccentOverride();
        dispatchThemeChange({ theme: 'dark', extraThemesStylesheetFailed: true });
        refreshThemeDependents();
        showNotification('That theme could not be loaded. Restored Modern Minimal.', 'error');
        return false;
      });
  }
  return true;
}

function refreshThemeDependents() {
  // If the Settings modal is open, the wearables list uses theme-aware
  // iconLight/iconDark assets, so refresh that panel in place.
  const settingsModalOpen = document.getElementById('settings-modal')?.classList.contains('show') || false;
  refreshThemeDependentsFromRuntime({ settingsModalOpen });
}

let toggleReturnTheme = 'dark';

export function toggleTheme() {
  const current = getTheme();
  const next = current === 'light' ? (VALID_THEMES.includes(toggleReturnTheme) ? toggleReturnTheme : 'dark') : 'light';
  if (current !== 'light') toggleReturnTheme = current;
  setTheme(next);
  refreshThemeDependents();
}

applyCrtEffectsAttr();
applyThemeChrome();
applyAccentOverride();

export function getChartColors() {
  const s = getComputedStyle(document.documentElement);
  const g = v => s.getPropertyValue(v).trim();
  return {
    tooltipBg: g('--bg-card'), tooltipTitle: g('--text-primary'),
    tooltipBody: g('--text-secondary'), tooltipBorder: g('--border'),
    tickColor: g('--text-muted'), gridColor: g('--chart-grid'),
    legendColor: g('--text-secondary'), lineColor: g('--accent'),
    lineFill: g('--accent-fill') || 'color-mix(in srgb, var(--accent) 10%, transparent)',
    canvasTooltipBg: g('--chart-tooltip-bg'), canvasTooltipText: g('--text-primary'),
    chronoLineColor: g('--text-muted'),
    green: g('--green'), red: g('--red'), yellow: g('--yellow'),
  };
}
