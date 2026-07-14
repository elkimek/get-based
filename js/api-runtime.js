// @ts-check
// api-runtime.js - Browser runtime adapters for AI provider orchestration.

function getApiRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
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
  const runtime = getApiRuntime();
  if (!runtime?.showInsufficientBalanceDialog) return false;
  try { runtime.showInsufficientBalanceDialog(); } catch {}
  return true;
}
