// @ts-check
// api-openai-compatible.js - shared OpenAI-compatible provider transport.

import { isDebugMode } from './utils.js';
import {
  FETCH_REQUEST_TIMEOUT_MS,
  createProxyFetch,
  fetchWithRetry,
  readWithStallTimeout,
} from './api-transport.js';
import { needsMaxCompletionTokens } from './api-models.js';
import { getAIProvider, getCustomApiUrl } from './api-provider-storage.js';
import { showOpenRouterInsufficientBalanceDialogRuntime } from './api-runtime.js';

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

// Only Custom API needs the proxy (arbitrary endpoints may lack CORS headers).
// Known providers set CORS headers, so we call them directly and avoid hosted
// proxy timeout limits.
export function useCustomApiProxy() {
  return getAIProvider() === 'custom' && shouldProxyCustomApiUrl(getCustomApiUrl());
}

const proxyFetch = createProxyFetch(useCustomApiProxy);

export function redactApiSecretText(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets) {
    const s = String(secret || '');
    if (s.length >= 6) text = text.split(s).join('[redacted]');
  }
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9._~+/=-]{6,}/g, '[redacted]')
    .replace(/\bcashu[A-Za-z0-9._~+/=-]{8,}/gi, '[redacted]');
}

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
  const timeoutSig = AbortSignal.timeout(timeoutMs);
  let signal;
  if (!requestInit.signal) {
    signal = timeoutSig;
  } else if (typeof AbortSignal.any === 'function') {
    signal = AbortSignal.any([requestInit.signal, timeoutSig]);
  } else {
    const ctl = new AbortController();
    const fwd = (sig) => sig.addEventListener('abort', () => ctl.abort(sig.reason), { once: true });
    if (requestInit.signal.aborted) ctl.abort(requestInit.signal.reason);
    else fwd(requestInit.signal);
    if (timeoutSig.aborted) ctl.abort(timeoutSig.reason);
    else fwd(timeoutSig);
    signal = ctl.signal;
  }
  try {
    return await fetchImpl(endpoint, { ...requestInit, signal });
  } catch (e) {
    const callerAborted = requestInit.signal?.aborted;
    const isTimeout = e?.name === 'TimeoutError' || (e?.name === 'AbortError' && !callerAborted);
    if (isTimeout) throw new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s - check your network`);
    throw e;
  }
}

export async function callOpenAICompatibleAPI(endpoint, key, model, providerName, { system, messages, maxTokens, onStream, signal, requestTimeoutMs, jsonMode, forceNonStream }, extraHeaders = {}, { useProxy = true, extraBody = {}, fetchImpl = null } = {}) {
  const apiMessages = [];
  if (system) apiMessages.push({ role: 'system', content: system });
  for (const msg of messages) apiMessages.push({ role: msg.role, content: msg.content });

  // Thinking models burn reasoning tokens against max_tokens, so low caps need
  // extra room while still constraining total output.
  const isThinkingModel = /deepseek-r1|kimi-k|qwq|glm-[45]|claude-.*sonnet|claude-.*opus|:cloud/.test(model);
  const effectiveMaxTokens = isThinkingModel
    ? Math.max(maxTokens || 4096, 16384)
    : (maxTokens || 4096);
  const tokenLimitField = needsMaxCompletionTokens(model) ? 'max_completion_tokens' : 'max_tokens';
  /** @type {Record<string, any>} */
  const body = { model, messages: apiMessages, [tokenLimitField]: effectiveMaxTokens || 4096, ...extraBody };
  if (jsonMode && providerName === 'Local AI') {
    body.response_format = { type: 'json_object' };
  }
  const useStream = !!onStream && !forceNonStream;
  if (useStream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }

  let res;
  try {
    const requestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        ...extraHeaders
      },
      body: JSON.stringify(body),
      signal
    };
    res = fetchImpl
      ? await fetchWithOptionalTimeout(fetchImpl, endpoint, requestInit, requestTimeoutMs)
      : await fetchWithApiRetry(endpoint, requestInit, 2, useProxy, requestTimeoutMs);
  } catch (e) {
    throw new Error(`Cannot reach ${providerName} API: ${redactApiSecretText(e.message, [key])}`);
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
          if (!hasContent) hasContent = true;
          fullText += delta.content;
          onStream(fullText);
        } else if (delta?.reasoning_content) {
          if (!hasContent) reasoningBuf += delta.reasoning_content;
        }
        if (event.usage) {
          inputTokens = event.usage.prompt_tokens || inputTokens;
          outputTokens = event.usage.completion_tokens || outputTokens;
        }
      } catch (parseErr) {
        if (boundary && parseErr instanceof SyntaxError) return;
        throw parseErr;
      }
    };
    const MAX_SSE_BUFFER = 4 * 1024 * 1024;
    while (true) {
      const { done, value } = await readWithStallTimeout(reader, `${providerName} stream`);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_SSE_BUFFER) {
        try { reader.cancel(); } catch {}
        throw new Error(`${providerName} stream exceeded ${MAX_SSE_BUFFER} bytes without a newline - aborting.`);
      }
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) handleSSELine(line, true);
    }
    if (buffer.startsWith('data: ')) handleSSELine(buffer, false);
    if (!fullText && reasoningBuf) fullText = reasoningBuf;
    return { text: fullText, usage: { inputTokens, outputTokens }, finishReason, truncated: isTokenLimitFinish(finishReason) };
  }

  const data = await res.json();
  const usage = data.usage || {};
  const choice = data.choices?.[0];
  const msg = choice?.message;
  let text = msg?.content || '';
  if (!text && msg?.reasoning_content) text = msg.reasoning_content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const finishReason = choice?.finish_reason || choice?.native_finish_reason || null;
  return {
    text,
    usage: { inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 },
    finishReason,
    truncated: isTokenLimitFinish(finishReason)
  };
}
