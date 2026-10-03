// light-devices-runtime.js - Browser runtime adapters for light-device UI shell hooks.

import { state } from './state.js';
import { showPromptDialog } from './utils.js';
import { getRecommendationModuleFunction } from './recommendations-runtime.js';
import { CHANNEL_DISPLAY, channelTier, formatChannelUnit, tierLabel } from './sun.js';

// Configured callbacks and their getter rereads remain opaque. Existing
// calls project only the operations they consume, without validation.
type RuntimeDependencies = { showPromptDialog: unknown; channelTier: unknown; tierLabel: unknown; formatChannelUnit: unknown; channelDisplay: unknown; navigate: unknown; openChannelOnLightPage: unknown };
const lightDevicesRuntimeDeps: RuntimeDependencies = {
  showPromptDialog,
  channelTier,
  tierLabel,
  formatChannelUnit,
  channelDisplay: CHANNEL_DISPLAY,
  navigate: null,
  openChannelOnLightPage: null,
};

export function configureLightDevicesRuntimeDeps(deps: unknown = {}) {
  const previous = { ...lightDevicesRuntimeDeps };
  for (const name of ['showPromptDialog', 'channelTier', 'tierLabel', 'formatChannelUnit']) {
    if (name in (deps as Record<string, unknown>)) {
      lightDevicesRuntimeDeps[name as keyof RuntimeDependencies] = typeof (deps as Record<string, unknown>)[name] === 'function' ? (deps as Record<string, unknown>)[name] : null;
    }
  }
  if ('channelDisplay' in (deps as object)) {
    lightDevicesRuntimeDeps.channelDisplay = (deps as { channelDisplay?: unknown }).channelDisplay && typeof (deps as { channelDisplay?: unknown }).channelDisplay === 'object'
      ? (deps as { channelDisplay?: unknown }).channelDisplay
      : null;
  }
  for (const name of ['navigate', 'openChannelOnLightPage']) {
    if (name in (deps as Record<string, unknown>)) {
      lightDevicesRuntimeDeps[name as keyof RuntimeDependencies] = typeof (deps as Record<string, unknown>)[name] === 'function' ? (deps as Record<string, unknown>)[name] : null;
    }
  }
  return previous;
}

export function navigateLightDevicesRoute(route: unknown) {
  (lightDevicesRuntimeDeps.navigate as ((route: unknown) => unknown) | null)?.(route);
}

export function refreshLightDevicesView() {
  if (state.currentView === 'light') navigateLightDevicesRoute('light');
}

export function promptLightDeviceSessionDuration(current: unknown) {
  return (lightDevicesRuntimeDeps.showPromptDialog as ((...args: Parameters<typeof showPromptDialog>) => unknown) | null)?.('New duration (in minutes)', {
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

export function getLightDeviceChannelDisplay(fallback: unknown = {}) {
  return lightDevicesRuntimeDeps.channelDisplay || fallback;
}

export function loadLightDevicesCatalog() {
  return (getRecommendationModuleFunction('loadCatalog') as (() => unknown) | null)?.();
}

export function renderLightDeviceAffiliateRowRuntime(catalog: unknown, slug: unknown) {
  return (getRecommendationModuleFunction('renderLightDeviceAffiliateRow') as ((catalog: unknown, slug: unknown) => unknown) | null)?.(catalog, slug) || '';
}

export function openLightDeviceChannel(channel: unknown) {
  (lightDevicesRuntimeDeps.openChannelOnLightPage as ((channel: unknown) => unknown) | null)?.(channel);
}
