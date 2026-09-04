// @ts-check
// Ollama native discovery, lifecycle, context management, and inference adapter.

import { getErrorMessage } from './caught-error.js';
import { createInitialResponseTimeout, FETCH_REQUEST_TIMEOUT_MS, LOCAL_AI_FIRST_TOKEN_STALL_MS, readWithStallTimeout } from './api-transport.js';
import {
  createLocalAiHeaders,
  getLocalAiExecutionLocation,
  isLikelyEmbeddingModel,
  localAiDiscoveryError,
  localAiFetchFailure,
  localAiResult,
  LOCAL_AI_DISCOVERY_TIMEOUT_MS,
  ollamaPerformanceDiagnostics,
  redactApiSecretText,
  unavailableLocalAiResult,
} from './local-ai-provider-shared.js';

export const ollamaProviderAdapter = Object.freeze({
  id: 'ollama',
  label: 'Ollama',
  capabilities: Object.freeze({
    nativeModelDiscovery: true,
    loadedModelState: true,
    contextOverride: true,
    nativeStreaming: true,
    structuredOutput: true,
    reasoningControl: 'native',
    performanceStats: 'native',
    modelUnload: true,
  }),
  discover: discoverOllamaProvider,
  prepareNativeRequest: prepareOllamaNativeRequest,
  infer: inferWithOllamaNativeProvider,
  unload: unloadOllamaModel,
});

function indexRunningOllamaModels(rawModels) {
  const index = new Map();
  for (const model of rawModels) {
    const name = model?.name || model?.model;
    if (name) index.set(name, model);
  }
  return index;
}

export async function discoverOllamaProvider({
  baseUrl,
  apiKey = '',
  timeoutMs = LOCAL_AI_DISCOVERY_TIMEOUT_MS,
}) {
  const headers = createLocalAiHeaders(apiKey);
  const request = path => fetch(`${baseUrl}${path}`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const [tagsResult, runningResult] = await Promise.allSettled([
    request('/api/tags'),
    request('/api/ps'),
  ]);
  if (tagsResult.status !== 'fulfilled') {
    return unavailableLocalAiResult('ollama', localAiFetchFailure(tagsResult.reason));
  }
  if (!tagsResult.value.ok) {
    return unavailableLocalAiResult('ollama', localAiDiscoveryError('http', {
      status: tagsResult.value.status,
      message: tagsResult.value.statusText,
    }));
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
      const capabilities = Array.isArray(model?.capabilities) ? model.capabilities : [];
      const supportsThinking = capabilities.includes('thinking');
      const gptOss = /(?:^|[/_.:-])gpt[-_.]?oss(?:$|[/_.:-])/i.test(String(name || ''));
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
        maxContextLength: Number(model?.details?.context_length || model?.context_length) || 0,
        vramAllocated: Number(running?.size_vram) || 0,
        vision: capabilities.includes('vision') ? true : null,
        reasoning: supportsThinking ? {
          allowedOptions: gptOss ? ['low', 'medium', 'high'] : ['off', 'on'],
          default: gptOss ? 'medium' : 'on',
        } : null,
        executionLocation: getLocalAiExecutionLocation(baseUrl, name),
        source: 'ollama',
      };
    }).filter(model => model.name && model.type !== 'embedding');
    return localAiResult('ollama', modelDetails, { runningStatusKnown });
  } catch (error) {
    return unavailableLocalAiResult('ollama', localAiDiscoveryError('parse', {
      message: String(getErrorMessage(error, error)),
    }));
  }
}

export function prepareOllamaNativeRequest({ opts, modelDetail, requiredContext, roundContextLength }) {
  if (!opts.preferNativeContext || modelDetail?.source !== 'ollama') return null;
  const currentContext = Number(modelDetail.contextLength) || 0;
  const maxContext = Number(modelDetail.maxContextLength) || 0;
  if (maxContext > 0 && requiredContext > maxContext) {
    throw new Error(`Local AI context is too small for this request: about ${requiredContext.toLocaleString()} tokens are required, but ${modelDetail.name || 'the model'} supports up to ${maxContext.toLocaleString()}. Use a smaller or chunked input.`);
  }
  const contextLength = currentContext > 0 && currentContext >= requiredContext
    ? currentContext
    : roundContextLength(requiredContext, maxContext);
  return {
    contextLength,
    nativeContextOverride: currentContext !== contextLength,
    modelDetail: { ...modelDetail, contextLength },
  };
}

function normalizeOllamaMessages(system, messages) {
  const output = [];
  if (system) output.push({ role: 'system', content: system });
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!Array.isArray(message?.content)) {
      output.push({ role: message?.role, content: message?.content });
      continue;
    }
    let text = '';
    const images = [];
    for (const block of message.content) {
      if (block?.type === 'text') text += block.text || '';
      else if (block?.type === 'image' && block.source?.data) images.push(block.source.data);
      else if (block?.type === 'image_url' && block.image_url?.url) {
        const match = block.image_url.url.match(/^data:[^;]+;base64,(.+)$/);
        if (match) images.push(match[1]);
      }
    }
    const ollamaMessage = { role: message.role, content: text };
    if (images.length > 0) ollamaMessage.images = images;
    output.push(ollamaMessage);
  }
  return output;
}

function localAiCorsError(error) {
  if (!(error instanceof TypeError) && !/Failed to fetch|Load failed|NetworkError/.test(error?.message || '')) return null;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const origin = typeof location !== 'undefined' ? location.origin : 'the getbased origin';
  const hint = /Mac/i.test(ua) ? `Set OLLAMA_ORIGINS to ${origin} and restart Ollama.`
    : /Win/i.test(ua) ? `Set OLLAMA_ORIGINS=${origin} and restart Ollama.`
    : `Start Ollama with OLLAMA_ORIGINS=${origin}.`;
  return new Error(`Cannot reach Ollama - CORS may be blocking the request. ${hint}`);
}

