// @ts-check
// api-local.js - Ollama/LM Studio/Jan provider adapters.

import { createInitialResponseTimeout, FETCH_REQUEST_TIMEOUT_MS, readWithStallTimeout } from './api-transport.js';
import { getOllamaConfig, getOllamaMainModel } from './api-provider-storage.js';
import { callOpenAICompatibleAPI } from './api-openai-compatible.js';
import { discoverLocalAI, getCachedLocalAiModelDetail, markCachedLocalAiModelLoaded } from './local-ai-discovery.js';

function contentTokenEstimate(content) {
  if (typeof content === 'string') return content.length / 3.5;
  if (!Array.isArray(content)) return 0;
  return content.reduce((total, block) => {
    if (typeof block?.text === 'string') return total + block.text.length / 3.5;
    if (block?.type === 'image' || block?.type === 'image_url') return total + 1600;
    return total;
  }, 0);
}

export function estimateLocalAiPromptTokens({ system, messages }) {
  const contentTokens = String(system || '').length / 3.5
    + (Array.isArray(messages) ? messages.reduce((total, message) => total + contentTokenEstimate(message?.content), 0) : 0);
  const messageOverhead = (Array.isArray(messages) ? messages.length : 0) * 6 + (system ? 6 : 0);
  return Math.ceil(contentTokens) + messageOverhead;
}

export function planLocalAiRequest(opts, modelDetail) {
  const requestedMaxTokens = Math.max(1, Number(opts.maxTokens) || 4096);
  const estimatedPromptTokens = estimateLocalAiPromptTokens(opts);
  const contextLength = Number(modelDetail?.contextLength) || 0;
  let maxTokens = requestedMaxTokens;
  let availableOutputTokens = null;
  if (contextLength > 0) {
    const safetyTokens = Math.max(256, Math.ceil(contextLength * 0.04));
    availableOutputTokens = contextLength - estimatedPromptTokens - safetyTokens;
    const minimumOutputTokens = Math.max(64, Math.min(requestedMaxTokens, Number(opts.minOutputTokens) || 256));
    if (availableOutputTokens < minimumOutputTokens) {
      const maxContext = Number(modelDetail?.maxContextLength) || 0;
      const maxHint = maxContext > contextLength ? ` This model supports up to ${maxContext.toLocaleString()} tokens.` : '';
      throw new Error(`Local AI context is too small for this request: about ${estimatedPromptTokens.toLocaleString()} prompt tokens plus output, but ${modelDetail?.name || 'the model'} is loaded with ${contextLength.toLocaleString()}.${maxHint} Reload it with a larger context or use a smaller/chunked input.`);
    }
    maxTokens = Math.min(requestedMaxTokens, availableOutputTokens);
  }
  return {
    maxTokens,
    diagnostics: {
      estimatedPromptTokens,
      requestedMaxTokens,
      plannedMaxTokens: maxTokens,
      contextLength,
      maxContextLength: Number(modelDetail?.maxContextLength) || 0,
      quantLevel: modelDetail?.quantLevel || '',
      modelSize: Number(modelDetail?.size) || 0,
      vramAllocated: Number(modelDetail?.vramAllocated) || 0,
      executionLocation: modelDetail?.executionLocation || 'unknown',
    },
  };
}

function publishLoadedModel(config, model, runtimePatch = {}) {
  const result = markCachedLocalAiModelLoaded(config.url, model, config.apiKey, runtimePatch);
  if (result && typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    globalThis.dispatchEvent(new CustomEvent('local-ai-discovery-updated', { detail: result }));
  }
}

