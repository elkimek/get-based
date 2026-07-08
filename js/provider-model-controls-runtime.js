// @ts-check
// provider-model-controls-runtime.js - Browser runtime adapters for provider model controls.

import { callClaudeAPI } from './api.js';

const providerModelControlsRuntimeDeps = {
  callClaudeAPI,
};

export function configureProviderModelControlsRuntimeDeps(deps = {}) {
  const previous = { ...providerModelControlsRuntimeDeps };
  if (typeof deps.callClaudeAPI === 'function') providerModelControlsRuntimeDeps.callClaudeAPI = deps.callClaudeAPI;
  return previous;
}

function getProviderModelControlsRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getProviderModelControlsRuntime();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

export function clearProviderE2EESessionRuntime() {
  const clearSession = getRuntimeFunction('clearE2EESession');
  if (!clearSession) return false;
  clearSession();
  return true;
}

export function refreshProviderModelUiRuntime() {
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

export function callProviderModelSmokeTestRuntime() {
  return providerModelControlsRuntimeDeps.callClaudeAPI({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 1 });
}
