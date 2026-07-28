// @ts-check
// LM Studio native discovery, context management, and inference adapter.

import { createInitialResponseTimeout, FETCH_REQUEST_TIMEOUT_MS } from './api-transport.js';
import {
  createLocalAiHeaders,
  getLocalAiExecutionLocation,
  isLikelyEmbeddingModel,
  localAiDiscoveryError,
  localAiFetchFailure,
  localAiResult,
  LOCAL_AI_DISCOVERY_TIMEOUT_MS,
  parseOpenAICompatibleModel,
  redactApiSecretText,
  unavailableLocalAiResult,
} from './local-ai-provider-shared.js';

export const lmStudioProviderAdapter = Object.freeze({
  id: 'lmstudio',
  label: 'LM Studio',
  capabilities: Object.freeze({
    nativeModelDiscovery: true,
    loadedModelState: true,
    contextOverride: true,
    nativeStreaming: false,
    structuredOutput: false,
    reasoningControl: 'native',
    performanceStats: 'native',
    modelUnload: true,
  }),
  discover: discoverLMStudioProvider,
  mergeDiscovery: mergeLMStudioDiscovery,
  prepareNativeRequest: prepareLMStudioNativeRequest,
  infer: inferWithLMStudioNativeProvider,
  unload: unloadLMStudioModel,
});

function indexLMStudioModels(rawModels) {
  const index = new Map();
  for (const model of rawModels) {
    if (!model || !model.key) continue;
    index.set(model.key, model);
    if (model.selected_variant) index.set(model.selected_variant, model);
    for (const instance of Array.isArray(model.loaded_instances) ? model.loaded_instances : []) {
      if (instance?.id) index.set(instance.id, model);
    }
  }
  return index;
}

function enrichWithLMStudioModel(detail, model, baseUrl) {
  if (!model) return detail;
  const loadedInstances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
  const loadedInstance = loadedInstances.find(instance => instance?.id === detail.name) || loadedInstances[0];
  const exactSize = Number(model.size_bytes) || 0;
  const reasoning = model.capabilities?.reasoning;
  return {
    ...detail,
    type: model.type || detail.type,
    size: exactSize || detail.size,
    sizeSource: exactSize ? 'lmstudio' : detail.sizeSource,
    paramSize: model.params_string || detail.paramSize,
    quantLevel: model.quantization?.name || detail.quantLevel,
    family: model.architecture || model.publisher || detail.family,
    format: model.format || detail.format,
    loaded: loadedInstances.length > 0,
    runningStatusKnown: true,
    contextLength: Number(loadedInstance?.config?.context_length) || 0,
    maxContextLength: Number(model.max_context_length) || detail.maxContextLength,
    vision: typeof model.capabilities?.vision === 'boolean' ? model.capabilities.vision : null,
    reasoning: reasoning ? {
      allowedOptions: Array.isArray(reasoning.allowed_options) ? reasoning.allowed_options.slice() : [],
      default: reasoning.default || null,
    } : null,
    nativeModelKey: model.key || '',
    loadedInstanceId: loadedInstance?.id || '',
    executionLocation: getLocalAiExecutionLocation(baseUrl, detail.name),
    source: 'lmstudio',
  };
}

function dedupeLMStudioAliases(modelDetails) {
  const output = [];
  const indexByKey = new Map();
  for (const detail of modelDetails) {
    const key = detail.nativeModelKey || detail.name;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, output.length);
      output.push(detail);
      continue;
    }
    const existing = output[existingIndex];
    const existingIsLoadedId = existing.name === existing.loadedInstanceId;
    const candidateIsLoadedId = detail.name === detail.loadedInstanceId;
    if (candidateIsLoadedId && !existingIsLoadedId) output[existingIndex] = detail;
  }
  return output;
}

function nativeLMStudioModelDetail(model, baseUrl) {
  const loadedInstances = Array.isArray(model?.loaded_instances) ? model.loaded_instances : [];
  const id = loadedInstances[0]?.id || model?.selected_variant || model?.key || '';
  if (!id) return null;
  return enrichWithLMStudioModel(parseOpenAICompatibleModel({
    id,
    type: model.type,
    owned_by: model.publisher,
  }, baseUrl), model, baseUrl);
}

