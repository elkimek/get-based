// api-provider-storage.js — persisted AI provider settings, keys, and model caches.

import { getRoutstrSessionKey, saveRoutstrSessionKey } from './routstr-session.js';
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

export interface StoredProviderModel extends Record<string, unknown> {
  id: string; name?: string;
  reasoning?: { mandatory?: unknown; supported_efforts?: unknown };
  model_spec?: { capabilities?: { supportsE2EE?: unknown; supportsVision?: unknown } };
}
interface StoredLocalAiConfig extends Record<string, unknown> { url: string; model: unknown; mode: unknown; apiKey: unknown }

function notifyAISelectionChanged() {
  refreshAIProviderSelectionRuntime();
}

function saveSelectedModel(storageKey: string, model: string) {
  localStorage.setItem(storageKey, model);
  markAISettingsLocal();
  notifyAISelectionChanged();
}

export function getAIProvider() { return localStorage.getItem('labcharts-ai-provider') || 'openrouter'; }
export function setAIProvider(provider: string) { saveSelectedModel('labcharts-ai-provider', provider); }
export function isAIPaused() { return localStorage.getItem('labcharts-ai-paused') === 'true'; }
export function setAIPaused(v: unknown) { localStorage.setItem('labcharts-ai-paused', v ? 'true' : 'false'); }

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

function cleanLocalAiServerUrl(value: unknown) {
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
    const config = { ...defaults, ...(JSON.parse(getCachedKey('labcharts-ollama') ?? 'null') as Partial<StoredLocalAiConfig>) };
    config.url = cleanLocalAiServerUrl(config.url) || defaults.url;
    return config;
  }
  catch { return defaults; }
}
export async function saveOllamaConfig(config: Record<string, unknown> & { url: unknown }) {
  const json = JSON.stringify({ ...config, url: cleanLocalAiServerUrl(config.url) });
  await encryptedSetProviderItemRuntime('labcharts-ollama', json);
  updateKeyCache('labcharts-ollama', json);
  markAISettingsLocal();
}

export function getOllamaMainModel() { return localStorage.getItem('labcharts-ollama-model') || (getOllamaConfig().model as string) || 'llama3.2'; }
export function setOllamaMainModel(model: string) { saveSelectedModel('labcharts-ollama-model', model); }
export function getOllamaPIIUrl() { return cleanLocalAiServerUrl(localStorage.getItem('labcharts-ollama-pii-url') || getOllamaConfig().url); }
export function setOllamaPIIUrl(url: unknown) {
  localStorage.setItem('labcharts-ollama-pii-url', cleanLocalAiServerUrl(url));
  markAISettingsLocal();
}
export function getOllamaPIIApiKey() {
  const stored = getCachedKey('labcharts-ollama-pii-key');
  if (stored) return stored;
  try {
    const main = getOllamaConfig();
    return new URL(getOllamaPIIUrl()).origin === new URL(main.url).origin ? (main.apiKey as string) : '';
  } catch {
    return '';
  }
}
export async function saveOllamaPIIApiKey(key: string) {
  await encryptedSetProviderItemRuntime('labcharts-ollama-pii-key', key);
  updateKeyCache('labcharts-ollama-pii-key', key);
  markAISettingsLocal();
}
export function getOllamaPIIModel() { return localStorage.getItem('labcharts-ollama-pii-model') || getOllamaMainModel(); }
export function setOllamaPIIModel(model: string) {
  localStorage.setItem('labcharts-ollama-pii-model', model);
  markAISettingsLocal();
}

export function getVeniceKey() { return getCachedKey('labcharts-venice-key') || ''; }
export async function saveVeniceKey(key: string) { await encryptedSetProviderItemRuntime('labcharts-venice-key', key); updateKeyCache('labcharts-venice-key', key); markAISettingsLocal(); }
export function hasVeniceKey() { return !!getVeniceKey(); }
export function getVeniceModel() { return localStorage.getItem('labcharts-venice-model') || 'llama-3.3-70b'; }
export function setVeniceModel(model: string) { saveSelectedModel('labcharts-venice-model', model); }

