// @ts-check
// Provider registry and normalized adapter contract for Local AI backends.

import { lmStudioProviderAdapter } from './local-ai-provider-lmstudio.js';
import { ollamaProviderAdapter } from './local-ai-provider-ollama.js';
import { openAICompatibleProviderAdapter } from './local-ai-provider-openai-compatible.js';
import { localAiDiscoveryError, unavailableLocalAiResult } from './local-ai-provider-shared.js';

/**
 * @typedef {Object} LocalAiProviderAdapter
 * @property {string} id Stable detected backend identifier.
 * @property {string} label User-facing backend name.
 * @property {Readonly<Record<string, boolean|string>>} capabilities Normalized feature support.
 * @property {(context: any) => Promise<any>} discover Native or compatible model discovery.
 * @property {(context: any) => Promise<any>} [infer] Normalized inference entry point.
 * @property {(context: any) => any} [prepareNativeRequest] Optional native request planner.
 * @property {(context: any) => Promise<boolean>} [unload] Optional model lifecycle hook.
 * @property {(context: any) => Promise<boolean>} [loadWithContext] Optional load-with-context-length lifecycle hook.
 */

/** @type {ReadonlyArray<LocalAiProviderAdapter>} */
export const LOCAL_AI_PROVIDER_ADAPTERS = Object.freeze([
  lmStudioProviderAdapter,
  ollamaProviderAdapter,
  openAICompatibleProviderAdapter,
]);

/** @type {Map<string, LocalAiProviderAdapter>} */
const adaptersById = new Map(LOCAL_AI_PROVIDER_ADAPTERS.map(adapter => [adapter.id, adapter]));

/** @returns {LocalAiProviderAdapter} */
export function getLocalAiProviderAdapter(providerId) {
  return adaptersById.get(providerId) || openAICompatibleProviderAdapter;
}

export function getLocalAiProviderCapabilities(providerId) {
  return getLocalAiProviderAdapter(providerId).capabilities;
}

function publicDiscoveryResult(result, adapter) {
  const { rawModels: _rawModels, nativeModels: _nativeModels, ...publicResult } = result || {};
  return {
    ...publicResult,
    capabilities: adapter.capabilities,
  };
}

/**
 * Preserve the legacy checkOpenAICompatible contract while keeping LM Studio
 * and generic endpoint knowledge inside their own adapters.
 */
export async function checkOpenAICompatibleProvider(baseUrl, apiKey = '') {
  const context = { baseUrl, apiKey };
  const lmStudioPromise = lmStudioProviderAdapter.discover(context);
  const openAIPromise = openAICompatibleProviderAdapter.discover(context);
  const [lmStudio, openAI] = await Promise.all([lmStudioPromise, openAIPromise]);
  if (lmStudio.available) {
    const merged = lmStudioProviderAdapter.mergeDiscovery(lmStudio, openAI, baseUrl);
    return publicDiscoveryResult(merged, lmStudioProviderAdapter);
  }
  return publicDiscoveryResult(openAI, openAICompatibleProviderAdapter);
}

export async function checkOllamaProvider(baseUrl, apiKey = '') {
  const result = await ollamaProviderAdapter.discover({ baseUrl, apiKey });
  return publicDiscoveryResult(result, ollamaProviderAdapter);
}

export async function discoverLocalAiProviders(baseUrl, apiKey = '') {
  const openai = await checkOpenAICompatibleProvider(baseUrl, apiKey);
  // Once the native LM Studio endpoint identifies the server, do not send it
  // Ollama-only probes. LM Studio logs unknown /api/tags and /api/ps routes.
  const ollama = openai.provider === 'lmstudio'
    ? {
        ...unavailableLocalAiResult('ollama', localAiDiscoveryError('not-probed', {
          message: 'LM Studio identified by native API',
        })),
        capabilities: ollamaProviderAdapter.capabilities,
      }
    : await checkOllamaProvider(baseUrl, apiKey);
  const primary = ollama.available && ollama.models.length > 0
    ? ollama
    : openai.available ? openai : ollama.available ? ollama : openai;
  return { primary, openai, ollama };
}
