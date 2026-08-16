// @ts-check
// api-openrouter.js - OpenRouter provider adapter.

import {
  getOpenRouterKey,
  getOpenRouterModel,
} from './api-provider-storage.js';
import { getApiLocationOriginRuntime } from './api-runtime.js';
import { callOpenAICompatibleAPI } from './api-openai-compatible.js';
import {
  authorizeAppExtensionAIRequest,
  getAppExtensionAIRequestOptions,
  isAppExtensionAICredentialOwned,
  mapAppExtensionAIProviderError,
  shouldHideAppExtensionAIUsage,
} from './app-extension-runtime.js';

export async function getOpenRouterBalance() {
  if (shouldHideAppExtensionAIUsage('openrouter')) return null;
  const key = getOpenRouterKey();
  if (!key) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data;
    if (d && d.total_credits != null) {
      return { total: d.total_credits, used: d.total_usage, remaining: d.total_credits - d.total_usage };
    }
    return null;
  } catch {
    return null;
  }
}

export async function callOpenRouterAPI(opts) {
  const key = getOpenRouterKey();
  if (!key) throw new Error('No OpenRouter API key configured. Add your key in Settings.');
  if (isAppExtensionAICredentialOwned('openrouter')) {
    const authorized = await authorizeAppExtensionAIRequest({
      provider: 'openrouter',
      model: getOpenRouterModel(),
      webSearch: opts.webSearch === true,
      request: opts,
    });
    if (!authorized) throw new Error('This hosted AI request is not authorized. No data was sent.');
  }
  const extensionOptions = getAppExtensionAIRequestOptions({
    provider: 'openrouter',
    model: getOpenRouterModel(),
    request: opts,
  });
  const extraBody = {
    ...extensionOptions,
    ...(opts.webSearch ? { plugins: [{ id: 'web' }] } : {}),
  };
  try {
    return await callOpenAICompatibleAPI(
      'https://openrouter.ai/api/v1/chat/completions',
      key,
      getOpenRouterModel(),
      'OpenRouter',
      opts,
      { 'HTTP-Referer': getApiLocationOriginRuntime(), 'X-Title': 'getbased' },
      { extraBody }
    );
  } catch (error) {
    const mapped = mapAppExtensionAIProviderError({ provider: 'openrouter', error });
    if (mapped instanceof Error) throw mapped;
    if (typeof mapped === 'string' && mapped) throw new Error(mapped);
    throw error;
  }
}
