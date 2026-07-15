// @ts-check
// startup-maintenance-runtime.js - Browser runtime adapters for startup maintenance hooks.

function getStartupMaintenanceRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/** @param {string} name */
function getRuntimeFunction(name) {
  const runtime = getStartupMaintenanceRuntime();
  return typeof runtime?.[name] === 'function' ? runtime[name].bind(runtime) : null;
}

export function hasSunSessionRehydrateRuntime() {
  return getRuntimeFunction('rehydrateStaleSessions') !== null;
}

export function rehydrateStaleSunSessionsRuntime() {
  try {
    return getRuntimeFunction('rehydrateStaleSessions')?.() || Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

export function getStartupSunEngineVersionRuntime() {
  return getStartupMaintenanceRuntime()?.SUN_ENGINE_VERSION || '?';
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
