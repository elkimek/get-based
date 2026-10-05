// api.js - AI provider facade and call router.

import { getAIProvider } from './api-provider-storage.js';
import type { ProviderRequestOptions } from './api-openai-compatible.js';
import type { LocalAiRequestOptions } from './api-local.js';
import { getVeniceE2EESessionRuntime } from './api-runtime.js';

export interface AIProviderRequestOptions extends ProviderRequestOptions, LocalAiRequestOptions {consentKind?: string | undefined}

function createProviderLoader<Module>(loadModule: () => Promise<Module>, loadRetryModule: () => Promise<Module>) {
  let modulePromise: Promise<Module> | null = null;
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
  () => import(('./api-local.js?lazy-retry=1' as string)) as Promise<typeof import('./api-local.js')>,
);
const loadVeniceApi = createProviderLoader(
  () => import('./api-venice.js'),
  () => import(('./api-venice.js?lazy-retry=1' as string)) as Promise<typeof import('./api-venice.js')>,
);
const loadOpenRouterApi = createProviderLoader(
  () => import('./api-openrouter.js'),
  () => import(('./api-openrouter.js?lazy-retry=1' as string)) as Promise<typeof import('./api-openrouter.js')>,
);
const loadRoutstrApi = createProviderLoader(
  () => import('./api-routstr.js'),
  () => import(('./api-routstr.js?lazy-retry=1' as string)) as Promise<typeof import('./api-routstr.js')>,
);
const loadPpqApi = createProviderLoader(
  () => import('./api-ppq.js'),
  () => import(('./api-ppq.js?lazy-retry=1' as string)) as Promise<typeof import('./api-ppq.js')>,
);
const loadCustomApi = createProviderLoader(
  () => import('./api-custom.js'),
  () => import(('./api-custom.js?lazy-retry=1' as string)) as Promise<typeof import('./api-custom.js')>,
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

export async function callOllamaChat(...args: Parameters<typeof import('./api-local.js').callOllamaChat>) {
  return (await loadLocalApi()).callOllamaChat(...args);
}

export async function callOpenAICompatibleLocalAPI(...args: Parameters<typeof import('./api-local.js').callOpenAICompatibleLocalAPI>) {
  return (await loadLocalApi()).callOpenAICompatibleLocalAPI(...args);
}

export function clearVeniceE2EESession() {
  const e2ee = getVeniceE2EESessionRuntime();
  if (typeof e2ee?.clearSession !== 'function') return false;
  e2ee.clearSession();
  return true;
}

export async function getVeniceBalance(...args: Parameters<typeof import('./api-venice.js').getVeniceBalance>) {
  return (await loadVeniceApi()).getVeniceBalance(...args);
}

export async function callVeniceAPI(...args: Parameters<typeof import('./api-venice.js').callVeniceAPI>) {
  return (await loadVeniceApi()).callVeniceAPI(...args);
}

export async function getOpenRouterBalance(...args: Parameters<typeof import('./api-openrouter.js').getOpenRouterBalance>) {
  return (await loadOpenRouterApi()).getOpenRouterBalance(...args);
}

export async function callOpenRouterAPI(...args: Parameters<typeof import('./api-openrouter.js').callOpenRouterAPI>) {
  return (await loadOpenRouterApi()).callOpenRouterAPI(...args);
}

export async function fetchRoutstrModels(...args: Parameters<typeof import('./api-routstr.js').fetchRoutstrModels>) {
  return (await loadRoutstrApi()).fetchRoutstrModels(...args);
}

export async function validateRoutstrKey(...args: Parameters<typeof import('./api-routstr.js').validateRoutstrKey>) {
  return (await loadRoutstrApi()).validateRoutstrKey(...args);
}

export function getRoutstrNodeUrl() {
  return localStorage.getItem('labcharts-routstr-node') || '';
}

export async function callRoutstrAPI(...args: Parameters<typeof import('./api-routstr.js').callRoutstrAPI>) {
  return (await loadRoutstrApi()).callRoutstrAPI(...args);
}

export async function createRoutstrAccount(...args: Parameters<typeof import('./api-routstr.js').createRoutstrAccount>) {
  return (await loadRoutstrApi()).createRoutstrAccount(...args);
}

export async function getRoutstrBalance(...args: Parameters<typeof import('./api-routstr.js').getRoutstrBalance>) {
  return (await loadRoutstrApi()).getRoutstrBalance(...args);
}

export async function fetchPpqModels(...args: Parameters<typeof import('./api-ppq.js').fetchPpqModels>) {
  return (await loadPpqApi()).fetchPpqModels(...args);
}

export async function validatePpqKey(...args: Parameters<typeof import('./api-ppq.js').validatePpqKey>) {
  return (await loadPpqApi()).validatePpqKey(...args);
}

export async function createPpqAccount(...args: Parameters<typeof import('./api-ppq.js').createPpqAccount>) {
  return (await loadPpqApi()).createPpqAccount(...args);
}

export async function getPpqBalance(...args: Parameters<typeof import('./api-ppq.js').getPpqBalance>) {
  return (await loadPpqApi()).getPpqBalance(...args);
}

export async function createPpqTopup(...args: Parameters<typeof import('./api-ppq.js').createPpqTopup>) {
  return (await loadPpqApi()).createPpqTopup(...args);
}

export async function checkPpqTopupStatus(...args: Parameters<typeof import('./api-ppq.js').checkPpqTopupStatus>) {
  return (await loadPpqApi()).checkPpqTopupStatus(...args);
}

export async function callPpqPrivateAPI(...args: Parameters<typeof import('./api-ppq.js').callPpqPrivateAPI>) {
  return (await loadPpqApi()).callPpqPrivateAPI(...args);
}

export async function callPpqAPI(...args: Parameters<typeof import('./api-ppq.js').callPpqAPI>) {
  return (await loadPpqApi()).callPpqAPI(...args);
}

export async function fetchCustomApiModels(...args: Parameters<typeof import('./api-custom.js').fetchCustomApiModels>) {
  return (await loadCustomApi()).fetchCustomApiModels(...args);
}

export async function validateCustomApiKey(...args: Parameters<typeof import('./api-custom.js').validateCustomApiKey>) {
  return (await loadCustomApi()).validateCustomApiKey(...args);
}

export async function callCustomAPI(...args: Parameters<typeof import('./api-custom.js').callCustomAPI>) {
  return (await loadCustomApi()).callCustomAPI(...args);
}

export async function callClaudeAPI(opts: AIProviderRequestOptions, provider = getAIProvider()) {
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
