// @ts-check
// api-models.js - Provider model catalogs, pricing, and capability helpers.

import { getErrorMessage } from './caught-error.js';
import { getModelPricing } from './schema.js';
import { isCloudModel } from './local-ai-provider-shared.js';
import {
  getAIProvider,
  getOllamaMainModel,
  getVeniceKey,
  getVeniceModel,
  getVeniceModelDisplay,
  isE2EEModel,
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
  isRoutstrTinfoilModel,
  getPpqModel,
  getPpqModelDisplay,
  isPpqPrivateModel,
  isPpqPrivateModeActive,
  getCustomApiModel,
  getCustomApiModelDisplay,
  notifyAIModelCatalogChanged,
} from './api-provider-storage.js';
import {
  getAppExtensionAIModelPolicy,
  refreshAppExtensionAI,
} from './app-extension-runtime.js';

/**
 * Provider catalogs use several equivalent flags for a model that should not
 * be offered. Treat an omitted flag as unknown/available and only exclude an
 * explicit negative signal from the provider.
 * @param {unknown} value
 */
export function modelMetadataIsAvailable(value) {
  if (!value || typeof value !== 'object') return false;
  const model = /** @type {Record<string, unknown>} */ (value);
  if (model.available === false || model.enabled === false || model.disabled === true
    || model.unavailable === true || model.missing === true) return false;
  const status = String(model.status || '').trim().toLowerCase();
  return !['disabled', 'offline', 'removed', 'unavailable'].includes(status);
}

export function deduplicateModels(models, familyFn) {
  const seen = {};
  return models.filter(function(m) {
    const fam = familyFn(m.id);
    if (seen[fam]) return false;
    seen[fam] = true;
    return true;
  });
}

/**
 * Read explicit image-input capability metadata from provider model rows.
 * Model names are deliberately not used here: a provider may expose a text-only
 * route for a model family that is multimodal elsewhere.
 */
export function modelMetadataSupportsVision(model) {
  if (!model || typeof model !== 'object') return false;
  const architecture = model.architecture && typeof model.architecture === 'object'
    ? model.architecture
    : {};
  const inputModalities = [
    ...(Array.isArray(architecture.input_modalities) ? architecture.input_modalities : []),
    ...(Array.isArray(model.input_modalities) ? model.input_modalities : []),
    ...(Array.isArray(model.input) ? model.input : []),
  ].map(value => String(value).toLowerCase());
  const modality = String(architecture.modality || model.modality || '').toLowerCase();
  return inputModalities.includes('image')
    || modality.includes('image')
    || model.capabilities?.vision === true
    || model.capabilities?.supportsVision === true
    || model.model_spec?.capabilities?.supportsVision === true;
}

// Curated: latest-gen medically capable models only (prefixes matched against IDs)
const OPENROUTER_CURATED = [
  'anthropic/claude-fable-5',
  'anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-5', 'anthropic/claude-opus-4',
  'openai/gpt-5', 'openai/gpt-6-astra',
  'google/gemini-3', 'google/gemini-2',
  'deepseek/deepseek',
  'qwen/qwen', 'qwen/qwq',
  'z-ai/glm-5',
  'moonshotai/kimi-',
  'x-ai/grok',
];

// Recommended models for medical analysis.
// Update when a new generation launches. Each provider uses different ID formats:
// OpenRouter: "provider/model-version" (dots: 4.6)
// Anthropic: "claude-model-version" (hyphens: 4-6, with date suffix)
// Venice: "model-version" (hyphens: 4-6, no provider prefix)
const OPENROUTER_RECOMMENDED = [
  'anthropic/claude-fable-5.1',
  'anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-5', 'anthropic/claude-opus-4.7',
  'openai/gpt-6-astra', 'openai/gpt-5.6-sol', 'openai/gpt-5.4',
  'google/gemini-3.8-flash', 'google/gemini-3.7-flash', 'google/gemini-3.6-flash', 'google/gemini-3.5-flash', 'google/gemini-3-flash-preview',
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
  'x-ai/grok-4',
];
const OPENROUTER_DEFAULT_CANDIDATES = ['openai/gpt-6-astra', 'openai/gpt-5.6-sol', 'anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-4.6'];