export function readStoredArray<Row = StoredProviderModel>(key: string): Row[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed as Row[] : [];
  } catch {
    return [];
  }
}

export function modelListHasId(models: readonly (Pick<StoredProviderModel, 'id'> | null | undefined)[], id: unknown) {
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

function normalizedPreferredModelId(id: unknown) {
  return String(id || '').toLowerCase().replace(/[_.]/g, '-');
}

function modelMatchesPreferredId(modelId: unknown, preferredId: unknown) {
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

function findPreferredStoredModel(models: StoredProviderModel[], preferredIds: readonly unknown[]) {
  for (const id of preferredIds) {
    const found = models.find(function(model) { return modelMatchesPreferredId(model?.id, id); });
    if (found) return found;
  }
  return null;
}

export function modelSupportsVeniceE2EE(model: Partial<StoredProviderModel> | null | undefined) {
  const supports = model?.model_spec?.capabilities?.supportsE2EE;
  if (supports === true) return true;
  if (supports === false) return false;
  return typeof model?.id === 'string' && model.id.startsWith('e2ee-');
}

function preferredVeniceModelId(models: StoredProviderModel[], savedId: string | null, preferLlama = false) {
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
  return models[0]!.id;
}

export function syncVeniceModelSelection(regularModels: StoredProviderModel[], e2eeModels: StoredProviderModel[]) {
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
export function setVeniceE2EE(on: unknown) {
  localStorage.setItem('labcharts-venice-e2ee', on ? 'on' : 'off');
  markAISettingsLocal();
}

export function isE2EEModel(modelId: unknown) {
  if (typeof modelId !== 'string') return false;
  const e2eeModels = readStoredArray('labcharts-venice-e2ee-models');
  if (veniceE2EEModelsCacheKnown()) return modelListHasId(e2eeModels, modelId);
  return modelId.startsWith('e2ee-');
}

export function isVeniceE2EEActive() {
  return isE2EEModel(getVeniceModel());
}

export function getOpenRouterKey() { return getCachedKey('labcharts-openrouter-key') || ''; }
export async function saveOpenRouterKey(key: string) {
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
export function setOpenRouterModel(model: string) { saveSelectedModel('labcharts-openrouter-model', model); }
export function getOpenRouterModelDisplay() {
  const id = getOpenRouterModel();
  const cached = readStoredArray('labcharts-openrouter-models');
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
export function getOpenRouterPricing(modelId: string) {
  let cached: Record<string, { input: number; output: number }> = {}; try { cached = JSON.parse(localStorage.getItem('labcharts-openrouter-pricing') || '{}'); } catch(e) {}
  return cached[modelId] || null;
}

export function getRoutstrKey(nodeUrl?: string | null) { return getRoutstrSessionKey(nodeUrl); }
export function touchRoutstrSession() {
  touchRoutstrSessionClock();
  markAISettingsLocal();
}
export async function saveRoutstrKey(key: string, nodeUrl?: string | null) {
  await saveRoutstrSessionKey(key, nodeUrl);
  markAISettingsLocal();
}
export function hasRoutstrKey() { return !!getRoutstrKey(); }
export function getRoutstrModel() { return localStorage.getItem('labcharts-routstr-model') || 'claude-sonnet-4.6'; }
export function setRoutstrModel(model: string) { saveSelectedModel('labcharts-routstr-model', model); }
export function getRoutstrModelDisplay() {
  const id = getRoutstrModel();
  const cached = [
    ...readStoredArray('labcharts-routstr-models'),
    ...readStoredArray('labcharts-routstr-private-models'),
  ];
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
export function isRoutstrTinfoilModel(modelId: unknown) {
  return typeof modelId === 'string' && modelId.startsWith('tinfoil-');
}
export function isRoutstrPrivateModeActive() {
  return isRoutstrTinfoilModel(getRoutstrModel());
}
export function syncRoutstrModelSelection(regularModels: StoredProviderModel[], privateModels: StoredProviderModel[]) {
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
      const next = saved && modelListHasId(privateModels, saved) ? saved : (preferred?.id || privateModels[0]!.id);
      setRoutstrModel(next);
      localStorage.setItem('labcharts-routstr-model-private', next);
    }
    return;
  }
  if (regularModels.length && !modelListHasId(regularModels, current)) {
    const saved = localStorage.getItem('labcharts-routstr-model-regular');
    const next = saved && modelListHasId(regularModels, saved) ? saved : regularModels[0]!.id;
    setRoutstrModel(next);
  }
}

export function getPpqKey() { return getCachedKey('labcharts-ppq-key') || ''; }
export async function savePpqKey(key: string) { await encryptedSetProviderItemRuntime('labcharts-ppq-key', key); updateKeyCache('labcharts-ppq-key', key); markAISettingsLocal(); }
export function hasPpqKey() { return !!getPpqKey(); }
export function getPpqModel() { return localStorage.getItem('labcharts-ppq-model') || 'claude-sonnet-4.6'; }
export function setPpqModel(model: string) { saveSelectedModel('labcharts-ppq-model', model); }
export function getPpqPrivateMode() { return localStorage.getItem('labcharts-ppq-private-mode') === 'on'; }
export function setPpqPrivateMode(on: unknown) {
  localStorage.setItem('labcharts-ppq-private-mode', on ? 'on' : 'off');
  markAISettingsLocal();
}
export function isPpqPrivateModel(modelId: unknown) {
  if (typeof modelId !== 'string') return false;
  const privateModels = readStoredArray('labcharts-ppq-private-models');
  if (ppqPrivateModelsCacheKnown()) return modelListHasId(privateModels, modelId);
  return modelId.startsWith('private/');
}
export function isPpqPrivateModeActive() {
  return isPpqPrivateModel(getPpqModel());
}
export function syncPpqModelSelection(regularModels: StoredProviderModel[], privateModels: StoredProviderModel[]) {
  const current = getPpqModel();
  const privateOn = getPpqPrivateMode();
  if (privateOn) {
    if (privateModels.length && !modelListHasId(privateModels, current)) {
      const saved = localStorage.getItem('labcharts-ppq-model-private');
      const preferred = findPreferredStoredModel(privateModels, PPQ_PRIVATE_DEFAULT_CANDIDATES);
      const next = saved && modelListHasId(privateModels, saved) ? saved : (preferred?.id || privateModels[0]!.id);
      setPpqModel(next);
      localStorage.setItem('labcharts-ppq-model-private', next);
    }
    return;
  }
  if (regularModels.length && !modelListHasId(regularModels, current)) {
    const saved = localStorage.getItem('labcharts-ppq-model-regular');
    const next = saved && modelListHasId(regularModels, saved) ? saved : regularModels[0]!.id;
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
export function savePpqCreditId(id: string) {
  localStorage.setItem('labcharts-ppq-credit-id', id);
  markAISettingsLocal();
}

export function getCustomApiUrl() { return localStorage.getItem('labcharts-custom-url') || ''; }
export function setCustomApiUrl(url: string) {
  localStorage.setItem('labcharts-custom-url', url);
  markAISettingsLocal();
}
export function getCustomApiKey() { return getCachedKey('labcharts-custom-key') || ''; }
export async function saveCustomApiKey(key: string) { await encryptedSetProviderItemRuntime('labcharts-custom-key', key); updateKeyCache('labcharts-custom-key', key); markAISettingsLocal(); }
export function hasCustomApiKey() { return !!getCustomApiKey(); }
export function getCustomApiModel() { return localStorage.getItem('labcharts-custom-model') || ''; }
export function setCustomApiModel(model: string) { saveSelectedModel('labcharts-custom-model', model); }
export function getCustomApiModelDisplay() {
  const id = getCustomApiModel();
  if (!id) return '(no model selected)';
  const cached = readStoredArray('labcharts-custom-models');
  const m = cached.find(function(x) { return x.id === id; });
  return m ? (m.name || m.id) : id;
}
