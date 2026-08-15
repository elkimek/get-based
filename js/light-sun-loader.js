// @ts-check
// light-sun-loader.js — lazy initialization for Light & Sun analysis hooks

import { state } from './state.js';
import { configureLightSunAnalysisRuntime } from './light-sun-analysis-runtime.js';

const LIGHT_SUN_STYLESHEET_URLS = [
  '../css/light-sun.css',
  '../css/light-channels.css',
  '../css/light-devices.css',
  '../css/light-conditions-now.css',
  '../css/light-setup.css',
  '../css/light-tools.css',
  '../css/light-env.css',
].map(path => new URL(path, import.meta.url).href);

/** @type {Promise<typeof import('./app-light-sun-modules.js')> | null} */
let _lightSunModulesLoad = null;
/** @type {typeof import('./app-light-sun-modules.js') | null} */
let _lightSunModules = null;
/** @type {Promise<HTMLLinkElement[]> | null} */
let _lightSunStylesheetsLoad = null;
/** @type {Promise<typeof import('./app-light-sun-modules.js')> | null} */
let _lightSunUILoad = null;
let _lightSunModulesLoaded = false;
let _lightSunUILoaded = false;
let _useLightSunStylesheetRetryUrls = false;
const _lightEnvironmentLoaderDeps = {};
const _lightSunShellLoaderDeps = {};

configureLightSunAnalysisRuntime({
  analyzeSunSession(session) {
    void loadLightSunModules()
      .then(() => import('./sun-ai-analysis.js'))
      .then(module => module.maybeAnalyzeSessionAfterFinish(session))
      .catch(() => {});
  },
  analyzeDeviceSession(session) {
    void loadLightSunModules()
      .then(() => import('./light-device-ai-analysis.js'))
      .then(module => module.maybeAnalyzeDeviceSessionAfterFinish(session))
      .catch(() => {});
  },
});

function applyLightEnvironmentLoaderDeps(module) {
  if (
    Object.keys(_lightEnvironmentLoaderDeps).length > 0
    && typeof module.configureLightEnv === 'function'
  ) {
    module.configureLightEnv(_lightEnvironmentLoaderDeps);
  }
  return module;
}

export function configureLightEnvironmentLoaderDeps(deps = {}) {
  for (const [key, value] of Object.entries(deps || {})) {
    if (typeof value === 'function') _lightEnvironmentLoaderDeps[key] = value;
  }
  if (_lightSunModulesLoad) {
    void _lightSunModulesLoad.then(applyLightEnvironmentLoaderDeps).catch(() => {});
  }
}

function applyLightSunShellLoaderDeps(module) {
  if (
    Object.keys(_lightSunShellLoaderDeps).length > 0
    && typeof module.configureLightSunShell === 'function'
  ) {
    module.configureLightSunShell(_lightSunShellLoaderDeps);
  }
  return module;
}

export function configureLightSunShellLoaderDeps(deps = {}) {
  for (const [key, value] of Object.entries(deps || {})) {
    if (typeof value === 'function') _lightSunShellLoaderDeps[key] = value;
  }
  if (_lightSunModulesLoad) {
    void _lightSunModulesLoad.then(applyLightSunShellLoaderDeps).catch(() => {});
  }
}

export function isLightSunModulesLoaded() {
  return _lightSunModulesLoaded;
}

export function isLightSunUILoaded() {
  return _lightSunUILoaded;
}

export function getLoadedLightSunModule() {
  return _lightSunModules;
}

export function renderLoadedLightTodayHero() {
  return _lightSunModules?.renderLightTodayHero?.() || '';
}

export function renderLoadedLightConditionsWidgetBody(options) {
  return _lightSunModules?.renderLightConditionsWidgetBody?.(options) || '';
}

export function renderLoadedDashboardLightChannelPills() {
  return _lightSunModules?.renderDashboardLightChannelPills?.() || '';
}

export function renderLoadedLightSessionLogActions() {
  return _lightSunModules?.renderLightSessionLogActions?.() || '';
}

export function renderLoadedLightLiveSession(options) {
  return _lightSunModules?.renderLightLiveSession?.(options) || '';
}

