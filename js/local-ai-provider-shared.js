// @ts-check
// Shared normalization helpers for Local AI provider adapters.

export const LOCAL_AI_DISCOVERY_TIMEOUT_MS = 3000;

export function normalizeLocalAiBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

export function createLocalAiHeaders(apiKey, { json = false } = {}) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

export function redactApiSecretText(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets) {
    const candidate = String(secret || '');
    if (candidate.length >= 6) text = text.split(candidate).join('[redacted]');
  }
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9._~+/=-]{6,}/g, '[redacted]')
    .replace(/\bcashu[A-Za-z0-9._~+/=-]{8,}/gi, '[redacted]');
}

/**
 * @param {string} kind
 * @param {Record<string, any>} [detail]
 */
export function localAiDiscoveryError(kind, detail = {}) {
  return { kind, ...detail };
}

export function localAiFetchFailure(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || 'Request failed');
  return localAiDiscoveryError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', { message });
}

/**
 * @param {string} [provider]
 * @param {Record<string, any> | null} [error]
 */
export function unavailableLocalAiResult(provider = 'unknown', error = null) {
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

export function localAiResult(provider, modelDetails, { runningStatusKnown = false } = {}) {
  const details = (Array.isArray(modelDetails) ? modelDetails : []).filter(model => model?.name);
  return {
    available: true,
    provider,
    models: details.map(model => model.name),
    modelDetails: details,
    vramAllocated: details.reduce((total, model) => total + (Number(model.vramAllocated) || 0), 0),
    runningStatusKnown,
    error: null,
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

export function isLocalAiLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function isLocalAiLoopbackUrl(url) {
  try {
    return isLocalAiLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function getLocalAiExecutionLocation(url, modelName = '') {
  if (isCloudModel(modelName)) return 'cloud';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (isLocalAiLoopbackHost(host)) return 'local';
    if (host.endsWith('.local') || isPrivateIPv4(host) || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host.replace(/:/g, ''))) return 'lan';
    return 'remote';
  } catch {
    return 'unknown';
  }
}

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

export function parseOpenAICompatibleModel(model, baseUrl) {
  const id = typeof model?.id === 'string' ? model.id : '';
  const parsed = parseNameMetadata(id);
  const reportedSize = Number(model?.size || model?.vram_required) || 0;
  const capabilityList = Array.isArray(model?.capabilities) ? model.capabilities.map(value => String(value).toLowerCase()) : [];
  const inputModalities = Array.isArray(model?.input_modalities)
    ? model.input_modalities.map(value => String(value).toLowerCase())
    : Array.isArray(model?.modalities) ? model.modalities.map(value => String(value).toLowerCase()) : [];
  const explicitVision = typeof model?.capabilities?.vision === 'boolean'
    ? model.capabilities.vision
    : typeof model?.vision === 'boolean' ? model.vision
      : String(model?.type || '').toLowerCase() === 'vlm' || capabilityList.includes('vision') || inputModalities.includes('image')
        ? true
        : inputModalities.length > 0 ? false : null;
  const loaded = typeof model?.loaded === 'boolean' ? model.loaded : null;
  const reportedQuantization = typeof model?.quantization === 'string'
    ? model.quantization
    : typeof model?.quantization?.name === 'string' ? model.quantization.name
      : typeof model?.quant === 'string' ? model.quant : '';
  return {
    name: id,
    type: model?.type || 'llm',
    size: reportedSize || parsed.estimatedSize,
    sizeSource: reportedSize ? 'reported' : parsed.estimatedSize ? 'estimated' : 'unknown',
    paramSize: model?.parameter_size || (parsed.params > 0 ? `${parsed.params}B` : ''),
    quantLevel: reportedQuantization || parsed.quantLevel,
    family: model?.owned_by || '',
    format: model?.format || '',
    loaded,
    runningStatusKnown: loaded !== null,
    contextLength: Number(model?.context_length) || 0,
    maxContextLength: Number(model?.max_context_length || model?.context_length) || 0,
    vramAllocated: Number(model?.size_vram) || 0,
    vision: explicitVision,
    reasoning: null,
    executionLocation: getLocalAiExecutionLocation(baseUrl, id),
    source: 'openai-compatible',
  };
}

export function ollamaPerformanceDiagnostics(event) {
  const outputTokens = Number(event?.eval_count) || 0;
  const evalDurationNs = Number(event?.eval_duration) || 0;
  const loadDurationNs = Number(event?.load_duration) || 0;
  const promptDurationNs = Number(event?.prompt_eval_duration) || 0;
  return {
    tokensPerSecond: outputTokens > 0 && evalDurationNs > 0
      ? outputTokens / (evalDurationNs / 1e9)
      : 0,
    timeToFirstTokenMs: loadDurationNs > 0 || promptDurationNs > 0
      ? Math.round((loadDurationNs + promptDurationNs) / 1e6)
      : 0,
    modelLoadMs: loadDurationNs > 0 ? Math.round(loadDurationNs / 1e6) : 0,
    reasoningTokens: Number(event?.thinking_count) || 0,
  };
}
