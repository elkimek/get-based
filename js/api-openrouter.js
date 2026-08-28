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
  callAppExtensionAIProvider,
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
  const modelId = String(opts?.modelOverride || getOpenRouterModel());
  if (isAppExtensionAICredentialOwned('openrouter')) {
    const authorized = await authorizeAppExtensionAIRequest({
      provider: 'openrouter',
      model: modelId,
      webSearch: opts.webSearch === true,
      request: opts,
    });
    if (!authorized) throw new Error('This hosted AI request is not authorized. No data was sent.');
  }
  const extensionOptions = getAppExtensionAIRequestOptions({
    provider: 'openrouter',
    model: modelId,
    request: opts,
  });
  const extensionProviderRouting = extensionOptions.provider
    && typeof extensionOptions.provider === 'object'
    && !Array.isArray(extensionOptions.provider)
    ? extensionOptions.provider
    : {};
  const extraBody = {
    ...extensionOptions,
    // OpenRouter aggregates parameter support across a model's providers.
    // Structured requests must only use endpoints that can honor the schema.
    ...(opts.jsonMode ? {
      provider: { ...extensionProviderRouting, require_parameters: true },
    } : {}),
    ...(opts.webSearch ? { plugins: [{ id: 'web' }] } : {}),
  };
  try {
    const extensionCall = await callAppExtensionAIProvider({
      provider: 'openrouter',
      credential: key,
      model: modelId,
      request: opts,
    });
    if (extensionCall.handled) return extensionCall.result;
    if (!key) throw new Error('No OpenRouter API key configured. Add your key in Settings.');
    return await callOpenAICompatibleAPI(
      'https://openrouter.ai/api/v1/chat/completions',
      key,
      modelId,
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
