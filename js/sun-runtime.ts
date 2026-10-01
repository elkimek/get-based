interface SunRuntimeDeps {
  buildSidebar: (() => void) | null;
  isDebugMode: (() => boolean) | null;
  navigate: ((view: string, options?: { scrollAnchor?: string } | undefined) => void) | null;
  openChannelOnLightPage: ((channel: string) => void) | null;
  renderLightChannelsLive: (() => void) | null;
  renderLightTodayStrip: (() => string) | null;
}

// sun-runtime.js - Browser runtime adapters for Sun session facade hooks.

import { configureValidRuntimeCallbacks } from './runtime-callbacks.js';
import { isDebugMode } from './utils.js';
import { state } from './state.js';

const sunRuntimeDeps: SunRuntimeDeps = {
  buildSidebar: null,
  isDebugMode,
  navigate: null,
  openChannelOnLightPage: null,
  renderLightChannelsLive: null,
  renderLightTodayStrip: null,
};

export function configureSunRuntimeDeps(deps: Partial<SunRuntimeDeps> = {}) {
  return configureValidRuntimeCallbacks(sunRuntimeDeps, deps);
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? window
    : null;
}

function getRuntimeNavigator() {
  return typeof navigator !== 'undefined'
    ? navigator
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
  const sessions = state.importedData?.deviceSessions;
  return Array.isArray(sessions) ? sessions : [];
}

export function rebuildSunSidebarRuntime() {
  try {
    sunRuntimeDeps.buildSidebar?.();
  } catch {
    // Best-effort compatibility hook.
  }
}

export function navigateSunRuntime(view: string, options?: { scrollAnchor?: string } | undefined) {
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

export function openSunChannelOnLightPageRuntime(channel: string) {
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

export function requestSunGeolocationPositionRuntime(options: PositionOptions) {
  const geolocation = getRuntimeNavigator()?.geolocation;
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof geolocation?.getCurrentPosition !== 'function') {
      reject(new Error('geolocation unavailable'));
      return;
    }
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export function addSunProfileSwitchListener(listener: EventListenerOrEventListenerObject) {
  const runtime = getRuntimeWindow();
  if (runtime && typeof runtime.addEventListener === 'function') {
    runtime.addEventListener('labcharts-profile-switched', listener);
  }
}
