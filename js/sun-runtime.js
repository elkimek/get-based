// @ts-check
// sun-runtime.js - Browser runtime adapters for Sun session facade hooks.

import { isDebugMode } from './utils.js';
import { getDeviceSessions } from './light-devices-store.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const sunRuntimeDeps = { isDebugMode };

export function configureSunRuntimeDeps(deps = {}) {
  const previous = { ...sunRuntimeDeps };
  if (typeof deps.isDebugMode === 'function') sunRuntimeDeps.isDebugMode = deps.isDebugMode;
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

function getRuntimeNavigator() {
  return typeof navigator !== 'undefined'
    ? /** @type {any} */ (navigator)
    : null;
}

/** @param {string} name */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  if (typeof runtime?.[name] === 'function') return runtime[name].bind(runtime);
  return getViewRuntimeFunction(name);
}

export function hasSunBrowserRuntime() {
  return getRuntimeWindow() !== null;
}

export function isSunDebugRuntime() {
  try {
    return sunRuntimeDeps.isDebugMode() === true;
  } catch {
    return false;
  }
}

export function getSunDeviceSessionsRuntime() {
  try {
    const sessions = getDeviceSessions();
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

export function rebuildSunSidebarRuntime() {
  try {
    getRuntimeFunction('buildSidebar')?.();
  } catch {
    // Best-effort compatibility hook.
  }
}

/**
 * @param {string} view
 * @param {{ scrollAnchor?: string } | undefined} [options]
 */
export function navigateSunRuntime(view, options) {
  try {
    getRuntimeFunction('navigate')?.(view, options);
  } catch {
    // Best-effort compatibility hook.
  }
}

export function renderLightChannelsLiveRuntime() {
  try {
    getRuntimeFunction('renderLightChannelsLive')?.();
  } catch {
    // Best-effort compatibility hook.
  }
}

export function renderLightTodayStripRuntime() {
  try {
    return getRuntimeFunction('renderLightTodayStrip')?.() || '';
  } catch {
    return '';
  }
}

/** @param {string} channel */
export function openSunChannelOnLightPageRuntime(channel) {
  try {
    getRuntimeFunction('_openChannelOnLightPage')?.(channel);
  } catch {
    // Best-effort compatibility hook.
  }
}

export function hasSunGeolocationRuntime() {
  const geolocation = getRuntimeNavigator()?.geolocation;
  return typeof geolocation?.getCurrentPosition === 'function';
}

/** @param {PositionOptions} options */
export function requestSunGeolocationPositionRuntime(options) {
  const geolocation = getRuntimeNavigator()?.geolocation;
  return new Promise((resolve, reject) => {
    if (typeof geolocation?.getCurrentPosition !== 'function') {
      reject(new Error('geolocation unavailable'));
      return;
    }
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/** @param {EventListenerOrEventListenerObject} listener */
export function addSunProfileSwitchListener(listener) {
  const runtime = getRuntimeWindow();
  if (runtime && typeof runtime.addEventListener === 'function') {
    runtime.addEventListener('labcharts-profile-switched', listener);
  }
}

/** @param {Record<string, any>} bindings */
export function exposeSunRuntimeBindings(bindings) {
  const runtime = getRuntimeWindow();
  if (runtime) Object.assign(runtime, bindings);
}
