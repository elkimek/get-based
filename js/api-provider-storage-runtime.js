// @ts-check
// api-provider-storage-runtime.js - Browser runtime adapters for persisted provider settings.

function getApiProviderStorageRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getApiProviderStorageRuntime();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

export function refreshAIProviderSelectionRuntime() {
  let refreshed = false;
  const updateHeader = getRuntimeFunction('updateChatHeaderModel');
  if (updateHeader) {
    updateHeader();
    refreshed = true;
  }
  const refreshWebSearch = getRuntimeFunction('refreshWebSearchToggle');
  if (refreshWebSearch) {
    refreshWebSearch();
    refreshed = true;
  }
  return refreshed;
}

export function dispatchAISettingsLocalChangedRuntime() {
  const runtime = getApiProviderStorageRuntime();
  if (!runtime || typeof runtime.dispatchEvent !== 'function' || typeof runtime.CustomEvent !== 'function') return false;
  try {
    runtime.dispatchEvent(new runtime.CustomEvent('labcharts-ai-settings-local-changed'));
    return true;
  } catch {
    return false;
  }
}

export function getOllamaConfigStorageRuntime() {
  const getOllamaConfig = getRuntimeFunction('getOllamaConfig');
  if (!getOllamaConfig) return {};
  return getOllamaConfig() || {};
}