// Routstr uses bare model IDs (no provider prefix, dots: claude-sonnet-4.6)
const ROUTSTR_RECOMMENDED = ['claude-fable-5.1', 'claude-sonnet-5', 'claude-sonnet-4.6', 'claude-opus-5', 'claude-opus-4.7', 'gpt-6-astra', 'openai/gpt-6-astra', 'gpt-5.6-sol', 'openai/gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4', 'gemini-3.8-flash', 'google/gemini-3.8-flash', 'gemini-3.7-flash', 'google/gemini-3.7-flash', 'gemini-3.6-flash', 'google/gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'glm-5.3-flash', 'z-ai/glm-5.3-flash', 'kimi-k3', 'moonshotai/kimi-k3', 'x-ai/grok-4.3', 'grok-4.3', 'grok-4'];
const ROUTSTR_PRIVATE_RECOMMENDED = ['tinfoil-gemma4-31b', 'tinfoil-kimi-k2-6', 'tinfoil-deepseek-v4-pro', 'tinfoil-glm-5-3-flash'];

// PPQ uses bare model IDs for regular routing and private/ IDs for Tinfoil TEE models.
const PPQ_RECOMMENDED = ['claude-fable-5.1', 'claude-sonnet-5', 'claude-sonnet-4.6', 'claude-opus-5', 'claude-opus-4.7', 'gpt-6-astra', 'openai/gpt-6-astra', 'gpt-5.6-sol', 'openai/gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4', 'gemini-3.8-flash', 'google/gemini-3.8-flash', 'gemini-3.7-flash', 'google/gemini-3.7-flash', 'gemini-3.6-flash', 'google/gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'z-ai/glm-5.3-flash', 'glm-5.3-flash', 'moonshotai/kimi-k3', 'kimi-k3', 'x-ai/grok-4.3', 'grok-4'];
const PPQ_PRIVATE_RECOMMENDED = ['private/kimi-k3', 'private/kimi-k2-6', 'private/glm-5-3-flash'];

function normalizedModelId(modelId) {
  return String(modelId || '').toLowerCase().replace(/[_.]/g, '-');
}

function isClaudeSonnet5Model(modelId) {
  return /(^|[/-])claude-sonnet-5($|[-:])/.test(normalizedModelId(modelId));
}

function isClaudeFable51Model(modelId) {
  return /(^|[/-])claude-fable-5-1($|[-:])/.test(normalizedModelId(modelId));
}

function isGemini38FlashCyberModel(modelId) {
  return /(^|[/-])gemini-3-8-flash-cyber($|[-:])/.test(normalizedModelId(modelId));
}

function isCustomRecommendedModel(modelId) {
  if (isClaudeFable51Model(modelId)) return true;
  if (isClaudeSonnet5Model(modelId)) return true;
  return /(^|[/-])claude-(sonnet-4-6|opus-5|opus-4-7)($|[-:])/.test(normalizedModelId(modelId))
    || /(^|[/-])gpt-(?:5-(?:[45]|6-sol)|6-astra)($|[-:])/.test(normalizedModelId(modelId))
    || /(^|[/-])gemini-3-(8-flash|7-flash|6-flash|5-flash|flash-preview)($|[-:])/.test(normalizedModelId(modelId))
    || /(^|[/-])glm-5-3-flash($|[-:])/.test(normalizedModelId(modelId))
    || /(^|[/-])kimi-k3($|[-:])/.test(normalizedModelId(modelId))
    || /(^|[/-])grok-4($|[-:])/.test(normalizedModelId(modelId));
}

function modelStartsWithRecommended(modelId, prefix) {
  const id = normalizedModelId(modelId);
  const p = normalizedModelId(prefix);
  const slug = id.split('/').pop() || '';
  return id.startsWith(p) || slug.startsWith(p);
}

function isVeniceRecommendedGptModel(modelId) {
  // Sol remains a fallback until Astra appears in the live catalog.
  return /^openai-gpt-(?:6-astra|5-?6-sol|5(?:-?[2-57-9]))(?:-|$)/.test(normalizedModelId(modelId));
}

export function modelMatchesPreferredId(modelId, preferredId) {
  if (!modelId || !preferredId) return false;
  const id = String(modelId);
  if (id === preferredId) return true;
  if (id.startsWith(`${preferredId}:`) || id.startsWith(`${preferredId}-`) || id.startsWith(`${preferredId}@`)) return true;
  const normalizedId = normalizedModelId(id);
  const normalizedPreferred = normalizedModelId(preferredId);
  if (normalizedId === normalizedPreferred) return true;
  return normalizedId.startsWith(`${normalizedPreferred}:`)
    || normalizedId.startsWith(`${normalizedPreferred}-`)
    || normalizedId.startsWith(`${normalizedPreferred}@`);
}

export function findPreferredModel(models, preferredIds) {
  for (const id of preferredIds) {
    const found = models.find(function(m) { return modelMatchesPreferredId(m?.id, id); });
    if (found) return found;
  }
  return null;
}

export function isRecommendedModel(provider, modelId) {
  // Small and specialized GPT variants must not inherit a flagship prefix.
  const normalizedId = normalizedModelId(modelId);
  if (/(^|[/-])gpt-[56]/.test(normalizedId)
    && /(^|[-/:])(nano|mini|codex|audio|image)([-/:]|$)/.test(normalizedId)) return false;
  // Flash Cyber is restricted and security-specialized, so it must not inherit
  // the general-purpose 3.8 Flash recommendation through prefix matching.
  if (isGemini38FlashCyberModel(modelId)) return false;
  if (provider === 'openrouter') return OPENROUTER_RECOMMENDED.some(function(prefix) { return modelStartsWithRecommended(modelId, prefix); });
  if (provider === 'venice') {
    if (modelId.startsWith('e2ee-')) return /qwen3-5-122b|gpt-oss-120b|qwen3-30b|glm-5-3-flash/.test(modelId);
    // claude-(sonnet-5|sonnet-4-6|opus-5|opus-4-7) is intentionally narrow. When newer
    // versions land, broaden the alternation rather than matching all 4.x.
    return isClaudeFable51Model(modelId)
      || isVeniceRecommendedGptModel(modelId)
      || /^(claude-(sonnet-5|sonnet-4-6|opus-5|opus-4-7)|gemini-3-(8-flash|7-flash|6-flash|5-flash|flash-preview)|zai-org-glm-5-3-flash|z-ai-glm-5-3-flash|glm-5-3-flash|kimi-k3|grok-4[1-9]?)(-|$)/.test(normalizedModelId(modelId));
  }
  if (provider === 'routstr') {
    if (modelId.startsWith('tinfoil-')) return ROUTSTR_PRIVATE_RECOMMENDED.includes(modelId);
    return ROUTSTR_RECOMMENDED.some(function(r) { return modelId === r || modelStartsWithRecommended(modelId, r); });
  }
  if (provider === 'ppq') {
    if (isPpqPrivateModel(modelId)) return PPQ_PRIVATE_RECOMMENDED.includes(modelId);
    return PPQ_RECOMMENDED.some(function(r) { return modelId === r || modelStartsWithRecommended(modelId, r); });
  }
  if (provider === 'custom') return isCustomRecommendedModel(modelId);
  if (provider === 'ollama') return /(^|\/)qwen3-vl($|[-:])/.test(normalizedModelId(modelId));
  return false;
}

function recommendedOptionId(modelId) {
  return normalizedModelId(modelId)
    .replace(/:\d{4}-\d{2}-\d{2}$/, '')
    .replace(/:(?:batch|free)$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/@\d{8}$/, '');
}

function recommendedOptionSlug(modelId) {
  return (recommendedOptionId(modelId).split('/').pop() || '').replace(/^e2ee-/, '');
}

function recommendedFamilyKey(modelId) {
  const slug = recommendedOptionSlug(modelId);
  if (slug.startsWith('claude-sonnet-')) return 'claude-sonnet';
  if (slug.startsWith('claude-opus-')) return 'claude-opus';
  if (/^(?:openai-)?gpt-6-astra(?:-|$)/.test(slug)) return 'gpt-5-flagship';
  const gpt56Tier = slug.match(/^(?:openai-)?gpt-5(?:-?6)?-(sol|terra|luna)(?:-|$)/);
  if (gpt56Tier) return gpt56Tier[1] === 'sol' ? 'gpt-5-flagship' : `gpt-5.6-${gpt56Tier[1]}`;
  if (/^(openai-)?gpt-5/.test(slug)) return 'gpt-5-flagship';
  if (/^gemini-\d.*pro/.test(slug)) return 'gemini-pro';
  if (/^gemini-\d.*flash/.test(slug)) return 'gemini-flash';
  if (/^grok/.test(slug)) return 'grok';
  // Keep the useful open-weight sizes independently comparable while still
  // collapsing superseded generations of the same size (for example,
  // Qwen3.6 27B behind Qwen3.8 27B). A 35B-A3B route is a different compute
  // tier from dense 27B and must not disappear into the same family slot.
  const qwenEvaluationSize = slug.match(/^qwen-?3(?:-\d+)?-(27b|35b(?:-a3b)?)(?:-|$)/);
  if (qwenEvaluationSize) {
    return `qwen-open-${qwenEvaluationSize[1].startsWith('35b') ? '35b' : qwenEvaluationSize[1]}`;
  }
  if (/^qwen\d.*vl/.test(slug)) return 'qwen-vl';
  if (/^gpt-oss/.test(slug)) return 'gpt-oss';
  if (/^glm-5/.test(slug)) return 'glm-5';
  if (/^kimi-k\d/.test(slug)) return 'kimi';
  return slug;
}

function recommendedModelVersionParts(modelId) {
  const slug = recommendedOptionSlug(modelId);
  const compactVeniceGpt = slug.match(/^openai-gpt-5([2-9])(?:-|$)/);
  if (compactVeniceGpt) return [5, Number(compactVeniceGpt[1])];
  if (/^grok-41-fast($|-)/.test(slug)) return [4, 1];
  if (/^grok-4-20($|-)/.test(slug)) return [4, 2, 0];
  return (slug.match(/\d+/g) || []).map(Number);
}

function recommendedVariantPenalty(model) {
  const identity = typeof model === 'object'
    ? `${model?.id || ''}-${model?.name || ''}`
    : String(model || '');
  return /(^|[-/:\s])(batch|beta|experimental|fast(?:-?api)?|lite|mini|preview)(-|[/:\s]|$)/.test(normalizedModelId(identity)) ? -1 : 0;
}

function compareRecommendedModelVersion(a, b) {
  const aParts = recommendedModelVersionParts(a.id);
  const bParts = recommendedModelVersionParts(b.id);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }
  return recommendedVariantPenalty(a) - recommendedVariantPenalty(b);
}

/**
 * Return the newest visible model in each capability family.
 * @param {Array<{ id: string, [key: string]: any }>} models
 */
export function selectLatestModelFamilies(models) {
  const bestByFamily = new Map();
  for (const model of models) {
    // Kimi K3 FastAPI is a higher-cost route for the same curated family. It
    // should never take the visible family slot, even when a catalog
    // temporarily omits the base route.
    if (/kimi-k3-fast-?api(?:-|$)/.test(normalizedModelId(`${model.id}-${model.name || ''}`))) continue;
    const family = recommendedFamilyKey(model.id);
    const existing = bestByFamily.get(family);
    if (!existing || compareRecommendedModelVersion(model, existing) > 0) bestByFamily.set(family, model);
  }
  return Array.from(bestByFamily.values());
}

export function selectLatestRecommendedModels(provider, models) {
  return selectLatestModelFamilies(models.filter(model => isRecommendedModel(provider, model.id)));
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
    let extensionPolicy = getAppExtensionAIModelPolicy({ provider: 'openrouter' });
    if (extensionPolicy?.enforced && !Array.isArray(extensionPolicy.allowlist)) return [];
    if (extensionPolicy?.enforced && extensionPolicy.allowlist.length === 0) {
      await refreshAppExtensionAI({ reason: 'model-policy', provider: 'openrouter' });
      extensionPolicy = getAppExtensionAIModelPolicy({ provider: 'openrouter' });
    }
    const allowlist = extensionPolicy?.enforced ? extensionPolicy.allowlist : null;
    if (extensionPolicy?.enforced && (!Array.isArray(allowlist) || allowlist.length === 0)) return [];
    const endpoint = extensionPolicy?.zdrOnly
      ? 'https://openrouter.ai/api/v1/models?zdr=true'
      : 'https://openrouter.ai/api/v1/models';
    const res = await fetch(endpoint, {
      headers: { 'Authorization': 'Bearer ' + (key || getOpenRouterKey()) }
    });
    if (!res.ok) return [];
    const json = await res.json();
    const all = (json.data || []).filter(function(m) {
      if (!m.id || !modelMetadataIsAvailable(m)) return false;
      if (OPENROUTER_EXCLUDE.some(function(ex) { return m.id.includes(ex); })) return false;
      if (allowlist) return allowlist.includes(m.id);
      return OPENROUTER_CURATED.some(function(prefix) { return m.id.startsWith(prefix); });
    }).sort(function(a, b) { return (a.name || a.id).localeCompare(b.name || b.id); });
    const models = deduplicateModels(all, function(id) {
      return id.replace(/:\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '');
    });
    models.sort(allowlist
      ? function(a, b) { return allowlist.indexOf(a.id) - allowlist.indexOf(b.id); }
      : function(a, b) {
          const aRec = isRecommendedModel('openrouter', a.id);
          const bRec = isRecommendedModel('openrouter', b.id);
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
      return !!m.id && modelMetadataIsAvailable(m) && modelMetadataSupportsVision(m);
    }).map(function(m) { return m.id; });
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(visionIds));
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(models));
    const selectedModel = localStorage.getItem('labcharts-openrouter-model') || '';
    if (models.length && (!selectedModel || (allowlist && !models.some(model => model.id === selectedModel)))) {
      const preferred = findPreferredModel(models, [extensionPolicy?.defaultModel, ...OPENROUTER_DEFAULT_CANDIDATES].filter(Boolean)) || models[0];
      if (preferred) setOpenRouterModel(preferred.id);
    }
    notifyAIModelCatalogChanged();
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
    return { valid: false, error: 'Cannot reach OpenRouter API: ' + getErrorMessage(e) };
  }
}

