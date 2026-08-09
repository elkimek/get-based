// @ts-check
// Generic OpenAI-compatible Local AI adapter (Jan, llama.cpp, LocalAI, etc.).

import { callOpenAICompatibleAPI } from './api-openai-compatible.js';
import { LOCAL_AI_FIRST_TOKEN_STALL_MS } from './api-transport.js';
import {
  createLocalAiHeaders,
  isLikelyEmbeddingModel,
  localAiDiscoveryError,
  localAiFetchFailure,
  localAiResult,
  LOCAL_AI_DISCOVERY_TIMEOUT_MS,
  parseOpenAICompatibleModel,
  unavailableLocalAiResult,
} from './local-ai-provider-shared.js';

export const openAICompatibleProviderAdapter = Object.freeze({
  id: 'openai-compatible',
  label: 'Local AI',
  capabilities: Object.freeze({
    nativeModelDiscovery: false,
    loadedModelState: false,
    contextOverride: false,
    nativeStreaming: false,
    structuredOutput: true,
    reasoningControl: 'compatibility',
    performanceStats: 'endpoint-dependent',
    modelUnload: false,
  }),
  discover: discoverOpenAICompatibleProvider,
  infer: inferWithOpenAICompatibleProvider,
});

export async function discoverOpenAICompatibleProvider({
  baseUrl,
  apiKey = '',
  timeoutMs = LOCAL_AI_DISCOVERY_TIMEOUT_MS,
}) {
  const headers = createLocalAiHeaders(apiKey);
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        ...unavailableLocalAiResult('openai-compatible', localAiDiscoveryError('http', {
          status: response.status,
          message: response.statusText,
        })),
        rawModels: [],
      };
    }
    const data = await response.json();
    const rawModels = Array.isArray(data.data) ? data.data : [];
    const modelDetails = rawModels
      .map(model => parseOpenAICompatibleModel(model, baseUrl))
      .filter(model => model.name && model.type !== 'embedding' && !isLikelyEmbeddingModel(model.name));
    return {
      ...localAiResult('openai-compatible', modelDetails),
      rawModels,
    };
  } catch (error) {
    return {
      ...unavailableLocalAiResult('openai-compatible', localAiFetchFailure(error)),
      rawModels: [],
    };
  }
}

export async function inferWithOpenAICompatibleProvider({ config, model, opts, plan }) {
  const url = String(config.url || '').replace(/\/+$/, '');
  const extraBody = {};
  if (opts.jsonMode || opts.reasoningEffort === 'none') extraBody.reasoning_effort = 'none';
  if (opts.jsonMode || opts.temperature === 0) extraBody.temperature = 0;
  const result = await callOpenAICompatibleAPI(
    `${url}/v1/chat/completions`,
    config.apiKey,
    model,
    'Local AI',
    { ...opts, maxTokens: plan.maxTokens },
    {},
    { useProxy: false, extraBody, firstReadStallMs: LOCAL_AI_FIRST_TOKEN_STALL_MS },
  );
  return {
    ...result,
    diagnostics: {
      ...result?.diagnostics,
      providerApi: 'openai-compatible',
    },
  };
}
