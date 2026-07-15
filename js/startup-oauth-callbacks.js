// @ts-check
// startup-oauth-callbacks.js - startup OAuth callback routing

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
import { handleOAuthCallbackOnLoad } from './wearables-connect.js';
import { showNotification as showAppNotification } from './utils.js';

/** @type {{ showNotification: Function | null, showInsufficientBalanceDialog: Function | null }} */
const startupOAuthCallbackDeps = {
  showNotification: showAppNotification,
  showInsufficientBalanceDialog: () => import('./provider-panels.js')
    .then(providerPanels => providerPanels.showInsufficientBalanceDialog()),
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

function callStartupRuntime(name, ...args) {
  const fn = startupRuntime()[name];
  return typeof fn === 'function' ? fn(...args) : undefined;
}

function currentPathname() {
  return startupRuntime().location?.pathname || '/';
}

function currentSearch() {
  return startupRuntime().location?.search || '';
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
      if (typeof remaining === 'number' && Number.isFinite(remaining) && remaining <= 0 && typeof startupOAuthCallbackDeps.showInsufficientBalanceDialog === 'function') {
        setTimeout(() => startupOAuthCallbackDeps.showInsufficientBalanceDialog(), 1500);
      }
    } catch {}
  } catch (e) {
    restoreOpenRouterOAuthPreviousProvider();
    clearOpenRouterOAuthSession();
    showNotification('OpenRouter connection failed: ' + e.message, 'error', 6000);
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
  // Wearable OAuth2 callbacks must run after profile load so saveConnection
  // writes to the active profile. If handled, skip OpenRouter so the same
  // `?code=` is not processed twice.
  const wearableHandled = await handleOAuthCallbackOnLoad();

  const urlParams = new URLSearchParams(currentSearch());
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
