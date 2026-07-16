// @ts-check
// light-devices-runtime.js - Browser runtime adapters for light-device UI shell hooks.

import { state } from './state.js';
import { showPromptDialog } from './utils.js';
import { getRecommendationModuleFunction } from './recommendations-runtime.js';
import { CHANNEL_DISPLAY, channelTier, formatChannelUnit, tierLabel } from './sun.js';

/** @type {{
 *   showPromptDialog: typeof showPromptDialog | null,
 *   channelTier: typeof channelTier | null,
 *   tierLabel: typeof tierLabel | null,
 *   formatChannelUnit: typeof formatChannelUnit | null,
 *   channelDisplay: Record<string, any> | null,
 *   navigate: ((route: string) => unknown) | null,
 *   openChannelOnLightPage: ((channel: string) => unknown) | null,
 * }} */
const lightDevicesRuntimeDeps = {
  showPromptDialog,
  channelTier,
  tierLabel,
  formatChannelUnit,
  channelDisplay: CHANNEL_DISPLAY,
  navigate: null,
  openChannelOnLightPage: null,
};

/** @param {Partial<typeof lightDevicesRuntimeDeps>} deps */
export function configureLightDevicesRuntimeDeps(deps = {}) {
  const previous = { ...lightDevicesRuntimeDeps };
  for (const name of ['showPromptDialog', 'channelTier', 'tierLabel', 'formatChannelUnit']) {
    if (name in deps) {
      lightDevicesRuntimeDeps[name] = typeof deps[name] === 'function' ? deps[name] : null;
    }
  }
  if ('channelDisplay' in deps) {
    lightDevicesRuntimeDeps.channelDisplay = deps.channelDisplay && typeof deps.channelDisplay === 'object'
      ? deps.channelDisplay
      : null;
  }
  for (const name of ['navigate', 'openChannelOnLightPage']) {
    if (name in deps) {
      lightDevicesRuntimeDeps[name] = typeof deps[name] === 'function' ? deps[name] : null;
    }
  }
  return previous;
}

/** @param {string} route */
export function navigateLightDevicesRoute(route) {
  lightDevicesRuntimeDeps.navigate?.(route);
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
  return {
    channelTier: lightDevicesRuntimeDeps.channelTier || (() => 0),
    tierLabel: lightDevicesRuntimeDeps.tierLabel || (() => 'none'),
    formatChannelUnit: lightDevicesRuntimeDeps.formatChannelUnit || (() => ''),
  };
}

/** @param {Record<string, any>} fallback */
export function getLightDeviceChannelDisplay(fallback = {}) {
  return lightDevicesRuntimeDeps.channelDisplay || fallback;
}

export function loadLightDevicesCatalog() {
  return getRecommendationModuleFunction('loadCatalog')?.();
}

/**
 * @param {any} catalog
 * @param {string} slug
 */
export function renderLightDeviceAffiliateRowRuntime(catalog, slug) {
  return getRecommendationModuleFunction('renderLightDeviceAffiliateRow')?.(catalog, slug) || '';
}

/** @param {string} channel */
export function openLightDeviceChannel(channel) {
  lightDevicesRuntimeDeps.openChannelOnLightPage?.(channel);
}
