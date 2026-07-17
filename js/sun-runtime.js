// @ts-check
// sun-runtime.js - Browser runtime adapters for Sun session facade hooks.

import { isDebugMode } from './utils.js';
import { getDeviceSessions } from './light-devices-store.js';

/**
 * @typedef {{
 *   buildSidebar: null | (() => void),
 *   isDebugMode: null | (() => boolean),
 *   navigate: null | ((view: string, options?: { scrollAnchor?: string }) => void),
 *   openChannelOnLightPage: null | ((channel: string) => void),
 *   renderLightChannelsLive: null | (() => void),
 *   renderLightTodayStrip: null | (() => string),
 * }} SunRuntimeDeps
 */

/** @type {SunRuntimeDeps} */
const sunRuntimeDeps = {
  buildSidebar: null,
  isDebugMode,
  navigate: null,
  openChannelOnLightPage: null,
  renderLightChannelsLive: null,
  renderLightTodayStrip: null,
};

/** @param {Partial<SunRuntimeDeps>} [deps] */
export function configureSunRuntimeDeps(deps = {}) {
  const previous = { ...sunRuntimeDeps };
  if (Object.hasOwn(deps, 'buildSidebar') && (deps.buildSidebar === null || typeof deps.buildSidebar === 'function')) {
    sunRuntimeDeps.buildSidebar = deps.buildSidebar;
  }
  if (Object.hasOwn(deps, 'isDebugMode') && (deps.isDebugMode === null || typeof deps.isDebugMode === 'function')) {
    sunRuntimeDeps.isDebugMode = deps.isDebugMode;
  }
  if (Object.hasOwn(deps, 'navigate') && (deps.navigate === null || typeof deps.navigate === 'function')) {
    sunRuntimeDeps.navigate = deps.navigate;
  }
  if (Object.hasOwn(deps, 'openChannelOnLightPage') && (deps.openChannelOnLightPage === null || typeof deps.openChannelOnLightPage === 'function')) {
    sunRuntimeDeps.openChannelOnLightPage = deps.openChannelOnLightPage;
  }
  if (Object.hasOwn(deps, 'renderLightChannelsLive') && (deps.renderLightChannelsLive === null || typeof deps.renderLightChannelsLive === 'function')) {
    sunRuntimeDeps.renderLightChannelsLive = deps.renderLightChannelsLive;
  }
  if (Object.hasOwn(deps, 'renderLightTodayStrip') && (deps.renderLightTodayStrip === null || typeof deps.renderLightTodayStrip === 'function')) {
    sunRuntimeDeps.renderLightTodayStrip = deps.renderLightTodayStrip;
  }
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

export function hasSunBrowserRuntime() {
  return getRuntimeWindow() !== null;
}

export function isSunDebugRuntime() {
  try {
    return sunRuntimeDeps.isDebugMode?.() === true;
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
    sunRuntimeDeps.buildSidebar?.();
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
    sunRuntimeDeps.navigate?.(view, options);
  } catch {
    // Best-effort compatibility hook.
  }
}

export function renderLightChannelsLiveRuntime() {
  try {
    sunRuntimeDeps.renderLightChannelsLive?.();
  } catch {
    // Best-effort compatibility hook.
  }
}

export function renderLightTodayStripRuntime() {
  try {
    return sunRuntimeDeps.renderLightTodayStrip?.() || '';
  } catch {
    return '';
  }
}

/** @param {string} channel */
export function openSunChannelOnLightPageRuntime(channel) {
  try {
    sunRuntimeDeps.openChannelOnLightPage?.(channel);
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