export function renderModelPricingHint(provider, modelId) {
  if (provider === 'ollama') {
    const selected = modelId || getOllamaMainModel();
    return isCloudModel(selected)
      ? '<span style="font-size:11px;color:var(--warning)">Cloud model · provider terms may apply</span>'
      : '<span style="font-size:11px;color:var(--green)">No app fee · configured server</span>';
  }
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
    const allText = (json.data || []).filter(function(m) {
      return m.id && m.type === 'text' && modelMetadataIsAvailable(m);
    }).sort(function(a, b) { return b.id.localeCompare(a.id); });
    const e2eeList = allText.filter(modelSupportsVeniceE2EE);
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify(e2eeList));
    const e2eeIds = new Set(e2eeList.map(function(m) { return m.id; }));
    const all = allText.filter(function(m) { return !e2eeIds.has(m.id) && !m.id.startsWith('e2ee-'); });
    const models = deduplicateModels(all, function(id) {
      if (id.startsWith('claude-')) return id;
      // Parameter count is a real model variant, not a dated alias. Preserve
      // 27B/35B/etc. routes in the main selector and collapse only snapshots.
      return id.replace(/-\d{8}$/, '');
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
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    syncVeniceModelSelection(models, e2eeList);
    notifyAIModelCatalogChanged();
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
    return { valid: false, error: 'Cannot reach Venice API: ' + getErrorMessage(e) };
  }
}

