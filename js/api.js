// api.js — AI provider management, API calls (OpenRouter, Venice, Routstr, PPQ, Local, Custom)

import { getModelPricing } from './schema.js';
import { isDebugMode } from './utils.js';
import { getCachedKey, updateKeyCache, encryptedSetItem } from './crypto.js';
import {
  FETCH_REQUEST_TIMEOUT_MS,
  createProxyFetch,
  fetchWithRetry,
  readWithStallTimeout,
} from './api-transport.js';
export {
  AI_IMPORT_REQUEST_TIMEOUT_MS,
  FETCH_REQUEST_TIMEOUT_MS,
  STREAM_STALL_TIMEOUT_MS,
} from './api-transport.js';

function isTokenLimitFinish(reason) {
  const r = String(reason || '').toLowerCase();
  return r === 'length'
    || r === 'max_tokens'
    || r === 'max_completion_tokens'
    || r.includes('token_limit')
    || r.includes('max token');
}

// ═══════════════════════════════════════════════
// AI PROVIDER MANAGEMENT
// ═══════════════════════════════════════════════
export function deduplicateModels(models, familyFn) {
  const seen = {};
  return models.filter(function(m) {
    const fam = familyFn(m.id);
    if (seen[fam]) return false;
    seen[fam] = true;
    return true;
  });
}
function notifyAISelectionChanged() {
  window.updateChatHeaderModel?.();
  window.refreshWebSearchToggle?.();
}

