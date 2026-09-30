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

import type { LocalAiModel } from './local-ai-provider-shared.js';

interface LocalAiDiscoveryOptions { baseUrl: string; apiKey?: string; timeoutMs?: number }
interface OllamaModelView {
  name?: unknown; model?: unknown; capabilities?: unknown; size?: unknown; context_length?: unknown; size_vram?: unknown;
  details?: { parameter_size?: unknown; quantization_level?: unknown; family?: unknown; format?: unknown; context_length?: unknown } | null;
}
interface OllamaEventView {
  done_reason?: unknown; done?: unknown; error?: unknown; message?: { content?: unknown } | null;
  prompt_eval_count?: unknown; eval_count?: unknown; eval_duration?: unknown; load_duration?: unknown;
  prompt_eval_duration?: unknown; thinking_count?: unknown;
}
interface LocalAiMessage { role?: unknown; content?: unknown }
interface LocalAiMessageBlock {
  type?: unknown; text?: unknown; source?: { data?: unknown } | null; image_url?: { url?: string } | null;
}
export interface OllamaInferenceOptions {
  preferNativeContext?: boolean;
  jsonMode?: boolean;
  jsonSchema?: unknown;
  temperature?: number;
  reasoningEffort?: string;
  system?: unknown;
  messages: LocalAiMessage[];
  onStream?: (text: string) => unknown;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
}
interface OllamaInferenceContext {
  config: { url: string; apiKey?: string };
  model: string;
  opts: OllamaInferenceOptions;
  plan?: { maxTokens?: number } | null;
  contextLength?: number;
  nativeContextOverride?: boolean;
}
interface OllamaContextOptions {
  opts: OllamaInferenceOptions;
  modelDetail: LocalAiModel | null | undefined;
  requiredContext: number;
  roundContextLength(required: number, maximum: number): number;
}

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

function indexRunningOllamaModels(rawModels: (OllamaModelView | null | undefined)[]) {
  const index = new Map<unknown, OllamaModelView>();
  for (const model of rawModels) {
    const name = model?.name || model?.model;
    if (name) index.set(name, model!);
  }
  return index;
}

