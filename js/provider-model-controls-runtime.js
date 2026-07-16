// @ts-check
// provider-model-controls-runtime.js - Browser runtime adapters for provider model controls.

import { callClaudeAPI } from './api.js';
import {
  refreshChatWebSearchToggleRuntime,
  updateChatHeaderModelRuntime,
} from './chat-runtime.js';

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
  const headerRefreshed = updateChatHeaderModelRuntime();
  return refreshChatWebSearchToggleRuntime() || headerRefreshed;
}

export function callProviderModelSmokeTestRuntime() {
  return providerModelControlsRuntimeDeps.callClaudeAPI({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 1 });
}