export function getAIProvider() { return localStorage.getItem('labcharts-ai-provider') || 'openrouter'; }
export function setAIProvider(provider) {
  localStorage.setItem('labcharts-ai-provider', provider);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function isAIPaused() { return localStorage.getItem('labcharts-ai-paused') === 'true'; }
export function setAIPaused(v) { localStorage.setItem('labcharts-ai-paused', v ? 'true' : 'false'); }

const OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY = 'or_previous_ai_provider';
const OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY = 'or_oauth_local_settings_lock_until';
const AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY = 'labcharts-ai-settings-local-lock-until';
const OPENROUTER_OAUTH_PROVIDERS = new Set(['openrouter', 'venice', 'routstr', 'ppq', 'custom', 'ollama']);

function _isValidAIProvider(provider) {
  return typeof provider === 'string' && OPENROUTER_OAUTH_PROVIDERS.has(provider);
}

export function markAISettingsLocal() {
  try {
    sessionStorage.setItem(AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY, String(Date.now() + 5 * 60 * 1000));
  } catch {}
  try { window.dispatchEvent(new CustomEvent('labcharts-ai-settings-local-changed')); } catch {}
}

export function hasAIProvider() {
  if (isAIPaused()) return false;
  const provider = getAIProvider();
  if (provider === 'venice') return hasVeniceKey();
  if (provider === 'openrouter') return hasOpenRouterKey();
  if (provider === 'routstr') return hasRoutstrKey();
  if (provider === 'ppq') return hasPpqKey();
  if (provider === 'custom') return hasCustomApiKey() && !!getCustomApiUrl();
  return true; // Ollama — optimistic, errors caught at call time
}

export function getOllamaMainModel() { return localStorage.getItem('labcharts-ollama-model') || window.getOllamaConfig().model || 'llama3.2'; }
export function setOllamaMainModel(model) {
  localStorage.setItem('labcharts-ollama-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function getOllamaPIIUrl() { return localStorage.getItem('labcharts-ollama-pii-url') || window.getOllamaConfig().url; }
export function setOllamaPIIUrl(url) {
  localStorage.setItem('labcharts-ollama-pii-url', url);
  markAISettingsLocal();
}
export function getOllamaPIIModel() { return localStorage.getItem('labcharts-ollama-pii-model') || getOllamaMainModel(); }
export function setOllamaPIIModel(model) {
  localStorage.setItem('labcharts-ollama-pii-model', model);
  markAISettingsLocal();
}

export function getVeniceKey() { return getCachedKey('labcharts-venice-key') || ''; }
export async function saveVeniceKey(key) { await encryptedSetItem('labcharts-venice-key', key); updateKeyCache('labcharts-venice-key', key); markAISettingsLocal(); }
export function hasVeniceKey() { return !!getVeniceKey(); }
export async function getVeniceBalance() {
  const key = getVeniceKey();
  if (!key) return null;
  try {
    // Venice returns balance in x-venice-balance-diem header on completions
    const res = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b', messages: [{ role: 'user', content: '' }], max_tokens: 1 })
    });
    if (!res.ok) return null;
    // Drain response body
    await res.text();
    const diem = res.headers.get('x-venice-balance-diem');
    if (diem != null) return { diem: parseFloat(diem), canConsume: true };
    return null;
  } catch { return null; }
}
export function getVeniceModel() { return localStorage.getItem('labcharts-venice-model') || 'llama-3.3-70b'; }
export function setVeniceModel(model) {
  localStorage.setItem('labcharts-venice-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}

function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function modelListHasId(models, id) {
  return models.some(function(m) { return m && m.id === id; });
}

function veniceE2EEModelsCacheKnown() {
  return localStorage.getItem('labcharts-venice-e2ee-models') !== null;
}

function modelSupportsVeniceE2EE(model) {
  const supports = model?.model_spec?.capabilities?.supportsE2EE;
  if (supports === true) return true;
  if (supports === false) return false;
  return typeof model?.id === 'string' && model.id.startsWith('e2ee-');
}

function preferredVeniceModelId(models, savedId, preferLlama = false) {
  if (!models.length) return '';
  if (savedId && modelListHasId(models, savedId)) return savedId;
  if (preferLlama) {
    const llama = models.find(function(m) { return m.id && m.id.includes('llama-3.3-70b'); });
    if (llama) return llama.id;
  }
  return models[0].id;
}

function syncVeniceModelSelection(regularModels, e2eeModels) {
  const current = getVeniceModel();
  const e2eeOn = getVeniceE2EE();
  if (e2eeOn) {
    if (e2eeModels.length) {
      if (!modelListHasId(e2eeModels, current)) {
        const next = preferredVeniceModelId(e2eeModels, localStorage.getItem('labcharts-venice-model-e2ee'));
        if (next) {
          setVeniceModel(next);
          localStorage.setItem('labcharts-venice-model-e2ee', next);
        }
      }
      return;
    }
    return;
  }
  if (regularModels.length && !modelListHasId(regularModels, getVeniceModel())) {
    const next = preferredVeniceModelId(regularModels, localStorage.getItem('labcharts-venice-model-regular'), true);
    if (next) setVeniceModel(next);
  }
}

function veniceModelsCacheStale() {
  const fetchedAt = Number(localStorage.getItem('labcharts-venice-models-fetched-at') || 0);
  return !fetchedAt || Date.now() - fetchedAt > 60 * 60 * 1000;
}

export function getVeniceModelDisplay() {
  const id = getVeniceModel();
  const cached = [
    ...readStoredArray('labcharts-venice-models'),
    ...readStoredArray('labcharts-venice-e2ee-models')
  ];
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}

export function getVeniceE2EE() { return localStorage.getItem('labcharts-venice-e2ee') === 'on'; }
export function setVeniceE2EE(on) {
  localStorage.setItem('labcharts-venice-e2ee', on ? 'on' : 'off');
  markAISettingsLocal();
}

export function getOpenRouterKey() { return getCachedKey('labcharts-openrouter-key') || ''; }
export async function saveOpenRouterKey(key) { await encryptedSetItem('labcharts-openrouter-key', key); updateKeyCache('labcharts-openrouter-key', key); markAISettingsLocal(); }
export function hasOpenRouterKey() { return !!getOpenRouterKey(); }
export async function getOpenRouterBalance() {
  const key = getOpenRouterKey();
  if (!key) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data;
    if (d && d.total_credits != null) return { total: d.total_credits, used: d.total_usage, remaining: d.total_credits - d.total_usage };
    return null;
  } catch { return null; }
}

// ─── Routstr ───
export function getRoutstrKey() { return getCachedKey('labcharts-routstr-key') || ''; }
export async function saveRoutstrKey(key) { await encryptedSetItem('labcharts-routstr-key', key); updateKeyCache('labcharts-routstr-key', key); markAISettingsLocal(); }
export function hasRoutstrKey() { return !!getRoutstrKey(); }
export function getRoutstrModel() { return localStorage.getItem('labcharts-routstr-model') || 'claude-sonnet-4.6'; }
export function setRoutstrModel(model) {
  localStorage.setItem('labcharts-routstr-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function getRoutstrModelDisplay() {
  const id = getRoutstrModel();
  let cached = []; try { cached = JSON.parse(localStorage.getItem('labcharts-routstr-models') || '[]'); } catch(e) {}
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}

// ─── PPQ (PayPerQ — pay-per-prompt, crypto + fiat) ───
export function getPpqKey() { return getCachedKey('labcharts-ppq-key') || ''; }
export async function savePpqKey(key) { await encryptedSetItem('labcharts-ppq-key', key); updateKeyCache('labcharts-ppq-key', key); markAISettingsLocal(); }
export function hasPpqKey() { return !!getPpqKey(); }
export function getPpqModel() { return localStorage.getItem('labcharts-ppq-model') || 'claude-sonnet-4.6'; }
export function setPpqModel(model) {
  localStorage.setItem('labcharts-ppq-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function getPpqModelDisplay() {
  const id = getPpqModel();
  let cached = []; try { cached = JSON.parse(localStorage.getItem('labcharts-ppq-models') || '[]'); } catch(e) {}
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
export function getPpqCreditId() { return localStorage.getItem('labcharts-ppq-credit-id') || ''; }
export function savePpqCreditId(id) {
  localStorage.setItem('labcharts-ppq-credit-id', id);
  markAISettingsLocal();
}

// ─── Custom API (any OpenAI-compatible endpoint) ───
export function getCustomApiUrl() { return localStorage.getItem('labcharts-custom-url') || ''; }
export function setCustomApiUrl(url) {
  localStorage.setItem('labcharts-custom-url', url);
  markAISettingsLocal();
}
export function getCustomApiKey() { return getCachedKey('labcharts-custom-key') || ''; }
export async function saveCustomApiKey(key) { await encryptedSetItem('labcharts-custom-key', key); updateKeyCache('labcharts-custom-key', key); markAISettingsLocal(); }
export function hasCustomApiKey() { return !!getCustomApiKey(); }
export function getCustomApiModel() { return localStorage.getItem('labcharts-custom-model') || ''; }
export function setCustomApiModel(model) {
  localStorage.setItem('labcharts-custom-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function getCustomApiModelDisplay() {
  const id = getCustomApiModel();
  if (!id) return '(no model selected)';
  let cached = []; try { cached = JSON.parse(localStorage.getItem('labcharts-custom-models') || '[]'); } catch(e) {}
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
export function getOpenRouterModel() {
  let m = localStorage.getItem('labcharts-openrouter-model');
  // Fix legacy hyphenated IDs (OpenRouter uses dots: anthropic/claude-sonnet-4.6)
  if (m === 'anthropic/claude-sonnet-4-6') { m = 'anthropic/claude-sonnet-4.6'; localStorage.setItem('labcharts-openrouter-model', m); }
  return m || 'anthropic/claude-sonnet-4.6';
}
export function setOpenRouterModel(model) {
  localStorage.setItem('labcharts-openrouter-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function getOpenRouterModelDisplay() {
  const id = getOpenRouterModel();
  let cached = []; try { cached = JSON.parse(localStorage.getItem('labcharts-openrouter-models') || '[]'); } catch(e) {}
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}

// ─── OpenRouter OAuth PKCE ───
export async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { codeVerifier, codeChallenge };
}

function _generateOAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startOpenRouterOAuth() {
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = _generateOAuthState();
  const previousProvider = sessionStorage.getItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY) || getAIProvider();
  if (_isValidAIProvider(previousProvider)) sessionStorage.setItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY, previousProvider);
  sessionStorage.setItem('or_pkce_verifier', codeVerifier);
  sessionStorage.setItem('or_oauth_state', state);
  const callbackUrl = window.location.origin + window.location.pathname;
  // PKCE verifier-mismatch alone catches code-injection but not login-CSRF;
  // `state` binds the redirect to the tab that initiated it.
  window.location.href = 'https://openrouter.ai/auth?callback_url=' + encodeURIComponent(callbackUrl) + '&code_challenge=' + encodeURIComponent(codeChallenge) + '&code_challenge_method=S256&state=' + encodeURIComponent(state);
}

export function rememberOpenRouterOAuthPreviousProvider(provider = getAIProvider()) {
  if (_isValidAIProvider(provider)) sessionStorage.setItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY, provider);
}

export function restoreOpenRouterOAuthPreviousProvider() {
  const previousProvider = sessionStorage.getItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY);
  sessionStorage.removeItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY);
  if (_isValidAIProvider(previousProvider)) setAIProvider(previousProvider);
}

export function clearOpenRouterOAuthSession() {
  sessionStorage.removeItem('or_pkce_verifier');
  sessionStorage.removeItem('or_oauth_state');
  sessionStorage.removeItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY);
}

export function hasPendingOpenRouterOAuthSession() {
  return !!(
    sessionStorage.getItem('or_pkce_verifier')
    || sessionStorage.getItem('or_oauth_state')
    || sessionStorage.getItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY)
  );
}

export function markOpenRouterOAuthSettingsLocal() {
  markAISettingsLocal();
  sessionStorage.setItem(OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY, String(Date.now() + 5 * 60 * 1000));
}

