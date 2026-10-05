// Provider registry and normalized adapter contract for Local AI backends.

import { lmStudioProviderAdapter } from './local-ai-provider-lmstudio.js';
import { ollamaProviderAdapter } from './local-ai-provider-ollama.js';
import { openAICompatibleProviderAdapter } from './local-ai-provider-openai-compatible.js';
import { localAiDiscoveryError, unavailableLocalAiResult } from './local-ai-provider-shared.js';

export const unslothProviderAdapter = Object.freeze({
  ...openAICompatibleProviderAdapter,
  id: 'unsloth',
  label: 'Unsloth Studio',
  capabilities: Object.freeze({
    ...openAICompatibleProviderAdapter.capabilities,
    providerIdentity: true,
    loadedModelState: true,
  }),
});

import type { localAiResult, LocalAiModel } from './local-ai-provider-shared.js';

export type LocalAiDiscoveryResult = Omit<ReturnType<typeof localAiResult>, 'error'>
  & { error: ReturnType<typeof unavailableLocalAiResult>['error'] };
export type LocalAiInferenceContext = Parameters<typeof lmStudioProviderAdapter.infer>[0]
  & Parameters<typeof ollamaProviderAdapter.infer>[0] & Parameters<typeof openAICompatibleProviderAdapter.infer>[0];
type NativeRequestContext = Parameters<typeof lmStudioProviderAdapter.prepareNativeRequest>[0]
  & Parameters<typeof ollamaProviderAdapter.prepareNativeRequest>[0];
export interface LocalAiProviderAdapter {
  id: string; label: string; capabilities: Readonly<Record<string, boolean | string>>;
  discover(context: { baseUrl: string; apiKey: unknown }): Promise<LocalAiDiscoveryResult>;
  infer?(context: LocalAiInferenceContext): ReturnType<typeof lmStudioProviderAdapter.infer>
    | ReturnType<typeof ollamaProviderAdapter.infer> | ReturnType<typeof openAICompatibleProviderAdapter.infer>;
  prepareNativeRequest?(context: NativeRequestContext): { contextLength: number; nativeContextOverride: boolean; modelDetail: LocalAiModel } | null;
  unload?(context: { baseUrl: string; apiKey: unknown; model: unknown; modelDetail?: LocalAiModel }): Promise<boolean>;
  loadWithContext?(context: Parameters<typeof lmStudioProviderAdapter.loadWithContext>[0]): Promise<boolean>;
}

export const LOCAL_AI_PROVIDER_ADAPTERS: ReadonlyArray<LocalAiProviderAdapter> = Object.freeze([
  lmStudioProviderAdapter,
  ollamaProviderAdapter,
  unslothProviderAdapter,
  openAICompatibleProviderAdapter,
]);

const adaptersById = new Map<string, LocalAiProviderAdapter>(LOCAL_AI_PROVIDER_ADAPTERS.map(adapter => [adapter.id, adapter]));

export function getLocalAiProviderAdapter(providerId: 'ollama'): typeof ollamaProviderAdapter;
export function getLocalAiProviderAdapter(providerId: 'openai-compatible'): typeof openAICompatibleProviderAdapter;
export function getLocalAiProviderAdapter(providerId: unknown): LocalAiProviderAdapter;
export function getLocalAiProviderAdapter(providerId: unknown): LocalAiProviderAdapter {
  return adaptersById.get(providerId as string) || openAICompatibleProviderAdapter;
}

export function getLocalAiProviderCapabilities(providerId: unknown) {
  return getLocalAiProviderAdapter(providerId).capabilities;
}

function publicDiscoveryResult(result: LocalAiDiscoveryResult & { rawModels?: unknown; nativeModels?: unknown }, adapter: Pick<LocalAiProviderAdapter, 'capabilities'>) {
  const { rawModels: _rawModels, nativeModels: _nativeModels, ...publicResult } = result || {};
  return {
    ...(publicResult as LocalAiDiscoveryResult),
    capabilities: adapter.capabilities,
  };
}

/**
 * Preserve the legacy checkOpenAICompatible contract while keeping LM Studio
 * and generic endpoint knowledge inside their own adapters.
 */
export async function checkOpenAICompatibleProvider(baseUrl: string, apiKey: unknown = '') {
  const context = { baseUrl, apiKey };
  const lmStudioPromise = lmStudioProviderAdapter.discover(context);
  const openAIPromise = openAICompatibleProviderAdapter.discover(context);
  const [lmStudio, openAI] = await Promise.all([lmStudioPromise, openAIPromise]);
  if (lmStudio.available) {
    const merged = lmStudioProviderAdapter.mergeDiscovery(lmStudio, openAI, baseUrl);
    return publicDiscoveryResult(merged, lmStudioProviderAdapter);
  }
  const compatibleAdapter = openAI.provider === 'unsloth' ? unslothProviderAdapter : openAICompatibleProviderAdapter;
  return publicDiscoveryResult(openAI, compatibleAdapter);
}

export async function checkOllamaProvider(baseUrl: string, apiKey: unknown = '') {
  const result = await ollamaProviderAdapter.discover({ baseUrl, apiKey });
  return publicDiscoveryResult(result, ollamaProviderAdapter);
}

export async function discoverLocalAiProviders(baseUrl: string, apiKey: unknown = '') {
  const openai = await checkOpenAICompatibleProvider(baseUrl, apiKey);
  // Once a compatible endpoint identifies the server, do not send it
  // Ollama-only probes. Other backends log unknown /api/tags and /api/ps routes.
  const identifiedCompatibleServer = ['lmstudio', 'unsloth'].includes(openai.provider);
  const ollama = identifiedCompatibleServer
    ? {
        ...unavailableLocalAiResult('ollama', localAiDiscoveryError('not-probed', {
          message: `${getLocalAiProviderAdapter(openai.provider).label} identified by API`,
        })),
        capabilities: ollamaProviderAdapter.capabilities,
      }
    : await checkOllamaProvider(baseUrl, apiKey);
  const primary = ollama.available && ollama.models.length > 0
    ? ollama
    : openai.available ? openai : ollama.available ? ollama : openai;
  return { primary, openai, ollama };
}
