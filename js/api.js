// api.js — AI provider management, API calls (OpenRouter, Venice, Routstr, PPQ, Local)

import { getModelPricing } from './schema.js';
import { isDebugMode, showNotification } from './utils.js';
import { getCachedKey, updateKeyCache, encryptedSetItem } from './crypto.js';

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
export function getAIProvider() { return localStorage.getItem('labcharts-ai-provider') || 'openrouter'; }
export function setAIProvider(provider) { localStorage.setItem('labcharts-ai-provider', provider); }
export function isAIPaused() { return localStorage.getItem('labcharts-ai-paused') === 'true'; }
export function setAIPaused(v) { localStorage.setItem('labcharts-ai-paused', v ? 'true' : 'false'); }

export function hasAIProvider() {
  if (isAIPaused()) return false;
  const provider = getAIProvider();
  if (provider === 'venice') return hasVeniceKey();
  if (provider === 'openrouter') return hasOpenRouterKey();
  if (provider === 'routstr') return hasRoutstrKey();
  if (provider === 'ppq') return hasPpqKey();
  return true; // Ollama — optimistic, errors caught at call time
}

export function getOllamaMainModel() { return localStorage.getItem('labcharts-ollama-model') || window.getOllamaConfig().model || 'llama3.2'; }
export function setOllamaMainModel(model) { localStorage.setItem('labcharts-ollama-model', model); }
export function getOllamaPIIUrl() { return localStorage.getItem('labcharts-ollama-pii-url') || window.getOllamaConfig().url; }
export function setOllamaPIIUrl(url) { localStorage.setItem('labcharts-ollama-pii-url', url); }
export function getOllamaPIIModel() { return localStorage.getItem('labcharts-ollama-pii-model') || getOllamaMainModel(); }
export function setOllamaPIIModel(model) { localStorage.setItem('labcharts-ollama-pii-model', model); }

export function getVeniceKey() { return getCachedKey('labcharts-venice-key') || ''; }
export async function saveVeniceKey(key) { await encryptedSetItem('labcharts-venice-key', key); updateKeyCache('labcharts-venice-key', key); }
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
export function setVeniceModel(model) { localStorage.setItem('labcharts-venice-model', model); }
export function getVeniceModelDisplay() {
  const id = getVeniceModel();
  let cached = []; try { cached = JSON.parse(localStorage.getItem('labcharts-venice-models') || '[]'); } catch(e) {}
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}

export function getVeniceE2EE() { return localStorage.getItem('labcharts-venice-e2ee') === 'on'; }
export function setVeniceE2EE(on) { localStorage.setItem('labcharts-venice-e2ee', on ? 'on' : 'off'); }

export function getOpenRouterKey() { return getCachedKey('labcharts-openrouter-key') || ''; }
export async function saveOpenRouterKey(key) { await encryptedSetItem('labcharts-openrouter-key', key); updateKeyCache('labcharts-openrouter-key', key); }
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
export async function saveRoutstrKey(key) { await encryptedSetItem('labcharts-routstr-key', key); updateKeyCache('labcharts-routstr-key', key); }
export function hasRoutstrKey() { return !!getRoutstrKey(); }
export function getRoutstrModel() { return localStorage.getItem('labcharts-routstr-model') || 'claude-sonnet-4.6'; }
export function setRoutstrModel(model) { localStorage.setItem('labcharts-routstr-model', model); }
export function getRoutstrModelDisplay() {
  const id = getRoutstrModel();
  let cached = []; try { cached = JSON.parse(localStorage.getItem('labcharts-routstr-models') || '[]'); } catch(e) {}
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}

