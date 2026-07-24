// @ts-check
// settings-loader.js — lazy initialization and safe entry points for Settings

import { applyAccentOverride } from './theme.js';
import { showNotification } from './utils.js';
import { configureSettingsModuleBridge } from './settings-runtime-bridge.js';
import { loadDataProtectionStylesheet } from './modal-lifecycle.js';

/** @typedef {typeof import('./settings.js')} SettingsModule */

const SETTINGS_STYLESHEET_URL = new URL('../css/settings.css', import.meta.url).href;

/** @type {Promise<SettingsModule> | null} */
let _settingsJavaScriptLoad = null;
/** @type {Promise<SettingsModule> | null} */
let _settingsModuleLoad = null;
/** @type {Promise<HTMLLinkElement> | null} */
let _settingsStylesheetLoad = null;
let _settingsModuleLoaded = false;
let _useSettingsRetryUrl = false;
let _useSettingsStylesheetRetryUrl = false;
/** @type {(module: SettingsModule) => void} */
let _configureSettingsModule = () => {};

export function isSettingsModuleLoaded() {
  return _settingsModuleLoaded;
}

/**
 * @param {{ configureModule?: (module: SettingsModule) => void }} [deps]
 */
export function configureSettingsLoader(deps = {}) {
  const previous = { configureModule: _configureSettingsModule };
  if (typeof deps.configureModule === 'function') {
    _configureSettingsModule = deps.configureModule;
  }
  return previous;
}

/** @returns {Promise<SettingsModule>} */
function loadSettingsRetryModule() {
  // @ts-expect-error The browser accepts a fixed query-string module URL;
  // TypeScript resolves declarations only for the query-free source path.
  return import('./settings.js?lazy-retry=1');
}

/** @returns {Promise<SettingsModule>} */
function loadSettingsJavaScript() {
  if (!_settingsJavaScriptLoad) {
    // Browsers cache failed module-map fetches by URL. A fixed second literal
    // gives the user one genuine retry without introducing a computed import.
    const moduleLoad = _useSettingsRetryUrl
      ? loadSettingsRetryModule()
      : import('./settings.js');
    _settingsJavaScriptLoad = moduleLoad.catch(err => {
      _settingsJavaScriptLoad = null;
      _useSettingsRetryUrl = true;
      throw err;
    });
  }
  return _settingsJavaScriptLoad;
}

function settingsStylesheetUrl() {
  if (!_useSettingsStylesheetRetryUrl) return SETTINGS_STYLESHEET_URL;
  const retryUrl = new URL(SETTINGS_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement>} */
function loadSettingsStylesheet() {
  if (!_settingsStylesheetLoad) {
    _settingsStylesheetLoad = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('Settings stylesheet requires a document'));
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = settingsStylesheetUrl();
      link.dataset.settingsStylesheet = '';
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => {
        link.remove();
        reject(new Error('Settings stylesheet could not be loaded'));
      }, { once: true });
      const anchor = document.querySelector('[data-settings-stylesheet-anchor]');
      (anchor?.parentNode || document.head).insertBefore(link, anchor || null);
    }).catch(err => {
      _settingsStylesheetLoad = null;
      _useSettingsStylesheetRetryUrl = true;
      throw err;
    });
  }
  return _settingsStylesheetLoad;
}

/** @returns {Promise<SettingsModule>} */
export function loadSettingsModule() {
  if (!_settingsModuleLoad) {
    _settingsModuleLoad = Promise.all([
      loadDataProtectionStylesheet(),
      loadSettingsJavaScript(),
      loadSettingsStylesheet(),
    ])
      .then(([, module]) => {
        _configureSettingsModule(module);
        _settingsModuleLoaded = true;
        return module;
      })
      .catch(err => {
        _settingsModuleLoad = null;
        _settingsModuleLoaded = false;
        installSettingsLoaderBridge();
        throw err;
      });
  }
  return _settingsModuleLoad;
}

/**
 * @param {keyof SettingsModule} name
 * @param {any[]} args
 */
async function runSettingsAction(name, args) {
  try {
    const module = await loadSettingsModule();
    const action = module[name];
    if (typeof action !== 'function') throw new Error(`Settings action ${String(name)} is unavailable`);
    return Reflect.apply(action, module, args);
  } catch (err) {
    console.error(`Failed to run Settings action ${String(name)}`, err);
    showNotification('Settings could not be loaded. Try again.', 'error');
    return false;
  }
}

/**
 * Invoke refresh helpers only when a Settings load is already underway.
 * Theme refreshes during normal startup must not pull in the Settings graph.
 *
 * @param {keyof SettingsModule} name
 * @param {any[]} args
 */
function runLoadedSettingsAction(name, args) {
  if (!_settingsModuleLoad) return undefined;
  return _settingsModuleLoad
    .then(module => {
      const action = module[name];
      return typeof action === 'function' ? Reflect.apply(action, module, args) : undefined;
    })
    .catch(() => undefined);
}

export function openSettingsModal(...args) {
  return runSettingsAction('openSettingsModal', args);
}

export function closeSettingsModal(...args) {
  return runSettingsAction('closeSettingsModal', args);
}

export function openTweaksPanel(...args) {
  return runSettingsAction('openTweaksPanel', args);
}

export function closeTweaksPanel(...args) {
  return runSettingsAction('closeTweaksPanel', args);
}

function installSettingsLoaderBridge() {
  configureSettingsModuleBridge({
    applyAccentOverride,
    openSettingsModal,
    closeSettingsModal,
    openTweaksPanel,
    closeTweaksPanel,
    updatePrivacyStatusCard: (...args) => runLoadedSettingsAction('updatePrivacyStatusCard', args),
    updateSettingsUI: (...args) => runLoadedSettingsAction('updateSettingsUI', args),
    updateTweaksUI: (...args) => runLoadedSettingsAction('updateTweaksUI', args),
  });
}

installSettingsLoaderBridge();
