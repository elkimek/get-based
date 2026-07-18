// @ts-check
// local-ai-discovery.js - Provider-aware Local AI model, capability, and runtime discovery.

import { getOllamaConfig } from './api-provider-storage.js';

const DISCOVERY_TIMEOUT_MS = 3000;
const DISCOVERY_CACHE_MS = 30000;
const FAILED_DISCOVERY_CACHE_MS = 3000;
const discoveryCache = new Map();
const latestDiscoveryKey = new Map();

const QUANT_BPW = {
  q2: 0.3,
  q3: 0.4,
  q4: 0.55,
  q5: 0.65,
  q6: 0.8,
  q8: 1.0,
  fp16: 2.0,
  fp32: 4.0,
  int4: 0.55,
  int8: 1.0,
};

function normalizeBaseUrl(url) {
  return String(url || getOllamaConfig().url || '').replace(/\/+$/, '');
}

function createHeaders(apiKey) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function discoveryError(kind, detail = {}) {
  return { kind, ...detail };
}

function fetchFailure(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || 'Request failed');
  return discoveryError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', { message });
}

function unavailableResult(provider = 'unknown', error = null) {
  return {
    available: false,
    provider,
    models: [],
    modelDetails: [],
    vramAllocated: 0,
    runningStatusKnown: false,
    error,
  };
}

export function isCloudModel(modelName) {
  return /(?:^|[/:_.-])cloud(?:$|[/:_.-])/i.test(String(modelName || ''));
}

export function isLikelyEmbeddingModel(modelName) {
  return /(?:^|[/:_.-])(?:embed(?:ding)?|nomic-embed|mxbai-embed|all-minilm|bge(?:-m3)?|e5)(?:$|[/:_.-])/i.test(String(modelName || ''));
}

function isPrivateIPv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function getLocalAiExecutionLocation(url, modelName = '') {
  if (isCloudModel(modelName)) return 'cloud';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'local';
    if (host.endsWith('.local') || isPrivateIPv4(host) || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host.replace(/:/g, ''))) return 'lan';
    return 'remote';
  } catch {
    return 'unknown';
  }
}

export function isPIIEligibleModel(modelName) {
  return !!modelName && !isCloudModel(modelName) && !isLikelyEmbeddingModel(modelName);
}

export function filterPIIEligibleModels(models) {
  return (Array.isArray(models) ? models : []).filter(isPIIEligibleModel);
}

function parseNameMetadata(id) {
  const paramMatch = id.match(/[\-:](\d+\.?\d*)[bB]/);
  const quantMatch = id.match(/(Q\d+_K(?:_[A-Z]+)?|Q\d+|fp16|fp32|int[48])/i);
  const params = paramMatch ? parseFloat(paramMatch[1]) : 0;
  const quantKey = quantMatch ? quantMatch[1].toLowerCase().replace(/_.*/, '') : '';
  const bpw = QUANT_BPW[quantKey] || 0.55;
  return {
    params,
    quantLevel: quantMatch ? quantMatch[1] : '',
    estimatedSize: params > 0 ? Math.round(params * bpw * 1e9) : 0,
  };
}

function parseOpenAIModel(model, baseUrl) {
  const id = typeof model?.id === 'string' ? model.id : '';
  const parsed = parseNameMetadata(id);
  const reportedSize = Number(model?.size || model?.vram_required) || 0;
  return {
    name: id,
    type: model?.type || 'llm',
    size: reportedSize || parsed.estimatedSize,
    sizeSource: reportedSize ? 'reported' : parsed.estimatedSize ? 'estimated' : 'unknown',
    paramSize: model?.parameter_size || (parsed.params > 0 ? `${parsed.params}B` : ''),
    quantLevel: model?.quantization || parsed.quantLevel,
    family: model?.owned_by || '',
    format: model?.format || '',
    loaded: null,
    runningStatusKnown: false,
    contextLength: Number(model?.context_length) || 0,
    maxContextLength: Number(model?.max_context_length || model?.context_length) || 0,
    vramAllocated: Number(model?.size_vram) || 0,
    vision: null,
    reasoning: null,
    executionLocation: getLocalAiExecutionLocation(baseUrl, id),
    source: 'openai-compatible',
  };
}

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

