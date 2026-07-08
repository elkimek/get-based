// @ts-check
// api.js - AI provider facade and call router.

import { getAIProvider } from './api-provider-storage.js';
import { callOpenAICompatibleLocalAPI } from './api-local.js';
import { callVeniceAPI } from './api-venice.js';
import { callOpenRouterAPI } from './api-openrouter.js';
import { callRoutstrAPI } from './api-routstr.js';
import { callPpqAPI } from './api-ppq.js';
import { callCustomAPI } from './api-custom.js';

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
  needsMaxCompletionTokens,
  renderModelPricingHint,
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
  getOllamaMainModel,
  setOllamaMainModel,
  getOllamaPIIUrl,
  setOllamaPIIUrl,
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
  hasRoutstrKey,
  getRoutstrModel,
  setRoutstrModel,
  getRoutstrModelDisplay,
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
  callOllamaChat,
  callOpenAICompatibleLocalAPI,
} from './api-local.js';
export {
  getVeniceBalance,
  callVeniceAPI,
} from './api-venice.js';
export {
  getOpenRouterBalance,
  callOpenRouterAPI,
} from './api-openrouter.js';
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
export {
  fetchRoutstrModels,
  validateRoutstrKey,
  getRoutstrNodeUrl,
  callRoutstrAPI,
  createRoutstrAccount,
  getRoutstrBalance,
} from './api-routstr.js';
export {
  fetchPpqModels,
  validatePpqKey,
  createPpqAccount,
  getPpqBalance,
  createPpqTopup,
  checkPpqTopupStatus,
  callPpqPrivateAPI,
  callPpqAPI,
} from './api-ppq.js';
export {
  fetchCustomApiModels,
  validateCustomApiKey,
  callCustomAPI,
} from './api-custom.js';

export async function callClaudeAPI(opts, provider = getAIProvider()) {
  if (provider === 'ollama') return callOpenAICompatibleLocalAPI(opts);
  if (provider === 'venice') return callVeniceAPI(opts);
  if (provider === 'openrouter') return callOpenRouterAPI(opts);
  if (provider === 'routstr') return callRoutstrAPI(opts);
  if (provider === 'ppq') return callPpqAPI(opts);
  if (provider === 'custom') return callCustomAPI(opts);
  throw new Error('Unknown AI provider: ' + provider + '. Please select a provider in Settings.');
}
