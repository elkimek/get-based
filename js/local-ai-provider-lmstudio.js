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

// A 20GB model load takes 20-60s; leave headroom for memory-pressure stalls.
const LMSTUDIO_LOAD_TIMEOUT_MS = 300000;
// The native chat endpoint is non-streaming, so the initial-response timeout
// spans the entire generation. Local generations legitimately run for many
// minutes (long prompts at ~15 tok/s), so the streaming-oriented request
// timeout must not apply here. The caller's abort signal still cancels.
const LMSTUDIO_NATIVE_GENERATION_TIMEOUT_MS = 900000;

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
  loadWithContext: loadLMStudioModelWithContext,
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
  const requestedReasoning = ['none', 'off'].includes(opts.reasoningEffort) ? 'off' : opts.reasoningEffort;
  const reasoning = opts.jsonMode && reasoningOptions.includes('off')
    ? 'off'
    : requestedReasoning && reasoningOptions.includes(requestedReasoning)
      ? requestedReasoning
      : undefined;
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
  const timeoutState = createInitialResponseTimeout(
    requestInit,
    Math.max(opts.requestTimeoutMs || FETCH_REQUEST_TIMEOUT_MS, LMSTUDIO_NATIVE_GENERATION_TIMEOUT_MS),
  );
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
  const inputTokens = Number(stats.input_tokens) || 0;
  const outputTokens = Number(stats.total_output_tokens) || 0;
  // The native endpoint reports no finish reason. Infer truncation from the
  // token accounting: generation that stopped at the output cap or filled the
  // context window did not finish naturally.
  const truncated = (plan.maxTokens > 0 && outputTokens >= plan.maxTokens)
    || (contextLength > 0 && inputTokens + outputTokens >= contextLength - 1);
  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
    },
    finishReason: truncated ? 'length' : null,
    truncated,
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
 * Load (or reload) a model with an explicit context length via the native
 * REST API, so generation can then run over the streaming OpenAI-compatible
 * endpoint instead of the non-streaming native chat call. Any loaded instance
 * is unloaded first — LM Studio instances are additive, and two resident
 * copies of a large model would exhaust unified memory.
 *
 * Throws with `status` set on HTTP failure; callers treat 404 (older builds
 * without the load route) as "fall back to the native chat path".
 *
 * @param {{
 *   baseUrl: string,
 *   apiKey?: string,
 *   model: string,
 *   modelDetail?: { nativeModelKey?: string, loadedInstanceId?: string, loaded?: boolean } | null,
 *   contextLength: number,
 *   timeoutMs?: number,
 * }} context
 */
export async function loadLMStudioModelWithContext({
  baseUrl,
  apiKey = '',
  model,
  modelDetail = null,
  contextLength,
  timeoutMs = LMSTUDIO_LOAD_TIMEOUT_MS,
}) {
  if (modelDetail?.loaded) {
    let unloaded = false;
    try {
      unloaded = await unloadLMStudioModel({ baseUrl, apiKey, model, modelDetail });
    } catch { unloaded = false; }
    if (!unloaded) {
      // A failed unload may just mean the instance already vanished (stale
      // cached state), but only an authoritative discovery response can prove
      // that. Fail closed when residency cannot be verified: loading a second
      // copy of a large model would exhaust unified memory.
      const check = await discoverLMStudioProvider({ baseUrl, apiKey }).catch(() => null);
      if (!check?.available || !check.runningStatusKnown) {
        throw new Error(`LM Studio could not verify that ${model} was unloaded before reloading it with a larger context. Check the model state in LM Studio, then retry.`);
      }
      const stillLoaded = check?.modelDetails?.some(detail => detail.loaded
        && (detail.name === model || (modelDetail.nativeModelKey && detail.nativeModelKey === modelDetail.nativeModelKey)));
      if (stillLoaded) {
        throw new Error(`LM Studio could not unload ${model} before reloading it with a larger context. Unload it manually in LM Studio, then retry.`);
      }
    }
  }
  const response = await fetch(`${baseUrl}/api/v1/models/load`, {
    method: 'POST',
    headers: createLocalAiHeaders(apiKey, { json: true }),
    body: JSON.stringify({
      model: modelDetail?.nativeModelKey || model,
      context_length: contextLength,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.error?.message || response.statusText;
    const error = new Error(`LM Studio could not load ${model} (${response.status}): ${redactApiSecretText(detail, [apiKey])}`);
    /** @type {any} */ (error).status = response.status;
    throw error;
  }
  await response.json().catch(() => null);
  return true;
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
