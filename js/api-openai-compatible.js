// @ts-check
// api-openai-compatible.js - shared OpenAI-compatible provider transport.

import { getErrorMessage, getErrorName } from './caught-error.js';
import { isDebugMode } from './utils.js';
import {
  FETCH_REQUEST_TIMEOUT_MS,
  createInitialResponseTimeout,
  createProxyFetch,
  fetchWithRetry,
  readWithStallTimeout,
} from './api-transport.js';
import { needsMaxCompletionTokens } from './api-models.js';
import { getAIProvider, getCustomApiUrl } from './api-provider-storage.js';
import { showOpenRouterInsufficientBalanceDialogRuntime } from './api-runtime.js';
import { redactApiSecretText } from './local-ai-provider-shared.js';

export { redactApiSecretText };

export function isTokenLimitFinish(reason) {
  const r = String(reason || '').toLowerCase();
  return r === 'length'
    || r === 'max_tokens'
    || r === 'max_completion_tokens'
    || r.includes('token_limit')
    || r.includes('max token');
}

export function shouldProxyCustomApiUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return !['localhost', '127.0.0.1'].includes(u.hostname) && !u.hostname.startsWith('192.168.');
  } catch {
    return false;
  }
}

// Legacy proxy-selection predicate retained for callers of the shared
// transport. The current Custom API adapter passes `useProxy: false` and calls
// its configured endpoint directly; known providers also use their reviewed
// browser-direct paths.
export function useCustomApiProxy() {
  return getAIProvider() === 'custom' && shouldProxyCustomApiUrl(getCustomApiUrl());
}

const proxyFetch = createProxyFetch(useCustomApiProxy);

/**
 * @typedef {{
 *   useProxy?: boolean,
 *   extraBody?: Record<string, any>,
 *   fetchImpl?: typeof fetch | null,
 *   firstReadStallMs?: number,
 * }} OpenAICompatibleTransportOptions
 */

export async function fetchWithApiRetry(url, options, retries = 2, useProxy = true, requestTimeoutMs = FETCH_REQUEST_TIMEOUT_MS) {
  return fetchWithRetry(url, options, {
    retries,
    useProxy,
    requestTimeoutMs,
    proxyFetch,
    directFetch: fetch,
    debug: isDebugMode,
  });
}

