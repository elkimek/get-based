// @ts-check
// provider-local-ai-runtime.js - Browser runtime adapters for Local AI settings hooks.

import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

/** @param {boolean} [isAvailable] */
export function updatePrivacyStatusCardFromRuntime(isAvailable) {
  const update = getSettingsModuleFunction('updatePrivacyStatusCard');
  if (!update) return;
  if (typeof isAvailable === 'boolean') update(isAvailable);
  else update();
}

/**
 * @param {any[]} modelDetails
 * @param {boolean} isOllamaServer
 */
export function cacheLocalAiModelDetails(modelDetails, isOllamaServer) {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._lastOllamaModelDetails = modelDetails;
  runtime._lastIsOllamaServer = isOllamaServer;
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
