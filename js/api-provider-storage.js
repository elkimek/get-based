// @ts-check
// api-provider-storage.js — persisted AI provider settings, keys, and model caches.

import { getCachedKey, updateKeyCache } from './crypto-key-cache.js';
import {
  dispatchAISettingsLocalChangedRuntime,
  encryptedSetProviderItemRuntime,
  refreshAIProviderSelectionRuntime,
  touchRoutstrSessionClock,
} from './api-provider-storage-runtime.js';
import {
  isAppExtensionAIProviderActive,
  notifyAppExtensionAICredentialChanged,
} from './app-extension-runtime.js';

function notifyAISelectionChanged() {
  refreshAIProviderSelectionRuntime();
}

export function getAIProvider() { return localStorage.getItem('labcharts-ai-provider') || 'openrouter'; }
export function setAIProvider(provider) {
  localStorage.setItem('labcharts-ai-provider', provider);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function isAIPaused() { return localStorage.getItem('labcharts-ai-paused') === 'true'; }
export function setAIPaused(v) { localStorage.setItem('labcharts-ai-paused', v ? 'true' : 'false'); }

const AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY = 'labcharts-ai-settings-local-lock-until';

export function markAISettingsLocal() {
  try {
    sessionStorage.setItem(AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY, String(Date.now() + 5 * 60 * 1000));
  } catch {}
  dispatchAISettingsLocalChangedRuntime();
}

export function notifyAIModelCatalogChanged() { return dispatchAISettingsLocalChangedRuntime(); }

export function hasAIProvider(provider = getAIProvider()) {
  if (isAIPaused()) return false;
  if (isAppExtensionAIProviderActive(provider)) return true;
  if (provider === 'venice') return hasVeniceKey();
  if (provider === 'openrouter') return hasOpenRouterKey();
  if (provider === 'routstr') return hasRoutstrKey();
  if (provider === 'ppq') return hasPpqKey();
  if (provider === 'custom') return hasCustomApiKey() && !!getCustomApiUrl();
  return true; // Ollama — optimistic, errors caught at call time
}

function cleanLocalAiServerUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/(?:v1(?:\/(?:models|chat\/completions))?|api\/v1\/models)\/?$/i, '') || '/';
    return parsed.href.replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

export function getOllamaConfig() {
  const defaults = { url: 'http://localhost:11434', model: 'llama3.2', mode: 'ollama', apiKey: '' };
  try {
    const config = { ...defaults, ...JSON.parse(getCachedKey('labcharts-ollama')) };
    config.url = cleanLocalAiServerUrl(config.url) || defaults.url;
    return config;
  }
  catch { return defaults; }
}
export async function saveOllamaConfig(config) {
  const json = JSON.stringify({ ...config, url: cleanLocalAiServerUrl(config.url) });
  await encryptedSetProviderItemRuntime('labcharts-ollama', json);
  updateKeyCache('labcharts-ollama', json);
  markAISettingsLocal();
}