export async function exchangeOpenRouterCode(code, returnedState) {
  const codeVerifier = sessionStorage.getItem('or_pkce_verifier');
  const expectedState = sessionStorage.getItem('or_oauth_state');
  if (!codeVerifier) throw new Error('Missing PKCE verifier. Please try connecting again.');
  // Some OAuth flows omit `state` on the way back; reject the exchange in
  // that case rather than fail-open. If the user started before this state
  // check existed, expectedState will also be null — that branch is safe to
  // accept (the verifier still binds the request).
  if (expectedState && returnedState !== expectedState) {
    sessionStorage.removeItem('or_pkce_verifier');
    sessionStorage.removeItem('or_oauth_state');
    throw new Error('OAuth state mismatch — please try connecting again.');
  }
  const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'getbased'
    },
    body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: 'S256' })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error?.message || errBody?.message || `OpenRouter auth failed (${res.status})`);
  }
  const data = await res.json();
  sessionStorage.removeItem('or_pkce_verifier');
  sessionStorage.removeItem('or_oauth_state');
  return data.key;
}
// Curated: latest-gen medically capable models only (prefixes matched against IDs)
const OPENROUTER_CURATED = [
  'anthropic/claude-sonnet-4', 'anthropic/claude-opus-4',
  'openai/gpt-5',
  'google/gemini-3', 'google/gemini-2',
  'deepseek/deepseek',
  'qwen/qwen', 'qwen/qwq',
  'x-ai/grok',
];
// ─── Recommended models for medical analysis ───
// Update when a new generation launches. Each provider uses different ID formats:
//   OpenRouter: "provider/model-version"  (dots: 4.6)
//   Anthropic:  "claude-model-version"    (hyphens: 4-6, with date suffix)
//   Venice:     "model-version"           (hyphens: 4-6, no provider prefix)
// To check current IDs, run in console:
//   JSON.parse(localStorage.getItem('labcharts-openrouter-models')||'[]').map(m=>m.id)
const OPENROUTER_RECOMMENDED = [
  'anthropic/claude-sonnet-4.6', 'anthropic/claude-opus-4.7',
  'openai/gpt-5.5', 'openai/gpt-5.4',
  'google/gemini-3.1-pro',
  'x-ai/grok-4',
];
// Routstr uses bare model IDs (no provider prefix, dots: claude-sonnet-4.6)
const ROUTSTR_CURATED = ['claude-', 'gpt-5', 'gpt-4', 'gemini-3', 'gemini-2', 'grok-4', 'grok-3', 'llama-', 'qwen', 'deepseek-', 'mistral-', 'mimo-'];
const ROUTSTR_RECOMMENDED = ['claude-sonnet-4.6', 'claude-opus-4.7', 'gpt-5.5', 'gpt-5.4', 'gemini-3.1-pro', 'grok-4'];
// PPQ uses bare model IDs (same as Routstr)
// private/ models (Tinfoil TEE) listed in API but require EHBP protocol, not standard completions
const PPQ_CURATED = ['claude-', 'gpt-5', 'gpt-4', 'gpt-oss', 'gemini-3', 'gemini-2', 'grok-', 'llama-', 'qwen', 'deepseek-', 'mistral-', 'kimi', 'perplexity'];
const PPQ_RECOMMENDED = ['claude-sonnet-4.6', 'claude-opus-4.7', 'gpt-5.5', 'gpt-5.4', 'gemini-3-flash-preview', 'grok-4'];
const PPQ_EXCLUDE = ['codex', 'audio', 'image', 'embed', 'tts', 'whisper', 'video', 'nano-banana'];
export function isRecommendedModel(provider, modelId) {
  if (provider === 'openrouter') return OPENROUTER_RECOMMENDED.some(function(prefix) { return modelId.startsWith(prefix); });
  if (provider === 'venice') {
    if (modelId.startsWith('e2ee-')) return /qwen3-5-122b|gpt-oss-120b|qwen3-30b|glm-5/.test(modelId);
    // claude-(sonnet-4-6|opus-4-7) is intentionally narrow — Anthropic ships
    // each model as its own version. When sonnet-4-7 / opus-4-8 land, broaden
    // the alternation rather than back to (sonnet|opus)-4-X (would over-match
    // older versions). gpt-5[2345] tracks 5.2/5.3/5.4/5.5 — extend digits as
    // OpenAI ships new minor versions.
    return /^(claude-(sonnet-4-6|opus-4-7)|openai-gpt-5[2345](-codex)?|gemini-3(-1)?-pro|grok-4[1-9]?)(-|$)/.test(modelId);
  }
  if (provider === 'routstr') return ROUTSTR_RECOMMENDED.some(function(r) { return modelId === r || modelId.startsWith(r); });
  if (provider === 'ppq') return PPQ_RECOMMENDED.some(function(r) { return modelId === r || modelId.startsWith(r); });
  return false; // Ollama — local models, can't tier
}
export function getActiveModelId(provider = getAIProvider()) {
  if (provider === 'venice') return getVeniceModel();
  if (provider === 'openrouter') return getOpenRouterModel();
  if (provider === 'routstr') return getRoutstrModel();
  if (provider === 'ppq') return getPpqModel();
  if (provider === 'custom') return getCustomApiModel();
  return getOllamaMainModel();
}
export function getActiveModelDisplay(provider = getAIProvider()) {
  if (provider === 'venice') return getVeniceModelDisplay();
  if (provider === 'openrouter') return getOpenRouterModelDisplay();
  if (provider === 'routstr') return getRoutstrModelDisplay();
  if (provider === 'ppq') return getPpqModelDisplay();
  if (provider === 'custom') return getCustomApiModelDisplay();
  return getOllamaMainModel();
}
// Exclude specialized variants not suited for medical analysis
const OPENROUTER_EXCLUDE = ['codex', 'audio', 'image', 'oss', 'safeguard', 'coder'];
export async function fetchOpenRouterModels(key) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + (key || getOpenRouterKey()) }
    });
    if (!res.ok) return [];
    const json = await res.json();
    // Filter to curated medically capable models, exclude specialized variants
    const all = (json.data || []).filter(function(m) {
      if (!m.id) return false;
      if (OPENROUTER_EXCLUDE.some(function(ex) { return m.id.includes(ex); })) return false;
      return OPENROUTER_CURATED.some(function(prefix) { return m.id.startsWith(prefix); });
    }).sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    // Deduplicate: strip date/size suffixes after provider/ prefix
    const models = deduplicateModels(all, function(id) {
      return id.replace(/:\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '');
    });
    // Sort recommended models first, then alphabetical within each group
    models.sort(function(a, b) {
      const aRec = OPENROUTER_RECOMMENDED.some(function(p) { return a.id.startsWith(p); });
      const bRec = OPENROUTER_RECOMMENDED.some(function(p) { return b.id.startsWith(p); });
      if (aRec !== bRec) return aRec ? -1 : 1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
    // Extract per-million-token pricing from API response
    const pricingCache = {};
    for (const m of models) {
      if (m.pricing && m.pricing.prompt && m.pricing.completion) {
        pricingCache[m.id] = {
          input: parseFloat(m.pricing.prompt) * 1_000_000,
          output: parseFloat(m.pricing.completion) * 1_000_000
        };
      }
    }
    localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify(pricingCache));
    // Cache vision-capable model IDs (architecture.modality contains "image->text" or similar)
    const visionIds = (json.data || []).filter(function(m) {
      if (!m.id || !m.architecture) return false;
      const modality = m.architecture.modality || '';
      return modality.includes('image');
    }).map(function(m) { return m.id; });
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(models));
    if (!localStorage.getItem('labcharts-openrouter-model') && models.length) {
      const claude = models.find(function(m) { return m.id === 'anthropic/claude-sonnet-4.6'; });
      if (claude) setOpenRouterModel(claude.id);
    }
    return models;
  } catch (e) { return []; }
}
export function getOpenRouterPricing(modelId) {
  let cached = {}; try { cached = JSON.parse(localStorage.getItem('labcharts-openrouter-pricing') || '{}'); } catch(e) {}
  return cached[modelId] || null;
}
/** Fetch and cache pricing for a custom OpenRouter model not in the curated list */
export async function fetchOpenRouterModelPricing(modelId) {
  if (!modelId) return null;
  const existing = getOpenRouterPricing(modelId);
  if (existing) return existing;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + getOpenRouterKey() }
    });
    if (!res.ok) return null;
    const json = await res.json();
    // Exact match first, then fuzzy (dots vs dashes, date suffixes)
    const norm = s => s.replace(/\./g, '-').replace(/-\d{8}$/, '');
    const model = (json.data || []).find(m => m.id === modelId)
      || (json.data || []).find(m => norm(m.id) === norm(modelId));
    if (!model?.pricing) return null;
    const pricing = {
      input: parseFloat(model.pricing.prompt || '0') * 1_000_000,
      output: parseFloat(model.pricing.completion || '0') * 1_000_000
    };
    const cached = JSON.parse(localStorage.getItem('labcharts-openrouter-pricing') || '{}');
    // Cache under both the API ID and the user-typed ID
    cached[model.id] = pricing;
    cached[modelId] = pricing;
    localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify(cached));
    return pricing;
  } catch (e) { /* fail silently */ }
  return null;
}

