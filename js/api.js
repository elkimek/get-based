// @ts-check
// api.js - AI provider facade and call router.

import { getAIProvider } from './api-provider-storage.js';

/**
 * @param {() => Promise<any>} loadModule
 * @param {() => Promise<any>} loadRetryModule
 * @returns {() => Promise<any>}
 */
function createProviderLoader(loadModule, loadRetryModule) {
  let modulePromise = null;
  let useRetryUrl = false;
  return function loadProviderModule() {
    if (!modulePromise) {
      modulePromise = (useRetryUrl ? loadRetryModule() : loadModule())
        .catch(err => {
          modulePromise = null;
          useRetryUrl = true;
          throw err;
        });
    }
    return modulePromise;
  };
}

const loadLocalApi = createProviderLoader(
  () => import('./api-local.js'),
  // @ts-expect-error TypeScript resolves only the query-free source path.
  () => import('./api-local.js?lazy-retry=1'),
);
const loadVeniceApi = createProviderLoader(
  () => import('./api-venice.js'),
  // @ts-expect-error TypeScript resolves only the query-free source path.
  () => import('./api-venice.js?lazy-retry=1'),
);
const loadOpenRouterApi = createProviderLoader(
  () => import('./api-openrouter.js'),
  // @ts-expect-error TypeScript resolves only the query-free source path.
  () => import('./api-openrouter.js?lazy-retry=1'),
);
const loadRoutstrApi = createProviderLoader(
  () => import('./api-routstr.js'),
  // @ts-expect-error TypeScript resolves only the query-free source path.
  () => import('./api-routstr.js?lazy-retry=1'),
);
const loadPpqApi = createProviderLoader(
  () => import('./api-ppq.js'),
  // @ts-expect-error TypeScript resolves only the query-free source path.
  () => import('./api-ppq.js?lazy-retry=1'),
);
const loadCustomApi = createProviderLoader(
  () => import('./api-custom.js'),
  // @ts-expect-error TypeScript resolves only the query-free source path.
  () => import('./api-custom.js?lazy-retry=1'),
);

export {
  AI_IMPORT_REQUEST_TIMEOUT_MS,
  FETCH_REQUEST_TIMEOUT_MS,
  STREAM_STALL_TIMEOUT_MS,
} from './api-transport.js';
export {
  deduplicateModels,
  findPreferredModel,
  fetchOpenRouterModelPricing,
  fetchOpenRouterModels,
  fetchVeniceModels,
  getActiveModelDisplay,
  getActiveModelId,
  isRecommendedModel,
  modelMetadataIsAvailable,
  modelMetadataSupportsVision,
  needsMaxCompletionTokens,
  renderModelPricingHint,
  selectLatestModelFamilies,
  selectLatestRecommendedModels,
  supportsVision,
  supportsWebSearch,
  validateOpenRouterKey,
  validateVeniceKey,
} from './api-models.js';
export {
  getAIProvider,
  setAIProvider,
  isAIPaused,
  setAIPaused,
  markAISettingsLocal,
  hasAIProvider,
  getOllamaConfig,
  saveOllamaConfig,
  getOllamaMainModel,
  setOllamaMainModel,
  getOllamaPIIUrl,
  setOllamaPIIUrl,
  getOllamaPIIApiKey,
  saveOllamaPIIApiKey,
  getOllamaPIIModel,
  setOllamaPIIModel,
  getVeniceKey,
  saveVeniceKey,
  hasVeniceKey,
  getVeniceModel,
  setVeniceModel,
  getVeniceModelDisplay,
  getVeniceE2EE,
  setVeniceE2EE,
  isE2EEModel,
  isVeniceE2EEActive,
  getOpenRouterKey,
  saveOpenRouterKey,
  hasOpenRouterKey,
  getOpenRouterModel,
  setOpenRouterModel,
  getOpenRouterModelDisplay,
  getOpenRouterPricing,
  getRoutstrKey,
  saveRoutstrKey,
  touchRoutstrSession,
  hasRoutstrKey,
  getRoutstrModel,
  setRoutstrModel,
  getRoutstrModelDisplay,
  isRoutstrTinfoilModel,
  isRoutstrPrivateModeActive,
  syncRoutstrModelSelection,
  getPpqKey,
  savePpqKey,
  hasPpqKey,
  getPpqModel,
  setPpqModel,
  getPpqModelDisplay,
  getPpqPrivateMode,
  setPpqPrivateMode,
  isPpqPrivateModel,
  isPpqPrivateModeActive,
  syncPpqModelSelection,
  getPpqCreditId,
  savePpqCreditId,
  getCustomApiUrl,
  setCustomApiUrl,
  getCustomApiKey,
  saveCustomApiKey,
  hasCustomApiKey,
  getCustomApiModel,
  setCustomApiModel,
  getCustomApiModelDisplay,
} from './api-provider-storage.js';
export {
  generatePKCE,
  startOpenRouterOAuth,
  rememberOpenRouterOAuthPreviousProvider,
  restoreOpenRouterOAuthPreviousProvider,
  clearOpenRouterOAuthSession,
  hasPendingOpenRouterOAuthSession,
  markOpenRouterOAuthSettingsLocal,
  exchangeOpenRouterCode,
} from './api-openrouter-oauth.js';