async function fetchLMStudioModels(baseUrl, headers) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/models`, {
      headers,
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) return { models: [], available: false };
    const data = await response.json();
    return { models: Array.isArray(data.models) ? data.models : [], available: true };
  } catch {
    return { models: [], available: false };
  }
}

/**
 * Probe an OpenAI-compatible model endpoint and enrich LM Studio responses with
 * exact native model metadata when its v1 REST API is available.
 */
export async function checkOpenAICompatible(url, apiKey) {
  const baseUrl = normalizeBaseUrl(url);
  const headers = createHeaders(apiKey);
  const lmStudioModelsPromise = fetchLMStudioModels(baseUrl, headers);
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return unavailableResult('openai-compatible', discoveryError('http', { status: response.status, message: response.statusText }));
    }
    const data = await response.json();
    const raw = Array.isArray(data.data) ? data.data : [];
    const lmStudioResult = await lmStudioModelsPromise;
    const lmStudioIndex = indexLMStudioModels(lmStudioResult.models);
    const modelDetails = dedupeLMStudioAliases(raw
      .map(model => parseOpenAIModel(model, baseUrl))
      .filter(model => model.name && model.type !== 'embedding' && lmStudioIndex.get(model.name)?.type !== 'embedding' && !isLikelyEmbeddingModel(model.name))
      .map(model => enrichWithLMStudioModel(model, lmStudioIndex.get(model.name), baseUrl)));
    return {
      available: true,
      provider: lmStudioResult.available ? 'lmstudio' : 'openai-compatible',
      models: modelDetails.map(model => model.name),
      modelDetails,
      vramAllocated: modelDetails.reduce((total, model) => total + (Number(model.vramAllocated) || 0), 0),
      runningStatusKnown: lmStudioResult.available,
      error: null,
    };
  } catch (error) {
    return unavailableResult('openai-compatible', fetchFailure(error));
  }
}

function indexRunningOllamaModels(rawModels) {
  const index = new Map();
  for (const model of rawModels) {
    const name = model?.name || model?.model;
    if (name) index.set(name, model);
  }
  return index;
}

/**
 * Probe Ollama's installed and running model endpoints. `size_vram` is current
 * allocation, not server capacity, and is kept separate for advisor labelling.
 */
export async function checkOllama(url, apiKey) {
  const baseUrl = normalizeBaseUrl(url);
  const headers = createHeaders(apiKey);
  const request = path => fetch(`${baseUrl}${path}`, {
    headers,
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  const [tagsResult, runningResult] = await Promise.allSettled([
    request('/api/tags'),
    request('/api/ps'),
  ]);
  if (tagsResult.status !== 'fulfilled') return unavailableResult('ollama', fetchFailure(tagsResult.reason));
  if (!tagsResult.value.ok) {
    return unavailableResult('ollama', discoveryError('http', { status: tagsResult.value.status, message: tagsResult.value.statusText }));
  }
  try {
    const tagsData = await tagsResult.value.json();
    const raw = Array.isArray(tagsData.models) ? tagsData.models : [];
    let runningRaw = [];
    const runningStatusKnown = runningResult.status === 'fulfilled' && runningResult.value.ok;
    if (runningStatusKnown) {
      const runningData = await runningResult.value.json();
      runningRaw = Array.isArray(runningData.models) ? runningData.models : [];
    }
    const runningIndex = indexRunningOllamaModels(runningRaw);
    const modelDetails = raw.map(model => {
      const name = model?.name || model?.model;
      const running = runningIndex.get(name);
      return {
        name,
        type: isLikelyEmbeddingModel(name) ? 'embedding' : 'llm',
        size: Number(model?.size) || 0,
        sizeSource: Number(model?.size) > 0 ? 'ollama' : 'unknown',
        paramSize: model?.details?.parameter_size || '',
        quantLevel: model?.details?.quantization_level || '',
        family: model?.details?.family || '',
        format: model?.details?.format || '',
        loaded: runningStatusKnown ? !!running : null,
        runningStatusKnown,
        contextLength: Number(running?.context_length) || 0,
        maxContextLength: 0,
        vramAllocated: Number(running?.size_vram) || 0,
        vision: null,
        reasoning: null,
        executionLocation: getLocalAiExecutionLocation(baseUrl, name),
        source: 'ollama',
      };
    }).filter(model => model.name && model.type !== 'embedding');
    const vramAllocated = runningRaw.reduce((total, model) => total + (Number(model?.size_vram) || 0), 0);
    return {
      available: true,
      provider: 'ollama',
      models: modelDetails.map(model => model.name),
      modelDetails,
      vramAllocated,
      runningStatusKnown,
      error: null,
    };
  } catch (error) {
    return unavailableResult('ollama', discoveryError('parse', { message: String(error?.message || error) }));
  }
}

export async function discoverLocalAI(url, apiKey, options = {}) {
  const baseUrl = normalizeBaseUrl(url);
  const cacheKey = `${baseUrl}\n${String(apiKey || '')}`;
  const cached = discoveryCache.get(cacheKey);
  const maxAge = cached?.result?.available ? DISCOVERY_CACHE_MS : FAILED_DISCOVERY_CACHE_MS;
  if (!options.force && cached && Date.now() - cached.at < maxAge) return cached.result;
  const openai = await checkOpenAICompatible(baseUrl, apiKey);
  // LM Studio exposes authoritative native metadata at /api/v1/models. Once
  // that endpoint identifies the server, do not send it Ollama-only probes
  // such as /api/tags or /api/ps (LM Studio logs those as unexpected routes).
  const ollama = openai.provider === 'lmstudio'
    ? unavailableResult('ollama', discoveryError('not-probed', { message: 'LM Studio identified by native API' }))
    : await checkOllama(baseUrl, apiKey);
  const primary = ollama.available && ollama.models.length > 0
    ? ollama
    : openai.available ? openai : ollama.available ? ollama : openai;
  const result = {
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

export function getCachedLocalAiDiscovery(url, apiKey) {
  const baseUrl = normalizeBaseUrl(url);
  const key = apiKey === undefined
    ? latestDiscoveryKey.get(baseUrl)
    : `${baseUrl}\n${String(apiKey || '')}`;
  return key ? discoveryCache.get(key)?.result || null : null;
}

export function getCachedLocalAiModelDetail(url, modelName, apiKey) {
  const result = getCachedLocalAiDiscovery(url, apiKey);
  return result?.modelDetails?.find(model => model.name === modelName) || null;
}

export function markCachedLocalAiModelLoaded(url, modelName, apiKey, runtimePatch = {}) {
  const result = getCachedLocalAiDiscovery(url, apiKey);
  const detail = result?.modelDetails?.find(model => model.name === modelName);
  if (!result || !detail) return result || null;
  Object.assign(detail, runtimePatch, { loaded: true, runningStatusKnown: true });
  result.runningStatusKnown = true;
  if (result.openai?.modelDetails) {
    const openaiDetail = result.openai.modelDetails.find(model => model.name === modelName);
    if (openaiDetail) {
      Object.assign(openaiDetail, runtimePatch, { loaded: true, runningStatusKnown: true });
    }
  }
  if (result.ollama?.modelDetails) {
    const ollamaDetail = result.ollama.modelDetails.find(model => model.name === modelName);
    if (ollamaDetail) {
      Object.assign(ollamaDetail, runtimePatch, { loaded: true, runningStatusKnown: true });
    }
  }
  return result;
}

export function clearLocalAiDiscovery(url) {
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
