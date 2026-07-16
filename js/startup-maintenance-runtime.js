// @ts-check
// startup-maintenance-runtime.js - Browser runtime adapters for startup maintenance hooks.

import { SUN_ENGINE_VERSION, rehydrateStaleSessions } from './sun-sessions-store.js';

const startupMaintenanceSunDeps = {
  rehydrateStaleSessions,
  getSunEngineVersion: () => SUN_ENGINE_VERSION,
};

/** @param {{ rehydrateStaleSessions?: (() => any) | null, getSunEngineVersion?: (() => any) | null }} deps */
export function configureStartupMaintenanceSunDeps(deps = {}) {
  const previous = { ...startupMaintenanceSunDeps };
  for (const name of ['rehydrateStaleSessions', 'getSunEngineVersion']) {
    if (name in deps) {
      startupMaintenanceSunDeps[name] = typeof deps[name] === 'function' ? deps[name] : null;
    }
  }
  return previous;
}

function getStartupMaintenanceRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function hasSunSessionRehydrateRuntime() {
  return startupMaintenanceSunDeps.rehydrateStaleSessions !== null;
}

export function rehydrateStaleSunSessionsRuntime() {
  try {
    return startupMaintenanceSunDeps.rehydrateStaleSessions?.() || Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

export function getStartupSunEngineVersionRuntime() {
  try {
    return startupMaintenanceSunDeps.getSunEngineVersion?.() || '?';
  } catch {
    return '?';
  }
}

/** @param {any[]} args */
export function logStartupMaintenanceRuntime(...args) {
  const runtime = getStartupMaintenanceRuntime();
  const logger = runtime?.console?.log;
  if (typeof logger !== 'function') return false;
  try {
    logger.apply(runtime.console, args);
    return true;
  } catch {
    return false;
  }
}