function roundContextLength(required, maximum) {
  const steps = [4096, 8192, 16384, 32768, 65536, 131072, 262144];
  const target = steps.find(step => step >= required) || required;
  return maximum > 0 ? Math.min(target, maximum) : target;
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

async function callLMStudioNativeAPI(config, model, opts, plan, contextLength) {
  const input = nativeLMStudioInput(opts.messages);
  if (!input) throw new Error('LM Studio context override is unavailable for requests containing assistant history. Reload the model with a larger context in LM Studio.');
  const requestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({
      model,
      input: input.length === 1 && input[0].type === 'message' ? input[0].content : input,
      system_prompt: opts.system || undefined,
      temperature: opts.jsonMode || opts.temperature === 0 ? 0 : undefined,
      max_output_tokens: plan.maxTokens,
      reasoning: opts.jsonMode || opts.reasoningEffort === 'none' ? 'off' : undefined,
      context_length: contextLength,
      stream: false,
      store: false,
    }),
    signal: opts.signal,
  };
  const timeoutState = createInitialResponseTimeout(requestInit, opts.requestTimeoutMs || FETCH_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${config.url.replace(/\/+$/, '')}/api/v1/chat`, timeoutState.fetchOptions);
  } finally {
    timeoutState.clearRequestTimeout();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(`LM Studio native API error (${response.status}): ${body?.error?.message || body?.error || response.statusText}`);
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

export async function callOllamaChat({ system, messages, maxTokens, onStream, signal }) {
  const config = getOllamaConfig();
  const model = getOllamaMainModel();
  const ollamaMessages = [];
  if (system) ollamaMessages.push({ role: 'system', content: system });
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      let text = '';
      const images = [];
      for (const block of msg.content) {
        if (block.type === 'text') text += block.text;
        else if (block.type === 'image' && block.source?.data) images.push(block.source.data);
        else if (block.type === 'image_url' && block.image_url?.url) {
          const match = block.image_url.url.match(/^data:[^;]+;base64,(.+)$/);
          if (match) images.push(match[1]);
        }
      }
      const ollamaMsg = { role: msg.role, content: text };
      if (images.length > 0) ollamaMsg.images = images;
      ollamaMessages.push(ollamaMsg);
    } else {
      ollamaMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const body = { model, messages: ollamaMessages, stream: !!onStream };
  if (maxTokens) body.options = { num_predict: maxTokens };

  let res;
  try {
    res = await fetch(`${config.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal
    });
  } catch (e) {
    if (e instanceof TypeError || /Failed to fetch|Load failed|NetworkError/.test(e.message || '')) {
      const ua = navigator.userAgent || '';
      const origin = typeof location !== 'undefined' ? location.origin : 'the getbased origin';
      const hint = /Mac/i.test(ua) ? `Ollama: set OLLAMA_ORIGINS to ${origin} and restart. LM Studio: enable CORS and API authentication`
        : /Win/i.test(ua) ? `Ollama: set OLLAMA_ORIGINS=${origin} and restart. LM Studio: enable CORS and API authentication`
        : `Ollama: OLLAMA_ORIGINS=${origin} ollama serve. LM Studio: enable CORS and API authentication`;
      throw new Error(`Cannot reach local server - CORS blocked. ${hint}`);
    }
    throw new Error(`Cannot reach local server. Check that it's running. (${e.message})`);
  }

  if (!res.ok) {
    let errMsg = `Local server error (${res.status})`;
    try { const errBody = await res.json(); errMsg += `: ${errBody.error || JSON.stringify(errBody)}`; } catch {}
    throw new Error(errMsg);
  }

  if (onStream) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const handleNdjsonLine = (line, boundary) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.error) throw new Error(event.error);
        if (event.message?.content) {
          fullText += event.message.content;
          onStream(fullText);
        }
        if (event.done === true) {
          inputTokens = event.prompt_eval_count || 0;
          outputTokens = event.eval_count || 0;
        }
      } catch (parseErr) {
        if (boundary && parseErr instanceof SyntaxError) return;
        throw parseErr;
      }
    };
    while (true) {
      const { done, value } = await readWithStallTimeout(reader, 'Local AI stream');
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) handleNdjsonLine(line, true);
    }
    if (buffer.trim()) handleNdjsonLine(buffer, false);
    return { text: fullText, usage: { inputTokens, outputTokens } };
  }

  const data = await res.json();
  return {
    text: data.message?.content || '',
    usage: { inputTokens: data.prompt_eval_count || 0, outputTokens: data.eval_count || 0 }
  };
}

export async function callOpenAICompatibleLocalAPI(opts) {
  const config = getOllamaConfig();
  const model = getOllamaMainModel();
  const url = config.url.replace(/\/+$/, '');
  let modelDetail = getCachedLocalAiModelDetail(url, model, config.apiKey);
  // Routine chat should not pay for four capability probes before its first
  // token. Imports opt in because they need exact LM Studio context metadata;
  // Settings and the hardware advisor also refresh discovery explicitly.
  if (!modelDetail && opts.preferNativeContext) {
    const discovery = await discoverLocalAI(url, config.apiKey);
    modelDetail = discovery.modelDetails?.find(detail => detail.name === model) || null;
  }
  const estimatedPromptTokens = estimateLocalAiPromptTokens(opts);
  const currentContext = Number(modelDetail?.contextLength) || 0;
  const maxContext = Number(modelDetail?.maxContextLength) || 0;
  const requestedOutput = Math.max(1, Number(opts.maxTokens) || 4096);
  const requiredContext = estimatedPromptTokens + requestedOutput + Math.max(512, Math.ceil((estimatedPromptTokens + requestedOutput) * 0.04));
  const useNativeContextOverride = !!opts.preferNativeContext
    && modelDetail?.source === 'lmstudio'
    && currentContext > 0
    && requiredContext > currentContext
    && maxContext >= requiredContext;
  const overrideContext = useNativeContextOverride ? roundContextLength(requiredContext, maxContext) : currentContext;
  const plan = planLocalAiRequest(opts, useNativeContextOverride ? { ...modelDetail, contextLength: overrideContext } : modelDetail);
  if (useNativeContextOverride) {
    const nativeResult = await callLMStudioNativeAPI(config, model, opts, plan, overrideContext);
    publishLoadedModel(config, model, { contextLength: overrideContext });
    return {
      ...nativeResult,
      diagnostics: { ...nativeResult.diagnostics, localPlan: plan.diagnostics },
    };
  }
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
    { useProxy: false, extraBody },
  );
  publishLoadedModel(config, model);
  return {
    ...result,
    diagnostics: { ...result?.diagnostics, localPlan: plan.diagnostics },
  };
}