export async function callOllamaChat(...args) {
  return (await loadLocalApi()).callOllamaChat(...args);
}

export async function callOpenAICompatibleLocalAPI(...args) {
  return (await loadLocalApi()).callOpenAICompatibleLocalAPI(...args);
}

export function clearVeniceE2EESession() {
  const e2ee = typeof window !== 'undefined' ? /** @type {any} */ (window)._veniceE2EE : null;
  if (typeof e2ee?.clearSession !== 'function') return false;
  e2ee.clearSession();
  return true;
}

export async function getVeniceBalance(...args) {
  return (await loadVeniceApi()).getVeniceBalance(...args);
}

export async function callVeniceAPI(...args) {
  return (await loadVeniceApi()).callVeniceAPI(...args);
}

export async function getOpenRouterBalance(...args) {
  return (await loadOpenRouterApi()).getOpenRouterBalance(...args);
}

export async function callOpenRouterAPI(...args) {
  return (await loadOpenRouterApi()).callOpenRouterAPI(...args);
}

export async function fetchRoutstrModels(...args) {
  return (await loadRoutstrApi()).fetchRoutstrModels(...args);
}

export async function validateRoutstrKey(...args) {
  return (await loadRoutstrApi()).validateRoutstrKey(...args);
}

export function getRoutstrNodeUrl() {
  return localStorage.getItem('labcharts-routstr-node') || '';
}

export async function callRoutstrAPI(...args) {
  return (await loadRoutstrApi()).callRoutstrAPI(...args);
}

export async function createRoutstrAccount(...args) {
  return (await loadRoutstrApi()).createRoutstrAccount(...args);
}

export async function getRoutstrBalance(...args) {
  return (await loadRoutstrApi()).getRoutstrBalance(...args);
}

export async function fetchPpqModels(...args) {
  return (await loadPpqApi()).fetchPpqModels(...args);
}

export async function validatePpqKey(...args) {
  return (await loadPpqApi()).validatePpqKey(...args);
}

export async function createPpqAccount(...args) {
  return (await loadPpqApi()).createPpqAccount(...args);
}

export async function getPpqBalance(...args) {
  return (await loadPpqApi()).getPpqBalance(...args);
}

export async function createPpqTopup(...args) {
  return (await loadPpqApi()).createPpqTopup(...args);
}

export async function checkPpqTopupStatus(...args) {
  return (await loadPpqApi()).checkPpqTopupStatus(...args);
}

export async function callPpqPrivateAPI(...args) {
  return (await loadPpqApi()).callPpqPrivateAPI(...args);
}

export async function callPpqAPI(...args) {
  return (await loadPpqApi()).callPpqAPI(...args);
}

export async function fetchCustomApiModels(...args) {
  return (await loadCustomApi()).fetchCustomApiModels(...args);
}

export async function validateCustomApiKey(...args) {
  return (await loadCustomApi()).validateCustomApiKey(...args);
}

export async function callCustomAPI(...args) {
  return (await loadCustomApi()).callCustomAPI(...args);
}

export async function callClaudeAPI(opts, provider = getAIProvider()) {
  const { requireAIProcessingApproval } = await import('./cloud-ai-consent.js');
  await requireAIProcessingApproval(provider, {
    kind: opts?.consentKind || 'text',
    modelId: opts?.modelOverride || '',
  });
  if (provider === 'ollama') return callOpenAICompatibleLocalAPI(opts);
  if (provider === 'venice') return callVeniceAPI(opts);
  if (provider === 'openrouter') return callOpenRouterAPI(opts);
  if (provider === 'routstr') return callRoutstrAPI(opts);
  if (provider === 'ppq') return callPpqAPI(opts);
  if (provider === 'custom') return callCustomAPI(opts);
  throw new Error('Unknown AI provider: ' + provider + '. Please select a provider in Settings.');
}
