// @ts-check
// wearables-connect-runtime.js - Browser runtime adapters for wearable connect orchestration.

/** @type {{ navigate: ((route: string) => void) | null }} */
const wearablesConnectRuntimeDeps = { navigate: null };

export function configureWearablesConnectRuntimeDeps(deps = {}) {
  const previous = { ...wearablesConnectRuntimeDeps };
  if ('navigate' in deps) {
    wearablesConnectRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? /** @type {(route: string) => void} */ (deps.navigate)
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function getWearableOAuthSearchParamsRuntime() {
  const runtime = getRuntimeWindow();
  return new URLSearchParams(runtime?.location?.search || '');
}

export function clearWearableOAuthCallbackRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime?.history || typeof runtime.history.replaceState !== 'function') return;
  try { runtime.history.replaceState(null, '', runtime.location?.pathname || ''); } catch {}
}

export function navigateWearablesDashboardAfterConnectRuntime() {
  wearablesConnectRuntimeDeps.navigate?.('dashboard');
}

/** @param {EventListenerOrEventListenerObject} handler */
export function addWearablesBeforeUnloadRuntime(handler) {
  const runtime = getRuntimeWindow();
  if (!runtime || typeof runtime.addEventListener !== 'function') return false;
  runtime.addEventListener('beforeunload', handler);
  return true;
}