export function supportsWebSearch(provider = getAIProvider()) {
  if (provider === 'venice') return !isVeniceE2EEActive();
  if (provider === 'routstr') return false;
  if (provider === 'ppq') return !isPpqPrivateModeActive();
  if (provider === 'custom') return false;
  if (provider === 'openrouter') {
    return getAppExtensionAIModelPolicy({ provider })?.allowWebSearch !== false;
  }
  return false;
}

export function supportsVision(provider = getAIProvider(), modelId = getActiveModelId(provider)) {
  if (provider === 'openrouter') {
    try {
      const visionIds = JSON.parse(localStorage.getItem('labcharts-openrouter-vision-models') || '[]');
      return visionIds.some(function(vid) { return modelId === vid || modelId.startsWith(vid.replace(/:\d{4}-\d{2}-\d{2}$/, '')); });
    } catch { return false; }
  }
  if (provider === 'venice') {
    if (isE2EEModel(modelId)) return false;
    try {
      const visionIds = JSON.parse(localStorage.getItem('labcharts-venice-vision-models') || '[]');
      return visionIds.some(function(vid) { return modelId === vid || modelId.startsWith(vid.replace(/-\d{8}$/, '')); });
    } catch { return false; }
  }
  if (provider === 'routstr') {
    if (isRoutstrTinfoilModel(modelId)) return false;
    try {
      const visionIds = JSON.parse(localStorage.getItem('labcharts-routstr-vision-models') || '[]');
      return visionIds.some(function(vid) { return modelId === vid || modelId.startsWith(vid.replace(/-\d{8}$/, '')); });
    } catch { return false; }
  }
  if (provider === 'ppq') {
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
  const bare = id.includes('/') ? id.split('/').pop() || '' : id;
  return /^(gpt-[56]|o[1-9])([-.]|$)/.test(bare);
}