function mergeLMStudioModelDetails(rawOpenAIModels, nativeModels, baseUrl) {
  const nativeIndex = indexLMStudioModels(nativeModels);
  const openAIDetails = rawOpenAIModels
    .map(model => parseOpenAICompatibleModel(model, baseUrl))
    .filter(model => model.name
      && model.type !== 'embedding'
      && nativeIndex.get(model.name)?.type !== 'embedding'
      && !isLikelyEmbeddingModel(model.name))
    .map(model => enrichWithLMStudioModel(model, nativeIndex.get(model.name), baseUrl));
  const representedNativeKeys = new Set(openAIDetails.map(detail => detail.nativeModelKey).filter(Boolean));
  const nativeOnlyDetails = nativeModels
    .filter(model => model?.type !== 'embedding' && !representedNativeKeys.has(model?.key))
    .map(model => nativeLMStudioModelDetail(model, baseUrl))
    .filter(detail => detail?.name && !isLikelyEmbeddingModel(detail.name));
  return dedupeLMStudioAliases([...openAIDetails, ...nativeOnlyDetails]);
}

export async function discoverLMStudioProvider({
  baseUrl,
  apiKey = '',
  timeoutMs = LOCAL_AI_DISCOVERY_TIMEOUT_MS,
}) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/models`, {
      headers: createLocalAiHeaders(apiKey),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        ...unavailableLocalAiResult('lmstudio', localAiDiscoveryError('http', {
          status: response.status,
          message: response.statusText,
        })),
        nativeModels: [],
      };
    }
    const data = await response.json();
    const nativeModels = Array.isArray(data.models) ? data.models : [];
    const modelDetails = mergeLMStudioModelDetails([], nativeModels, baseUrl);
    return {
      ...localAiResult('lmstudio', modelDetails, { runningStatusKnown: true }),
      nativeModels,
    };
  } catch (error) {
    return {
      ...unavailableLocalAiResult('lmstudio', localAiFetchFailure(error)),
      nativeModels: [],
    };
  }
}

export function mergeLMStudioDiscovery(nativeDiscovery, openAIDiscovery, baseUrl) {
  const nativeModels = Array.isArray(nativeDiscovery?.nativeModels) ? nativeDiscovery.nativeModels : [];
  const rawOpenAIModels = Array.isArray(openAIDiscovery?.rawModels) ? openAIDiscovery.rawModels : [];
  const modelDetails = mergeLMStudioModelDetails(rawOpenAIModels, nativeModels, baseUrl);
  return localAiResult('lmstudio', modelDetails, { runningStatusKnown: true });
}

export function prepareLMStudioNativeRequest({ opts, modelDetail, requiredContext, roundContextLength }) {
  if (!opts.preferNativeContext || modelDetail?.source !== 'lmstudio') return null;
  const currentContext = Number(modelDetail.contextLength) || 0;
  const maxContext = Number(modelDetail.maxContextLength) || 0;
  if (currentContext > 0 && requiredContext <= currentContext) return null;
  if (maxContext > 0 && requiredContext > maxContext) {
    throw new Error(`Local AI context is too small for this request: about ${requiredContext.toLocaleString()} tokens are required, but ${modelDetail.name || 'the model'} supports up to ${maxContext.toLocaleString()}. Use a smaller or chunked input.`);
  }
  const contextLength = roundContextLength(requiredContext, maxContext);
  return {
    contextLength,
    nativeContextOverride: true,
    modelDetail: { ...modelDetail, contextLength },
  };
}

function nativeLMStudioInput(messages) {
  const input = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== 'user') return null;
    if (typeof message.content === 'string') {
      input.push({ type: 'message', content: message.content });
      continue;
    }
    if (!Array.isArray(message.content)) return null;
    for (const block of message.content) {
      if (block?.type === 'text') input.push({ type: 'message', content: block.text || '' });
      else if (block?.type === 'image_url' && block.image_url?.url) input.push({ type: 'image', data_url: block.image_url.url });
      else if (block?.type === 'image' && block.source?.data) {
        input.push({ type: 'image', data_url: `data:${block.source.media_type || 'image/jpeg'};base64,${block.source.data}` });
      }
    }
  }
  return input;
}

export async function inferWithLMStudioNativeProvider({ config, model, opts, plan, contextLength, modelDetail }) {
  const input = nativeLMStudioInput(opts.messages);
  if (!input) throw new Error('LM Studio context override is unavailable for requests containing assistant history. Reload the model with a larger context in LM Studio.');
  const reasoningOptions = Array.isArray(modelDetail?.reasoning?.allowedOptions)
    ? modelDetail.reasoning.allowedOptions
    : [];
  const disableReasoning = opts.jsonMode || opts.reasoningEffort === 'none';
  const reasoning = disableReasoning && reasoningOptions.includes('off') ? 'off' : undefined;
  const requestInit = {
    method: 'POST',
    headers: createLocalAiHeaders(config.apiKey, { json: true }),
    body: JSON.stringify({
      model,
      input: input.length === 1 && input[0].type === 'message' ? input[0].content : input,
      system_prompt: opts.system || undefined,
      temperature: opts.jsonMode || opts.temperature === 0 ? 0 : undefined,
      max_output_tokens: plan.maxTokens,
      reasoning,
      context_length: contextLength,
      stream: false,
      store: false,
    }),
    signal: opts.signal,
  };
  const timeoutState = createInitialResponseTimeout(requestInit, opts.requestTimeoutMs || FETCH_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${String(config.url || '').replace(/\/+$/, '')}/api/v1/chat`, timeoutState.fetchOptions);
  } finally {
    timeoutState.clearRequestTimeout();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.error?.message
      || (body?.error ? JSON.stringify(body.error) : response.statusText);
    throw new Error(`LM Studio native API error (${response.status}): ${redactApiSecretText(detail, [config.apiKey])}`);
  }
  const data = await response.json();
  const text = (Array.isArray(data.output) ? data.output : [])
    .filter(item => item?.type === 'message' && typeof item.content === 'string')
    .map(item => item.content)
    .join('\n')
    .trim();
  if (!text) throw new Error('LM Studio returned no final response content.');
  if (opts.onStream) opts.onStream(text);
  const stats = data.stats || {};
  return {
    text,
    usage: {
      inputTokens: Number(stats.input_tokens) || 0,
      outputTokens: Number(stats.total_output_tokens) || 0,
    },
    finishReason: null,
    truncated: false,
    diagnostics: {
      providerApi: 'native',
      nativeContextOverride: true,
      contextLength,
      schemaUnavailableOnNativeEndpoint: !!opts.jsonMode,
      performance: {
        tokensPerSecond: Number(stats.tokens_per_second) || 0,
        timeToFirstTokenMs: Number(stats.time_to_first_token_seconds) > 0 ? Math.round(Number(stats.time_to_first_token_seconds) * 1000) : 0,
        modelLoadMs: Number(stats.model_load_time_seconds) > 0 ? Math.round(Number(stats.model_load_time_seconds) * 1000) : 0,
        reasoningTokens: Number(stats.reasoning_output_tokens) || 0,
      },
    },
  };
}

/**
 * @param {{
 *   baseUrl: string,
 *   apiKey?: string,
 *   model: string,
 *   modelDetail?: { loadedInstanceId?: string } | null,
 *   timeoutMs?: number,
 * }} context
 */
export async function unloadLMStudioModel({ baseUrl, apiKey = '', model, modelDetail = null, timeoutMs = 5000 }) {
  const instanceId = modelDetail?.loadedInstanceId || model;
  if (!instanceId) return false;
  const response = await fetch(`${baseUrl}/api/v1/models/unload`, {
    method: 'POST',
    headers: createLocalAiHeaders(apiKey, { json: true }),
    body: JSON.stringify({ instance_id: instanceId }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return response.ok;
}
