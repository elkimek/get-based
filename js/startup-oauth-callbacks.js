// @ts-check
// startup-oauth-callbacks.js - startup OAuth callback routing

import { getErrorMessage } from './caught-error.js';
import {
  exchangeOpenRouterCode,
  saveOpenRouterKey,
  setAIProvider,
  fetchOpenRouterModels,
  getOpenRouterBalance,
  restoreOpenRouterOAuthPreviousProvider,
  clearOpenRouterOAuthSession,
  hasPendingOpenRouterOAuthSession,
  markOpenRouterOAuthSettingsLocal,
} from './api.js';
import { showNotification as showAppNotification } from './utils.js';
import { loadWearablesConnectModule } from './wearables-connect-loader.js';

/** @type {{ showNotification: Function | null, showInsufficientBalanceDialog: Function | null }} */
const startupOAuthCallbackDeps = {
  showNotification: showAppNotification,
  showInsufficientBalanceDialog: null,
};

export function configureStartupOAuthCallbackDeps(deps = {}) {
  const previous = { ...startupOAuthCallbackDeps };
  if ('showNotification' in deps) {
    startupOAuthCallbackDeps.showNotification = typeof deps.showNotification === 'function'
      ? /** @type {typeof showAppNotification} */ (deps.showNotification)
      : null;
  }
  if ('showInsufficientBalanceDialog' in deps) {
    startupOAuthCallbackDeps.showInsufficientBalanceDialog = typeof deps.showInsufficientBalanceDialog === 'function'
      ? deps.showInsufficientBalanceDialog
      : null;
  }
  return previous;
}

function startupRuntime() {
  return /** @type {Record<string, any>} */ (globalThis);
}

function currentPathname() {
  return startupRuntime().location?.pathname || '/';
}

function currentSearch() {
  return startupRuntime().location?.search || '';
}

export function hasPendingWearableOAuthCallback(search = currentSearch()) {
  const returnedState = new URLSearchParams(search).get('state');
  if (!returnedState) return false;
  try {
    const storage = startupRuntime().sessionStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.endsWith('-oauth-pending')) continue;
      const pendingRaw = storage.getItem(key);
      if (!pendingRaw) continue;
      try {
        if (JSON.parse(pendingRaw).state === returnedState) return true;
      } catch {}
    }
  } catch {}
  return false;
}

function replaceCurrentUrl() {
  const historyApi = startupRuntime().history;
  if (historyApi && typeof historyApi.replaceState === 'function') {
    historyApi.replaceState(null, '', currentPathname());
  }
}

function showNotification(message, type, duration) {
  startupOAuthCallbackDeps.showNotification?.(message, type, duration);
}

function openChatAfterInit() {
  startupRuntime()._openChatAfterInit = true;
}

async function handleOpenRouterOAuthCallback(oauthCode, oauthState) {
  replaceCurrentUrl();

  if (typeof oauthCode !== 'string' || !oauthCode) {
    restoreOpenRouterOAuthPreviousProvider();
    clearOpenRouterOAuthSession();
    showNotification('OpenRouter connection failed: missing authorization code. Please try connecting again.', 'error', 6000);
    return;
  }

  try {
    const key = await exchangeOpenRouterCode(oauthCode, oauthState);
    const { requestAIProviderActivation } = await import('./cloud-ai-consent.js');
    if (!await requestAIProviderActivation('openrouter')) {
      restoreOpenRouterOAuthPreviousProvider();
      clearOpenRouterOAuthSession();
      showNotification('OpenRouter connection verified, but AI was not activated.', 'info', 6000);
      return;
    }
    await saveOpenRouterKey(key);
    markOpenRouterOAuthSettingsLocal();
    setAIProvider('openrouter');
    clearOpenRouterOAuthSession();
    fetchOpenRouterModels(key);
    openChatAfterInit();
    showNotification('Connected to OpenRouter successfully!', 'success');

    // A brand-new OpenRouter account can have zero credits. Show the
    // persistent dialog before the first AI call fails behind a transient toast.
    try {
      const balance = await getOpenRouterBalance();
      const remaining = balance?.remaining;
      const showInsufficientBalanceDialog = startupOAuthCallbackDeps.showInsufficientBalanceDialog;
      if (typeof remaining === 'number' && Number.isFinite(remaining) && remaining <= 0 && typeof showInsufficientBalanceDialog === 'function') {
        setTimeout(() => showInsufficientBalanceDialog(), 1500);
      }
    } catch {}
  } catch (e) {
    restoreOpenRouterOAuthPreviousProvider();
    clearOpenRouterOAuthSession();
    showNotification('OpenRouter connection failed: ' + getErrorMessage(e), 'error', 6000);
  }
}

function handleOpenRouterOAuthError(error, description) {
  replaceCurrentUrl();
  restoreOpenRouterOAuthPreviousProvider();
  clearOpenRouterOAuthSession();

  if (error === 'access_denied') {
    showNotification('OpenRouter authorization was cancelled', 'info', 4000);
  } else {
    const detail = description || error || 'Authorization failed';
    showNotification('OpenRouter authorization failed: ' + detail, 'error', 6000);
  }
}

export async function handleStartupOAuthCallbacks() {
  const search = currentSearch();
  const urlParams = new URLSearchParams(search);
  // Wearable OAuth2 callbacks must run after profile load so saveConnection
  // writes to the active profile. If handled, skip OpenRouter so the same
  // `?code=` is not processed twice.
  let wearableHandled = false;
  if (hasPendingWearableOAuthCallback(search)) {
    const wearables = await loadWearablesConnectModule();
    // The old eager startup path had already installed the scheduler by the
    // time a callback completed. Preserve that behavior on callback loads.
    // Confidential self-host integrations need the server capability before
    // their callback can save credentials and start the initial backfill.
    await wearables.loadWearableRuntimeConfig({ waitForFetch: true });
    wearables.initWearableScheduler();
    wearableHandled = await wearables.handleOAuthCallbackOnLoad();
  }

  const oauthCode = urlParams.get('code');
  const oauthState = urlParams.get('state');
  const oauthError = urlParams.get('error');
  const pendingOpenRouterOAuth = hasPendingOpenRouterOAuthSession();
  if (!wearableHandled && pendingOpenRouterOAuth) {
    if (oauthError) {
      handleOpenRouterOAuthError(oauthError, urlParams.get('error_description'));
      return;
    }
    await handleOpenRouterOAuthCallback(oauthCode, oauthState);
  }
}