function isTokenLimitFinish(reason) {
  return /^(?:length|max_tokens|token_limit)$/i.test(String(reason || ''));
}

function normalizedOllamaResult(text, event, diagnostics = {}) {
  const finishReason = event?.done_reason || null;
  return {
    text,
    usage: {
      inputTokens: Number(event?.prompt_eval_count) || 0,
      outputTokens: Number(event?.eval_count) || 0,
    },
    finishReason,
    truncated: isTokenLimitFinish(finishReason),
    diagnostics: {
      providerApi: 'native',
      ...diagnostics,
      performance: ollamaPerformanceDiagnostics(event),
    },
  };
}

function ollamaStructuredOutputRejected(response, errorText) {
  return (response.status === 400 || response.status === 422)
    && /format|schema|structured output/i.test(errorText);
}

function ollamaReasoningControlRejected(response, errorText) {
  return (response.status === 400 || response.status === 422)
    && /think|reasoning/i.test(errorText);
}

async function requestOllamaChat(config, opts, body) {
  const requestInit = {
    method: 'POST',
    headers: createLocalAiHeaders(config.apiKey, { json: true }),
    body: JSON.stringify(body),
    signal: opts.signal,
  };
  const timeoutState = createInitialResponseTimeout(requestInit, opts.requestTimeoutMs || FETCH_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${String(config.url || '').replace(/\/+$/, '')}/api/chat`, timeoutState.fetchOptions);
  } catch (error) {
    const corsError = localAiCorsError(error);
    if (corsError) throw corsError;
    throw new Error(`Cannot reach Ollama. Check that it is running. (${redactApiSecretText(getErrorMessage(error, error), [config.apiKey])})`);
  } finally {
    timeoutState.clearRequestTimeout();
  }
}

export async function inferWithOllamaNativeProvider({ config, model, opts, plan, contextLength = 0, nativeContextOverride = false }) {
  const options = {};
  if (plan?.maxTokens) options.num_predict = plan.maxTokens;
  if (contextLength > 0) options.num_ctx = contextLength;
  if (opts.jsonMode || opts.temperature === 0) options.temperature = 0;
  /** @type {Record<string, any>} */
  const body = {
    model,
    messages: normalizeOllamaMessages(opts.system, opts.messages),
    stream: !!opts.onStream,
    ...(Object.keys(options).length ? { options } : {}),
  };
  if (opts.jsonMode) body.format = opts.jsonSchema || 'json';
  if (opts.jsonMode || ['none', 'off'].includes(opts.reasoningEffort)) body.think = false;
  else if (['low', 'medium', 'high'].includes(opts.reasoningEffort)) body.think = opts.reasoningEffort;
  else if (opts.reasoningEffort === 'on') body.think = true;
  /** @type {Response | null} */
  let response = null;
  let structuredOutputFallback = false;
  let reasoningControlFallback = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await requestOllamaChat(config, opts, body);
    if (response.ok) break;
    const errorText = await response.clone().text();
    if (body.format && typeof body.format === 'object' && ollamaStructuredOutputRejected(response, errorText)) {
      body.format = 'json';
      structuredOutputFallback = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'think') && ollamaReasoningControlRejected(response, errorText)) {
      delete body.think;
      reasoningControlFallback = true;
      continue;
    }
    break;
  }
  if (!response) throw new Error('Ollama request ended without a response.');
  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json();
      detail = errorBody.error || JSON.stringify(errorBody);
    } catch {}
    throw new Error(`Ollama API error (${response.status})${detail ? `: ${redactApiSecretText(detail, [config.apiKey])}` : ''}`);
  }

  const requestDiagnostics = {
    nativeContextOverride,
    contextLength,
    structuredOutputFallback,
    reasoningControlFallback,
  };
  if (!opts.onStream) {
    const data = await response.json();
    const text = String(data.message?.content || '').trim();
    if (!text) throw new Error('Ollama returned no final response content.');
    return normalizedOllamaResult(text, data, requestDiagnostics);
  }

  if (!response.body) throw new Error('Ollama returned a streaming response without a readable body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finalEvent = null;
  let receivedFirstToken = false;
  const handleNdjsonLine = (line, boundary) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      if (event.error) throw new Error(redactApiSecretText(event.error, [config.apiKey]));
      if (event.message?.content) {
        receivedFirstToken = true;
        fullText += event.message.content;
        opts.onStream(fullText);
      }
      if (event.done === true) finalEvent = event;
    } catch (parseError) {
      if (boundary && parseError instanceof SyntaxError) return;
      throw parseError;
    }
  };
  const maxBuffer = 4 * 1024 * 1024;
  while (true) {
    // Metadata-only events can precede the first generated token, so retain
    // the prefill allowance until response content actually arrives.
    const { done, value } = await readWithStallTimeout(reader, 'Ollama stream',
      receivedFirstToken ? undefined : LOCAL_AI_FIRST_TOKEN_STALL_MS);
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > maxBuffer) {
      try { reader.cancel(); } catch {}
      throw new Error(`Ollama stream exceeded ${maxBuffer} bytes without a newline - aborting.`);
    }
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handleNdjsonLine(line, true);
  }
  if (buffer.trim()) handleNdjsonLine(buffer, false);
  if (!fullText.trim()) throw new Error('Ollama stream ended without response content.');
  return normalizedOllamaResult(fullText, finalEvent, requestDiagnostics);
}

export async function unloadOllamaModel({ baseUrl, apiKey = '', model, timeoutMs = 5000 }) {
  if (!model) return false;
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: createLocalAiHeaders(apiKey, { json: true }),
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return response.ok;
}