// ─── PPQ (PayPerQ — pay-per-prompt, crypto + fiat) ───
export function getPpqKey() { return getCachedKey('labcharts-ppq-key') || ''; }
export async function savePpqKey(key) { await encryptedSetItem('labcharts-ppq-key', key); updateKeyCache('labcharts-ppq-key', key); }
export function hasPpqKey() { return !!getPpqKey(); }
export function getPpqModel() { return localStorage.getItem('labcharts-ppq-model') || 'claude-sonnet-4.6'; }
export function setPpqModel(model) { localStorage.setItem('labcharts-ppq-model', model); }
export function getPpqModelDisplay() {
  const id = getPpqModel();
  let cached = []; try { cached = JSON.parse(localStorage.getItem('labcharts-ppq-models') || '[]'); } catch(e) {}
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
export function getPpqCreditId() { return localStorage.getItem('labcharts-ppq-credit-id') || ''; }
export function savePpqCreditId(id) { localStorage.setItem('labcharts-ppq-credit-id', id); }
export function getOpenRouterModel() {
  let m = localStorage.getItem('labcharts-openrouter-model');
  // Fix legacy hyphenated IDs (OpenRouter uses dots: anthropic/claude-sonnet-4.6)
  if (m === 'anthropic/claude-sonnet-4-6') { m = 'anthropic/claude-sonnet-4.6'; localStorage.setItem('labcharts-openrouter-model', m); }
  return m || 'anthropic/claude-sonnet-4.6';
}
export function setOpenRouterModel(model) { localStorage.setItem('labcharts-openrouter-model', model); }
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

export async function startOpenRouterOAuth() {
  const { codeVerifier, codeChallenge } = await generatePKCE();
  sessionStorage.setItem('or_pkce_verifier', codeVerifier);
  setAIProvider('openrouter');
  const callbackUrl = window.location.origin + window.location.pathname;
  window.location.href = 'https://openrouter.ai/auth?callback_url=' + encodeURIComponent(callbackUrl) + '&code_challenge=' + encodeURIComponent(codeChallenge) + '&code_challenge_method=S256';
}

export async function exchangeOpenRouterCode(code) {
  const codeVerifier = sessionStorage.getItem('or_pkce_verifier');
  if (!codeVerifier) throw new Error('Missing PKCE verifier. Please try connecting again.');
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
  'anthropic/claude-sonnet-4.6', 'anthropic/claude-opus-4.6',
  'openai/gpt-5.4',
  'google/gemini-3.1-pro',
  'x-ai/grok-4',
];
// Routstr uses bare model IDs (no provider prefix, dots: claude-sonnet-4.6)
const ROUTSTR_CURATED = ['claude-', 'gpt-5', 'gpt-4', 'gemini-3', 'gemini-2', 'grok-4', 'grok-3', 'llama-', 'qwen', 'deepseek-', 'mistral-', 'mimo-'];
const ROUTSTR_RECOMMENDED = ['claude-sonnet-4.6', 'claude-opus-4.6', 'gpt-5.4', 'gemini-3.1-pro', 'grok-4'];
// PPQ uses bare model IDs (same as Routstr)
// private/ models (Tinfoil TEE) listed in API but require EHBP protocol, not standard completions
const PPQ_CURATED = ['claude-', 'gpt-5', 'gpt-4', 'gpt-oss', 'gemini-3', 'gemini-2', 'grok-', 'llama-', 'qwen', 'deepseek-', 'mistral-', 'kimi', 'perplexity'];
const PPQ_RECOMMENDED = ['claude-sonnet-4.6', 'claude-opus-4.6', 'gpt-5.4', 'gemini-3-flash-preview', 'grok-4'];
const PPQ_EXCLUDE = ['codex', 'audio', 'image', 'embed', 'tts', 'whisper', 'video', 'nano-banana'];
export function isRecommendedModel(provider, modelId) {
  if (provider === 'openrouter') return OPENROUTER_RECOMMENDED.some(function(prefix) { return modelId.startsWith(prefix); });
  if (provider === 'venice') {
    if (modelId.startsWith('e2ee-')) return /qwen3-5-122b|gpt-oss-120b|qwen3-30b|glm-5/.test(modelId);
    return /^(claude-(sonnet|opus)-4-6|openai-gpt-5[234](-codex)?|gemini-3(-1)?-pro|grok-4[1-9]?)(-|$)/.test(modelId);
  }
  if (provider === 'routstr') return ROUTSTR_RECOMMENDED.some(function(r) { return modelId === r || modelId.startsWith(r); });
  if (provider === 'ppq') return PPQ_RECOMMENDED.some(function(r) { return modelId === r || modelId.startsWith(r); });
  return false; // Ollama — local models, can't tier
}
export function getActiveModelId() {
  const provider = getAIProvider();
  if (provider === 'venice') return getVeniceModel();
  if (provider === 'openrouter') return getOpenRouterModel();
  if (provider === 'routstr') return getRoutstrModel();
  if (provider === 'ppq') return getPpqModel();
  return getOllamaMainModel();
}
export function getActiveModelDisplay() {
  const provider = getAIProvider();
  if (provider === 'venice') return getVeniceModelDisplay();
  if (provider === 'openrouter') return getOpenRouterModelDisplay();
  if (provider === 'routstr') return getRoutstrModelDisplay();
  if (provider === 'ppq') return getPpqModelDisplay();
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
    // Cache E2EE models separately
    const e2eeList = allText.filter(function(m) { return m.id.startsWith('e2ee-'); });
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify(e2eeList));
    const all = allText.filter(function(m) { return !m.id.startsWith('e2ee-'); });
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
    localStorage.setItem('labcharts-venice-models', JSON.stringify(models));
    if (!localStorage.getItem('labcharts-venice-model') && models.length) {
      const llama = models.find(function(m) { return m.id.includes('llama-3.3-70b'); });
      if (llama) setVeniceModel(llama.id);
    }
    return models;
  } catch (e) { return []; }
}

