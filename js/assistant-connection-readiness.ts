// Metadata-only preflight. Never infer, fund, load a model or publish settings.
import type { AssistantSelection } from '../shared/agent-control-contract.js';
import { getCustomApiKey, getCustomApiUrl, getOllamaConfig, getOpenRouterKey, getPpqKey, getVeniceKey } from './api-provider-storage.js';
import { getRoutstrNodeUrl } from './api.js';
import { modelMetadataIsAvailable } from './api-models.js';
import { isAppExtensionAICredentialOwned, isAppExtensionAIProviderActive, getAppExtensionAIModelPolicy } from './app-extension-runtime.js';
import { AssistantSelectionConflict } from './assistant-selection.js';
import { isChatModelRow } from './chat-model-control-state.js';

const maximumBytes = 8_000_000;
/** Metadata reachability does not promise that a future paid inference succeeds. */
export interface AssistantConnectionReadiness { checkedAt: number; modelListed: true; inferenceTested: false; authentication: 'not-rejected' | 'not-tested' }
function fail(message: string): never { throw new AssistantSelectionConflict(`${message} The working connection was not changed. Open native AI settings to check it.`); }
async function readMetadata(url: string, key: unknown, signal: AbortSignal): Promise<{ response: Response; value: unknown }> {
  // Redirects may cross recipient boundaries. No credential is forwarded and
  // no inference endpoint, app proxy or account/payment endpoint is probed.
  const response = await fetch(url, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
    headers: key ? { Authorization: `Bearer ${String(key)}` } : {} });
  if (!response.ok) { await response.body?.cancel(); return { response, value: null }; }
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maximumBytes) { await response.body?.cancel(); fail('The connection returned an oversized metadata response.'); }
  if (!response.body) fail('The connection did not return model metadata.');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let total = 0, text = '';
  try {
    while (true) {
      signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break;
      total += chunk.value.byteLength; if (total > maximumBytes) fail('The connection returned an oversized metadata response.');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return { response, value: JSON.parse(text + decoder.decode()) as unknown };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
/** Only native saved configuration is accepted; no tool-supplied URL or key. */
export async function checkDirectAssistantConnection(selection: AssistantSelection, options: { signal?: AbortSignal; isCurrent: () => boolean; timeoutMs?: number }): Promise<AssistantConnectionReadiness> {
  if (selection.backend !== 'direct') fail('Use the paired Companion to check this CLI connection.');
  if (isAppExtensionAICredentialOwned(selection.provider) || isAppExtensionAIProviderActive(selection.provider)) fail('This edition manages that connection’s credentials. Use its native connection controls.');
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), Math.min(8000, Math.max(1, options.timeoutMs ?? 8000)));
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const ownerTimer = setInterval(() => { if (!options.isCurrent()) controller.abort(); }, 50);
  let url = '', key: unknown = '', ollama = false;
  try {
    if (!options.isCurrent() || signal.aborted) fail('The connection review is no longer current.');
    if (selection.provider === 'custom') { url = `${getCustomApiUrl().replace(/\/+$/, '')}/models`; key = getCustomApiKey(); }
    else if (selection.provider === 'openrouter') { url = `https://openrouter.ai/api/v1/models${getAppExtensionAIModelPolicy({ provider: selection.provider })?.zdrOnly ? '?zdr=true' : ''}`; key = getOpenRouterKey(); }
    else if (selection.provider === 'venice') { url = 'https://api.venice.ai/api/v1/models'; key = getVeniceKey(); }
    else if (selection.provider === 'ppq') { url = 'https://api.ppq.ai/v1/models?type=chat'; key = getPpqKey(); }
    else if (selection.provider === 'routstr') url = `${getRoutstrNodeUrl().replace(/\/+$/, '')}/v1/models`;
    else if (selection.provider === 'ollama') {
      const config = getOllamaConfig(); ollama = config.mode === 'ollama'; key = config.apiKey;
      url = `${config.url.replace(/\/+$/, '')}${ollama ? '/api/tags' : '/v1/models'}`;
    } else fail('That connection does not have a native metadata check.');
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) fail('Check the saved native connection URL.');
    let result = await readMetadata(url, key, signal);
    if (selection.provider === 'custom' && result.response.status === 404) {
      // Match the native Custom API model-list fallback, on the same origin.
      const fallback = url.replace(/\/[^/]+\/v\d+\/models$/, '/v1/models');
      if (fallback !== url && new URL(fallback).origin === parsed.origin) result = await readMetadata(fallback, key, signal);
    }
    if (!options.isCurrent()) fail('The connection review changed during its metadata check.');
    if (result.response.status === 401 || result.response.status === 403) fail('The connection rejected its saved credentials.');
    if (!result.response.ok) fail('The connection could not confirm model availability.');
    const payload = result.value && typeof result.value === 'object' ? result.value as Record<string, unknown> : null;
    const rows = payload?.[ollama ? 'models' : 'data'];
    if (!Array.isArray(rows)) fail('The connection returned an invalid model catalog.');
    const row = rows.find((item: unknown) => item && typeof item === 'object' && (ollama ? (item as { name?: unknown }).name : (item as { id?: unknown }).id) === selection.model);
    if (!row || !modelMetadataIsAvailable(row) || !isChatModelRow(row)) fail('The selected model is no longer available for chat on that connection.');
    return { checkedAt: Date.now(), modelListed: true, inferenceTested: false, authentication: key ? 'not-rejected' : 'not-tested' };
  } catch (cause) {
    if (cause instanceof AssistantSelectionConflict) throw cause;
    fail(signal.aborted ? 'The connection check was cancelled, expired or timed out.' : 'The connection metadata could not be reached directly from this browser.');
  } finally { clearTimeout(timeout); clearInterval(ownerTimer); }
}