export async function validateOpenRouterKey(key) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (res.ok) return { valid: true };
    if (res.status === 401) return { valid: false, error: 'Invalid API key' };
    if (res.status === 429) return { valid: true };
    const errBody = await res.json().catch(() => null);
    const errMsg = errBody?.error?.message || `status ${res.status}`;
    return { valid: false, error: `API error: ${errMsg}` };
  } catch (e) {
    return { valid: false, error: 'Cannot reach OpenRouter API: ' + e.message };
  }
}

export function renderModelPricingHint(provider, modelId) {
  if (provider === 'ollama') return '<span style="font-size:11px;color:var(--green)">Free (local)</span>';
  if (provider === 'custom') return '';
  const p = getModelPricing(provider, modelId);
  if (p.input === 0 && p.output === 0) return '<span style="font-size:11px;color:var(--green)">Free</span>';
  const pre = p.approx ? '~' : '';
  return `<span style="font-size:11px;color:var(--text-muted)">${pre}$${p.input.toFixed(2)}/M in \u00b7 ${pre}$${p.output.toFixed(2)}/M out</span>`;
}
export async function fetchVeniceModels(key) {
  try {
    const res = await fetch('https://api.venice.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + (key || getVeniceKey()) }
    });
    if (!res.ok) return [];
    const json = await res.json();
    // Sort descending so latest version comes first per family
    const allText = (json.data || []).filter(function(m) { return m.id && m.type === 'text'; }).sort(function(a, b) { return b.id.localeCompare(a.id); });
    // Cache E2EE models separately. The capability flag is authoritative;
    // keep a prefix fallback for older Venice responses that did not include it.
    const e2eeList = allText.filter(modelSupportsVeniceE2EE);
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify(e2eeList));
    const e2eeIds = new Set(e2eeList.map(function(m) { return m.id; }));
    const all = allText.filter(function(m) { return !e2eeIds.has(m.id) && !m.id.startsWith('e2ee-'); });
    // Deduplicate: Venice curates Claude models (no date-stamped variants), so keep all.
    // For others, strip size/date suffixes to collapse duplicates.
    const models = deduplicateModels(all, function(id) {
      if (id.startsWith('claude-')) return id;
      return id.replace(/-\d{8}$/, '').replace(/-\d+[bB]$/, '');
    });
    // Re-sort alphabetically by display name
    models.sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    // Extract per-million-token pricing from model_spec
    const pricingCache = {};
    for (const m of allText) {
      const p = m.model_spec && m.model_spec.pricing;
      if (p && p.input && p.output) {
        pricingCache[m.id] = { input: parseFloat(p.input.usd || 0), output: parseFloat(p.output.usd || 0) };
      }
    }
    localStorage.setItem('labcharts-venice-pricing', JSON.stringify(pricingCache));
    const visionIds = allText.filter(m => m.model_spec?.capabilities?.supportsVision).map(m => m.id);
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-venice-models', JSON.stringify(models));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    syncVeniceModelSelection(models, e2eeList);
    return models;
  } catch (e) { return []; }
}

// ─── Proxy support ───
// Only Custom API needs the proxy (arbitrary endpoints may lack CORS headers).
// Known providers (Venice, OpenRouter, Routstr, PPQ, Local AI) all set CORS headers,
// so we call them directly — avoids Vercel's 30s Edge Function timeout on hosted site.
function _useProxy() {
  if (getAIProvider() === 'custom') {
    try { const u = new URL(getCustomApiUrl()); return !['localhost', '127.0.0.1'].includes(u.hostname) && !u.hostname.startsWith('192.168.'); } catch { return false; }
  }
  return false;
}

const _proxyFetch = createProxyFetch(_useProxy);
async function _fetchWithRetry(url, options, retries = 2, useProxy = true, requestTimeoutMs = FETCH_REQUEST_TIMEOUT_MS) {
  return fetchWithRetry(url, options, {
    retries,
    useProxy,
    requestTimeoutMs,
    proxyFetch: _proxyFetch,
    directFetch: fetch,
    debug: isDebugMode,
  });
}

// ═══════════════════════════════════════════════
// WEB SEARCH SUPPORT
// ═══════════════════════════════════════════════
export function supportsWebSearch(provider = getAIProvider()) {
  if (provider === 'venice') return !isVeniceE2EEActive();
  if (provider === 'routstr') return false;
  if (provider === 'ppq') return true;
  if (provider === 'custom') return false;
  return provider === 'openrouter';
}

export function isE2EEModel(modelId) {
  if (typeof modelId !== 'string') return false;
  const e2eeModels = readStoredArray('labcharts-venice-e2ee-models');
  if (veniceE2EEModelsCacheKnown()) return modelListHasId(e2eeModels, modelId);
  return modelId.startsWith('e2ee-');
}

// Is Venice E2EE currently active?
export function isVeniceE2EEActive() {
  return isE2EEModel(getVeniceModel());
}

