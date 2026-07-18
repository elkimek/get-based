// @ts-check
// provider-model-controls-runtime.js - Browser runtime adapters for provider model controls.

import { callClaudeAPI, clearVeniceE2EESession } from './api.js';
import {
  refreshChatWebSearchToggleRuntime,
  updateChatHeaderModelRuntime,
} from './chat-runtime.js';

const providerModelControlsRuntimeDeps = {
  callClaudeAPI,
  clearE2EESession: clearVeniceE2EESession,
};

export function configureProviderModelControlsRuntimeDeps(deps = {}) {
  const previous = { ...providerModelControlsRuntimeDeps };
  if (typeof deps.callClaudeAPI === 'function') providerModelControlsRuntimeDeps.callClaudeAPI = deps.callClaudeAPI;
  if (typeof deps.clearE2EESession === 'function') providerModelControlsRuntimeDeps.clearE2EESession = deps.clearE2EESession;
  return previous;
}

export function clearProviderE2EESessionRuntime() {
  return providerModelControlsRuntimeDeps.clearE2EESession() !== false;
}

export function refreshProviderModelUiRuntime() {
  const headerRefreshed = updateChatHeaderModelRuntime();
  return refreshChatWebSearchToggleRuntime() || headerRefreshed;
}

export function callProviderModelSmokeTestRuntime() {
  return providerModelControlsRuntimeDeps.callClaudeAPI({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 1 });
}
