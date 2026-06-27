// @ts-check
// api-models.js - Provider model catalogs, pricing, and capability helpers.

import { getModelPricing } from './schema.js';
import {
  getAIProvider,
  getOllamaMainModel,
  getVeniceKey,
  getVeniceModel,
  getVeniceModelDisplay,
  modelSupportsVeniceE2EE,
  syncVeniceModelSelection,
  isVeniceE2EEActive,
  getOpenRouterKey,
  getOpenRouterModel,
  getOpenRouterModelDisplay,
  getOpenRouterPricing,
  setOpenRouterModel,
  getRoutstrModel,
  getRoutstrModelDisplay,
  getPpqModel,
  getPpqModelDisplay,
  isPpqPrivateModel,
  isPpqPrivateModeActive,
  syncPpqModelSelection,
  getCustomApiModel,
  getCustomApiModelDisplay,
} from './api-provider-storage.js';

export function deduplicateModels(models, familyFn) {
  const seen = {};
  return models.filter(function(m) {
    const fam = familyFn(m.id);
    if (seen[fam]) return false;
    seen[fam] = true;
    return true;
  });
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

// Recommended models for medical analysis.
// Update when a new generation launches. Each provider uses different ID formats:
// OpenRouter: "provider/model-version" (dots: 4.6)
// Anthropic: "claude-model-version" (hyphens: 4-6, with date suffix)
// Venice: "model-version" (hyphens: 4-6, no provider prefix)
const OPENROUTER_RECOMMENDED = [
  'anthropic/claude-sonnet-4.6', 'anthropic/claude-opus-4.7',
  'openai/gpt-5.5', 'openai/gpt-5.4',
  'google/gemini-3.1-pro',
  'x-ai/grok-4',
];

const OPENROUTER_ROUTER_RECOMMENDED = [
  'google/gemini-3.5-flash',
  'google/gemini-3.1-flash-lite',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5.4-mini',
];
const ROUTER_MODEL_LIMIT = 6;
const ROUTER_EXCLUDE_RE = /(audio|image|vision|embed|embedding|rerank|moderation|safeguard|codex|coder|code|search|research|reason|thinking|opus|sonnet|120b|90b|72b|70b|65b|32b|30b|24b|22b|large|xl|xxl|kimi|deepseek|grok)/i;
const ROUTER_SIGNAL_RE = /(flash|flash-lite|haiku|mini|nano|lite|\bphi\b|qwen[^/]*[-_.:](0\.5b|1\.5b|3b|4b|7b|8b)|llama[^/]*[-_.:](1b|3b|8b)|gemma[^/]*[-_.:](2b|4b|7b|9b))/i;

// Routstr uses bare model IDs (no provider prefix, dots: claude-sonnet-4.6)
const ROUTSTR_RECOMMENDED = ['claude-sonnet-4.6', 'claude-opus-4.7', 'gpt-5.5', 'gpt-5.4', 'gemini-3.1-pro', 'grok-4'];

// PPQ uses bare model IDs for regular routing and private/ IDs for Tinfoil TEE models.
const PPQ_RECOMMENDED = ['claude-sonnet-4.6', 'claude-opus-4.7', 'gpt-5.5', 'gpt-5.4', 'gemini-3-flash-preview', 'grok-4'];
const PPQ_PRIVATE_RECOMMENDED = ['private/kimi-k2-6', 'private/glm-5-2', 'private/gpt-oss-120b'];

function readStoredModelArray(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function normalizeEndpoint(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function writeProviderModelCacheMeta(provider, meta = {}) {
  try {
    localStorage.setItem(`labcharts-${provider}-models-meta`, JSON.stringify({
      provider,
      fetchedAt: Date.now(),
      source: 'provider-api',
      ...meta,
    }));
  } catch {}
}

function readProviderModelCacheMeta(provider) {
  try { return JSON.parse(localStorage.getItem(`labcharts-${provider}-models-meta`) || 'null'); }
  catch { return null; }
}

function providerModelCacheTrusted(provider) {
  const meta = readProviderModelCacheMeta(provider);
  if (!meta || meta.provider !== provider || meta.source !== 'provider-api') return false;
  if (provider === 'openrouter') return meta.endpoint === 'https://openrouter.ai/api/v1/models';
  if (provider === 'venice') return meta.endpoint === 'https://api.venice.ai/api/v1/models';
  if (provider === 'ppq') return meta.endpoint === 'https://api.ppq.ai/v1/models?type=chat';
  if (provider === 'routstr') {
    const node = normalizeEndpoint(localStorage.getItem('labcharts-routstr-node') || '');
    return !!node && normalizeEndpoint(meta.endpoint) === node + '/v1/models';
  }
  if (provider === 'custom') {
    const endpoint = normalizeEndpoint(localStorage.getItem('labcharts-custom-url') || '');
    const expected = endpoint + '/models';
    const parent = endpoint.replace(/\/[^/]+\/v\d+$/, '/v1') + '/models';
    const actual = normalizeEndpoint(meta.endpoint);
    return !!endpoint && (actual === expected || actual === parent);
  }
  if (provider === 'ollama') {
    const config = typeof window !== 'undefined' && window.getOllamaConfig ? window.getOllamaConfig() : null;
    const endpoint = normalizeEndpoint(config?.url || '');
    return !!endpoint && normalizeEndpoint(meta.endpoint) === endpoint + '/v1/models';
  }
  return false;
}

function normalizeRouterCandidate(m) {
  if (typeof m === 'string') return { id: m, name: m };
  return m && m.id ? m : null;
}

function modelPricingInput(model) {
  const raw = model?.pricing?.prompt ?? model?.pricing?.input_per_1M_tokens ?? model?.model_spec?.pricing?.input?.usd;
  const n = Number.parseFloat(String(raw ?? '999'));
  return Number.isFinite(n) ? n : 999;
}

function routerModelRank(modelId) {
  const id = String(modelId || '').toLowerCase();
  const exact = OPENROUTER_ROUTER_RECOMMENDED.findIndex(function(prefix) { return id.startsWith(prefix); });
  if (exact >= 0) return exact;
  if (/flash-lite|lite/.test(id)) return 10;
  if (/flash/.test(id)) return 11;
  if (/haiku/.test(id)) return 12;
  if (/mini|nano/.test(id)) return 13;
  if (/\bphi\b|qwen|llama|gemma/.test(id)) return 20;
  return 99;
}

export function isAgentRouterRecommendedModel(provider, modelId) {
  const id = String(modelId || '').toLowerCase();
  if (!id || ROUTER_EXCLUDE_RE.test(id) || /(^|[-_/])pro($|[-_/])/.test(id)) return false;
  if (provider === 'openrouter') return isOpenRouterRouterModel(modelId);
  return ROUTER_SIGNAL_RE.test(id);
}

function routerFamilyId(modelId) {
  return String(modelId || '')
    .toLowerCase()
    .replace(/:\d{4}-\d{2}-\d{2}$/, '')
    .replace(/[-_:]?\d{8}$/, '')
    .replace(/[-_:.]?(preview|beta|latest|experimental|exp)$/g, '')
    .replace(/[-_.:]instruct$/g, '')
    .replace(/[-_.:]chat$/g, '');
}

function previewPenalty(modelId) {
  return /(^|[-_.:/])(preview|beta|experimental|exp)($|[-_.:/])/.test(String(modelId || '').toLowerCase()) ? 1 : 0;
}

function chooseRouterCandidate(existing, candidate) {
  if (!existing) return candidate;
  const ep = previewPenalty(existing.id);
  const cp = previewPenalty(candidate.id);
  if (ep !== cp) return cp < ep ? candidate : existing;
  const er = routerModelRank(existing.id);
  const cr = routerModelRank(candidate.id);
  if (er !== cr) return cr < er ? candidate : existing;
  const ePrice = modelPricingInput(existing);
  const cPrice = modelPricingInput(candidate);
  if (ePrice !== cPrice) return cPrice < ePrice ? candidate : existing;
  return String(candidate.id).length < String(existing.id).length ? candidate : existing;
}

export function getAgentRouterModelList(provider, sourceModels) {
  let models = sourceModels;
  const fromFreshFetch = Array.isArray(models);
  if (!fromFreshFetch && !providerModelCacheTrusted(provider)) return [];
  if (!fromFreshFetch) {
    if (provider === 'openrouter') models = readStoredModelArray('labcharts-openrouter-router-models');
    else if (provider === 'venice') {
      const e2ee = isVeniceE2EEActive() ? readStoredModelArray('labcharts-venice-e2ee-models') : [];
      models = e2ee.length ? e2ee : readStoredModelArray('labcharts-venice-models');
    } else if (provider === 'ppq') {
      models = readStoredModelArray('labcharts-ppq-models');
    } else if (provider === 'routstr') models = readStoredModelArray('labcharts-routstr-models');
    else if (provider === 'custom') models = readStoredModelArray('labcharts-custom-models');
    else if (provider === 'ollama') models = readStoredModelArray('labcharts-ollama-models');
    else models = [];
  }
  const byFamily = new Map();
  for (const candidate of models.map(normalizeRouterCandidate).filter(Boolean)) {
    if (!isAgentRouterRecommendedModel(provider, candidate.id)) continue;
    const family = routerFamilyId(candidate.id);
    byFamily.set(family, chooseRouterCandidate(byFamily.get(family), candidate));
  }
  return [...byFamily.values()]
    .sort(function(a, b) {
      const ar = routerModelRank(a.id);
      const br = routerModelRank(b.id);
      if (ar !== br) return ar - br;
      const ap = modelPricingInput(a);
      const bp = modelPricingInput(b);
      if (ap !== bp) return ap - bp;
      return (a.name || a.id).localeCompare(b.name || b.id);
    })
    .slice(0, ROUTER_MODEL_LIMIT);
}

export function isRecommendedModel(provider, modelId) {
  if (provider && provider.startsWith('agent-router-')) return isAgentRouterRecommendedModel(provider.replace(/^agent-router-/, ''), modelId);
  if (provider === 'openrouter') return OPENROUTER_RECOMMENDED.some(function(prefix) { return modelId.startsWith(prefix); });
  if (provider === 'venice') {
    if (modelId.startsWith('e2ee-')) return /qwen3-5-122b|gpt-oss-120b|qwen3-30b|glm-5/.test(modelId);
    // claude-(sonnet-4-6|opus-4-7) is intentionally narrow. When newer
    // versions land, broaden the alternation rather than matching all 4.x.
    return /^(claude-(sonnet-4-6|opus-4-7)|openai-gpt-5[2345](-codex)?|gemini-3(-1)?-pro|grok-4[1-9]?)(-|$)/.test(modelId);
  }
  if (provider === 'routstr') return ROUTSTR_RECOMMENDED.some(function(r) { return modelId === r || modelId.startsWith(r); });
  if (provider === 'ppq') {
    if (isPpqPrivateModel(modelId)) return PPQ_PRIVATE_RECOMMENDED.includes(modelId);
    return PPQ_RECOMMENDED.some(function(r) { return modelId === r || modelId.startsWith(r); });
  }
  return false;
}

function getOpenRouterRouterRecommendationRank(modelId) {
  const id = String(modelId || '');
  const rank = OPENROUTER_ROUTER_RECOMMENDED.findIndex(function(prefix) { return id.startsWith(prefix); });
  return rank >= 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function isOpenRouterRouterModel(modelId) {
  if (!modelId) return false;
  const id = String(modelId);
  if (['audio', 'image', 'vision', 'embed', 'rerank', 'moderation', 'safeguard', 'codex'].some(function(ex) { return id.includes(ex); })) return false;
  return OPENROUTER_ROUTER_RECOMMENDED.some(function(prefix) { return id.startsWith(prefix); });
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

// Exclude specialized variants not suited for medical analysis.
const OPENROUTER_EXCLUDE = ['codex', 'audio', 'image', 'oss', 'safeguard', 'coder'];

export async function fetchOpenRouterModels(key) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + (key || getOpenRouterKey()) }
    });
    if (!res.ok) return [];
    const json = await res.json();
    const all = (json.data || []).filter(function(m) {
      if (!m.id) return false;
      if (OPENROUTER_EXCLUDE.some(function(ex) { return m.id.includes(ex); })) return false;
      if (isOpenRouterRouterModel(m.id)) return false;
      return OPENROUTER_CURATED.some(function(prefix) { return m.id.startsWith(prefix); });
    }).sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    const models = deduplicateModels(all, function(id) {
      return id.replace(/:\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '');
    });
    models.sort(function(a, b) {
      const aRec = OPENROUTER_RECOMMENDED.some(function(p) { return a.id.startsWith(p); });
      const bRec = OPENROUTER_RECOMMENDED.some(function(p) { return b.id.startsWith(p); });
      if (aRec !== bRec) return aRec ? -1 : 1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
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
    const visionIds = (json.data || []).filter(function(m) {
      if (!m.id || !m.architecture) return false;
      const modality = m.architecture.modality || '';
      return modality.includes('image');
    }).map(function(m) { return m.id; });
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(models));
    writeProviderModelCacheMeta('openrouter', { endpoint: 'https://openrouter.ai/api/v1/models' });
    const routerModels = (json.data || [])
      .filter(function(m) { return m && isOpenRouterRouterModel(m.id); })
      .sort(function(a, b) {
        const ar = getOpenRouterRouterRecommendationRank(a.id);
        const br = getOpenRouterRouterRecommendationRank(b.id);
        if (ar !== br) return ar - br;
        const pa = parseFloat(a.pricing?.prompt || '999');
        const pb = parseFloat(b.pricing?.prompt || '999');
        if (pa !== pb) return pa - pb;
        return (a.name || a.id).localeCompare(b.name || b.id);
      });
    localStorage.setItem('labcharts-openrouter-router-models', JSON.stringify(getAgentRouterModelList('openrouter', routerModels)));
    if (!localStorage.getItem('labcharts-openrouter-model') && models.length) {
      const claude = models.find(function(m) { return m.id === 'anthropic/claude-sonnet-4.6'; });
      if (claude) setOpenRouterModel(claude.id);
    }
    return models;
  } catch (e) { return []; }
}

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
    const norm = s => s.replace(/\./g, '-').replace(/-\d{8}$/, '');
    const model = (json.data || []).find(m => m.id === modelId)
      || (json.data || []).find(m => norm(m.id) === norm(modelId));
    if (!model?.pricing) return null;
    const pricing = {
      input: parseFloat(model.pricing.prompt || '0') * 1_000_000,
      output: parseFloat(model.pricing.completion || '0') * 1_000_000
    };
    const cached = JSON.parse(localStorage.getItem('labcharts-openrouter-pricing') || '{}');
    cached[model.id] = pricing;
    cached[modelId] = pricing;
    localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify(cached));
    return pricing;
  } catch (e) {}
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
    const allText = (json.data || []).filter(function(m) { return m.id && m.type === 'text'; }).sort(function(a, b) { return b.id.localeCompare(a.id); });
    const e2eeList = allText.filter(modelSupportsVeniceE2EE);
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify(e2eeList));
    const e2eeIds = new Set(e2eeList.map(function(m) { return m.id; }));
    const all = allText.filter(function(m) { return !e2eeIds.has(m.id) && !m.id.startsWith('e2ee-'); });
    const models = deduplicateModels(all, function(id) {
      if (id.startsWith('claude-')) return id;
      return id.replace(/-\d{8}$/, '').replace(/-\d+[bB]$/, '');
    });
    models.sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
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
    writeProviderModelCacheMeta('venice', { endpoint: 'https://api.venice.ai/api/v1/models' });
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    syncVeniceModelSelection(models, e2eeList);
    return models;
  } catch (e) { return []; }
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

export function supportsWebSearch(provider = getAIProvider()) {
  if (provider === 'venice') return !isVeniceE2EEActive();
  if (provider === 'routstr') return false;
  if (provider === 'ppq') return !isPpqPrivateModeActive();
  if (provider === 'custom') return false;
  return provider === 'openrouter';
}

export function supportsVision() {
  const provider = getAIProvider();
  if (provider === 'openrouter') {
    const modelId = getOpenRouterModel();
    try {
      const visionIds = JSON.parse(localStorage.getItem('labcharts-openrouter-vision-models') || '[]');
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
      const visionIds = JSON.parse(localStorage.getItem(isPpqPrivateModel(modelId) ? 'labcharts-ppq-private-vision-models' : 'labcharts-ppq-vision-models') || '[]');
      return visionIds.some(function(vid) { return modelId === vid || modelId.startsWith(vid.replace(/-\d{8}$/, '')); });
    } catch { return false; }
  }
  if (provider === 'custom') return true;
  return true;
}

export function needsMaxCompletionTokens(modelId) {
  if (!modelId) return false;
  const id = String(modelId).toLowerCase();
  const bare = id.includes('/') ? id.split('/').pop() : id;
  return /^(gpt-5|o[1-9])([-.]|$)/.test(bare);
}
