// @ts-check
// nutrition-ai-settings.js — an optional model route dedicated to meal photos.

import {
  getActiveModelDisplay,
  getActiveModelId,
  getAIProvider,
  getOllamaConfig,
  hasAIProvider,
  isRecommendedModel,
  markAISettingsLocal,
  selectLatestModelFamilies,
  supportsVision,
} from './api.js';
import { getCachedKey } from './crypto-key-cache.js';
import {
  getAssistantExecutionRoute, getCodexExecutionRoute, listCodexExecutionRoutes,
} from './ai-execution-routing.js';
import { discoverLocalAI } from './local-ai-discovery.js';
import { cacheLocalAiModelDetails, getCachedLocalAiModelDetails } from './provider-local-ai-runtime.js';
import { getModelPricing } from './schema.js';
import { escapeAttr, escapeHTML } from './utils.js';

export const NUTRITION_AI_ROUTE_KEY = 'labcharts-nutrition-ai-route';

const PROVIDERS = Object.freeze(['openrouter', 'venice', 'ppq', 'routstr', 'custom', 'ollama']);
const ROUTE_PROVIDERS = Object.freeze([...PROVIDERS, 'codex']);
const PROVIDER_LABELS = Object.freeze({
  openrouter: 'OpenRouter',
  venice: 'Venice',
  ppq: 'PPQ',
  routstr: 'Routstr',
  custom: 'Custom API',
  ollama: 'Local AI',
  codex: 'CLI agent',
});
const MODEL_CACHE_KEYS = Object.freeze({
  openrouter: ['labcharts-openrouter-models'],
  venice: ['labcharts-venice-models'],
  ppq: ['labcharts-ppq-models', 'labcharts-ppq-private-models'],
  routstr: ['labcharts-routstr-models', 'labcharts-routstr-private-models'],
  custom: ['labcharts-custom-models'],
  ollama: [],
});
const VISION_CACHE_KEYS = Object.freeze({
  openrouter: ['labcharts-openrouter-vision-models'],
  venice: ['labcharts-venice-vision-models'],
  ppq: ['labcharts-ppq-vision-models', 'labcharts-ppq-private-vision-models'],
  routstr: ['labcharts-routstr-vision-models'],
  custom: ['labcharts-custom-vision-models'],
  ollama: [],
});
let nutritionLocalCatalogPromise = null;
let nutritionLocalCatalogLoading = false;

function notifyNutritionLocalCatalogChanged() {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  globalThis.dispatchEvent(new CustomEvent('labcharts-ai-settings-local-changed'));
}

export function isNutritionLocalAICatalogLoading() {
  return nutritionLocalCatalogLoading;
}

function hasSavedLocalAIConnection() {
  try {
    const config = JSON.parse(getCachedKey('labcharts-ollama') || 'null');
    return !!(config?.url && config?.model);
  } catch {
    return false;
  }
}

/** Restore Local AI capability metadata after an application refresh. */
export function hydrateNutritionLocalAICatalog({ includeConfigured = false } = {}) {
  if (getAIProvider() !== 'ollama' && !(includeConfigured && hasSavedLocalAIConnection())) {
    return Promise.resolve(null);
  }
  const cached = getCachedLocalAiModelDetails();
  if (cached.modelDetails.length) return Promise.resolve(cached);
  if (nutritionLocalCatalogPromise) return nutritionLocalCatalogPromise;
  const config = getOllamaConfig();
  nutritionLocalCatalogLoading = true;
  nutritionLocalCatalogPromise = discoverLocalAI(config.url, config.apiKey, { force: includeConfigured })
    .then(result => {
      nutritionLocalCatalogLoading = false;
      const current = getOllamaConfig();
      if (current.url === config.url && current.apiKey === config.apiKey) {
        cacheLocalAiModelDetails(result?.modelDetails || [], result?.provider === 'ollama');
      } else notifyNutritionLocalCatalogChanged();
      return result;
    })
    .catch(() => {
      nutritionLocalCatalogLoading = false;
      notifyNutritionLocalCatalogChanged();
      return null;
    })
    .finally(() => { nutritionLocalCatalogPromise = null; });
  return nutritionLocalCatalogPromise;
}

function nutritionModelSlug(modelId) {
  return (String(modelId || '').toLocaleLowerCase().replace(/[_.]/g, '-').split('/').pop() || '')
    .replace(/:\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{8}$/, '');
}

/**
 * Open-weight Qwen tiers requested for direct meal-photo evaluation. These are
 * candidates, not product recommendations: a route still has to exist in the
 * connected provider catalog and carry explicit image-input metadata.
 */
