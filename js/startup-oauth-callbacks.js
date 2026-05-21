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

async function handleOpenRouterOAuthCallback(oauthCode, oauthState) {
  history.replaceState(null, '', window.location.pathname);

  if (typeof oauthCode !== 'string' || !oauthCode) {
    restoreOpenRouterOAuthPreviousProvider();
    clearOpenRouterOAuthSession();
    window.showNotification('OpenRouter connection failed: missing authorization code. Please try connecting again.', 'error', 6000);
    return;
  }

  try {
    const key = await exchangeOpenRouterCode(oauthCode, oauthState);
    await saveOpenRouterKey(key);
    markOpenRouterOAuthSettingsLocal();
    setAIProvider('openrouter');
    clearOpenRouterOAuthSession();
    fetchOpenRouterModels(key);
    window._openChatAfterInit = true;
    window.showNotification('Connected to OpenRouter successfully!', 'success');

    // A brand-new OpenRouter account can have zero credits. Show the
    // persistent dialog before the first AI call fails behind a transient toast.
    try {
      const balance = await getOpenRouterBalance();
      const remaining = balance?.remaining;
      if (typeof remaining === 'number' && Number.isFinite(remaining) && remaining <= 0 && window.showInsufficientBalanceDialog) {
        setTimeout(() => window.showInsufficientBalanceDialog(), 1500);
      }
    } catch {}
  } catch (e) {
    restoreOpenRouterOAuthPreviousProvider();
    clearOpenRouterOAuthSession();
    window.showNotification('OpenRouter connection failed: ' + e.message, 'error', 6000);
  }
}

function handleOpenRouterOAuthError(error, description) {
  history.replaceState(null, '', window.location.pathname);
  restoreOpenRouterOAuthPreviousProvider();
  clearOpenRouterOAuthSession();

  if (error === 'access_denied') {
    window.showNotification('OpenRouter authorization was cancelled', 'info', 4000);
  } else {
    const detail = description || error || 'Authorization failed';
    window.showNotification('OpenRouter authorization failed: ' + detail, 'error', 6000);
  }
}

export async function handleStartupOAuthCallbacks() {
  // Wearable OAuth2 callbacks must run after profile load so saveConnection
  // writes to the active profile. If handled, skip OpenRouter so the same
  // `?code=` is not processed twice.
  const wearableHandled = await handleOAuthCallbackOnLoad();

  const urlParams = new URLSearchParams(window.location.search);
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