async function fetchWithOptionalTimeout(fetchImpl, endpoint, requestInit, requestTimeoutMs) {
  const timeoutMs = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : FETCH_REQUEST_TIMEOUT_MS;
  const requestState = createInitialResponseTimeout(requestInit, timeoutMs);
  try {
    return await fetchImpl(endpoint, requestState.fetchOptions);
  } catch (e) {
    const callerAborted = requestInit.signal?.aborted;
    const isTimeout = getErrorName(e) === 'TimeoutError' || (getErrorName(e) === 'AbortError' && !callerAborted);
    if (isTimeout) throw new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s - check your network`);
    throw e;
  } finally {
    // Private TEE fetch wrappers return a streaming decrypted Response. The
    // initial-response timeout must stop once those headers arrive or it will
    // abort a legitimate long PPQ/Routstr response body later.
    requestState.clearRequestTimeout();
  }
}

function jsonResponseFormat(schema) {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'structured_response',
      strict: true,
      schema: schema || { type: 'object' },
    },
  };
}

function structuredOutputRejected(res, errorText) {
  return (res.status === 400 || res.status === 422)
    && /response[_ ]format|json[_ ]schema|structured output|output_config(?:\.format)?\.schema|schema[^\n]{0,120}(?:not supported|unsupported|invalid)|for ['"]?anyof|any[_ ]?of[^\n]{0,160}(?:alongside|only field)|(?:alongside|only field)[^\n]{0,160}any[_ ]?of/i.test(errorText);
}

function reasoningControlRejected(res, errorText) {
  return (res.status === 400 || res.status === 422)
    && /reasoning[_ .-]?(?:effort|control)|invalid.*reasoning|reasoning[^\n]{0,120}(?:mandatory|required|cannot be disabled|can't be disabled|must (?:be|remain) enabled)/i.test(errorText);
}

function temperatureControlRejected(res, errorText) {
  return (res.status === 400 || res.status === 422)
    && /temperature[^\n]{0,120}(?:not supported|unsupported|not permitted|not allowed|invalid|fixed)|(?:not supported|unsupported|invalid)[^\n]{0,120}temperature/i.test(errorText);
}

export async function callOpenAICompatibleAPI(endpoint, key, model, providerName, { system, messages, maxTokens, onStream, signal, requestTimeoutMs, requestRetries, jsonMode, jsonSchema, forceNonStream, temperature, reasoningEffort }, extraHeaders = {}, { useProxy = true, extraBody = {}, fetchImpl = null, firstReadStallMs = 0 } = /** @type {OpenAICompatibleTransportOptions} */ ({})) {
  const apiMessages = [];
  if (system) apiMessages.push({ role: 'system', content: system });
  for (const msg of messages) apiMessages.push({ role: msg.role, content: msg.content });

  // Thinking models burn reasoning tokens against max_tokens, so low caps need
  // extra room while still constraining total output.
  const isThinkingModel = /deepseek-r1|kimi-k|qwq|qwen3(?:[.\-:]|$)|glm-[45]|claude-.*sonnet|claude-.*opus|(?:^|[/:_.-])cloud(?:$|[/:_.-])/i.test(model);
  const effectiveMaxTokens = isThinkingModel && providerName !== 'Local AI'
    ? Math.max(maxTokens || 4096, 16384)
    : (maxTokens || 4096);
  const tokenLimitField = needsMaxCompletionTokens(model) ? 'max_completion_tokens' : 'max_tokens';
  /** @type {Record<string, any>} */
  const body = { model, messages: apiMessages, [tokenLimitField]: effectiveMaxTokens || 4096, ...extraBody };
  if (typeof reasoningEffort === 'string' && reasoningEffort) body.reasoning_effort = reasoningEffort;
  const requestedTemperature = Number(temperature);
  if (temperature !== undefined && Number.isFinite(requestedTemperature) && requestedTemperature >= 0 && requestedTemperature <= 2) {
    body.temperature = requestedTemperature;
  }
  if (jsonMode) {
    body.response_format = jsonResponseFormat(jsonSchema);
  }
  const useStream = !!onStream && !forceNonStream;
  if (useStream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }

  const fetchRequest = async (requestBody) => {
    const requestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'Authorization': `Bearer ${key}` } : {}),
        ...extraHeaders
      },
      body: JSON.stringify(requestBody),
      signal
    };
    return fetchImpl
      ? fetchWithOptionalTimeout(fetchImpl, endpoint, requestInit, requestTimeoutMs)
      : fetchWithApiRetry(
        endpoint,
        requestInit,
        Number.isInteger(requestRetries) ? Math.max(0, requestRetries) : providerName === 'Local AI' ? 0 : 2,
        useProxy,
        requestTimeoutMs,
      );
  };

  let res;
  let structuredOutputFallback = false;
  let reasoningControlFallback = false;
  let temperatureControlFallback = false;
  try {
    let requestBody = { ...body };
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetchRequest(requestBody);
      if (res.ok) break;
      const errorText = await res.clone().text();
      if ((requestBody.reasoning_effort || requestBody.reasoning) && reasoningControlRejected(res, errorText)) {
        delete requestBody.reasoning_effort;
        delete requestBody.reasoning;
        reasoningControlFallback = true;
        continue;
      }
      if (requestBody.temperature !== undefined && temperatureControlRejected(res, errorText)) {
        delete requestBody.temperature;
        temperatureControlFallback = true;
        continue;
      }
      if (requestBody.response_format?.type === 'json_schema' && structuredOutputRejected(res, errorText)) {
        delete requestBody.response_format;
        structuredOutputFallback = true;
        continue;
      }
      break;
    }
  } catch (e) {
    throw new Error(`Cannot reach ${providerName} API: ${redactApiSecretText(getErrorMessage(e), [key])}`);
  }

  if (!res.ok) {
    if (res.status === 401) {
      let errType = '';
      try { const b = await res.clone().json(); errType = b?.error?.type || ''; } catch {}
      if (!errType || errType === 'AuthError' || errType === 'authentication_error') {
        throw new Error(`Invalid ${providerName} API key. Check your settings.`);
      }
      throw new Error(`${providerName} API error: ${redactApiSecretText(errType, [key])}`);
    }
    if (res.status === 402) {
      const hint = providerName === 'Routstr' ? ' Top up with Lightning or Cashu.'
        : providerName === 'PPQ' ? ' Top up in Settings -> AI -> PPQ.'
        : ' Add credits at openrouter.ai/settings/credits';
      const modalShown = providerName === 'OpenRouter'
        && showOpenRouterInsufficientBalanceDialogRuntime();
      const balanceErr = /** @type {Error & { _modalShown?: boolean }} */ (new Error(`Insufficient ${providerName} balance.${hint}`));
      if (modalShown) balanceErr._modalShown = true;
      throw balanceErr;
    }
    if (res.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
    let errMsg = `${providerName} API error (${res.status})`;
    try {
      const errBody = await res.json();
      errMsg += `: ${redactApiSecretText(errBody.error?.message || JSON.stringify(errBody.error), [key])}`;
    } catch {}
    throw new Error(errMsg);
  }

  if (useStream) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let hasContent = false;
    let reasoningBuf = '';
    let finishReason = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let performance = null;
    let receivedFirstToken = false;
    const handleSSELine = (line, boundary) => {
      if (!line.startsWith('data: ')) return;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const event = JSON.parse(data);
        if (event.error) throw new Error(redactApiSecretText(event.error.message || JSON.stringify(event.error), [key]));
        const choice = event.choices?.[0];
        const delta = choice?.delta;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        else if (choice?.native_finish_reason) finishReason = choice.native_finish_reason;
        if (delta?.content) {
          receivedFirstToken = true;
          if (!hasContent) hasContent = true;
          fullText += delta.content;
          onStream(fullText);
        } else if (delta?.reasoning_content || delta?.reasoning) {
          receivedFirstToken = true;
          if (!hasContent) reasoningBuf += delta.reasoning_content || delta.reasoning;
        }
        if (event.usage) {
          inputTokens = event.usage.prompt_tokens || inputTokens;
          outputTokens = event.usage.completion_tokens || outputTokens;
        }
        if (event.stats) {
          performance = {
            tokensPerSecond: Number(event.stats.tokens_per_second) || 0,
            timeToFirstTokenMs: Number(event.stats.time_to_first_token_seconds) > 0 ? Math.round(Number(event.stats.time_to_first_token_seconds) * 1000) : 0,
            modelLoadMs: Number(event.stats.model_load_time_seconds) > 0 ? Math.round(Number(event.stats.model_load_time_seconds) * 1000) : 0,
            reasoningTokens: Number(event.stats.reasoning_output_tokens) || 0,
          };
        }
      } catch (parseErr) {
        if (boundary && parseErr instanceof SyntaxError) return;
        throw parseErr;
      }
    };
    const MAX_SSE_BUFFER = 4 * 1024 * 1024;
    while (true) {
      // Metadata and role-only SSE events can arrive before prefill finishes;
      // keep the extended allowance until an actual response token arrives.
      const stallMs = !receivedFirstToken && firstReadStallMs > 0 ? firstReadStallMs : undefined;
      const { done, value } = await readWithStallTimeout(reader, `${providerName} stream`, stallMs);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_SSE_BUFFER) {
        try { reader.cancel(); } catch {}
        throw new Error(`${providerName} stream exceeded ${MAX_SSE_BUFFER} bytes without a newline - aborting.`);
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) handleSSELine(line, true);
    }
    if (buffer.startsWith('data: ')) handleSSELine(buffer, false);
    if (!fullText && reasoningBuf) {
      if (providerName === 'Local AI') {
        throw new Error('Local AI returned reasoning but no final answer. Reasoning used the output budget; disable thinking for this task or increase the model context/output limit.');
      }
      fullText = reasoningBuf;
      onStream(fullText);
    }
    if (!fullText.trim()) {
      throw new Error(`${providerName} stream ended without response content. No usage was reported by the app; check the provider account before retrying.`);
    }
    return {
      text: fullText,
      usage: { inputTokens, outputTokens },
      finishReason,
      truncated: isTokenLimitFinish(finishReason),
      ...((structuredOutputFallback || reasoningControlFallback || temperatureControlFallback || performance) ? { diagnostics: { structuredOutputFallback, reasoningControlFallback, temperatureControlFallback, ...(performance ? { performance } : {}) } } : {}),
    };
  }

  const data = await res.json();
  const usage = data.usage || {};
  const choice = data.choices?.[0];
  const msg = choice?.message;
  let text = msg?.content || '';
  const reasoningText = msg?.reasoning_content || msg?.reasoning || '';
  if (!text && reasoningText) {
    if (providerName === 'Local AI') {
      throw new Error('Local AI returned reasoning but no final answer. Reasoning used the output budget; disable thinking for this task or increase the model context/output limit.');
    }
    text = reasoningText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
  if (!String(text).trim()) {
    throw new Error(`${providerName} returned no response content. No usage was reported by the app; check the provider account before retrying.`);
  }
  const finishReason = choice?.finish_reason || choice?.native_finish_reason || null;
  const stats = data.stats || {};
  const performance = Object.keys(stats).length ? {
    tokensPerSecond: Number(stats.tokens_per_second) || 0,
    timeToFirstTokenMs: Number(stats.time_to_first_token_seconds) > 0 ? Math.round(Number(stats.time_to_first_token_seconds) * 1000) : 0,
    modelLoadMs: Number(stats.model_load_time_seconds) > 0 ? Math.round(Number(stats.model_load_time_seconds) * 1000) : 0,
    reasoningTokens: Number(stats.reasoning_output_tokens || usage.completion_tokens_details?.reasoning_tokens) || 0,
  } : null;
  return {
    text,
    usage: { inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 },
    finishReason,
    truncated: isTokenLimitFinish(finishReason),
    ...((structuredOutputFallback || reasoningControlFallback || temperatureControlFallback || performance) ? { diagnostics: { structuredOutputFallback, reasoningControlFallback, temperatureControlFallback, ...(performance ? { performance } : {}) } } : {}),
  };
}