export function getOllamaMainModel() { return localStorage.getItem('labcharts-ollama-model') || getOllamaConfig().model || 'llama3.2'; }
export function setOllamaMainModel(model) {
  localStorage.setItem('labcharts-ollama-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function getOllamaPIIUrl() { return cleanLocalAiServerUrl(localStorage.getItem('labcharts-ollama-pii-url') || getOllamaConfig().url); }
export function setOllamaPIIUrl(url) {
  localStorage.setItem('labcharts-ollama-pii-url', cleanLocalAiServerUrl(url));
  markAISettingsLocal();
}
export function getOllamaPIIApiKey() {
  const stored = getCachedKey('labcharts-ollama-pii-key');
  if (stored) return stored;
  try {
    const main = getOllamaConfig();
    return new URL(getOllamaPIIUrl()).origin === new URL(main.url).origin ? main.apiKey : '';
  } catch {
    return '';
  }
}
export async function saveOllamaPIIApiKey(key) {
  await encryptedSetProviderItemRuntime('labcharts-ollama-pii-key', key);
  updateKeyCache('labcharts-ollama-pii-key', key);
  markAISettingsLocal();
}
export function getOllamaPIIModel() { return localStorage.getItem('labcharts-ollama-pii-model') || getOllamaMainModel(); }
export function setOllamaPIIModel(model) {
  localStorage.setItem('labcharts-ollama-pii-model', model);
  markAISettingsLocal();
}

export function getVeniceKey() { return getCachedKey('labcharts-venice-key') || ''; }
export async function saveVeniceKey(key) { await encryptedSetProviderItemRuntime('labcharts-venice-key', key); updateKeyCache('labcharts-venice-key', key); markAISettingsLocal(); }
export function hasVeniceKey() { return !!getVeniceKey(); }
export function getVeniceModel() { return localStorage.getItem('labcharts-venice-model') || 'llama-3.3-70b'; }
export function setVeniceModel(model) {
  localStorage.setItem('labcharts-venice-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}

export function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function modelListHasId(models, id) {
  return models.some(function(m) { return m && m.id === id; });
}

function veniceE2EEModelsCacheKnown() {
  return localStorage.getItem('labcharts-venice-e2ee-models') !== null;
}

function ppqPrivateModelsCacheKnown() {
  return localStorage.getItem('labcharts-ppq-private-models') !== null;
}

const VENICE_E2EE_DEFAULT_CANDIDATES = ['e2ee-glm-5-2', 'e2ee-glm-5-2-p', 'glm-5-2'];
const PPQ_PRIVATE_DEFAULT_CANDIDATES = ['private/glm-5-2'];

function normalizedPreferredModelId(id) {
  return String(id || '').toLowerCase().replace(/[_.]/g, '-');
}

function modelMatchesPreferredId(modelId, preferredId) {
  if (!modelId || !preferredId) return false;
  const id = String(modelId);
  const preferred = String(preferredId);
  if (id === preferred) return true;
  if (id.startsWith(`${preferred}:`) || id.startsWith(`${preferred}-`) || id.startsWith(`${preferred}@`)) return true;
  const normalized = normalizedPreferredModelId(id);
  const normalizedPreferred = normalizedPreferredModelId(preferred);
  if (normalized === normalizedPreferred) return true;
  return normalized.startsWith(`${normalizedPreferred}:`)
    || normalized.startsWith(`${normalizedPreferred}-`)
    || normalized.startsWith(`${normalizedPreferred}@`);
}

function findPreferredStoredModel(models, preferredIds) {
  for (const id of preferredIds) {
    const found = models.find(function(model) { return modelMatchesPreferredId(model?.id, id); });
    if (found) return found;
  }
  return null;
}

export function modelSupportsVeniceE2EE(model) {
  const supports = model?.model_spec?.capabilities?.supportsE2EE;
  if (supports === true) return true;
  if (supports === false) return false;
  return typeof model?.id === 'string' && model.id.startsWith('e2ee-');
}

function preferredVeniceModelId(models, savedId, preferLlama = false) {
  if (!models.length) return '';
  if (savedId && modelListHasId(models, savedId)) return savedId;
  if (!preferLlama) {
    const preferred = findPreferredStoredModel(models, VENICE_E2EE_DEFAULT_CANDIDATES);
    if (preferred) return preferred.id;
  }
  if (preferLlama) {
    const llama = models.find(function(m) { return m.id && m.id.includes('llama-3.3-70b'); });
    if (llama) return llama.id;
  }
  return models[0].id;
}

export function syncVeniceModelSelection(regularModels, e2eeModels) {
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

export function veniceModelsCacheStale() {
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

export function isE2EEModel(modelId) {
  if (typeof modelId !== 'string') return false;
  const e2eeModels = readStoredArray('labcharts-venice-e2ee-models');
  if (veniceE2EEModelsCacheKnown()) return modelListHasId(e2eeModels, modelId);
  return modelId.startsWith('e2ee-');
}

export function isVeniceE2EEActive() {
  return isE2EEModel(getVeniceModel());
}

export function getOpenRouterKey() { return getCachedKey('labcharts-openrouter-key') || ''; }
export async function saveOpenRouterKey(key) {
  await encryptedSetProviderItemRuntime('labcharts-openrouter-key', key);
  updateKeyCache('labcharts-openrouter-key', key);
  markAISettingsLocal();
  await notifyAppExtensionAICredentialChanged({ provider: 'openrouter', source: 'user', hasCredential: Boolean(key) });
}
export function hasOpenRouterKey() { return !!getOpenRouterKey(); }
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
  const cached = readStoredArray('labcharts-openrouter-models');
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
export function getOpenRouterPricing(modelId) {
  let cached = {}; try { cached = JSON.parse(localStorage.getItem('labcharts-openrouter-pricing') || '{}'); } catch(e) {}
  return cached[modelId] || null;
}

export function getRoutstrKey() { return getCachedKey('labcharts-routstr-key') || ''; }
export function touchRoutstrSession() {
  touchRoutstrSessionClock();
  markAISettingsLocal();
}
export async function saveRoutstrKey(key) {
  await encryptedSetProviderItemRuntime('labcharts-routstr-key', key);
  updateKeyCache('labcharts-routstr-key', key);
  touchRoutstrSession();
}
export function hasRoutstrKey() { return !!getRoutstrKey(); }
export function getRoutstrModel() { return localStorage.getItem('labcharts-routstr-model') || 'claude-sonnet-4.6'; }
export function setRoutstrModel(model) {
  localStorage.setItem('labcharts-routstr-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function getRoutstrModelDisplay() {
  const id = getRoutstrModel();
  const cached = [
    ...readStoredArray('labcharts-routstr-models'),
    ...readStoredArray('labcharts-routstr-private-models'),
  ];
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
export function isRoutstrTinfoilModel(modelId) {
  return typeof modelId === 'string' && modelId.startsWith('tinfoil-');
}
export function isRoutstrPrivateModeActive() {
  return isRoutstrTinfoilModel(getRoutstrModel());
}
export function syncRoutstrModelSelection(regularModels, privateModels) {
  const current = getRoutstrModel();
  if (isRoutstrTinfoilModel(current)) {
    if (privateModels.length && !modelListHasId(privateModels, current)) {
      const saved = localStorage.getItem('labcharts-routstr-model-private');
      const preferred = findPreferredStoredModel(privateModels, [
        'tinfoil-gemma4-31b',
        'tinfoil-kimi-k2-6',
        'tinfoil-deepseek-v4-pro',
        'tinfoil-glm-5-2',
      ]);
      const next = saved && modelListHasId(privateModels, saved) ? saved : (preferred?.id || privateModels[0].id);
      setRoutstrModel(next);
      localStorage.setItem('labcharts-routstr-model-private', next);
    }
    return;
  }
  if (regularModels.length && !modelListHasId(regularModels, current)) {
    const saved = localStorage.getItem('labcharts-routstr-model-regular');
    const next = saved && modelListHasId(regularModels, saved) ? saved : regularModels[0].id;
    setRoutstrModel(next);
  }
}

export function getPpqKey() { return getCachedKey('labcharts-ppq-key') || ''; }
export async function savePpqKey(key) { await encryptedSetProviderItemRuntime('labcharts-ppq-key', key); updateKeyCache('labcharts-ppq-key', key); markAISettingsLocal(); }
export function hasPpqKey() { return !!getPpqKey(); }
export function getPpqModel() { return localStorage.getItem('labcharts-ppq-model') || 'claude-sonnet-4.6'; }
export function setPpqModel(model) {
  localStorage.setItem('labcharts-ppq-model', model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}
export function getPpqPrivateMode() { return localStorage.getItem('labcharts-ppq-private-mode') === 'on'; }
export function setPpqPrivateMode(on) {
  localStorage.setItem('labcharts-ppq-private-mode', on ? 'on' : 'off');
  markAISettingsLocal();
}
export function isPpqPrivateModel(modelId) {
  if (typeof modelId !== 'string') return false;
  const privateModels = readStoredArray('labcharts-ppq-private-models');
  if (ppqPrivateModelsCacheKnown()) return modelListHasId(privateModels, modelId);
  return modelId.startsWith('private/');
}
export function isPpqPrivateModeActive() {
  return isPpqPrivateModel(getPpqModel());
}
export function syncPpqModelSelection(regularModels, privateModels) {
  const current = getPpqModel();
  const privateOn = getPpqPrivateMode();
  if (privateOn) {
    if (privateModels.length && !modelListHasId(privateModels, current)) {
      const saved = localStorage.getItem('labcharts-ppq-model-private');
      const preferred = findPreferredStoredModel(privateModels, PPQ_PRIVATE_DEFAULT_CANDIDATES);
      const next = saved && modelListHasId(privateModels, saved) ? saved : (preferred?.id || privateModels[0].id);
      setPpqModel(next);
      localStorage.setItem('labcharts-ppq-model-private', next);
    }
    return;
  }
  if (regularModels.length && !modelListHasId(regularModels, current)) {
    const saved = localStorage.getItem('labcharts-ppq-model-regular');
    const next = saved && modelListHasId(regularModels, saved) ? saved : regularModels[0].id;
    setPpqModel(next);
  }
}
export function getPpqModelDisplay() {
  const id = getPpqModel();
  const cached = [
    ...readStoredArray('labcharts-ppq-models'),
    ...readStoredArray('labcharts-ppq-private-models')
  ];
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
export function getPpqCreditId() { return localStorage.getItem('labcharts-ppq-credit-id') || ''; }
export function savePpqCreditId(id) {
  localStorage.setItem('labcharts-ppq-credit-id', id);
  markAISettingsLocal();
}

export function getCustomApiUrl() { return localStorage.getItem('labcharts-custom-url') || ''; }
export function setCustomApiUrl(url) {
  localStorage.setItem('labcharts-custom-url', url);
  markAISettingsLocal();
}
export function getCustomApiKey() { return getCachedKey('labcharts-custom-key') || ''; }
export async function saveCustomApiKey(key) { await encryptedSetProviderItemRuntime('labcharts-custom-key', key); updateKeyCache('labcharts-custom-key', key); markAISettingsLocal(); }
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
  const cached = readStoredArray('labcharts-custom-models');
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
