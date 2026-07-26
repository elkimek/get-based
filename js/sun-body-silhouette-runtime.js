// @ts-check
// sun-body-silhouette-runtime.js - Browser runtime adapters for the sun body picker.

import { getActiveProfileId, getProfiles } from './profile.js';

const sunBodySilhouetteRuntimeDeps = { getActiveProfileId, getProfiles };

export function configureSunBodySilhouetteRuntimeDeps(deps = {}) {
  const previous = { ...sunBodySilhouetteRuntimeDeps };
  if (typeof deps.getActiveProfileId === 'function') sunBodySilhouetteRuntimeDeps.getActiveProfileId = deps.getActiveProfileId;
  if (typeof deps.getProfiles === 'function') sunBodySilhouetteRuntimeDeps.getProfiles = deps.getProfiles;
  return previous;
}

function getSilhouetteRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function getActiveSilhouetteProfileIdRuntime() {
  try {
    return sunBodySilhouetteRuntimeDeps.getActiveProfileId() || null;
  } catch {
    return null;
  }
}

export function getSilhouetteProfilesRuntime() {
  try {
    const profiles = sunBodySilhouetteRuntimeDeps.getProfiles();
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    return [];
  }
}

export function dispatchSunOverlayReadyRuntime() {
  const runtime = getSilhouetteRuntime();
  const EventCtor = typeof runtime?.CustomEvent === 'function'
    ? runtime.CustomEvent
    : (typeof CustomEvent === 'function' ? CustomEvent : null);
  if (!runtime || typeof runtime.dispatchEvent !== 'function' || !EventCtor) return false;
  try {
    runtime.dispatchEvent(new EventCtor('sun-overlay-ready'));
    return true;
  } catch {
    return false;
  }
}

/** @param {EventListenerOrEventListenerObject} listener */
export function addSunOverlayReadyListenerRuntime(listener) {
  const runtime = getSilhouetteRuntime();
  if (!runtime || typeof runtime.addEventListener !== 'function') return false;
  runtime.addEventListener('sun-overlay-ready', listener);
  return true;
}

/** @param {EventListenerOrEventListenerObject} listener */
export function removeSunOverlayReadyListenerRuntime(listener) {
  const runtime = getSilhouetteRuntime();
  if (!runtime || typeof runtime.removeEventListener !== 'function') return false;
  runtime.removeEventListener('sun-overlay-ready', listener);
  return true;
}