// ═══════════════════════════════════════════════
// VISION SUPPORT
// ═══════════════════════════════════════════════
export function supportsVision() {
  const provider = getAIProvider();
  if (provider === 'openrouter') {
    const modelId = getOpenRouterModel();
    try {
      const visionIds = JSON.parse(localStorage.getItem('labcharts-openrouter-vision-models') || '[]');
      // Check exact match or prefix match (model IDs may have date suffixes)
      return visionIds.some(function(vid) { return modelId === vid || modelId.startsWith(vid.replace(/:\d{4}-\d{2}-\d{2}$/, '')); });
    } catch { return false; }
  }
  if (provider === 'venice') {
    if (isVeniceE2EEActive()) return false;
    const modelId = getVeniceModel();
    try {
      const visionIds = JSON.parse(localStorage.getItem('labcharts-venice-vision-models') || '[]');
      return visionIds.some(function(vid) { return modelId === vid || modelId.startsWith(vid.replace(/-\d{8}$/, '')); });
    } catch { return false; }
  }
  if (provider === 'routstr') {
    const modelId = getRoutstrModel();
    try {
      const visionIds = JSON.parse(localStorage.getItem('labcharts-routstr-vision-models') || '[]');
      return visionIds.some(function(vid) { return modelId === vid || modelId.startsWith(vid.replace(/-\d{8}$/, '')); });
    } catch { return false; }
  }
  if (provider === 'ppq') {
    const modelId = getPpqModel();
    try {
      const visionIds = JSON.parse(localStorage.getItem('labcharts-ppq-vision-models') || '[]');
      return visionIds.some(function(vid) { return modelId === vid || modelId.startsWith(vid.replace(/-\d{8}$/, '')); });
    } catch { return false; }
  }
  // Custom API / Local AI — optimistic (user's responsibility)
  if (provider === 'custom') return true;
  return true;
}

export async function callOllamaChat({ system, messages, maxTokens, onStream, signal }) {
  const config = window.getOllamaConfig();
  const model = getOllamaMainModel();
  const ollamaMessages = [];
  if (system) ollamaMessages.push({ role: 'system', content: system });
  for (const msg of messages) {
    // Normalize array content (vision messages) to Ollama's native format
    if (Array.isArray(msg.content)) {
      let text = '';
      const images = [];
      for (const block of msg.content) {
        if (block.type === 'text') text = block.text;
        else if (block.type === 'image' && block.source?.data) images.push(block.source.data);
        else if (block.type === 'image_url' && block.image_url?.url) {
          // Extract base64 from data URL
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (e) {
    if (e instanceof TypeError || /Failed to fetch|Load failed|NetworkError/.test(e.message || '')) {
      const ua = navigator.userAgent || '';
      const hint = /Mac/i.test(ua) ? 'Ollama: launchctl setenv OLLAMA_ORIGINS "*" and restart. LM Studio: Settings \u2192 Enable CORS'
        : /Win/i.test(ua) ? 'Ollama: set OLLAMA_ORIGINS=* as system env var and restart. LM Studio: Settings \u2192 Enable CORS'
        : 'Ollama: OLLAMA_ORIGINS=* ollama serve. LM Studio: Settings \u2192 Enable CORS';
      throw new Error(`Cannot reach local server \u2014 CORS blocked. ${hint}`);
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
    let inputTokens = 0, outputTokens = 0;
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
  } else {
    const data = await res.json();
    return { text: data.message?.content || '', usage: { inputTokens: data.prompt_eval_count || 0, outputTokens: data.eval_count || 0 } };
  }
}

// ═══════════════════════════════════════════════
// SHARED OPENAI-COMPATIBLE API HELPER
// ═══════════════════════════════════════════════
// GPT-5 family + o-series reasoning models reject `max_tokens` and require `max_completion_tokens`.
// Matches bare ids (gpt-5.4, o1-mini) and provider-prefixed (openai/gpt-5, openai/o3).
export function needsMaxCompletionTokens(modelId) {
  if (!modelId) return false;
  const id = String(modelId).toLowerCase();
  const bare = id.includes('/') ? id.split('/').pop() : id;
  return /^(gpt-5|o[1-9])([-.]|$)/.test(bare);
}

async function callOpenAICompatibleAPI(endpoint, key, model, providerName, { system, messages, maxTokens, onStream, signal, requestTimeoutMs }, extraHeaders = {}, { useProxy = true, extraBody = {} } = {}) {
  const apiMessages = [];
  if (system) apiMessages.push({ role: 'system', content: system });
  for (const msg of messages) apiMessages.push({ role: msg.role, content: msg.content });

  // Thinking models burn reasoning tokens against max_tokens — scale up low caps
  // to give room for thinking while still constraining total output
  const isThinkingModel = /deepseek-r1|kimi-k|qwq|glm-[45]|claude-.*sonnet|claude-.*opus|:cloud/.test(model);
  const effectiveMaxTokens = isThinkingModel
    ? Math.max(maxTokens || 4096, 16384)  // thinking models burn reasoning against max_tokens; give real headroom
    : (maxTokens || 4096);
  const tokenLimitField = needsMaxCompletionTokens(model) ? 'max_completion_tokens' : 'max_tokens';
  const body = { model, messages: apiMessages, [tokenLimitField]: effectiveMaxTokens || 4096, ...extraBody };
  if (onStream) { body.stream = true; body.stream_options = { include_usage: true }; }

  let res;
  try {
    res = await _fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        ...extraHeaders
      },
      body: JSON.stringify(body),
      signal
    }, 2, useProxy, requestTimeoutMs);
  } catch (e) {
    throw new Error(`Cannot reach ${providerName} API: ${e.message}`);
  }

  if (!res.ok) {
    if (res.status === 401) {
      // Some endpoints (e.g. OpenCode Go) return 401 for non-auth errors — check error body
      let errType = '';
      try { const b = await res.clone().json(); errType = b?.error?.type || ''; } catch {}
      if (!errType || errType === 'AuthError' || errType === 'authentication_error')
        throw new Error(`Invalid ${providerName} API key. Check your settings.`);
      throw new Error(`${providerName} API error: ${errType}`);
    }
    if (res.status === 402) {
      const hint = providerName === 'Routstr' ? ' Top up with Lightning or Cashu.'
        : providerName === 'PPQ' ? ' Top up in Settings \u2192 AI \u2192 PPQ.'
        : ' Add credits at openrouter.ai/settings/credits';
      // OpenRouter gets a persistent dialog with an actionable
      // "add credits" link. The thrown error still propagates so
      // callers abort their in-flight request, but we tag the error
      // with _modalShown so chat.js suppresses its inline red-error
      // line — otherwise the user sees the modal AND a duplicate
      // inline error for the same condition (Greptile #192 review).
      const modalShown = providerName === 'OpenRouter'
        && typeof window !== 'undefined'
        && !!window.showInsufficientBalanceDialog;
      if (modalShown) {
        try { window.showInsufficientBalanceDialog(); } catch {}
      }
      const balanceErr = new Error(`Insufficient ${providerName} balance.${hint}`);
      if (modalShown) balanceErr._modalShown = true;
      throw balanceErr;
    }
    if (res.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
    let errMsg = `${providerName} API error (${res.status})`;
    try { const errBody = await res.json(); errMsg += `: ${errBody.error?.message || JSON.stringify(errBody.error)}`; } catch {}
    throw new Error(errMsg);
  }

  if (onStream) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let _hasContent = false;
    let _reasoningBuf = '';
    let finishReason = null;
    let inputTokens = 0, outputTokens = 0;
    // Local helper so the trailing-buffer pass after the loop and the in-loop
    // line iteration share identical handling. `boundary` is true while the
    // event came from a chunk split (incomplete trailing line should be
    // re-buffered); false on the post-loop flush where we've seen `done`.
    const handleSSELine = (line, boundary) => {
      if (!line.startsWith('data: ')) return;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const event = JSON.parse(data);
        if (event.error) throw new Error(event.error.message || JSON.stringify(event.error));
        const choice = event.choices?.[0];
        const delta = choice?.delta;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        else if (choice?.native_finish_reason) finishReason = choice.native_finish_reason;
        if (delta?.content) {
          if (!_hasContent) _hasContent = true;
          fullText += delta.content;
          onStream(fullText);
        } else if (delta?.reasoning_content) {
          if (!_hasContent) _reasoningBuf += delta.reasoning_content;
        }
        if (event.usage) {
          inputTokens = event.usage.prompt_tokens || inputTokens;
          outputTokens = event.usage.completion_tokens || outputTokens;
        }
      } catch (parseErr) {
        // SyntaxError on a chunk-boundary line is expected (the JSON
        // continues in the next chunk). Anything else — including
        // SyntaxError after the stream is done, when the chunk really did
        // arrive truncated — is a real error worth surfacing.
        if (boundary && parseErr instanceof SyntaxError) return;
        throw parseErr;
      }
    };
    // Cap the unfinished-line buffer at 4 MB so a malicious / broken provider
    // streaming megabytes without a newline can't OOM the tab. Real SSE lines
    // are always tiny — providers chunk by token boundary, not line boundary.
    // Crossing this cap means either the upstream is misbehaving or someone
    // is trying to wedge us; fail loud rather than swelling indefinitely.
    const MAX_SSE_BUFFER = 4 * 1024 * 1024;
    while (true) {
      const { done, value } = await readWithStallTimeout(reader, `${providerName} stream`);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_SSE_BUFFER) {
        try { reader.cancel(); } catch {}
        throw new Error(`${providerName} stream exceeded ${MAX_SSE_BUFFER} bytes without a newline — aborting.`);
      }
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) handleSSELine(line, true);
    }
    // Flush trailing buffer: a final `data: ...` event without a closing
    // newline (e.g. server truncation) would otherwise be silently dropped.
    if (buffer.startsWith('data: ')) handleSSELine(buffer, false);
    if (!fullText && _reasoningBuf) fullText = _reasoningBuf;
    return { text: fullText, usage: { inputTokens, outputTokens }, finishReason, truncated: isTokenLimitFinish(finishReason) };
  } else {
    const data = await res.json();
    const usage = data.usage || {};
    const choice = data.choices?.[0];
    const msg = choice?.message;
    let text = msg?.content || '';
    // If content is empty, fall back to reasoning but strip thinking tags
    if (!text && msg?.reasoning_content) text = msg.reasoning_content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const finishReason = choice?.finish_reason || choice?.native_finish_reason || null;
    return { text, usage: { inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 }, finishReason, truncated: isTokenLimitFinish(finishReason) };
  }
}

