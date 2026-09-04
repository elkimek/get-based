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

async function unslothRuntimeStatus(baseUrl, apiKey, timeoutMs) {
  try {
    const response = await fetch(`${baseUrl}/api/inference/status`, {
      headers: createLocalAiHeaders(apiKey),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function enrichUnslothRuntime(modelDetails, status) {
  if (!Array.isArray(modelDetails)) return modelDetails;
  const unslothModels = modelDetails.map(model => ({ ...model, source: 'unsloth' }));
  if (!status) return unslothModels;
  const activeIds = new Set([
    status.active_model,
    status.model_identifier,
    ...(Array.isArray(status.loaded) ? status.loaded : []),
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
  const loadedRows = unslothModels.filter(model => model.loaded === true);
  let active = unslothModels.find(model => activeIds.has(String(model.name || '').toLowerCase())) || null;
  if (!active && loadedRows.length === 1) active = loadedRows[0];
  if (!active && unslothModels.length === 1 && activeIds.size > 0) active = unslothModels[0];
  return unslothModels.map(model => model === active ? {
    ...model,
    loaded: true,
    runningStatusKnown: true,
    contextLength: Number(status.context_length) || model.contextLength,
    vision: typeof status.is_vision === 'boolean' ? status.is_vision : model.vision,
  } : model);
}

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
    const isUnsloth = rawModels.some(model => String(model?.owned_by || '').toLowerCase() === 'unsloth-studio');
    let modelDetails = rawModels
      .map(model => parseOpenAICompatibleModel(model, baseUrl))
      .filter(model => model.name && model.type !== 'embedding' && !isLikelyEmbeddingModel(model.name));
    if (isUnsloth) {
      modelDetails = enrichUnslothRuntime(modelDetails, await unslothRuntimeStatus(baseUrl, apiKey, timeoutMs));
    }
    const provider = isUnsloth ? 'unsloth' : 'openai-compatible';
    return {
      ...localAiResult(provider, modelDetails, { runningStatusKnown: modelDetails.some(model => model.runningStatusKnown) }),
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
  // "on" is a native boolean-model choice, not an OpenAI reasoning_effort
  // value. Omitting it preserves the model/server's enabled default.
  const requestOpts = opts.reasoningEffort === 'on' ? { ...opts, reasoningEffort: undefined } : opts;
  const result = await callOpenAICompatibleAPI(
    `${url}/v1/chat/completions`,
    config.apiKey,
    model,
    'Local AI',
    { ...requestOpts, maxTokens: plan.maxTokens },
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