function isNutritionBenchmarkCandidate(modelId) {
  return /^qwen-?3(?:-\d+)?-(?:27b|35b(?:-a3b)?)(?:-|$)/.test(nutritionModelSlug(modelId));
}

/**
 * Food-specific evidence is intentionally tied to exact studied versions.
 * Newer family members remain useful candidates, but do not inherit a claim
 * that their predecessor's food-photo result proved their accuracy.
 */
export function getNutritionModelGuidance(modelId) {
  const slug = nutritionModelSlug(modelId);
  if (/^claude-sonnet-4-6(?:-|$)/.test(slug)) {
    return { rank: 1, level: 'published', label: 'Best studied balance' };
  }
  if (/^gemini-3-(?:7|8)-flash(?:-|$)/.test(slug)) {
    return { rank: 2, level: 'candidate', label: 'Value candidate' };
  }
  if (/^gemini-3-(?:0|1)-flash(?:-|$)/.test(slug)) {
    return { rank: 3, level: 'preprint', label: 'Nutrition5k top performer' };
  }
  if (/^claude-opus-4-6(?:-|$)/.test(slug)) {
    return { rank: 4, level: 'published', label: 'Studied accuracy tier' };
  }
  if (/^(?:openai-)?gpt-5(?:-|$)/.test(slug)) {
    return { rank: 5, level: 'family', label: 'Family evidence' };
  }
  return { rank: 20, level: 'candidate', label: 'Vision candidate' };
}

function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanRoute(value) {
  const provider = String(value?.provider || '');
  const model = String(value?.model || '').trim();
  if (!ROUTE_PROVIDERS.includes(provider) || !model || model.length > 300) return null;
  return { provider, model };
}

function cachedVisionModelIds(provider) {
  return new Set((VISION_CACHE_KEYS[provider] || []).flatMap(readStoredArray).map(String));
}

function modelIdMatchesCapability(modelId, capabilityId) {
  if (modelId === capabilityId) return true;
  const undated = String(capabilityId || '')
    .replace(/:\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{8}$/, '');
  return !!undated && (modelId.startsWith(`${undated}:`) || modelId.startsWith(`${undated}-`));
}

/** Meal routing requires positive capability evidence from this provider. */
export function isConfirmedMealVisionModel(provider, modelId) {
  const id = String(modelId || '').trim();
  if (!id) return false;
  if (provider === 'codex') return getCodexExecutionRoute(id, 'image').available;
  if (provider === 'ollama') {
    return getCachedLocalAiModelDetails().modelDetails
      .some(row => row?.name === id && row?.vision === true);
  }
  if (provider === 'custom') {
    return [...cachedVisionModelIds(provider)].some(capabilityId => modelIdMatchesCapability(id, capabilityId));
  }
  return supportsVision(provider, id);
}

export function getNutritionAIRoute() {
  try {
    return cleanRoute(JSON.parse(localStorage.getItem(NUTRITION_AI_ROUTE_KEY) || 'null'));
  } catch {
    return null;
  }
}

export function setNutritionAIRoute(route) {
  const cleaned = cleanRoute(route);
  if (cleaned) localStorage.setItem(NUTRITION_AI_ROUTE_KEY, JSON.stringify(cleaned));
  else localStorage.removeItem(NUTRITION_AI_ROUTE_KEY);
  markAISettingsLocal();
  return cleaned;
}

function modelCatalog(provider) {
  const rows = provider === 'ollama'
    ? getCachedLocalAiModelDetails().modelDetails
      .filter(row => row?.vision === true)
      .map(row => ({ id: row?.name, name: row?.name }))
    : (MODEL_CACHE_KEYS[provider] || []).flatMap(readStoredArray);
  const byId = new Map();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (id && isConfirmedMealVisionModel(provider, id) && !byId.has(id)) byId.set(id, { id, name: String(row?.name || id) });
  }
  const activeId = getActiveModelId(provider);
  if (activeId && isConfirmedMealVisionModel(provider, activeId) && !byId.has(activeId)) {
    byId.set(activeId, { id: activeId, name: getActiveModelDisplay(provider) || activeId });
  }
  const candidates = [...byId.values()].filter(model => ['custom', 'ollama'].includes(provider)
    || model.id === activeId
    || isRecommendedModel(provider, model.id)
    || isNutritionBenchmarkCandidate(model.id));
  return selectLatestModelFamilies(candidates)
    .map(model => {
      const pricing = nutritionModelPricing(provider, model.id);
      return { ...model, guidance: getNutritionModelGuidance(model.id), ...pricing };
    })
    .sort((a, b) => a.priceScore - b.priceScore || a.guidance.rank - b.guidance.rank || a.name.localeCompare(b.name));
}

function formattedTokenRate(value) {
  return String(Number(Number(value).toFixed(2)));
}

