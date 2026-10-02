// api-runtime.js - Browser runtime adapters for AI provider orchestration.

import type { createVeniceE2EE } from '../vendor/venice-e2ee.js';

interface ApiBrowserRuntime {
  location?: { origin?: string; pathname?: string; href: string };
  _veniceE2EE?: ReturnType<typeof createVeniceE2EE>;
}
interface ApiRuntimeCallbacks { showInsufficientBalanceDialog: () => unknown }

function getApiRuntime() {
  return typeof window !== 'undefined'
    ? (window as unknown as ApiBrowserRuntime)
    : null;
}

const apiRuntimeCallbacks: ApiRuntimeCallbacks = {
  showInsufficientBalanceDialog: () => false,
};

export function configureApiRuntimeCallbacks(callbacks: Partial<ApiRuntimeCallbacks> = {}) {
  const previous = { ...apiRuntimeCallbacks };
  if ('showInsufficientBalanceDialog' in callbacks) {
    apiRuntimeCallbacks.showInsufficientBalanceDialog = typeof callbacks.showInsufficientBalanceDialog === 'function'
      ? callbacks.showInsufficientBalanceDialog
      : () => false;
  }
  return previous;
}

export function getVeniceE2EESessionRuntime() {
  return typeof window !== 'undefined'
    ? (window as unknown as ApiBrowserRuntime)._veniceE2EE
    : null;
}

export function getApiLocationOriginRuntime() {
  return getApiRuntime()?.location?.origin || '';
}

export function getApiLocationPathnameRuntime() {
  return getApiRuntime()?.location?.pathname || '';
}

export function setApiLocationHrefRuntime(url: string) {
  const runtime = getApiRuntime();
  if (!runtime?.location) return false;
  runtime.location.href = url;
  return true;
}

export function showOpenRouterInsufficientBalanceDialogRuntime() {
  try {
    return apiRuntimeCallbacks.showInsufficientBalanceDialog() !== false;
  } catch {
    return false;
  }
}
