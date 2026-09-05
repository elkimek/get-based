// @ts-check
// api-ppq.js - PPQ provider adapter and account helpers.

import { getErrorMessage } from './caught-error.js';
import {
  getPpqCreditId,
  getPpqKey,
  getPpqModel,
  getPpqPrivateMode,
  isPpqPrivateModel,
  notifyAIModelCatalogChanged,
  setPpqModel,
  syncPpqModelSelection,
} from './api-provider-storage.js';
import {
  deduplicateModels,
  findPreferredModel,
  isRecommendedModel,
  modelMetadataIsAvailable,
} from './api-models.js';
import { callOpenAICompatibleAPI } from './api-openai-compatible.js';

/** @typedef {Window & typeof globalThis & {
 *   _ppqAttestation?: any
 * }} PpqApiWindow */

const apiWindow = /** @type {PpqApiWindow} */ (typeof window !== 'undefined' ? window : {});

const PPQ_CURATED = ['claude-', 'anthropic/claude-', 'gpt-5', 'gpt-4', 'gpt-oss', 'gemini-3', 'gemini-2', 'google/gemini-3', 'google/gemini-2', 'glm-5', 'z-ai/glm-5', 'moonshotai/kimi-', 'grok-', 'x-ai/grok-4', 'llama-', 'qwen', 'deepseek-', 'mistral-', 'kimi', 'perplexity'];
const PPQ_DEFAULT_CANDIDATES = ['gpt-5.5', 'openai/gpt-5.5', 'claude-sonnet-5', 'claude-sonnet-4.6'];
const PPQ_EXCLUDE = ['codex', 'audio', 'image', 'embed', 'tts', 'whisper', 'video', 'nano-banana'];
// The PPQ API is authoritative for private-model availability, names, and
// pricing. This map only fills capability metadata that the current private
// catalogue rows omit; it must never act as an availability allowlist.
/** @type {Record<string, { input: string[], reasoning?: { supported_efforts: string[], default_effort: string } }>} */
const PPQ_PRIVATE_MODEL_CAPABILITIES = {
  'private/kimi-k2-6': { input: ['text', 'image'] },
  'private/gpt-oss-120b': {
    input: ['text'],
    reasoning: { supported_efforts: ['low', 'medium', 'high'], default_effort: 'medium' },
  },
  'private/llama3-3-70b': { input: ['text'] },
  'private/qwen3-vl-30b': { input: ['text', 'image'] },
  'private/glm-5-2': { input: ['text'] },
  'private/gemma4-31b': { input: ['text', 'image'] },
  'private/kimi-k3': { input: ['text', 'image'] },
};

export async function createPpqAccount() {
  const res = await fetch('https://api.ppq.ai/accounts/create', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create PPQ account: ' + res.status);
  return res.json();
}

export async function getPpqBalance() {
  const key = getPpqKey();
  const creditId = getPpqCreditId();
  if (!key && !creditId) return null;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;
    const body = creditId ? JSON.stringify({ credit_id: creditId }) : JSON.stringify({});
    const res = await fetch('https://api.ppq.ai/credits/balance', {
      method: 'POST',
      headers,
      body
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.balance != null ? json.balance : null;
  } catch {
    return null;
  }
}

export async function createPpqTopup(amountUsd, paymentMethod) {
  const key = getPpqKey();
  if (!key) throw new Error('No PPQ API key');
  const method = paymentMethod || 'btc-lightning';
  const res = await fetch('https://api.ppq.ai/topup/create/' + encodeURIComponent(method), {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountUsd, currency: 'USD' })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || err?.error || 'Topup failed: ' + res.status);
  }
  return res.json();
}