export function nutritionModelPricing(provider, modelId) {
  if (provider === 'codex') return { priceLabel: 'Uses CLI subscription', priceScore: 0 };
  if (provider === 'ollama') return { priceLabel: 'Local · no token charge', priceScore: 0 };
  if (provider === 'custom') return { priceLabel: 'Endpoint pricing', priceScore: Number.POSITIVE_INFINITY };
  try {
    const pricing = getModelPricing(provider, modelId);
    const input = Number(pricing?.input || 0);
    const output = Number(pricing?.output || 0);
    if (!(input > 0 || output > 0)) return { priceLabel: 'Price unavailable', priceScore: Number.POSITIVE_INFINITY };
    return {
      priceLabel: `${pricing?.approx ? '≈' : ''}$${formattedTokenRate(input)} in · $${formattedTokenRate(output)} out / 1M`,
      priceScore: input + output,
    };
  } catch {
    return { priceLabel: 'Price unavailable', priceScore: Number.POSITIVE_INFINITY };
  }
}

function modelDisplay(provider, model) {
  if (provider === 'codex') return getCodexExecutionRoute(model, 'image').modelDisplay;
  for (const key of MODEL_CACHE_KEYS[provider] || []) {
    const found = readStoredArray(key).find(row => row?.id === model);
    if (found) return String(found.name || found.id);
  }
  return model;
}

export function getMealAISelection() {
  const provider = getAIProvider();
  const stored = getNutritionAIRoute();
  const assistant = getAssistantExecutionRoute();
  if (stored?.provider === 'codex') {
    return {
      ...getCodexExecutionRoute(stored.model, 'image'),
      usesChatModel: assistant.adapter === 'codex' && assistant.model === stored.model,
      usesAssistant: assistant.adapter === 'codex' && assistant.model === stored.model,
      usesAutomatic: false,
      fallback: false,
    };
  }
  const saved = stored?.provider === provider ? stored : null;
  if (!saved && assistant.adapter === 'codex') {
    const codex = getCodexExecutionRoute(assistant.model, 'image');
    if (codex.available) {
      return {
        ...codex,
        usesChatModel: true,
        usesAssistant: true,
        usesAutomatic: true,
        fallback: false,
      };
    }
  }
  const model = saved?.model || getActiveModelId(provider);
  return {
    adapter: 'direct',
    provider,
    model,
    modelDisplay: saved ? modelDisplay(provider, model) : (getActiveModelDisplay(provider) || model || 'Selected model'),
    providerDisplay: PROVIDER_LABELS[provider] || provider,
    usesChatModel: !saved && assistant.adapter === 'direct',
    usesAssistant: !saved && assistant.adapter === 'direct',
    usesAutomatic: !saved,
    fallback: !saved && assistant.adapter === 'codex',
    local: provider === 'ollama',
    available: hasAIProvider(provider) && !!model && isConfirmedMealVisionModel(provider, model),
  };
}

export function getMealAISelectionForRoute(route) {
  const saved = cleanRoute(route);
  if (!saved) {
    return {
      provider: '', model: '', modelDisplay: 'Unavailable model', providerDisplay: '',
      adapter: 'direct', usesChatModel: false, usesAssistant: false, usesAutomatic: false,
      fallback: false, local: false, available: false,
    };
  }
  if (saved.provider === 'codex') {
    return {
      ...getCodexExecutionRoute(saved.model, 'image'),
      usesChatModel: false,
      usesAssistant: false,
      usesAutomatic: false,
      fallback: false,
    };
  }
  return {
    adapter: 'direct',
    provider: saved.provider,
    model: saved.model,
    modelDisplay: modelDisplay(saved.provider, saved.model),
    providerDisplay: PROVIDER_LABELS[saved.provider] || saved.provider,
    usesChatModel: false,
    usesAssistant: false,
    usesAutomatic: false,
    fallback: false,
    local: saved.provider === 'ollama',
    available: hasAIProvider(saved.provider) && isConfirmedMealVisionModel(saved.provider, saved.model),
  };
}

export function listNutritionVisionModels() {
  const current = getMealAISelection();
  const providerOrder = [current.provider, ...PROVIDERS.filter(provider => provider !== current.provider)];
  const directModels = providerOrder.flatMap(provider => {
    if (!hasAIProvider(provider)) return [];
    const providerModel = getActiveModelId(provider);
    return modelCatalog(provider).map(model => ({
      provider,
      providerDisplay: PROVIDER_LABELS[provider] || provider,
      model: model.id,
      modelDisplay: model.name,
      local: provider === 'ollama',
      current: provider === current.provider && model.id === current.model,
      providerCurrent: model.id === providerModel,
      guidance: model.guidance,
      priceLabel: model.priceLabel,
      value: routeValue(provider, model.id),
    }));
  });
  const codexModels = listCodexExecutionRoutes('image').map(route => ({
    ...route,
    current: current.provider === 'codex' && route.model === current.model,
    providerCurrent: getAssistantExecutionRoute().adapter === 'codex'
      && getAssistantExecutionRoute().model === route.model,
    guidance: getNutritionModelGuidance(route.model),
    ...nutritionModelPricing('codex', route.model),
    value: routeValue('codex', route.model),
  }));
  return current.provider === 'codex' ? [...codexModels, ...directModels] : [...directModels, ...codexModels];
}