// ─── Proxy support ───
// When running on hosted version (not localhost), route cloud AI calls through
// /api/proxy to eliminate CORS restrictions. Local AI skips the proxy.
function _useProxy() {
  const h = window.location.hostname;
  return h !== 'localhost' && h !== '127.0.0.1' && !h.startsWith('192.168.') && !h.endsWith('.onion');
}

function _proxyFetch(url, options) {
  if (!_useProxy()) return fetch(url, options);
  // Extract headers (minus Content-Type which the proxy sets) and body
  const { 'Content-Type': _ct, ...fwdHeaders } = options.headers || {};
  const proxyBody = {
    url,
    headers: fwdHeaders,
    body: options.body, // already JSON string
  };
  return fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyBody),
    signal: options.signal,
  });
}

async function _fetchWithRetry(url, options, retries = 2, useProxy = true) {
  const fetchFn = useProxy ? _proxyFetch : fetch;
  for (let i = 0; i <= retries; i++) {
    const res = await fetchFn(url, options);
    if (res.status !== 429 || i === retries) return res;
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    const delay = Math.max(retryAfter * 1000, (i + 1) * 5000);
    if (isDebugMode()) console.log(`[API] Rate limited, retry ${i + 1}/${retries} in ${delay / 1000}s`);
    if (options.signal?.aborted) return res;
    await new Promise(r => setTimeout(r, delay));
  }
}

// ═══════════════════════════════════════════════
// WEB SEARCH SUPPORT
// ═══════════════════════════════════════════════
export function supportsWebSearch() {
  const provider = getAIProvider();
  if (provider === 'venice') return !isVeniceE2EEActive();
  if (provider === 'routstr') return false;
  if (provider === 'ppq') return true;
  return provider === 'openrouter';
}

export function isE2EEModel(modelId) {
  return typeof modelId === 'string' && modelId.startsWith('e2ee-');
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
    return /qwen.*vl|llava|vision/i.test(getVeniceModel());
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
  // Local AI — optimistic (user's responsibility)
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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
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
        } catch (parseErr) { if (parseErr.message && !parseErr.message.startsWith('Unexpected')) throw parseErr; }
      }
    }
    return { text: fullText, usage: { inputTokens, outputTokens } };
  } else {
    const data = await res.json();
    return { text: data.message?.content || '', usage: { inputTokens: data.prompt_eval_count || 0, outputTokens: data.eval_count || 0 } };
  }
}

// ═══════════════════════════════════════════════
// SHARED OPENAI-COMPATIBLE API HELPER
// ═══════════════════════════════════════════════
async function callOpenAICompatibleAPI(endpoint, key, model, providerName, { system, messages, maxTokens, onStream, signal }, extraHeaders = {}, { useProxy = true, extraBody = {} } = {}) {
  const apiMessages = [];
  if (system) apiMessages.push({ role: 'system', content: system });
  for (const msg of messages) apiMessages.push({ role: msg.role, content: msg.content });

  const body = { model, messages: apiMessages, max_tokens: maxTokens || 4096, ...extraBody };
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
    }, 2, useProxy);
  } catch (e) {
    throw new Error(`Cannot reach ${providerName} API: ${e.message}`);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error(`Invalid ${providerName} API key. Check your settings.`);
    if (res.status === 402) {
      const hint = providerName === 'Routstr' ? ' Top up with Lightning or Cashu.'
        : providerName === 'PPQ' ? ' Top up in Settings \u2192 AI \u2192 PPQ.'
        : ' Add credits at openrouter.ai/settings/credits';
      throw new Error(`Insufficient ${providerName} balance.${hint}`);
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
    let inputTokens = 0, outputTokens = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.error) throw new Error(event.error.message || JSON.stringify(event.error));
          if (event.choices?.[0]?.delta?.content) {
            fullText += event.choices[0].delta.content;
            onStream(fullText);
          }
          if (event.usage) {
            inputTokens = event.usage.prompt_tokens || inputTokens;
            outputTokens = event.usage.completion_tokens || outputTokens;
          }
        } catch (parseErr) { if (parseErr.message && !parseErr.message.startsWith('Unexpected')) throw parseErr; }
      }
    }
    return { text: fullText, usage: { inputTokens, outputTokens } };
  } else {
    const data = await res.json();
    const usage = data.usage || {};
    return { text: data.choices?.[0]?.message?.content || '', usage: { inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 } };
  }
}

