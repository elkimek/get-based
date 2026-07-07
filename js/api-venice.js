// @ts-check
// api-venice.js - Venice provider adapter, including E2EE mode.

import { readWithStallTimeout } from './api-transport.js';
import {
  getVeniceE2EE,
  getVeniceKey,
  getVeniceModel,
  isE2EEModel,
  readStoredArray,
  syncVeniceModelSelection,
  veniceModelsCacheStale,
} from './api-provider-storage.js';
import { fetchVeniceModels } from './api-models.js';
import {
  callOpenAICompatibleAPI,
  fetchWithApiRetry,
  isTokenLimitFinish,
} from './api-openai-compatible.js';

/** @typedef {Window & typeof globalThis & {
 *   _veniceE2EE?: any,
 *   _veniceE2EEKey?: string,
 *   _veniceAttestation?: any,
 *   clearE2EESession?: () => void
 * }} VeniceApiWindow */

const apiWindow = /** @type {VeniceApiWindow} */ (typeof window !== 'undefined' ? window : {});

export async function getVeniceBalance() {
  const key = getVeniceKey();
  if (!key) return null;
  try {
    const res = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b', messages: [{ role: 'user', content: '' }], max_tokens: 1 })
    });
    if (!res.ok) return null;
    await res.text();
    const diem = res.headers.get('x-venice-balance-diem');
    if (diem != null) return { diem: parseFloat(diem), canConsume: true };
    return null;
  } catch {
    return null;
  }
}

export async function callVeniceAPI(opts) {
  const key = getVeniceKey();
  if (!key) throw new Error('No Venice API key configured. Add your key in Settings.');
  const regularModels = readStoredArray('labcharts-venice-models');
  const e2eeModels = readStoredArray('labcharts-venice-e2ee-models');
  if (regularModels.length || e2eeModels.length) syncVeniceModelSelection(regularModels, e2eeModels);
  let modelId = getVeniceModel();
  let e2eeRequested = getVeniceE2EE() || isE2EEModel(modelId);
  if (e2eeRequested && veniceModelsCacheStale()) {
    await fetchVeniceModels(key);
    modelId = getVeniceModel();
    e2eeRequested = getVeniceE2EE() || isE2EEModel(modelId);
  }
  if (e2eeRequested && !isE2EEModel(modelId)) {
    throw new Error('Venice E2EE is enabled, but no current Venice E2EE model is available. Refresh Venice models in Settings and choose an E2EE model.');
  }

  if (!isE2EEModel(modelId)) {
    const extraBody = opts.webSearch ? { venice_parameters: { enable_web_search: 'on' } } : {};
    return callOpenAICompatibleAPI('https://api.venice.ai/api/v1/chat/completions', key, modelId, 'Venice', opts, {}, { extraBody });
  }

  if (!crypto?.subtle) throw new Error('E2EE requires a secure context (HTTPS). Cannot encrypt on this page.');
  const { createVeniceE2EE, encryptMessage, decryptChunk } = await import('../vendor/venice-e2ee.js');
  if (!apiWindow._veniceE2EE || apiWindow._veniceE2EEKey !== key) {
    apiWindow._veniceE2EE = createVeniceE2EE({ apiKey: key });
    apiWindow._veniceE2EEKey = key;
    apiWindow.clearE2EESession = () => apiWindow._veniceE2EE?.clearSession();
  }
  let session;
  try {
    session = await apiWindow._veniceE2EE.createSession(modelId);
  } catch (e) {
    throw new Error(`Venice E2EE setup failed: ${e.message}`);
  }
  apiWindow._veniceAttestation = session.attestation ?? apiWindow._veniceAttestation ?? null;
  document.querySelector('.chat-header-model')?.dispatchEvent(new CustomEvent('e2ee-attestation'));

  const contentStr = (c) => typeof c === 'string'
    ? c
    : Array.isArray(c)
      ? c.filter(b => b.type === 'text').map(b => b.text).join('')
      : String(c);
  const { system, messages, maxTokens, onStream, signal, forceNonStream, requestTimeoutMs } = opts;
  const apiMessages = [];
  if (system) apiMessages.push({ role: 'system', content: await encryptMessage(session.aesKey, session.publicKey, system) });
  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: await encryptMessage(session.aesKey, session.publicKey, contentStr(msg.content)) });
  }

  const useStream = !forceNonStream;
  const body = { model: modelId, messages: apiMessages, max_tokens: maxTokens || 4096, stream: useStream };
  if (useStream) body.stream_options = { include_usage: true };
  let res;
  try {
    res = await fetchWithApiRetry('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'X-Venice-TEE-Client-Pub-Key': session.pubKeyHex,
        'X-Venice-TEE-Model-Pub-Key': session.modelPubKeyHex,
        'X-Venice-TEE-Signing-Algo': 'ecdsa'
      },
      body: JSON.stringify(body),
      signal
    }, 2, true, requestTimeoutMs);
  } catch (e) {
    throw new Error(`Cannot reach Venice API: ${e.message}`);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid Venice API key. Check your settings.');
    if (res.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
    let errMsg = `Venice API error (${res.status})`;
    try { const b = await res.json(); errMsg += `: ${b.error?.message || JSON.stringify(b.error)}`; } catch {}
    throw new Error(errMsg);
  }

  if (!useStream) {
    const data = await res.json();
    const usage = data.usage || {};
    const choice = data.choices?.[0];
    const encryptedContent = choice?.message?.content || '';
    const text = await decryptChunk(session.privateKey, encryptedContent);
    const finishReason = choice?.finish_reason || choice?.native_finish_reason || null;
    return {
      text,
      usage: { inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 },
      finishReason,
      truncated: isTokenLimitFinish(finishReason)
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason = null;
  const handleVeniceLine = async (line, boundary) => {
    if (!line.startsWith('data: ')) return;
    const data = line.slice(6);
    if (data === '[DONE]') return;
    try {
      const event = JSON.parse(data);
      const choice = event.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      else if (choice?.native_finish_reason) finishReason = choice.native_finish_reason;
      if (choice?.delta?.content) {
        const chunk = await decryptChunk(session.privateKey, choice.delta.content);
        fullText += chunk;
        if (onStream) onStream(fullText);
      }
      if (event.usage) {
        inputTokens = event.usage.prompt_tokens || inputTokens;
        outputTokens = event.usage.completion_tokens || outputTokens;
      }
    } catch (e) {
      if (e.name === 'OperationError') throw new Error('E2EE decryption failed - session may be stale. Try sending again.');
      if (boundary && e instanceof SyntaxError) return;
      throw e;
    }
  };
  while (true) {
    const { done, value } = await readWithStallTimeout(reader, 'Venice stream');
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) await handleVeniceLine(line, true);
  }
  if (buffer.startsWith('data: ')) await handleVeniceLine(buffer, false);
  return { text: fullText, usage: { inputTokens, outputTokens }, finishReason, truncated: isTokenLimitFinish(finishReason) };
}
