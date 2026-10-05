// sun-defaults-runtime.js - Browser runtime adapters for Light setup defaults.

import type { SunSetupCoords } from './sun-defaults-model.js';
import { getProfileLocation } from './profile.js';

export interface SunDefaultsRuntimeDeps {
  getProfileLocation: () => ReturnType<typeof getProfileLocation> | null;
  getSunCoords: (() => SunSetupCoords | null) | null;
  navigate: ((route: string) => unknown) | null;
  requestPreciseLocation: (() => SunSetupCoords | null | PromiseLike<SunSetupCoords | null>) | null;
  clearCurrentLocation: (() => unknown) | null;
  openProfileLocationEditor: (() => unknown) | null;
  openClientList: (() => unknown) | null;
}

const sunDefaultsRuntimeDeps: SunDefaultsRuntimeDeps = {
  getProfileLocation,
  getSunCoords: null,
  navigate: null,
  requestPreciseLocation: null,
  clearCurrentLocation: null,
  openProfileLocationEditor: null,
  openClientList: null,
};

export function configureSunDefaultsRuntimeDeps(deps: Partial<SunDefaultsRuntimeDeps> = {}) {
  const previous = { ...sunDefaultsRuntimeDeps };
  if (typeof deps.getProfileLocation === 'function') sunDefaultsRuntimeDeps.getProfileLocation = deps.getProfileLocation;
  for (const name of ['getSunCoords', 'navigate', 'requestPreciseLocation', 'clearCurrentLocation', 'openProfileLocationEditor', 'openClientList'] as const) {
    if (name in deps) {
      (sunDefaultsRuntimeDeps as Record<typeof name, typeof deps[typeof name]>)[name] = typeof deps[name] === 'function' ? deps[name] : null;
    }
  }
  return previous;
}

export function getSunSetupCoords() {
  try {
    return sunDefaultsRuntimeDeps.getSunCoords?.() || null;
  } catch {
    return null;
  }
}

export function getSunSetupProfileLocation() {
  try {
    return sunDefaultsRuntimeDeps.getProfileLocation() || { country: '', zip: '' };
  } catch {
    return { country: '', zip: '' };
  }
}

export function openSunSetupProfileLocationRuntime() {
  const openProfileLocationEditor = sunDefaultsRuntimeDeps.openProfileLocationEditor;
  if (openProfileLocationEditor) {
    openProfileLocationEditor();
    return true;
  }
  const openClientList = sunDefaultsRuntimeDeps.openClientList;
  if (openClientList) {
    openClientList();
    return true;
  }
  return false;
}

export function hasSunSetupPreciseLocationRequester() {
  return sunDefaultsRuntimeDeps.requestPreciseLocation !== null;
}

export function requestSunSetupPreciseLocationRuntime() {
  try {
    return sunDefaultsRuntimeDeps.requestPreciseLocation?.() || null;
  } catch {
    return null;
  }
}

export function clearSunSetupCurrentLocationRuntime() {
  try {
    if (!sunDefaultsRuntimeDeps.clearCurrentLocation) return false;
    sunDefaultsRuntimeDeps.clearCurrentLocation();
    return true;
  } catch {
    return false;
  }
}

export function navigateSunDefaultsRoute(route: string) {
  sunDefaultsRuntimeDeps.navigate?.(route);
}
