// wearables-connect-runtime.js - Browser runtime adapters for wearable connect orchestration.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
export interface WearablesConnectRuntimeDeps { navigate: ((route: string) => void) | null }

const wearablesConnectRuntimeDeps: WearablesConnectRuntimeDeps = { navigate: null };

export function configureWearablesConnectRuntimeDeps(deps: Partial<WearablesConnectRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(wearablesConnectRuntimeDeps, deps, 'inherited');
}

function getRuntimeWindow(): Window | null {
  return typeof window !== 'undefined'
    ? (window)
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

export function addWearablesBeforeUnloadRuntime(handler: EventListenerOrEventListenerObject) {
  const runtime = getRuntimeWindow();
  if (!runtime || typeof runtime.addEventListener !== 'function') return false;
  runtime.addEventListener('beforeunload', handler);
  return true;
}
