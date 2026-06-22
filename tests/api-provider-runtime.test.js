import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { updateKeyCache } from '../js/crypto.js';
import {
  callOpenRouterAPI,
  exchangeOpenRouterCode,
  fetchOpenRouterModelPricing,
  fetchOpenRouterModels,
  fetchPpqModels,
  fetchRoutstrModels,
  getOpenRouterBalance,
  getPpqBalance,
  getVeniceBalance,
  isRecommendedModel,
  needsMaxCompletionTokens,
  setAIProvider,
  setCustomApiModel,
  setCustomApiUrl,
  setOpenRouterModel,
  setPpqModel,
  setRoutstrModel,
  setVeniceE2EE,
  setVeniceModel,
  supportsVision,
  supportsWebSearch,
  validateOpenRouterKey,
  validatePpqKey,
  validateRoutstrKey,
} from '../js/api.js';

const realFetch = globalThis.fetch;
const realLocation = globalThis.location;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

function sha256Base64Url(value) {
  return createHash('sha256').update(value).digest('base64url');
}

function clearKeyCaches() {
  [
    'labcharts-openrouter-key',
    'labcharts-venice-key',
    'labcharts-routstr-key',
    'labcharts-ppq-key',
    'labcharts-custom-key',
  ].forEach(key => updateKeyCache(key, ''));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearKeyCaches();
  globalThis.fetch = vi.fn();
  globalThis.location = { origin: 'https://getbased.test', pathname: '/app' };
  window.showInsufficientBalanceDialog = undefined;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realLocation) globalThis.location = realLocation;
  else delete globalThis.location;
  clearKeyCaches();
  vi.restoreAllMocks();
});

