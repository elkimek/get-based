// @ts-check
// settings-sync-panel.js — cold-safe Settings sync-panel facade

import {
  applyPendingTombstone,
  listPendingTombstones,
  pushContextToGateway,
  rejectPendingTombstone,
  updateSyncIndicator,
} from './sync.js';
import { showNotification } from './utils.js';

/** @typedef {typeof import('./settings-sync-panel-impl.js')} SettingsSyncPanelModule */
/** @type {Promise<SettingsSyncPanelModule> | null} */
let settingsSyncPanelPromise = null;
/** @type {SettingsSyncPanelModule | null} */
let settingsSyncPanelModule = null;
let useSettingsSyncPanelRetryUrl = false;

const settingsSyncPanelDeps = {
  applyPendingTombstone,
  listPendingTombstones,
  pushContextToGateway,
  rejectPendingTombstone,
  updateSyncIndicator,
};

export function isSettingsSyncPanelLoaded() {
  return settingsSyncPanelModule !== null;
}

/** @returns {Promise<SettingsSyncPanelModule>} */
function loadSettingsSyncPanelRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./settings-sync-panel-impl.js?lazy-retry=1');
}

/** @returns {Promise<SettingsSyncPanelModule>} */
export function loadSettingsSyncPanelModule() {
  if (!settingsSyncPanelPromise) {
    const load = useSettingsSyncPanelRetryUrl
      ? loadSettingsSyncPanelRetryModule()
      : import('./settings-sync-panel-impl.js');
    settingsSyncPanelPromise = load
      .then(module => {
        settingsSyncPanelModule = module;
        module.configureSettingsSyncPanelDeps(settingsSyncPanelDeps);
        return module;
      })
      .catch(err => {
        settingsSyncPanelPromise = null;
        settingsSyncPanelModule = null;
        useSettingsSyncPanelRetryUrl = true;
        throw err;
      });
  }
  return settingsSyncPanelPromise;
}

/** @param {Partial<typeof settingsSyncPanelDeps>} deps */
export function configureSettingsSyncPanelDeps(deps = {}) {
  const previous = { ...settingsSyncPanelDeps };
  /** @type {Partial<typeof settingsSyncPanelDeps>} */
  const update = {};
  for (const [name, value] of Object.entries(deps)) {
    if (typeof value === 'function' && name in settingsSyncPanelDeps) {
      settingsSyncPanelDeps[name] = value;
      update[name] = value;
    }
  }
  settingsSyncPanelModule?.configureSettingsSyncPanelDeps(update);
  return previous;
}

/**
 * @param {keyof SettingsSyncPanelModule} name
 * @param {any[]} args
 * @param {boolean} [shouldLoad]
 */
function runSettingsSyncPanelAction(name, args, shouldLoad = true) {
  const run = (/** @type {SettingsSyncPanelModule} */ module) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Settings sync-panel action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  if (!settingsSyncPanelModule && !shouldLoad) return undefined;
  try {
    if (settingsSyncPanelModule) return run(settingsSyncPanelModule);
    return loadSettingsSyncPanelModule()
      .then(run)
      .catch(err => {
        console.error(`[settings-sync] Could not run ${String(name)}:`, err);
        showNotification('Sync settings could not be loaded. Try again.', 'error');
        return false;
      });
  } catch (err) {
    console.error(`[settings-sync] Could not run ${String(name)}:`, err);
    if (shouldLoad) showNotification('Sync settings could not be loaded. Try again.', 'error');
    return shouldLoad ? false : undefined;
  }
}

export function renderSyncSection() {
  if (settingsSyncPanelModule) return settingsSyncPanelModule.renderSyncSection();
  void loadSettingsSyncPanelModule().catch(() => {});
  return '<div class="settings-loading-placeholder">Loading sync settings…</div>';
}

export function renderMessengerSection() {
  if (settingsSyncPanelModule) return settingsSyncPanelModule.renderMessengerSection();
  void loadSettingsSyncPanelModule().catch(() => {});
  return '<div class="settings-loading-placeholder">Loading Agent Access…</div>';
}

export function showSyncSetupModal() {
  return runSettingsSyncPanelAction('showSyncSetupModal', []);
}

export function closeSyncSetup() {
  return runSettingsSyncPanelAction('closeSyncSetup', [], false);
}

export function closeRestoreMnemonicDialog() {
  return runSettingsSyncPanelAction('closeRestoreMnemonicDialog', [], false);
}

export function hydrateSettingsSyncPanel() {
  return runSettingsSyncPanelAction('hydrateSettingsSyncPanel', []);
}
