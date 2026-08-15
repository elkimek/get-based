// @ts-check
// sun-defaults-runtime.js - Browser runtime adapters for Light setup defaults.

import { getProfileLocation } from './profile.js';

/** @type {{ getProfileLocation: AnyFunction, getSunCoords: AnyFunction | null, navigate: AnyFunction | null, requestPreciseLocation: AnyFunction | null, clearCurrentLocation: AnyFunction | null, openProfileLocationEditor: AnyFunction | null, openClientList: AnyFunction | null }} */
const sunDefaultsRuntimeDeps = {
  getProfileLocation,
  getSunCoords: null,
  navigate: null,
  requestPreciseLocation: null,
  clearCurrentLocation: null,
  openProfileLocationEditor: null,
  openClientList: null,
};

export function configureSunDefaultsRuntimeDeps(deps = {}) {
  const previous = { ...sunDefaultsRuntimeDeps };
  if (typeof deps.getProfileLocation === 'function') sunDefaultsRuntimeDeps.getProfileLocation = deps.getProfileLocation;
  for (const name of ['getSunCoords', 'navigate', 'requestPreciseLocation', 'clearCurrentLocation', 'openProfileLocationEditor', 'openClientList']) {
    if (name in deps) {
      sunDefaultsRuntimeDeps[name] = typeof deps[name] === 'function' ? deps[name] : null;
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

/** @param {string} route */
export function navigateSunDefaultsRoute(route) {
  sunDefaultsRuntimeDeps.navigate?.(route);
}
