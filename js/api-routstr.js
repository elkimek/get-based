// @ts-check
// api-routstr.js - Routstr provider adapter and wallet helpers.

import { getErrorMessage } from './caught-error.js';
import {
  getRoutstrKey,
  getRoutstrModel,
  isRoutstrPrivateModeActive,
  isRoutstrTinfoilModel,
  notifyAIModelCatalogChanged,
  setRoutstrModel,
  syncRoutstrModelSelection,
} from './api-provider-storage.js';
import {
  deduplicateModels,
  findPreferredModel,
  isRecommendedModel,
  needsMaxCompletionTokens,
} from './api-models.js';
import { callOpenAICompatibleAPI } from './api-openai-compatible.js';
import { notifyRoutstrRequestSettled } from './routstr-balance-settlement.js';

const ROUTSTR_CURATED = ['claude-', 'anthropic/claude-', 'gpt-5', 'gpt-4', 'gemini-3', 'gemini-2', 'glm-5', 'z-ai/glm-5', 'kimi-', 'moonshotai/kimi-', 'grok-4', 'x-ai/grok-4', 'grok-3', 'llama-', 'qwen', 'deepseek-', 'mistral-', 'mimo-'];
const ROUTSTR_DEFAULT_CANDIDATES = ['gpt-5.5', 'openai/gpt-5.5', 'claude-sonnet-5', 'claude-sonnet-4.6'];
const ROUTSTR_EXCLUDE = ['codex', 'audio', 'image', 'oss', 'safeguard', 'coder', 'embed', 'tts', 'whisper', 'beta', 'preview', 'free', 'gratis'];
const ROUTSTR_PRIVATE_REQUEST_TIMEOUT_MS = 180000;
const ROUTSTR_PRIVATE_MAX_OUTPUT_TOKENS = 4096;
const ROUTSTR_SLOW_CONNECTION_THRESHOLD_MS = 45000;

/** @typedef {Window & typeof globalThis & { _routstrAttestation?: any }} RoutstrApiWindow */
const apiWindow = /** @type {RoutstrApiWindow} */ (typeof window !== 'undefined' ? window : {});

/** @param {unknown} error @param {number} elapsedMs @param {string} modelId */
function privateRequestError(error, elapsedMs, modelId) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const slowConnectionEnded = elapsedMs >= ROUTSTR_SLOW_CONNECTION_THRESHOLD_MS
    && /Cannot reach Routstr API:\s*(Failed to fetch|NetworkError)/i.test(message);
  const reservationHint = 'The displayed node balance may include a temporary reservation and will refresh automatically.';
  if (slowConnectionEnded) {
    const elapsedSeconds = Math.max(1, Math.round(elapsedMs / 1000));
    return new Error(`The encrypted Routstr connection ended after ${elapsedSeconds}s before ${modelId} returned a response. The model may have exceeded the node's upstream timeout; try another Private TEE model. ${reservationHint}`);
  }
  return new Error(`${message} ${reservationHint}`);
}

