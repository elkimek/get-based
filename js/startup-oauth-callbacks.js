// startup-oauth-callbacks.js - startup OAuth callback routing

import {
  exchangeOpenRouterCode,
  saveOpenRouterKey,
  setAIProvider,
  fetchOpenRouterModels,
} from './api.js';
import { handleOAuthCallbackOnLoad } from './wearables-connect.js';

async function handleOpenRouterOAuthCallback(oauthCode, oauthState) {
  history.replaceState(null, '', window.location.pathname);

  try {
    const key = await exchangeOpenRouterCode(oauthCode, oauthState);
    await saveOpenRouterKey(key);
    setAIProvider('openrouter');
    fetchOpenRouterModels(key);
    window._openChatAfterInit = true;
    window.showNotification('Connected to OpenRouter successfully!', 'success');

    // A brand-new OpenRouter account can have zero credits. Show the
    // persistent dialog before the first AI call fails behind a transient toast.
    try {
      const { getOpenRouterBalance } = await import('./api.js');
      const balance = await getOpenRouterBalance();
      const remaining = balance?.remaining;
      if (typeof remaining === 'number' && Number.isFinite(remaining) && remaining <= 0 && window.showInsufficientBalanceDialog) {
        setTimeout(() => window.showInsufficientBalanceDialog(), 1500);
      }
    } catch {}
  } catch (e) {
    window.showNotification('OpenRouter connection failed: ' + e.message, 'error', 6000);
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
  if (!wearableHandled && oauthCode) {
    await handleOpenRouterOAuthCallback(oauthCode, oauthState);
  }
}
