// @ts-check
// light-devices-runtime.js - Browser runtime adapters for light-device UI shell hooks.

import { state } from './state.js';
import { showPromptDialog } from './utils.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const lightDevicesRuntimeDeps = { showPromptDialog };

export function configureLightDevicesRuntimeDeps(deps = {}) {
  const previous = { ...lightDevicesRuntimeDeps };
  if ('showPromptDialog' in deps) {
    lightDevicesRuntimeDeps.showPromptDialog = typeof deps.showPromptDialog === 'function'
      ? /** @type {typeof showPromptDialog} */ (deps.showPromptDialog)
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : /** @type {any} */ (globalThis);
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  if (typeof runtime[name] === 'function') return runtime[name].bind(runtime);
  return getViewRuntimeFunction(name);
}

/**
 * @param {string} name
 * @returns {any}
 */
function getRuntimeValue(name) {
  return getRuntimeWindow()[name];
}

/** @param {string} route */
export function navigateLightDevicesRoute(route) {
  getRuntimeFunction('navigate')?.(route);
}

export function refreshLightDevicesView() {
  if (state.currentView === 'light') navigateLightDevicesRoute('light');
}

/** @param {number} current */
export function promptLightDeviceSessionDuration(current) {
  return lightDevicesRuntimeDeps.showPromptDialog?.('New duration (in minutes)', {
    defaultValue: String(current),
    okLabel: 'Save',
    placeholder: 'e.g. 12',
  });
}

export function getLightDeviceChannelHelpers() {
  const channelTier = /** @type {(value: any, channelKey?: string) => number} */ (
    getRuntimeFunction('channelTier') || (() => 0)
  );
  const tierLabel = /** @type {(tier: number) => string} */ (
    getRuntimeFunction('tierLabel') || (() => 'none')
  );
  const formatChannelUnit = /** @type {(...args: any[]) => string} */ (
    getRuntimeFunction('formatChannelUnit') || (() => '')
  );
  return {
    channelTier,
    tierLabel,
    formatChannelUnit,
  };
}

/** @param {Record<string, any>} fallback */
export function getLightDeviceChannelDisplay(fallback = {}) {
  const display = getRuntimeValue('CHANNEL_DISPLAY');
  return display && typeof display === 'object' ? display : fallback;
}

export function loadLightDevicesCatalog() {
  return getRuntimeFunction('loadCatalog')?.();
}

/**
 * @param {any} catalog
 * @param {string} slug
 */
export function renderLightDeviceAffiliateRowRuntime(catalog, slug) {
  return getRuntimeFunction('renderLightDeviceAffiliateRow')?.(catalog, slug) || '';
}

/** @param {string} channel */
export function openLightDeviceChannel(channel) {
  getRuntimeFunction('_openChannelOnLightPage')?.(channel);
}

/** @param {string} id */
export function editLightDeviceSessionDurationFromRuntime(id) {
  getRuntimeFunction('editDeviceSessionDuration')?.(id);
}

/** @param {string} id */
export function editLightDeviceSessionModeFromRuntime(id) {
  getRuntimeFunction('editDeviceSessionMode')?.(id);
}

/** @param {string} id */
export function deleteLightDeviceSessionFromRuntime(id) {
  getRuntimeFunction('deleteDeviceSession')?.(id);
}

/** @param {Record<string, any>} bindings */
export function publishLightDevicesWindowBindings(bindings) {
  if (typeof window === 'undefined') return;
  Object.assign(getRuntimeWindow(), bindings);
}
