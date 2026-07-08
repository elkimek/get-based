// @ts-check
// sun-defaults-runtime.js - Browser runtime adapters for Light setup defaults.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/** @param {string} name */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  return typeof runtime?.[name] === 'function' ? runtime[name].bind(runtime) : null;
}

/**
 * Invoke the currently exposed runtime binding when it differs from the local
 * module function. This keeps delegated document handlers stable when a
 * cache-busted module instance replaces public bindings during browser tests.
 *
 * @param {string} name
 * @param {Function} localFn
 * @param {any[]} [args]
 */
export function invokeSunDefaultsBinding(name, localFn, args = []) {
  const runtime = getRuntimeWindow();
  const runtimeFn = runtime?.[name];
  if (typeof runtimeFn === 'function' && runtimeFn !== localFn) {
    return runtimeFn.apply(runtime, args);
  }
  return localFn(...args);
}

export function hasSunDefaultsBrowserRuntime() {
  return getRuntimeWindow() !== null;
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
    return getRuntimeFunction('getProfileLocation')?.() || {};
  } catch {
    return {};
  }
}

export function openSunSetupProfileLocationRuntime() {
  const openProfileLocationEditor = getRuntimeFunction('openProfileLocationEditor');
  if (openProfileLocationEditor) {
    openProfileLocationEditor();
    return true;
  }
  const openClientList = getRuntimeFunction('openClientList');
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

/** @param {Record<string, any>} bindings */
export function exposeSunDefaultsBindings(bindings) {
  const runtime = getRuntimeWindow();
  if (runtime) Object.assign(runtime, bindings);
}