export async function callOpenAICompatibleLocalAPI(opts) {
  const config = window.getOllamaConfig();
  const model = getOllamaMainModel();
  const url = config.url.replace(/\/+$/, '');
  const key = config.apiKey || 'not-needed';
  // Thinking models burn reasoning tokens against max_tokens — remove the cap
  // so the model can think freely and still produce content
  const isThinkingModel = /deepseek-r1|deepseek-v3|kimi-k|qwq|glm-[45]|:cloud/.test(model);
  const adjustedOpts = isThinkingModel && opts.maxTokens && opts.maxTokens < 4096 ? { ...opts, maxTokens: undefined } : opts;
  return callOpenAICompatibleAPI(`${url}/v1/chat/completions`, key, model, 'Local AI', adjustedOpts, {}, { useProxy: false });
}

export async function callVeniceAPI(opts) {
  const key = getVeniceKey();
  if (!key) throw new Error('No Venice API key configured. Add your key in Settings.');
  const modelId = getVeniceModel();

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
  const { system, messages, maxTokens, onStream, signal } = opts;
  const apiMessages = [];
  if (system) apiMessages.push({ role: 'system', content: await encryptMessage(session.aesKey, session.publicKey, system) });
  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: await encryptMessage(session.aesKey, session.publicKey, _contentStr(msg.content)) });
  }

  const body = { model: modelId, messages: apiMessages, max_tokens: maxTokens || 4096, stream: true, stream_options: { include_usage: true } };
  let res;
  try {
    res = await _fetchWithRetry('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`,
        'X-Venice-TEE-Client-Pub-Key': session.pubKeyHex,
        'X-Venice-TEE-Model-Pub-Key': session.modelPubKeyHex,
        'X-Venice-TEE-Signing-Algo': 'ecdsa' },
      body: JSON.stringify(body), signal
    }, 2, true);
  } catch (e) { throw new Error(`Cannot reach Venice API: ${e.message}`); }

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid Venice API key. Check your settings.');
    if (res.status === 429) throw new Error('Rate limited. Please wait a moment and try again.');
    let errMsg = `Venice API error (${res.status})`;
    try { const b = await res.json(); errMsg += `: ${b.error?.message || JSON.stringify(b.error)}`; } catch {}
    throw new Error(errMsg);
  }

  // Streaming with per-chunk decryption
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', fullText = '', inputTokens = 0, outputTokens = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const event = JSON.parse(data);
        if (event.choices?.[0]?.delta?.content) {
          const chunk = await decryptChunk(session.privateKey, event.choices[0].delta.content);
          fullText += chunk;
          if (onStream) onStream(fullText);
        }
        if (event.usage) { inputTokens = event.usage.prompt_tokens || inputTokens; outputTokens = event.usage.completion_tokens || outputTokens; }
      } catch (e) {
        if (e.name === 'OperationError') throw new Error('E2EE decryption failed — session may be stale. Try sending again.');
      }
    }
  }
  return { text: fullText, usage: { inputTokens, outputTokens } };
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
    const nodeUrl = getRoutstrNodeUrl();
    const res = await fetch(nodeUrl.replace(/\/$/, '') + '/v1/models');
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
export function getRoutstrPricing(modelId) {
  let cached = {}; try { cached = JSON.parse(localStorage.getItem('labcharts-routstr-pricing') || '{}'); } catch(e) {}
  return cached[modelId] || null;
}
export async function validateRoutstrKey(key) {
  // Routstr uses Cashu tokens or session keys — format check, then save optimistically.
  // Models endpoint is public (no auth), so we can't validate keys via model fetch.
  // Actual auth errors (401/402) surface when the user sends a message.
  if (!key.startsWith('sk-') && !key.startsWith('cashu')) {
    return { valid: false, error: 'Key should start with sk-... (session key) or cashu... (eCash token)' };
  }
  return { valid: true };
}
export function getRoutstrNodeUrl() {
  return localStorage.getItem('labcharts-routstr-node') || 'https://api.routstr.com';
}
export async function callRoutstrAPI(opts) {
  const key = getRoutstrKey();
  if (!key) throw new Error('No Routstr key configured. Fund your wallet and connect to a node in Settings.');
  const nodeUrl = getRoutstrNodeUrl();
  return callOpenAICompatibleAPI(
    nodeUrl.replace(/\/$/, '') + '/v1/chat/completions',
    key, getRoutstrModel(), 'Routstr', opts
  );
}

