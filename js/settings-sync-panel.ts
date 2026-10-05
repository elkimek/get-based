// settings-sync-panel.js — cold-safe Settings sync-panel facade

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import {
  applyPendingTombstone,
  listPendingTombstones,
  pushContextToGateway,
  rejectPendingTombstone,
  updateSyncIndicator,
} from './sync.js';
import { showNotification } from './utils.js';

type SettingsSyncPanelModule = typeof import('./settings-sync-panel-impl.js');

const settingsSyncPanelModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadSettingsSyncPanelRetryModule() : import('./settings-sync-panel-impl.js'),
  module => {
    module.configureSettingsSyncPanelDeps(settingsSyncPanelDeps);
    // renderSyncSection/renderMessengerSection return placeholders on a
    // cold Settings open. Once the lazy module arrives, replace those
    // placeholders in place so users get the real controls without
    // closing and reopening Settings.
    replaceSettingsSyncPanelPlaceholders(module);
    return module;
  },
);

const settingsSyncPanelDeps: Record<string, unknown> = {
  applyPendingTombstone,
  listPendingTombstones,
  pushContextToGateway,
  rejectPendingTombstone,
  updateSyncIndicator,
};

function replaceSettingsSyncPanelPlaceholders(module: SettingsSyncPanelModule) {
  const syncSection = document.getElementById('sync-section');
  if (syncSection?.querySelector('[data-settings-sync-placeholder="sync"]')) {
    syncSection.innerHTML = module.renderSyncSection();
  }
  const messengerSection = document.getElementById('messenger-section');
  if (messengerSection?.querySelector('[data-settings-sync-placeholder="messenger"]')) {
    messengerSection.innerHTML = module.renderMessengerSection();
  }
}

export function isSettingsSyncPanelLoaded() {
  return settingsSyncPanelModuleLoader.module !== null;
}

function loadSettingsSyncPanelRetryModule(): Promise<typeof import('./settings-sync-panel-impl.js')> {
  return import('./settings-sync-panel-impl.js?lazy-retry=1' as './settings-sync-panel-impl.js');
}

export function loadSettingsSyncPanelModule() {
  return settingsSyncPanelModuleLoader.load();
}

export function configureSettingsSyncPanelDeps(deps: Record<string, unknown> = {}) {
  const previous = { ...settingsSyncPanelDeps };
  const update: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(deps)) {
    if (typeof value === 'function' && name in settingsSyncPanelDeps) {
      settingsSyncPanelDeps[name] = value;
      update[name] = value;
    }
  }
  settingsSyncPanelModuleLoader.module?.configureSettingsSyncPanelDeps(update);
  return previous;
}

function runSettingsSyncPanelAction(name: keyof SettingsSyncPanelModule, args: unknown[], shouldLoad = true) {
  const run = (module: SettingsSyncPanelModule): unknown => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Settings sync-panel action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  if (!settingsSyncPanelModuleLoader.module && !shouldLoad) return undefined;
  return invokeCachedModule(settingsSyncPanelModuleLoader, loadSettingsSyncPanelModule, run, (err, phase) => {
    console.error(`[settings-sync] Could not run ${String(name)}:`, err);
    if (shouldLoad || phase === 'async') showNotification('Sync settings could not be loaded. Try again.', 'error');
    return shouldLoad || phase === 'async' ? false : undefined;
  });
}

export function renderSyncSection() {
  if (settingsSyncPanelModuleLoader.module) return settingsSyncPanelModuleLoader.module.renderSyncSection();
  void loadSettingsSyncPanelModule().catch(() => {});
  return '<div class="settings-loading-placeholder" data-settings-sync-placeholder="sync">Loading sync settings…</div>';
}

export function renderMessengerSection() {
  if (settingsSyncPanelModuleLoader.module) return settingsSyncPanelModuleLoader.module.renderMessengerSection();
  void loadSettingsSyncPanelModule().catch(() => {});
  return '<div class="settings-loading-placeholder" data-settings-sync-placeholder="messenger">Loading Agent Access…</div>';
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
