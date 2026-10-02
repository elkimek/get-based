import type { RuntimeDependencyUpdates } from './runtime-callbacks.js';

// provider-model-controls-runtime.js - Browser runtime adapters for provider model controls.

import { configureRuntimeDependencies } from './runtime-callbacks.js';
import { callClaudeAPI, clearVeniceE2EESession } from './api.js';
import {
  refreshChatWebSearchToggleRuntime,
  updateChatHeaderModelRuntime,
} from './chat-runtime.js';

interface ProviderModelControlsDependencies {
  callClaudeAPI: (options: Parameters<typeof callClaudeAPI>[0]) => Promise<unknown>;
  clearE2EESession: () => unknown;
}

const providerModelControlsRuntimeDeps: ProviderModelControlsDependencies = {
  callClaudeAPI,
  clearE2EESession: clearVeniceE2EESession,
};

export function configureProviderModelControlsRuntimeDeps(deps: RuntimeDependencyUpdates<ProviderModelControlsDependencies> = {}) {
  return configureRuntimeDependencies(providerModelControlsRuntimeDeps, deps);
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