export function ensureLoadedActiveDeviceTicker() {
  if (_lightSunModules) return _lightSunModules.ensureActiveDeviceTicker?.();
  const hasActiveDeviceSession = state.importedData?.deviceSessions
    ?.some(session => session && !session.endedAt);
  if (!hasActiveDeviceSession) return undefined;
  return loadLightSunModules().then(module => module.ensureActiveDeviceTicker?.());
}

export function resumeLoadedActiveSunTickerIfNeeded() {
  if (_lightSunModules) return _lightSunModules.resumeActiveTickerIfNeeded?.();
  const hasActiveSunSession = state.importedData?.sunSessions
    ?.some(session => session && !session.endedAt);
  if (!hasActiveSunSession) return undefined;
  return loadLightSunModules().then(module => module.resumeActiveTickerIfNeeded?.());
}

export function getLoadedRollingChannelTotals(days) {
  return _lightSunModules?.rollingChannelTotals?.(days) || null;
}

export function hasPersistedLightSunState() {
  const data = state.importedData;
  if (!data) return false;
  if (data.sunSessions?.length || data.deviceSessions?.length || data.lightDevices?.length) return true;
  if (data.sunDefaults && Object.keys(data.sunDefaults).length > 0) return true;
  if (data.lightCircadian && Object.keys(data.lightCircadian).length > 0) return true;
  const environment = data.lightEnvironment;
  return Boolean(environment?.rooms?.length || environment?.screens?.length);
}

export function loadLightSunModulesForPersistedState() {
  return hasPersistedLightSunState()
    ? loadLightSunModules()
    : Promise.resolve(null);
}

/** @returns {Promise<typeof import('./app-light-sun-modules.js')>} */
export function loadLightSunModules() {
  if (!_lightSunModulesLoad) {
    _lightSunModulesLoad = import('./app-light-sun-modules.js')
      .then(module => {
        applyLightSunShellLoaderDeps(module);
        applyLightEnvironmentLoaderDeps(module);
        _lightSunModules = module;
        _lightSunModulesLoaded = true;
        return module;
      })
      .catch(err => {
        _lightSunModulesLoad = null;
        _lightSunModules = null;
        _lightSunModulesLoaded = false;
        throw err;
      });
  }
  return _lightSunModulesLoad;
}

/** @param {string} stylesheetUrl */
function lightSunStylesheetUrl(stylesheetUrl) {
  if (!_useLightSunStylesheetRetryUrls) return stylesheetUrl;
  const retryUrl = new URL(stylesheetUrl);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement[]>} */
function loadLightSunStylesheets() {
  if (!_lightSunStylesheetsLoad) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Light & Sun stylesheets require a document'));
    }
    const anchor = document.querySelector('[data-light-sun-stylesheet-anchor]');
    const parent = anchor?.parentNode || document.head;
    const links = LIGHT_SUN_STYLESHEET_URLS.map((stylesheetUrl, index) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = lightSunStylesheetUrl(stylesheetUrl);
      link.dataset.lightSunStylesheet = String(index);
      return link;
    });
    const loads = links.map(link => new Promise((resolve, reject) => {
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => {
        reject(new Error(`Light & Sun stylesheet could not be loaded: ${link.href}`));
      }, { once: true });
      parent.insertBefore(link, anchor || null);
    }));
    _lightSunStylesheetsLoad = Promise.all(loads)
      .catch(err => {
        links.forEach(link => link.remove());
        _lightSunStylesheetsLoad = null;
        _useLightSunStylesheetRetryUrls = true;
        throw err;
      });
  }
  return _lightSunStylesheetsLoad;
}

/** @returns {Promise<typeof import('./app-light-sun-modules.js')>} */
export function loadLightSunUI() {
  if (!_lightSunUILoad) {
    _lightSunUILoad = Promise.all([
      loadLightSunModules(),
      loadLightSunStylesheets(),
    ])
      .then(([module]) => {
        _lightSunUILoaded = true;
        return module;
      })
      .catch(err => {
        _lightSunUILoad = null;
        _lightSunUILoaded = false;
        throw err;
      });
  }
  return _lightSunUILoad;
}