describe('API provider runtime behavior', () => {
  it('filters OpenRouter models, caches pricing and vision metadata, and fetches fuzzy pricing', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        {
          id: 'openai/gpt-5.5',
          name: 'GPT 5.5',
          pricing: { prompt: '0.000004', completion: '0.000012' },
          architecture: { modality: 'text->text' },
        },
        {
          id: 'anthropic/claude-sonnet-4.6',
          name: 'Claude Sonnet 4.6',
          pricing: { prompt: '0.000003', completion: '0.000015' },
          architecture: { modality: 'image->text' },
        },
        {
          id: 'anthropic/claude-sonnet-4.6:2026-01-01',
          name: 'Claude Sonnet dated duplicate',
          pricing: { prompt: '0.000003', completion: '0.000015' },
        },
        { id: 'openai/gpt-5.5-codex', name: 'GPT Codex' },
        { id: 'old/vendor-model', name: 'Old model' },
      ],
    }));

    const models = await fetchOpenRouterModels('sk-or');

    expect(fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: 'Bearer sk-or' },
    });
    expect(models.map(m => m.id)).toEqual([
      'anthropic/claude-sonnet-4.6',
      'openai/gpt-5.5',
    ]);
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-pricing'))).toMatchObject({
      'anthropic/claude-sonnet-4.6': { input: 3, output: 15 },
      'openai/gpt-5.5': { input: 4, output: 12 },
    });
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-vision-models'))).toContain('anthropic/claude-sonnet-4.6');
    expect(localStorage.getItem('labcharts-openrouter-model')).toBe('anthropic/claude-sonnet-4.6');

    expect(await fetchOpenRouterModelPricing('openai/gpt-5.5')).toEqual({ input: 4, output: 12 });

    localStorage.setItem('labcharts-openrouter-pricing', '{}');
    updateKeyCache('labcharts-openrouter-key', 'sk-or');
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'anthropic/claude-sonnet-4.6-20260101', pricing: { prompt: '0.000003', completion: '0.000015' } },
      ],
    }));

    await expect(fetchOpenRouterModelPricing('anthropic/claude-sonnet-4.6')).resolves.toEqual({ input: 3, output: 15 });
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-pricing'))).toMatchObject({
      'anthropic/claude-sonnet-4.6': { input: 3, output: 15 },
      'anthropic/claude-sonnet-4.6-20260101': { input: 3, output: 15 },
    });
  });

  it('filters Routstr and PPQ models and preserves provider-specific pricing semantics', async () => {
    localStorage.setItem('labcharts-routstr-node', 'https://node.example.com/');
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'llama-3.1-8b', name: 'Llama', enabled: true, pricing: { prompt: '0.000001', completion: '0.000002' } },
        { id: 'claude-sonnet-4.6', name: 'Claude', enabled: true, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text', 'image'] } },
        { id: 'claude-sonnet-4.6-20260101', name: 'Claude duplicate', enabled: true },
        { id: 'gpt-5-preview', name: 'Preview', enabled: true },
        { id: 'grok-4', name: 'Disabled', enabled: false },
      ],
    }));

    const routstrModels = await fetchRoutstrModels();

    expect(fetch).toHaveBeenCalledWith('https://node.example.com/v1/models');
    expect(routstrModels.map(m => m.id)).toEqual(['claude-sonnet-4.6', 'llama-3.1-8b']);
    expect(localStorage.getItem('labcharts-routstr-model')).toBe('claude-sonnet-4.6');
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-pricing'))['claude-sonnet-4.6']).toEqual({ input: 3, output: 15 });
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-vision-models'))).toContain('claude-sonnet-4.6');

    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'perplexity/sonar', name: 'Sonar', pricing: { input_per_1M_tokens: '2', output_per_1M_tokens: '8' }, architecture: { modality: 'text->text' } },
        { id: 'claude-sonnet-4.6', name: 'Claude', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' }, architecture: { modality: 'image->text' } },
        { id: 'gpt-4-audio-preview', name: 'Audio' },
      ],
    }));

    const ppqModels = await fetchPpqModels('sk-ppq');

    expect(ppqModels.map(m => m.id)).toEqual(['claude-sonnet-4.6', 'perplexity/sonar']);
    expect(localStorage.getItem('labcharts-ppq-model')).toBe('claude-sonnet-4.6');
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing'))['claude-sonnet-4.6']).toEqual({ input: 3, output: 15 });
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-vision-models'))).toContain('claude-sonnet-4.6');
  });

  it('validates provider keys and reads balance endpoints defensively', async () => {
    fetch
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockRejectedValueOnce(new TypeError('offline'));

    await expect(validateOpenRouterKey('bad')).resolves.toEqual({ valid: false, error: 'Invalid API key' });
    await expect(validatePpqKey('busy')).resolves.toEqual({ valid: true });
    await expect(validatePpqKey('offline')).resolves.toEqual({ valid: false, error: 'Cannot reach PPQ API: offline' });

    expect(await validateRoutstrKey('cashu:cashuA-token')).toEqual({ valid: true });
    expect(await validateRoutstrKey('sk-routstr')).toEqual({ valid: true });
    expect(await validateRoutstrKey('not-a-key')).toEqual({
      valid: false,
      error: 'Key should start with sk-... (session key) or cashu... (eCash token)',
    });

    updateKeyCache('labcharts-openrouter-key', 'sk-or');
    updateKeyCache('labcharts-venice-key', 'sk-venice');
    updateKeyCache('labcharts-ppq-key', 'sk-ppq');
    localStorage.setItem('labcharts-ppq-credit-id', 'credit-1');
    fetch
      .mockResolvedValueOnce(jsonResponse({ data: { total_credits: 20, total_usage: 7 } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'x-venice-balance-diem': '12.5' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: { usd: 4.25 } }));

    await expect(getOpenRouterBalance()).resolves.toEqual({ total: 20, used: 7, remaining: 13 });
    await expect(getVeniceBalance()).resolves.toEqual({ diem: 12.5, canConsume: true });
    await expect(getPpqBalance()).resolves.toEqual({ usd: 4.25 });
  });

  it('exchanges OpenRouter OAuth codes only with a matching tab state', async () => {
    await expect(exchangeOpenRouterCode('code-without-verifier', 'state')).rejects.toThrow('Missing PKCE verifier');

    sessionStorage.setItem('or_pkce_verifier', 'verifier-a');
    sessionStorage.setItem('or_oauth_state', 'state-a');
    await expect(exchangeOpenRouterCode('code-a', 'state-b')).rejects.toThrow('OAuth state mismatch');
    expect(sessionStorage.getItem('or_pkce_verifier')).toBeNull();
    expect(sessionStorage.getItem('or_oauth_state')).toBeNull();

    sessionStorage.setItem('or_pkce_verifier', 'verifier-b');
    sessionStorage.setItem('or_oauth_state', 'state-b');
    fetch.mockResolvedValueOnce(jsonResponse({ key: 'sk-new' }));

    await expect(exchangeOpenRouterCode('code-b', 'state-b')).resolves.toBe('sk-new');
    expect(fetch).toHaveBeenLastCalledWith('https://openrouter.ai/api/v1/auth/keys', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://getbased.test',
        'X-Title': 'getbased',
      }),
    }));
    expect(JSON.parse(fetch.mock.calls.at(-1)[1].body)).toEqual({
      code: 'code-b',
      code_verifier: 'verifier-b',
      code_challenge_method: 'S256',
    });
    expect(sessionStorage.getItem('or_pkce_verifier')).toBeNull();
    expect(sessionStorage.getItem('or_oauth_state')).toBeNull();

    sessionStorage.setItem('or_pkce_verifier', 'verifier-c');
    sessionStorage.setItem('or_oauth_state', `sha256:${sha256Base64Url('state-c')}`);
    fetch.mockResolvedValueOnce(jsonResponse({ key: 'sk-hashed' }));

    await expect(exchangeOpenRouterCode('code-c', 'state-c')).resolves.toBe('sk-hashed');
    expect(JSON.parse(fetch.mock.calls.at(-1)[1].body)).toEqual({
      code: 'code-c',
      code_verifier: 'verifier-c',
      code_challenge_method: 'S256',
    });
    expect(sessionStorage.getItem('or_pkce_verifier')).toBeNull();
    expect(sessionStorage.getItem('or_oauth_state')).toBeNull();
  });

  it('builds OpenAI-compatible chat bodies and surfaces provider balance failures', async () => {
    updateKeyCache('labcharts-openrouter-key', 'sk-or');
    setOpenRouterModel('openai/gpt-5.5');
    fetch.mockResolvedValueOnce(jsonResponse({
      choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 13 },
    }));

    await expect(callOpenRouterAPI({
      system: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 42,
      webSearch: true,
      requestTimeoutMs: 50,
    })).resolves.toEqual({
      text: 'answer',
      usage: { inputTokens: 11, outputTokens: 13 },
      finishReason: 'stop',
      truncated: false,
    });

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: 'openai/gpt-5.5',
      max_completion_tokens: 42,
      plugins: [{ id: 'web' }],
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'hello' },
      ],
    });
    expect(requestBody).not.toHaveProperty('max_tokens');

    window.showInsufficientBalanceDialog = vi.fn();
    fetch.mockResolvedValueOnce(new Response('{}', { status: 402 }));
    await expect(callOpenRouterAPI({
      messages: [{ role: 'user', content: 'hello again' }],
      requestTimeoutMs: 50,
    })).rejects.toMatchObject({ _modalShown: true });
    expect(window.showInsufficientBalanceDialog).toHaveBeenCalledTimes(1);
  });

  it('reports model capabilities across providers', () => {
    expect(needsMaxCompletionTokens('openai/gpt-5.4')).toBe(true);
    expect(needsMaxCompletionTokens('o3-mini')).toBe(true);
    expect(needsMaxCompletionTokens('anthropic/claude-sonnet-4.6')).toBe(false);

    expect(isRecommendedModel('openrouter', 'anthropic/claude-sonnet-4.6')).toBe(true);
    expect(isRecommendedModel('venice', 'e2ee-qwen3-5-122b')).toBe(true);
    expect(isRecommendedModel('routstr', 'claude-sonnet-4.6')).toBe(true);
    expect(isRecommendedModel('ppq', 'gemini-3-flash-preview')).toBe(true);

    setAIProvider('openrouter');
    setOpenRouterModel('anthropic/claude-sonnet-4.6:2026-01-01');
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(['anthropic/claude-sonnet-4.6']));
    expect(supportsWebSearch()).toBe(true);
    expect(supportsVision()).toBe(true);

    setAIProvider('venice');
    setVeniceModel('e2ee-qwen3-5-122b');
    setVeniceE2EE(true);
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-qwen3-5-122b' }]));
    expect(supportsWebSearch()).toBe(false);
    expect(supportsVision()).toBe(false);

    setAIProvider('routstr');
    setRoutstrModel('grok-4-20260101');
    localStorage.setItem('labcharts-routstr-vision-models', JSON.stringify(['grok-4']));
    expect(supportsWebSearch()).toBe(false);
    expect(supportsVision()).toBe(true);

    setAIProvider('ppq');
    setPpqModel('perplexity/sonar');
    localStorage.setItem('labcharts-ppq-vision-models', 'not-json');
    expect(supportsWebSearch()).toBe(true);
    expect(supportsVision()).toBe(false);

    setAIProvider('custom');
    setCustomApiUrl('http://localhost:11434/v1');
    setCustomApiModel('local-vision');
    expect(supportsWebSearch()).toBe(false);
    expect(supportsVision()).toBe(true);
  });
});