export async function discoverOllamaProvider({
  baseUrl,
  apiKey = '',
  timeoutMs = LOCAL_AI_DISCOVERY_TIMEOUT_MS,
}: LocalAiDiscoveryOptions) {
  const headers = createLocalAiHeaders(apiKey);
  const request = (path: string) => fetch(`${baseUrl}${path}`, {
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
    const tagsData = await tagsResult.value.json() as { models?: unknown };
    const raw = Array.isArray(tagsData.models) ? tagsData.models as (OllamaModelView | null | undefined)[] : [];
    let runningRaw: (OllamaModelView | null | undefined)[] = [];
    const runningStatusKnown = runningResult.status === 'fulfilled' && runningResult.value.ok;
    if (runningStatusKnown) {
      const runningData = await runningResult.value.json() as { models?: unknown };
      runningRaw = Array.isArray(runningData.models) ? runningData.models as (OllamaModelView | null | undefined)[] : [];
    }
    const runningIndex = indexRunningOllamaModels(runningRaw);
    const modelDetails = raw.map(model => {
      const name = model?.name || model?.model;
      const running = runningIndex.get(name);
      const capabilities = Array.isArray(model?.capabilities) ? model.capabilities as unknown[] : [];
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

export function prepareOllamaNativeRequest({ opts, modelDetail, requiredContext, roundContextLength }: OllamaContextOptions) {
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

function normalizeOllamaMessages(system: unknown, messages: LocalAiMessage[]) {
  const output: { role?: unknown; content: unknown; images?: unknown[] }[] = [];
  if (system) output.push({ role: 'system', content: system });
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!Array.isArray(message?.content)) {
      output.push({ role: message?.role, content: message?.content });
      continue;
    }
    let text = '';
    const images: unknown[] = [];
    for (const block of message.content as (LocalAiMessageBlock | null | undefined)[]) {
      if (block?.type === 'text') text += block.text || '';
      else if (block?.type === 'image' && block.source?.data) images.push(block.source.data);
      else if (block?.type === 'image_url' && block.image_url?.url) {
        const match = block.image_url.url.match(/^data:[^;]+;base64,(.+)$/);
        if (match) images.push(match[1]);
      }
    }
    const ollamaMessage: { role?: unknown; content: string; images?: unknown[] } = { role: message.role, content: text };
    if (images.length > 0) ollamaMessage.images = images;
    output.push(ollamaMessage);
  }
  return output;
}

function localAiCorsError(error: unknown) {
  if (!(error instanceof TypeError) && !/Failed to fetch|Load failed|NetworkError/.test(((error as { message?: unknown } | null | undefined)?.message || '') as string)) return null;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const origin = typeof location !== 'undefined' ? location.origin : 'the getbased origin';
  const hint = /Mac/i.test(ua) ? `Set OLLAMA_ORIGINS to ${origin} and restart Ollama.`
    : /Win/i.test(ua) ? `Set OLLAMA_ORIGINS=${origin} and restart Ollama.`
    : `Start Ollama with OLLAMA_ORIGINS=${origin}.`;
  return new Error(`Cannot reach Ollama - CORS may be blocking the request. ${hint}`);
}

function isTokenLimitFinish(reason: unknown) {
  return /^(?:length|max_tokens|token_limit)$/i.test(String(reason || ''));
}

function normalizedOllamaResult(text: string, event: OllamaEventView | null | undefined, diagnostics: Record<string, unknown> = {}) {
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

function ollamaStructuredOutputRejected(response: Response, errorText: string) {
  return (response.status === 400 || response.status === 422)
    && /format|schema|structured output/i.test(errorText);
}

function ollamaReasoningControlRejected(response: Response, errorText: string) {
  return (response.status === 400 || response.status === 422)
    && /think|reasoning/i.test(errorText);
}

async function requestOllamaChat(config: OllamaInferenceContext['config'], opts: OllamaInferenceOptions, body: Record<string, unknown>) {
  const requestInit = {
    method: 'POST',
    headers: createLocalAiHeaders(config.apiKey, { json: true }),
    body: JSON.stringify(body),
    signal: opts.signal,
  } as RequestInit;
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

export async function inferWithOllamaNativeProvider({ config, model, opts, plan, contextLength = 0, nativeContextOverride = false }: OllamaInferenceContext) {
  const options: Record<string, number> = {};
  if (plan?.maxTokens) options.num_predict = plan.maxTokens;
  if (contextLength > 0) options.num_ctx = contextLength;
  if (opts.jsonMode || opts.temperature === 0) options.temperature = 0;
  const body: Record<string, unknown> = {
    model,
    messages: normalizeOllamaMessages(opts.system, opts.messages),
    stream: !!opts.onStream,
    ...(Object.keys(options).length ? { options } : {}),
  };
  if (opts.jsonMode) body.format = opts.jsonSchema || 'json';
  if (opts.jsonMode || ['none', 'off'].includes(opts.reasoningEffort!)) body.think = false;
  else if (['low', 'medium', 'high'].includes(opts.reasoningEffort!)) body.think = opts.reasoningEffort;
  else if (opts.reasoningEffort === 'on') body.think = true;
  let response: Response | null = null;
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
    let detail: unknown = '';
    try {
      const errorBody = await response.json() as { error?: unknown };
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
    const data = await response.json() as OllamaEventView;
    const text = String(data.message?.content || '').trim();
    if (!text) throw new Error('Ollama returned no final response content.');
    return normalizedOllamaResult(text, data, requestDiagnostics);
  }

  if (!response.body) throw new Error('Ollama returned a streaming response without a readable body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finalEvent: OllamaEventView | null = null;
  let receivedFirstToken = false;
  const handleNdjsonLine = (line: string, boundary: boolean) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as OllamaEventView;
      if (event.error) throw new Error(redactApiSecretText(event.error, [config.apiKey]));
      if (event.message?.content) {
        receivedFirstToken = true;
        fullText += event.message.content;
        opts.onStream!(fullText);
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

export async function unloadOllamaModel({ baseUrl, apiKey = '', model, timeoutMs = 5000 }: LocalAiDiscoveryOptions & { model: string }) {
  if (!model) return false;
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: createLocalAiHeaders(apiKey, { json: true }),
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return response.ok;
}