export async function checkPpqTopupStatus(invoiceId) {
  const key = getPpqKey();
  const res = await fetch('https://api.ppq.ai/topup/status/' + encodeURIComponent(invoiceId), {
    headers: key ? { 'Authorization': 'Bearer ' + key } : {}
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchPpqModels(key) {
  try {
    /** @type {Record<string, string>} */
    const headers = {};
    if (key || getPpqKey()) headers['Authorization'] = 'Bearer ' + (key || getPpqKey());
    const res = await fetch('https://api.ppq.ai/v1/models?type=chat', { headers });
    if (!res.ok) return [];
    const json = await res.json();
    const rawModels = (json.data || []).filter(modelMetadataIsAvailable);
    const privateFromApi = rawModels.filter(function(m) { return m?.id && m.id.startsWith('private/'); });
    const privateModels = privateFromApi
      .map(function(m) { return { ...PPQ_PRIVATE_MODEL_CAPABILITIES[m.id], ...m }; })
      .sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    const all = rawModels.filter(function(m) {
      if (!m.id || m.id.startsWith('private/')) return false;
      if (PPQ_EXCLUDE.some(function(ex) { return m.id.includes(ex); })) return false;
      return PPQ_CURATED.some(function(prefix) { return m.id.startsWith(prefix); });
    }).sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    const models = deduplicateModels(all, function(id) {
      return id.replace(/-\d{8}$/, '');
    });
    models.sort(function(a, b) {
      const aRec = isRecommendedModel('ppq', a.id);
      const bRec = isRecommendedModel('ppq', b.id);
      if (aRec !== bRec) return aRec ? -1 : 1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
    const pricingCache = {};
    for (const m of [...models, ...privateModels]) {
      if (m.pricing) {
        const inp = parseFloat(m.pricing.input_per_1M_tokens || m.pricing.prompt || '0');
        const out = parseFloat(m.pricing.output_per_1M_tokens || m.pricing.completion || '0');
        if (inp || out) {
          pricingCache[m.id] = {
            input: inp > 1000 ? inp / 1_000_000 : inp,
            output: out > 1000 ? out / 1_000_000 : out
          };
        }
      }
    }
    localStorage.setItem('labcharts-ppq-pricing', JSON.stringify(pricingCache));
    const visionIds = rawModels.filter(function(m) {
      if (!m.id || !m.architecture) return false;
      const modality = m.architecture.modality || '';
      const inputMods = m.architecture.input_modalities || [];
      return modality.includes('image') || inputMods.includes('image');
    }).map(function(m) { return m.id; });
    const privateVisionIds = privateModels.filter(m => Array.isArray(m.input) && m.input.includes('image')).map(m => m.id);
    localStorage.setItem('labcharts-ppq-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-ppq-private-vision-models', JSON.stringify(privateVisionIds));
    localStorage.setItem('labcharts-ppq-models', JSON.stringify(models));
    localStorage.setItem('labcharts-ppq-private-models', JSON.stringify(privateModels));
    syncPpqModelSelection(models, privateModels);
    if (!localStorage.getItem('labcharts-ppq-model') && models.length) {
      const claude = findPreferredModel(models, PPQ_DEFAULT_CANDIDATES);
      if (claude) setPpqModel(claude.id);
    }
    notifyAIModelCatalogChanged();
    return getPpqPrivateMode() && privateModels.length ? privateModels : models;
  } catch (e) {
    return [];
  }
}

export async function validatePpqKey(key) {
  try {
    const res = await fetch('https://api.ppq.ai/v1/models?type=chat', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (res.ok) return { valid: true };
    if (res.status === 401) return { valid: false, error: 'Invalid API key' };
    if (res.status === 429) return { valid: true };
    const errBody = await res.json().catch(() => null);
    const errMsg = errBody?.error?.message || `status ${res.status}`;
    return { valid: false, error: `API error: ${errMsg}` };
  } catch (e) {
    return { valid: false, error: 'Cannot reach PPQ API: ' + getErrorMessage(e) };
  }
}

export async function callPpqPrivateAPI(opts) {
  const key = getPpqKey();
  if (!key) throw new Error('No PPQ API key configured. Create an account or add your key in Settings.');
  if (!crypto?.subtle) throw new Error('PPQ Private TEE mode requires a secure context (HTTPS). Cannot encrypt on this page.');
  const modelId = String(opts?.modelOverride || getPpqModel());
  const enclaveModelId = modelId.replace(/^private\//, '');
  const { createPpqPrivateFetch } = await import('../vendor/ppq-private-tee.js');
  let secure;
  try {
    secure = await createPpqPrivateFetch({ apiBase: 'https://api.ppq.ai' });
  } catch (e) {
    throw new Error(`PPQ Private TEE setup failed: ${getErrorMessage(e)}`);
  }
  apiWindow._ppqAttestation = secure.verification ?? apiWindow._ppqAttestation ?? null;
  document.querySelector('.chat-header-model')?.dispatchEvent(new CustomEvent('e2ee-attestation'));
  return callOpenAICompatibleAPI(
    'https://api.ppq.ai/private/v1/chat/completions',
    key,
    enclaveModelId,
    'PPQ Private',
    { ...opts, webSearch: false },
    { 'X-Private-Model': modelId, 'x-query-source': 'getbased' },
    { useProxy: false, fetchImpl: secure.fetch }
  );
}

export async function callPpqAPI(opts) {
  const key = getPpqKey();
  if (!key) throw new Error('No PPQ API key configured. Create an account or add your key in Settings.');
  const modelId = String(opts?.modelOverride || getPpqModel());
  if (isPpqPrivateModel(modelId)) return callPpqPrivateAPI({ ...opts, webSearch: false });
  const extraBody = opts.webSearch ? { plugins: [{ id: 'web' }] } : {};
  return callOpenAICompatibleAPI(
    'https://api.ppq.ai/chat/completions',
    key,
    modelId,
    'PPQ',
    opts,
    {},
    { extraBody }
  );
}