// ─── Routstr wallet ───
export async function createRoutstrAccount(cashuToken) {
  if (!cashuToken) throw new Error('A Cashu token is required to create a wallet');
  const res = await fetch(getRoutstrNodeUrl().replace(/\/$/, '') + '/v1/balance/create?initial_balance_token=' + encodeURIComponent(cashuToken));
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
    const res = await fetch(getRoutstrNodeUrl().replace(/\/$/, '') + '/v1/balance/info', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!res.ok) return null;
    const json = await res.json();
    // balance is in millisatoshis — convert to sats
    if (json.balance != null) return { sats: Math.floor(json.balance / 1000), msats: json.balance, totalRequests: json.total_requests || 0, totalSpent: json.total_spent || 0 };
    return null;
  } catch { return null; }
}
export async function createRoutstrLightningInvoice(amountSats) {
  const key = getRoutstrKey();
  if (!key) throw new Error('No Routstr key');
  const res = await fetch(getRoutstrNodeUrl().replace(/\/$/, '') + '/v1/balance/lightning/invoice', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount_sats: amountSats, purpose: 'topup', api_key: key })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const detail = err?.detail;
    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join('; ') : err?.message;
    throw new Error(msg || 'Invoice creation failed: ' + res.status);
  }
  return res.json(); // { invoice_id, bolt11, amount_sats, expires_at, payment_hash }
}
export async function checkRoutstrInvoiceStatus(invoiceId) {
  const key = getRoutstrKey();
  const res = await fetch(getRoutstrNodeUrl().replace(/\/$/, '') + '/v1/balance/lightning/invoice/' + encodeURIComponent(invoiceId) + '/status', {
    headers: key ? { 'Authorization': 'Bearer ' + key } : {}
  });
  if (!res.ok) return null;
  return res.json(); // { status: 'pending'|'paid'|'expired', ... }
}
export async function topupRoutstrCashu(cashuToken) {
  const key = getRoutstrKey();
  if (!key) throw new Error('No Routstr key');
  const res = await fetch(getRoutstrNodeUrl().replace(/\/$/, '') + '/v1/balance/topup', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cashu_token: cashuToken })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const detail = err?.detail;
    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join('; ') : err?.message;
    throw new Error(msg || 'Cashu topup failed: ' + res.status);
  }
  return res.json(); // { balance, amount_added, currency }
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
export function getPpqPricing(modelId) {
  let cached = {}; try { cached = JSON.parse(localStorage.getItem('labcharts-ppq-pricing') || '{}'); } catch(e) {}
  return cached[modelId] || null;
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

export async function callClaudeAPI(opts) {
  const provider = getAIProvider();
  if (provider === 'ollama') return callOpenAICompatibleLocalAPI(opts);
  if (provider === 'venice') return callVeniceAPI(opts);
  if (provider === 'openrouter') return callOpenRouterAPI(opts);
  if (provider === 'routstr') return callRoutstrAPI(opts);
  if (provider === 'ppq') return callPpqAPI(opts);
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
  fetchRoutstrModels, getRoutstrPricing, createRoutstrAccount, getRoutstrBalance, createRoutstrLightningInvoice, checkRoutstrInvoiceStatus, topupRoutstrCashu,
  fetchPpqModels, getPpqPricing, createPpqAccount, getPpqBalance, createPpqTopup, checkPpqTopupStatus,
  generatePKCE, startOpenRouterOAuth, exchangeOpenRouterCode,
  deduplicateModels,
  isRecommendedModel,
  getActiveModelId, getActiveModelDisplay,
  renderModelPricingHint,
  getAIProvider, setAIProvider, hasAIProvider,
  supportsVision, supportsWebSearch, isE2EEModel, isVeniceE2EEActive, getVeniceE2EE, setVeniceE2EE,
  validateVeniceKey, validateOpenRouterKey, validateRoutstrKey, validatePpqKey,
  callOllamaChat, callOpenAICompatibleLocalAPI, callVeniceAPI, callOpenRouterAPI, callRoutstrAPI, callPpqAPI, callClaudeAPI
});