/**
 * Start comparisons with the meal route and a model from another configured
 * provider. Within that second provider, prefer its saved active model.
 */
export function getDefaultNutritionComparisonModelValues(models = listNutritionVisionModels()) {
  if (!Array.isArray(models) || models.length < 2) return [];
  const primary = models.find(model => model.current)
    || models.find(model => model.providerCurrent)
    || models[0];
  const otherProviderModels = models.filter(model => model.provider !== primary.provider);
  const secondary = otherProviderModels.find(model => model.providerCurrent)
    || otherProviderModels[0]
    || models.find(model => model.value !== primary.value);
  return secondary ? [primary.value, secondary.value] : [primary.value];
}

function routeValue(provider, model) {
  return JSON.stringify({ provider, model });
}

export function setNutritionAIRouteFromValue(value) {
  if (!value) return setNutritionAIRoute(null);
  try {
    return setNutritionAIRoute(JSON.parse(value));
  } catch {
    return setNutritionAIRoute(null);
  }
}

export function renderNutritionAISettings() {
  const directProvider = getAIProvider();
  const directProviderDisplay = PROVIDER_LABELS[directProvider] || directProvider;
  const assistant = getAssistantExecutionRoute();
  const selection = getMealAISelection();
  const stored = getNutritionAIRoute();
  const saved = selection.usesAutomatic ? null : stored;
  const selectedValue = saved ? routeValue(saved.provider, saved.model) : '';
  const automaticLabel = selection.fallback
    ? `Automatic fallback — ${selection.modelDisplay} via ${selection.providerDisplay}`
    : `Follow chat assistant — ${selection.modelDisplay}`;
  let options = `<option value=""${saved ? '' : ' selected'}${selection.available ? '' : ' disabled'}>${escapeHTML(automaticLabel)}</option>`;
  let savedChoiceRendered = false;

  if (assistant.adapter === 'codex') {
    const rows = listCodexExecutionRoutes('image').map(model => {
      const value = routeValue('codex', model.model);
      if (value === selectedValue) savedChoiceRendered = true;
      return `<option value="${escapeAttr(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHTML(model.modelDisplay)} — Uses CLI subscription</option>`;
    }).join('');
    if (rows) options += `<optgroup label="CLI agent vision models">${rows}</optgroup>`;
  }

  if (hasAIProvider(directProvider)) {
    const models = modelCatalog(directProvider);
    const rows = models.map(model => {
      const value = routeValue(directProvider, model.id);
      if (value === selectedValue) savedChoiceRendered = true;
      return `<option value="${escapeAttr(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHTML(model.name)} — ${escapeHTML(model.priceLabel)}</option>`;
    }).join('');
    if (rows) options += `<optgroup label="${escapeAttr(directProviderDisplay)} vision models">${rows}</optgroup>`;
  }

  if (saved && !savedChoiceRendered) {
    options += `<optgroup label="Saved choice unavailable"><option value="${escapeAttr(selectedValue)}" selected>${escapeHTML(modelDisplay(saved.provider, saved.model))}</option></optgroup>`;
  }

  return `<div class="settings-group-title">Feature models</div>
    <div class="settings-section" id="nutrition-ai-model-settings">
      <div class="settings-copy-title">Meal photos and labels</div>
      <div class="settings-copy-desc">Follow the chat assistant when it supports images, or use the configured feature fallback.</div>
      <select class="api-key-input" style="margin-top:8px" aria-label="Meal photo and nutrition label model" data-settings-action="set-nutrition-ai-route">${options}</select>
      <details class="nutrition-ai-model-details"><summary>About this list</summary><div class="settings-copy-desc">Only models with confirmed image input are shown. CLI models use their existing subscription; API and Local models use the configured ${escapeHTML(directProviderDisplay)} route. Evidence informs ordering only and does not prove accuracy. <a href="https://doi.org/10.3390/nu18122017" target="_blank" rel="noopener noreferrer">Claude study ↗</a> · <a href="https://doi.org/10.64898/2026.07.26.740845" target="_blank" rel="noopener noreferrer">Gemini preprint ↗</a></div></details>
    </div>`;
}