export async function callOpenAICompatibleLocalAPI(opts) {
  const config = window.getOllamaConfig();
  const model = getOllamaMainModel();
  const url = config.url.replace(/\/+$/, '');
  const key = config.apiKey || 'not-needed';
  return callOpenAICompatibleAPI(`${url}/v1/chat/completions`, key, model, 'Local AI', opts, {}, { useProxy: false });
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

  // ── E2EE path ──
  if (!crypto?.subtle) throw new Error('E2EE requires a secure context (HTTPS). Cannot encrypt on this page.');
  const { createVeniceE2EE, encryptMessage, decryptChunk } = await import('../vendor/venice-e2ee.js');
  if (!window._veniceE2EE || window._veniceE2EEKey !== key) {
    window._veniceE2EE = createVeniceE2EE({ apiKey: key });
    window._veniceE2EEKey = key;
    window.clearE2EESession = () => window._veniceE2EE?.clearSession();
  }
  let session;
  try { session = await window._veniceE2EE.createSession(modelId); }
  catch (e) { throw new Error(`Venice E2EE setup failed: ${e.message}`); }
  window._veniceAttestation = session.attestation ?? window._veniceAttestation ?? null;
  // Refresh header lock indicator now that attestation is available
  document.querySelector('.chat-header-model')?.dispatchEvent(new CustomEvent('e2ee-attestation'));

  const _contentStr = (c) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('') : String(c);
  const { system, messages, maxTokens, onStream, signal, forceNonStream, requestTimeoutMs } = opts;
  const apiMessages = [];
  if (system) apiMessages.push({ role: 'system', content: await encryptMessage(session.aesKey, session.publicKey, system) });
  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: await encryptMessage(session.aesKey, session.publicKey, _contentStr(msg.content)) });
  }

  const useStream = !forceNonStream;
  const body = { model: modelId, messages: apiMessages, max_tokens: maxTokens || 4096, stream: useStream };
  if (useStream) body.stream_options = { include_usage: true };
  let res;
  try {
    res = await _fetchWithRetry('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`,
        'X-Venice-TEE-Client-Pub-Key': session.pubKeyHex,
        'X-Venice-TEE-Model-Pub-Key': session.modelPubKeyHex,
        'X-Venice-TEE-Signing-Algo': 'ecdsa' },
      body: JSON.stringify(body), signal
    }, 2, true, requestTimeoutMs);
  } catch (e) { throw new Error(`Cannot reach Venice API: ${e.message}`); }

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

  // Streaming with per-chunk decryption
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', fullText = '', inputTokens = 0, outputTokens = 0, finishReason = null;
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
      if (event.usage) { inputTokens = event.usage.prompt_tokens || inputTokens; outputTokens = event.usage.completion_tokens || outputTokens; }
    } catch (e) {
      if (e.name === 'OperationError') throw new Error('E2EE decryption failed — session may be stale. Try sending again.');
      // Chunk-boundary SyntaxError is normal; let everything else surface.
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

export async function callOpenRouterAPI(opts) {
  const key = getOpenRouterKey();
  if (!key) throw new Error('No OpenRouter API key configured. Add your key in Settings.');
  const extraBody = opts.webSearch ? { plugins: [{ id: 'web' }] } : {};
  return callOpenAICompatibleAPI(
    'https://openrouter.ai/api/v1/chat/completions',
    key, getOpenRouterModel(), 'OpenRouter', opts,
    { 'HTTP-Referer': window.location.origin, 'X-Title': 'getbased' },
    { extraBody }
  );
}

export async function validateVeniceKey(key) {
  try {
    const res = await fetch('https://api.venice.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (res.ok) return { valid: true };
    if (res.status === 401) return { valid: false, error: 'Invalid API key' };
    if (res.status === 429) return { valid: true };
    const errBody = await res.json().catch(() => null);
    const errMsg = errBody?.error?.message || `status ${res.status}`;
    return { valid: false, error: `API error: ${errMsg}` };
  } catch (e) {
    return { valid: false, error: 'Cannot reach Venice API: ' + e.message };
  }
}

// ═══════════════════════════════════════════════
// ROUTSTR (Bitcoin eCash micropayments, OpenAI-compatible)
// ═══════════════════════════════════════════════
const ROUTSTR_EXCLUDE = ['codex', 'audio', 'image', 'oss', 'safeguard', 'coder', 'embed', 'tts', 'whisper', 'beta', 'preview', 'free', 'gratis'];
export async function fetchRoutstrModels() {
  try {
    const nodeUrl = _requireNodeUrl();
    const res = await fetch(nodeUrl + '/v1/models');
    if (!res.ok) return [];
    const json = await res.json();
    const all = (json.data || []).filter(function(m) {
      if (!m.id || !m.enabled) return false;
      if (ROUTSTR_EXCLUDE.some(function(ex) { return m.id.includes(ex); })) return false;
      return ROUTSTR_CURATED.some(function(prefix) { return m.id.startsWith(prefix); });
    }).sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    const models = deduplicateModels(all, function(id) {
      return id.replace(/-\d{8}$/, '');
    });
    models.sort(function(a, b) {
      const aRec = ROUTSTR_RECOMMENDED.some(function(r) { return a.id === r || a.id.startsWith(r); });
      const bRec = ROUTSTR_RECOMMENDED.some(function(r) { return b.id === r || b.id.startsWith(r); });
      if (aRec !== bRec) return aRec ? -1 : 1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
    const pricingCache = {};
    for (const m of models) {
      if (m.pricing && m.pricing.prompt && m.pricing.completion) {
        pricingCache[m.id] = { input: parseFloat(m.pricing.prompt) * 1_000_000, output: parseFloat(m.pricing.completion) * 1_000_000 };
      }
    }
    localStorage.setItem('labcharts-routstr-pricing', JSON.stringify(pricingCache));
    const visionIds = (json.data || []).filter(function(m) {
      if (!m.id || !m.architecture) return false;
      return (m.architecture.modality || '').includes('image') || (m.architecture.input_modalities || []).includes('image');
    }).map(function(m) { return m.id; });
    localStorage.setItem('labcharts-routstr-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-routstr-models', JSON.stringify(models));
    if (!localStorage.getItem('labcharts-routstr-model') && models.length) {
      const claude = models.find(function(m) { return m.id === 'claude-sonnet-4.6'; });
      if (claude) setRoutstrModel(claude.id);
    }
    return models;
  } catch (e) { return []; }
}
export async function validateRoutstrKey(key) {
  // Routstr uses Cashu tokens or session keys — format check, then save optimistically.
  // Models endpoint is public (no auth), so we can't validate keys via model fetch.
  // Actual auth errors (401/402) surface when the user sends a message.
  if (key.startsWith('cashu:')) key = key.slice(6); // strip URI prefix
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
  if (!url) throw new Error('No Routstr node selected. Pick a node in Settings → Routstr.');
  return url.replace(/\/$/, '');
}
export async function callRoutstrAPI(opts) {
  const key = getRoutstrKey();
  if (!key) throw new Error('No Routstr key configured. Fund your wallet and connect to a node in Settings.');
  const nodeUrl = _requireNodeUrl();
  return callOpenAICompatibleAPI(
    nodeUrl + '/v1/chat/completions',
    key, getRoutstrModel(), 'Routstr', opts
  );
}

// ─── Routstr wallet ───
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
  return res.json(); // { api_key, balance, ... }
}
export async function getRoutstrBalance() {
  const key = getRoutstrKey();
  if (!key) return null;
  try {
    const res = await fetch(_requireNodeUrl() + '/v1/balance/info', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!res.ok) return null;
    const json = await res.json();
    // balance is in millisatoshis — convert to sats
    if (json.balance != null) return { sats: Math.floor(json.balance / 1000), msats: json.balance, totalRequests: json.total_requests || 0, totalSpent: json.total_spent || 0 };
    return null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════
// PPQ (PayPerQ — pay-per-prompt, crypto + fiat, OpenAI-compatible)
// ═══════════════════════════════════════════════
export async function createPpqAccount() {
  const res = await fetch('https://api.ppq.ai/accounts/create', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create PPQ account: ' + res.status);
  return res.json(); // { success, credit_id, api_key, balance }
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
      method: 'POST', headers, body
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.balance != null ? json.balance : null;
  } catch { return null; }
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
  return res.json(); // { invoice_id, amount, lightning_invoice, checkout_url, expires_at }
}
export async function checkPpqTopupStatus(invoiceId) {
  const key = getPpqKey();
  const res = await fetch('https://api.ppq.ai/topup/status/' + encodeURIComponent(invoiceId), {
    headers: key ? { 'Authorization': 'Bearer ' + key } : {}
  });
  if (!res.ok) return null;
  return res.json(); // { status: 'pending'|'paid'|'expired', ... }
}
export async function fetchPpqModels(key) {
  try {
    const headers = {};
    if (key || getPpqKey()) headers['Authorization'] = 'Bearer ' + (key || getPpqKey());
    const res = await fetch('https://api.ppq.ai/v1/models?type=chat', { headers });
    if (!res.ok) return [];
    const json = await res.json();
    const all = (json.data || []).filter(function(m) {
      if (!m.id) return false;
      if (PPQ_EXCLUDE.some(function(ex) { return m.id.includes(ex); })) return false;
      return PPQ_CURATED.some(function(prefix) { return m.id.startsWith(prefix); });
    }).sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    const models = deduplicateModels(all, function(id) {
      return id.replace(/-\d{8}$/, '');
    });
    models.sort(function(a, b) {
      const aRec = PPQ_RECOMMENDED.some(function(r) { return a.id === r || a.id.startsWith(r); });
      const bRec = PPQ_RECOMMENDED.some(function(r) { return b.id === r || b.id.startsWith(r); });
      if (aRec !== bRec) return aRec ? -1 : 1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
    const pricingCache = {};
    for (const m of models) {
      if (m.pricing) {
        const inp = parseFloat(m.pricing.input_per_1M_tokens || m.pricing.prompt || '0');
        const out = parseFloat(m.pricing.output_per_1M_tokens || m.pricing.completion || '0');
        // PPQ pricing may be per-token (large numbers) or per-million (small). Threshold 1000 avoids misclassifying $100-999/M models
        if (inp || out) pricingCache[m.id] = { input: inp > 1000 ? inp / 1_000_000 : inp, output: out > 1000 ? out / 1_000_000 : out };
      }
    }
    localStorage.setItem('labcharts-ppq-pricing', JSON.stringify(pricingCache));
    const visionIds = (json.data || []).filter(function(m) {
      if (!m.id || !m.architecture) return false;
      const modality = m.architecture.modality || '';
      const inputMods = m.architecture.input_modalities || [];
      return modality.includes('image') || inputMods.includes('image');
    }).map(function(m) { return m.id; });
    localStorage.setItem('labcharts-ppq-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-ppq-models', JSON.stringify(models));
    if (!localStorage.getItem('labcharts-ppq-model') && models.length) {
      const claude = models.find(function(m) { return m.id === 'claude-sonnet-4.6'; });
      if (claude) setPpqModel(claude.id);
    }
    return models;
  } catch (e) { return []; }
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
    return { valid: false, error: 'Cannot reach PPQ API: ' + e.message };
  }
}
export async function callPpqAPI(opts) {
  const key = getPpqKey();
  if (!key) throw new Error('No PPQ API key configured. Create an account or add your key in Settings.');
  const extraBody = opts.webSearch ? { plugins: [{ id: 'web' }] } : {};
  return callOpenAICompatibleAPI(
    'https://api.ppq.ai/chat/completions',
    key, getPpqModel(), 'PPQ', opts,
    {},
    { extraBody }
  );
}

// ─── Custom API ───
// Proxy-aware GET for fetching models from custom endpoints (CORS bypass on hosted version)
function _customApiFetchModels(url, key) {
  if (_useProxy()) {
    return fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method: 'GET', headers: { 'Authorization': 'Bearer ' + key } }),
    });
  }
  return fetch(url, { headers: { 'Authorization': 'Bearer ' + key } });
}
export async function fetchCustomApiModels(baseUrl, key) {
  try {
    const url = (baseUrl || getCustomApiUrl()).replace(/\/+$/, '');
    const k = key || getCustomApiKey();
    if (!url || !k) return [];
    let res = await _customApiFetchModels(url + '/models', k);
    // If /models not found, try parent path (e.g. /zen/go/v1 → /zen/v1)
    if (!res.ok && res.status === 404) {
      const parent = url.replace(/\/[^/]+\/v\d+$/, '/v1');
      if (parent !== url) res = await _customApiFetchModels(parent + '/models', k);
    }
    if (!res.ok) return [];
    const json = await res.json();
    const models = (json.data || []).filter(function(m) { return m.id; }).map(function(m) {
      return { id: m.id, name: m.name || m.id };
    }).sort(function(a, b) { return a.name.localeCompare(b.name); });
    localStorage.setItem('labcharts-custom-models', JSON.stringify(models));
    if (!getCustomApiModel() && models.length) setCustomApiModel(models[0].id);
    return models;
  } catch (e) { return []; }
}
export async function validateCustomApiKey(baseUrl, key) {
  try {
    const url = baseUrl.replace(/\/+$/, '');
    const res = await _customApiFetchModels(url + '/models', key);
    let noModels = false;
    if (res.status === 401 || res.status === 403) return { valid: false, error: 'Invalid API key' };
    if (res.status === 404) noModels = true;
    else if (!res.ok) return { valid: false, error: 'Server returned status ' + res.status };
    // Some endpoints (e.g. OpenCode Zen) list models without auth — verify key with a chat probe
    if (res.ok || noModels) {
      const probeBody = JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 });
      const probeOpts = { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, body: probeBody };
      const probe = _useProxy()
        ? await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url + '/chat/completions', headers: { 'Authorization': 'Bearer ' + key }, body: probeBody }) })
        : await fetch(url + '/chat/completions', probeOpts);
      if (probe.status === 401 || probe.status === 403) {
        // Some endpoints return 401 for bad model names too — check error body
        try {
          const errBody = await probe.json();
          const errType = errBody?.error?.type || '';
          if (errType === 'AuthError' || errType === 'authentication_error') return { valid: false, error: 'Invalid API key' };
        } catch {}
        // Non-auth 401 (e.g. ModelError) — key is fine, model was just invalid
      }
    }
    return noModels ? { valid: true, noModels: true } : { valid: true };
  } catch (e) {
    return { valid: false, error: 'Cannot reach endpoint: ' + e.message };
  }
}
export async function callCustomAPI(opts) {
  const baseUrl = getCustomApiUrl().replace(/\/+$/, '');
  const key = getCustomApiKey();
  if (!baseUrl) throw new Error('No Custom API URL configured. Set it in Settings.');
  if (!key) throw new Error('No Custom API key configured. Add your key in Settings.');
  return callOpenAICompatibleAPI(
    baseUrl + '/chat/completions',
    key, getCustomApiModel(), 'Custom', opts,
    {}
  );
}