export async function fetchRoutstrModels() {
  try {
    const nodeUrl = _requireNodeUrl();
    const res = await fetch(nodeUrl + '/v1/models');
    if (!res.ok) return [];
    const json = await res.json();
    const enabled = (json.data || []).filter(function(m) { return m.id && m.enabled !== false; });
    const privateModels = enabled.filter(function(m) { return isRoutstrTinfoilModel(m.id); })
      .sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    const all = enabled.filter(function(m) {
      if (isRoutstrTinfoilModel(m.id)) return false;
      if (!m.id || !m.enabled) return false;
      if (ROUTSTR_EXCLUDE.some(function(ex) { return m.id.includes(ex); })) return false;
      return ROUTSTR_CURATED.some(function(prefix) { return m.id.startsWith(prefix); });
    }).sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    const models = deduplicateModels(all, function(id) {
      return id.replace(/-\d{8}$/, '');
    });
    models.sort(function(a, b) {
      const aRec = isRecommendedModel('routstr', a.id);
      const bRec = isRecommendedModel('routstr', b.id);
      if (aRec !== bRec) return aRec ? -1 : 1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
    const pricingCache = {};
    for (const m of [...models, ...privateModels]) {
      if (m.pricing && m.pricing.prompt && m.pricing.completion) {
        pricingCache[m.id] = {
          input: parseFloat(m.pricing.prompt) * 1_000_000,
          output: parseFloat(m.pricing.completion) * 1_000_000
        };
      }
    }
    localStorage.setItem('labcharts-routstr-pricing', JSON.stringify(pricingCache));
    const visionIds = enabled.filter(function(m) {
      if (!m.id || !m.architecture) return false;
      return (m.architecture.modality || '').includes('image') || (m.architecture.input_modalities || []).includes('image');
    }).map(function(m) { return m.id; });
    localStorage.setItem('labcharts-routstr-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-routstr-models', JSON.stringify(models));
    localStorage.setItem('labcharts-routstr-private-models', JSON.stringify(privateModels));
    syncRoutstrModelSelection(models, privateModels);
    if (!localStorage.getItem('labcharts-routstr-model') && models.length) {
      const claude = findPreferredModel(models, ROUTSTR_DEFAULT_CANDIDATES);
      if (claude) setRoutstrModel(claude.id);
    }
    notifyAIModelCatalogChanged();
    return isRoutstrPrivateModeActive() ? privateModels : models;
  } catch (e) {
    return [];
  }
}

export async function validateRoutstrKey(key) {
  if (key.startsWith('cashu:')) key = key.slice(6);
  if (!key.startsWith('sk-') && !key.startsWith('cashu')) {
    return { valid: false, error: 'Key should start with sk-... (session key) or cashu... (eCash token)' };
  }
  return { valid: true };
}

export function getRoutstrNodeUrl() {
  return localStorage.getItem('labcharts-routstr-node') || '';
}

function _requireNodeUrl() {
  const url = getRoutstrNodeUrl();
  if (!url) throw new Error('No Routstr node selected. Pick a node in Settings -> Routstr.');
  return url.replace(/\/$/, '');
}

export async function callRoutstrAPI(opts) {
  const key = getRoutstrKey();
  if (!key) throw new Error('No Routstr key configured. Fund your wallet and connect to a node in Settings.');
  const nodeUrl = _requireNodeUrl();
  const modelId = String(opts?.modelOverride || getRoutstrModel());
  if (isRoutstrTinfoilModel(modelId)) {
    if (!globalThis.crypto?.subtle) throw new Error('Routstr Private TEE mode requires a secure context (HTTPS). Cannot encrypt on this page.');
    const { createTinfoilSecureFetch } = await import('./tinfoil-secure-fetch.js');
    let secure;
    try {
      secure = await createTinfoilSecureFetch({ baseUrl: nodeUrl });
    } catch (e) {
      throw new Error(`Routstr Private TEE setup failed: ${getErrorMessage(e)}`);
    }
    apiWindow._routstrAttestation = secure.verification ?? apiWindow._routstrAttestation ?? null;
    document.querySelector('.chat-header-model')?.dispatchEvent(new CustomEvent('e2ee-attestation'));
    const enclaveModelId = modelId.replace(/^tinfoil-/, '');
    const outputTokenField = needsMaxCompletionTokens(enclaveModelId) ? 'max_completion_tokens' : 'max_tokens';
    const outputTokenLimit = Math.min(opts.maxTokens || ROUTSTR_PRIVATE_MAX_OUTPUT_TOKENS, ROUTSTR_PRIVATE_MAX_OUTPUT_TOKENS);
    const requestStartedAt = Date.now();
    let failed = true;
    try {
      const result = await callOpenAICompatibleAPI(
        nodeUrl + '/v1/chat/completions',
        key,
        enclaveModelId,
        'Routstr',
        {
          ...opts,
          webSearch: false,
          requestTimeoutMs: opts.requestTimeoutMs || ROUTSTR_PRIVATE_REQUEST_TIMEOUT_MS,
        },
        { 'X-Routstr-Model': modelId },
        {
          useProxy: false,
          fetchImpl: secure.fetch,
          extraBody: { [outputTokenField]: outputTokenLimit },
        }
      );
      failed = false;
      return result;
    } catch (error) {
      throw privateRequestError(error, Date.now() - requestStartedAt, modelId);
    } finally {
      notifyRoutstrRequestSettled({ failed, modelId });
    }
  }
  return callOpenAICompatibleAPI(
    nodeUrl + '/v1/chat/completions',
    key,
    modelId,
    'Routstr',
    opts
  );
}

export async function createRoutstrAccount(cashuToken) {
  if (!cashuToken) throw new Error('A Cashu token is required to create a wallet');
  const res = await fetch(_requireNodeUrl() + '/v1/balance/create?initial_balance_token=' + encodeURIComponent(cashuToken));
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const detail = err?.detail;
    const msg = typeof detail === 'string' ? detail
      : (detail && detail.error) ? detail.error.message
      : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join('; ')
      : err?.message;
    throw new Error(msg || 'Failed to create Routstr wallet: ' + res.status);
  }
  return res.json();
}

export async function getRoutstrBalance() {
  const key = getRoutstrKey();
  if (!key) return null;
  try {
    const res = await fetch(_requireNodeUrl() + '/v1/balance/info', {
      headers: { 'Authorization': 'Bearer ' + key },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.balance != null) {
      return {
        sats: Math.floor(json.balance / 1000),
        msats: json.balance,
        totalRequests: json.total_requests || 0,
        totalSpent: json.total_spent || 0
      };
    }
    return null;
  } catch {
    return null;
  }
}
