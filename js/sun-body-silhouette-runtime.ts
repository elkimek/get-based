// sun-body-silhouette-runtime.js - Browser runtime adapters for the sun body picker.

import { configureRuntimeDependencies } from './runtime-callbacks.js';
import { getActiveProfileId, getProfiles } from './profile.js';

const sunBodySilhouetteRuntimeDeps = { getActiveProfileId, getProfiles };

export function configureSunBodySilhouetteRuntimeDeps(deps: Partial<typeof sunBodySilhouetteRuntimeDeps> = {}) {
  return configureRuntimeDependencies(sunBodySilhouetteRuntimeDeps, deps);
}

function getSilhouetteRuntime() {
  return typeof window !== 'undefined'
    ? window
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

export function addSunOverlayReadyListenerRuntime(listener: EventListenerOrEventListenerObject) {
  const runtime = getSilhouetteRuntime();
  if (!runtime || typeof runtime.addEventListener !== 'function') return false;
  runtime.addEventListener('sun-overlay-ready', listener);
  return true;
}

export function removeSunOverlayReadyListenerRuntime(listener: EventListenerOrEventListenerObject) {
  const runtime = getSilhouetteRuntime();
  if (!runtime || typeof runtime.removeEventListener !== 'function') return false;
  runtime.removeEventListener('sun-overlay-ready', listener);
  return true;
}
