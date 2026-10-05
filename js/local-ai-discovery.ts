// Cached orchestration for provider-specific Local AI discovery adapters.

import { getOllamaConfig } from './api-provider-storage.js';
import {
  checkOllamaProvider,
  checkOpenAICompatibleProvider,
  discoverLocalAiProviders,
} from './local-ai-provider-registry.js';
import {
  getLocalAiExecutionLocation,
  isCloudModel,
  isLikelyEmbeddingModel,
  normalizeLocalAiBaseUrl,
} from './local-ai-provider-shared.js';

import type { LocalAiDiscoveryResult } from './local-ai-provider-registry.js';
import type { LocalAiModel } from './local-ai-provider-shared.js';

type ProviderDiscovery = Awaited<ReturnType<typeof discoverLocalAiProviders>>;
type DiscoveryResult = LocalAiDiscoveryResult & {
  capabilities: Readonly<Record<string, boolean | string>>;
  baseUrl: string; discoveredAt: number; executionLocation: ReturnType<typeof getLocalAiExecutionLocation>;
  openai: ProviderDiscovery['openai']; ollama: ProviderDiscovery['ollama'];
};
interface DiscoveryOptions { force?: boolean }

const DISCOVERY_CACHE_MS = 30000;
const FAILED_DISCOVERY_CACHE_MS = 3000;
const discoveryCache = new Map<string, { at: number; result: DiscoveryResult }>();
const latestDiscoveryKey = new Map<string, string>();

export { getLocalAiExecutionLocation, isCloudModel, isLikelyEmbeddingModel };

function normalizeBaseUrl(url: unknown) {
  return normalizeLocalAiBaseUrl(url || getOllamaConfig().url || '');
}

export function isPIIEligibleModel(modelName: unknown) {
  return !!modelName && !isCloudModel(modelName) && !isLikelyEmbeddingModel(modelName);
}

export function filterPIIEligibleModels(models: unknown) {
  return (Array.isArray(models) ? models : []).filter(isPIIEligibleModel);
}

export function checkOpenAICompatible(url: unknown, apiKey?: unknown) {
  return checkOpenAICompatibleProvider(normalizeBaseUrl(url), apiKey);
}

export function checkOllama(url: unknown, apiKey = '') {
  return checkOllamaProvider(normalizeBaseUrl(url), apiKey);
}

export async function discoverLocalAI(url: unknown, apiKey?: unknown, options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
  const baseUrl = normalizeBaseUrl(url);
  const cacheKey = `${baseUrl}\n${String(apiKey || '')}`;
  const cached = discoveryCache.get(cacheKey);
  const maxAge = cached?.result?.available ? DISCOVERY_CACHE_MS : FAILED_DISCOVERY_CACHE_MS;
  if (!options.force && cached && Date.now() - cached.at < maxAge) return cached.result;
  const { primary, openai, ollama } = await discoverLocalAiProviders(baseUrl, apiKey);
  const result: DiscoveryResult = {
    ...primary,
    baseUrl,
    discoveredAt: Date.now(),
    executionLocation: getLocalAiExecutionLocation(baseUrl),
    openai,
    ollama,
  };
  discoveryCache.set(cacheKey, { at: Date.now(), result });
  latestDiscoveryKey.set(baseUrl, cacheKey);
  return result;
}

export function getCachedLocalAiDiscovery(url: unknown, apiKey?: unknown) {
  const baseUrl = normalizeBaseUrl(url);
  const key = apiKey === undefined
    ? latestDiscoveryKey.get(baseUrl)
    : `${baseUrl}\n${String(apiKey || '')}`;
  return key ? discoveryCache.get(key)?.result || null : null;
}

export function getCachedLocalAiModelDetail(url: unknown, modelName: unknown, apiKey?: unknown) {
  const result = getCachedLocalAiDiscovery(url, apiKey);
  return result?.modelDetails?.find(model => model.name === modelName) || null;
}

export function markCachedLocalAiModelLoaded(url: unknown, modelName: unknown, apiKey?: unknown, runtimePatch: Partial<LocalAiModel> = {}) {
  const result = getCachedLocalAiDiscovery(url, apiKey);
  const detail = result?.modelDetails?.find(model => model.name === modelName);
  if (!result || !detail) return result || null;
  Object.assign(detail, runtimePatch, { loaded: true, runningStatusKnown: true });
  result.runningStatusKnown = true;
  if (result.openai?.modelDetails) {
    const openaiDetail = result.openai.modelDetails.find(model => model.name === modelName);
    if (openaiDetail) Object.assign(openaiDetail, runtimePatch, { loaded: true, runningStatusKnown: true });
  }
  if (result.ollama?.modelDetails) {
    const ollamaDetail = result.ollama.modelDetails.find(model => model.name === modelName);
    if (ollamaDetail) Object.assign(ollamaDetail, runtimePatch, { loaded: true, runningStatusKnown: true });
  }
  return result;
}

export function clearLocalAiDiscovery(url?: unknown) {
  if (url) {
    const baseUrl = normalizeBaseUrl(url);
    for (const key of discoveryCache.keys()) {
      if (key.startsWith(`${baseUrl}\n`)) discoveryCache.delete(key);
    }
    latestDiscoveryKey.delete(baseUrl);
  } else {
    discoveryCache.clear();
    latestDiscoveryKey.clear();
  }
}
