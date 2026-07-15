// @ts-check
// sun-defaults-runtime.js - Browser runtime adapters for Light setup defaults.

import { getProfileLocation } from './profile.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const sunDefaultsRuntimeDeps = {
  getProfileLocation,
  openProfileLocationEditor: null,
  openClientList: null,
};

export function configureSunDefaultsRuntimeDeps(deps = {}) {
  const previous = { ...sunDefaultsRuntimeDeps };
  if (typeof deps.getProfileLocation === 'function') sunDefaultsRuntimeDeps.getProfileLocation = deps.getProfileLocation;
  for (const name of ['openProfileLocationEditor', 'openClientList']) {
    if (name in deps) {
      sunDefaultsRuntimeDeps[name] = typeof deps[name] === 'function' ? deps[name] : null;
    }
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/** @param {string} name */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  const fn = runtime[name];
  if (typeof fn === 'function') return fn.bind(runtime);
  return name === 'navigate' ? getViewRuntimeFunction(name) : null;
}

export function getSunSetupCoords() {
  try {
    return getRuntimeFunction('getSunCoords')?.() || null;
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
  return getRuntimeFunction('requestPreciseLocation') !== null;
}

export function requestSunSetupPreciseLocationRuntime() {
  try {
    return getRuntimeFunction('requestPreciseLocation')?.() || null;
  } catch {
    return null;
  }
}

/** @param {string} route */
export function navigateSunDefaultsRoute(route) {
  getRuntimeFunction('navigate')?.(route);
}
