// @ts-check
// api-openrouter.js - OpenRouter provider adapter.

import {
  getOpenRouterKey,
  getOpenRouterModel,
} from './api-provider-storage.js';
import { getApiLocationOriginRuntime } from './api-runtime.js';
import { callOpenAICompatibleAPI } from './api-openai-compatible.js';

export async function getOpenRouterBalance() {
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
  const extraBody = opts.webSearch ? { plugins: [{ id: 'web' }] } : {};
  return callOpenAICompatibleAPI(
    'https://openrouter.ai/api/v1/chat/completions',
    key,
    getOpenRouterModel(),
    'OpenRouter',
    opts,
    { 'HTTP-Referer': getApiLocationOriginRuntime(), 'X-Title': 'getbased' },
    { extraBody }
  );
}
