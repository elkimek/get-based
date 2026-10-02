import type { LocalAiModel } from './local-ai-provider-shared.js';
type LocalAiRuntimeWindow = Window & {
  _lastOllamaModelDetails?: LocalAiModel[];
  _lastIsOllamaServer?: unknown;
  CustomEvent: typeof CustomEvent;
};

// provider-local-ai-runtime.js - Browser runtime adapters for Local AI settings hooks.

import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as LocalAiRuntimeWindow)
    : null;
}

export function updatePrivacyStatusCardFromRuntime(isAvailable?: boolean) {
  const update = getSettingsModuleFunction('updatePrivacyStatusCard');
  if (!update) return;
  if (typeof isAvailable === 'boolean') update(isAvailable);
  else update();
}

export function cacheLocalAiModelDetails(modelDetails: LocalAiModel[], isOllamaServer: boolean) {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._lastOllamaModelDetails = modelDetails;
  runtime._lastIsOllamaServer = isOllamaServer;
  if (typeof runtime.dispatchEvent === 'function' && typeof runtime.CustomEvent === 'function') {
    runtime.dispatchEvent(new runtime.CustomEvent('labcharts-ai-settings-local-changed'));
  }
}

export function getCachedLocalAiModelDetails() {
  const runtime = getRuntimeWindow();
  const modelDetails = Array.isArray(runtime?._lastOllamaModelDetails)
    ? runtime._lastOllamaModelDetails
    : [];
  return {
    modelDetails,
    isOllamaServer: !!runtime?._lastIsOllamaServer,
  };
}

export function clearCachedLocalAiModelDetails() {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._lastOllamaModelDetails = [];
  runtime._lastIsOllamaServer = false;
}