export async function callClaudeAPI(opts, provider = getAIProvider()) {
  if (provider === 'ollama') return callOpenAICompatibleLocalAPI(opts);
  if (provider === 'venice') return callVeniceAPI(opts);
  if (provider === 'openrouter') return callOpenRouterAPI(opts);
  if (provider === 'routstr') return callRoutstrAPI(opts);
  if (provider === 'ppq') return callPpqAPI(opts);
  if (provider === 'custom') return callCustomAPI(opts);
  // Legacy fallback — should not reach here; all providers handled above
  throw new Error('Unknown AI provider: ' + provider + '. Please select a provider in Settings.');
}

Object.assign(window, {
  getVeniceKey, saveVeniceKey, hasVeniceKey,
  getVeniceModel, setVeniceModel, getVeniceModelDisplay,
  getOpenRouterKey, saveOpenRouterKey, hasOpenRouterKey,
  getOpenRouterModel, setOpenRouterModel, getOpenRouterModelDisplay,
  getRoutstrKey, saveRoutstrKey, hasRoutstrKey,
  getRoutstrModel, setRoutstrModel, getRoutstrModelDisplay, getRoutstrNodeUrl,
  getPpqKey, savePpqKey, hasPpqKey,
  getPpqModel, setPpqModel, getPpqModelDisplay,
  getPpqCreditId, savePpqCreditId,
  getOllamaMainModel, setOllamaMainModel,
  getOllamaPIIUrl, setOllamaPIIUrl,
  getOllamaPIIModel, setOllamaPIIModel,
  getOpenRouterBalance,
  getVeniceBalance,
  fetchVeniceModels, fetchOpenRouterModels, getOpenRouterPricing,
  fetchRoutstrModels, createRoutstrAccount, getRoutstrBalance,
  fetchPpqModels, createPpqAccount, getPpqBalance, createPpqTopup, checkPpqTopupStatus,
  generatePKCE, startOpenRouterOAuth, exchangeOpenRouterCode,
  deduplicateModels,
  isRecommendedModel,
  getActiveModelId, getActiveModelDisplay,
  renderModelPricingHint,
  getAIProvider, setAIProvider, hasAIProvider, markAISettingsLocal,
  supportsVision, supportsWebSearch, isE2EEModel, isVeniceE2EEActive, getVeniceE2EE, setVeniceE2EE,
  validateVeniceKey, validateOpenRouterKey, validateRoutstrKey, validatePpqKey, validateCustomApiKey,
  getCustomApiUrl, setCustomApiUrl, getCustomApiKey, saveCustomApiKey, hasCustomApiKey,
  getCustomApiModel, setCustomApiModel, getCustomApiModelDisplay,
  fetchCustomApiModels, callCustomAPI,
  callOllamaChat, callOpenAICompatibleLocalAPI, callVeniceAPI, callOpenRouterAPI, callRoutstrAPI, callPpqAPI, callClaudeAPI,
  needsMaxCompletionTokens
});
