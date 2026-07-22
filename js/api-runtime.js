// @ts-check
// api-runtime.js - Browser runtime adapters for AI provider orchestration.

function getApiRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/** @type {{ showInsufficientBalanceDialog: Function }} */
const apiRuntimeCallbacks = {
  showInsufficientBalanceDialog: () => false,
};

export function configureApiRuntimeCallbacks(callbacks = {}) {
  const previous = { ...apiRuntimeCallbacks };
  if ('showInsufficientBalanceDialog' in callbacks) {
    apiRuntimeCallbacks.showInsufficientBalanceDialog = typeof callbacks.showInsufficientBalanceDialog === 'function'
      ? callbacks.showInsufficientBalanceDialog
      : () => false;
  }
  return previous;
}

export function getApiLocationOriginRuntime() {
  return getApiRuntime()?.location?.origin || '';
}

export function getApiLocationPathnameRuntime() {
  return getApiRuntime()?.location?.pathname || '';
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function setApiLocationHrefRuntime(url) {
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
