import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { updateKeyCache } from '../js/crypto.js';
import {
  callOpenRouterAPI,
  exchangeOpenRouterCode,
  fetchCustomApiModels,
  fetchOpenRouterModelPricing,
  fetchOpenRouterModels,
  fetchPpqModels,
  fetchRoutstrModels,
  fetchVeniceModels,
  getCustomApiModel,
  getOpenRouterBalance,
  getPpqBalance,
  getPpqModel,
  getVeniceModel,
  getVeniceBalance,
  isRecommendedModel,
  needsMaxCompletionTokens,
  setAIProvider,
  setCustomApiModel,
  setCustomApiUrl,
  setOpenRouterModel,
  setPpqPrivateMode,
  setPpqModel,
  setRoutstrModel,
  setVeniceE2EE,
  setVeniceModel,
  supportsVision,
  supportsWebSearch,
  validateCustomApiKey,
  validateOpenRouterKey,
  validatePpqKey,
  validateRoutstrKey,
} from '../js/api.js';
import { configureApiRuntimeCallbacks } from '../js/api-runtime.js';

const realFetch = globalThis.fetch;
const realLocation = globalThis.location;
let previousApiRuntimeCallbacks;

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
  previousApiRuntimeCallbacks = configureApiRuntimeCallbacks({ showInsufficientBalanceDialog: () => false });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realLocation) globalThis.location = realLocation;
  else delete globalThis.location;
  clearKeyCaches();
  configureApiRuntimeCallbacks(previousApiRuntimeCallbacks);
  vi.restoreAllMocks();
});

describe('API provider runtime behavior', () => {
  it('filters OpenRouter models, caches pricing and vision metadata, and fetches fuzzy pricing', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        {
          id: 'openai/gpt-5.6-sol',
          name: 'GPT 5.6 Sol',
          pricing: { prompt: '0.000005', completion: '0.000030' },
          architecture: { modality: 'text->text' },
        },
        { id: 'openai/gpt-5.5', name: 'GPT 5.5' },
        {
          id: 'anthropic/claude-sonnet-4.6',
          name: 'Claude Sonnet 4.6',
          pricing: { prompt: '0.000003', completion: '0.000015' },
          architecture: { modality: 'image->text' },
        },
        {
          id: 'anthropic/claude-sonnet-5',
          name: 'Claude Sonnet 5',
          pricing: { prompt: '0.000002', completion: '0.000010' },
          architecture: { modality: 'text+image+file->text' },
        },
        {
          id: 'google/gemini-3.5-flash',
          name: 'Gemini 3.5 Flash',
          pricing: { prompt: '0.0000007', completion: '0.00000375' },
          architecture: { modality: 'text+image+file->text' },
        },
        {
          id: 'z-ai/glm-5.2',
          name: 'GLM 5.2',
          pricing: { prompt: '0.000001', completion: '0.000003' },
          architecture: { modality: 'text->text' },
        },
        {
          id: 'moonshotai/kimi-k2.7-code',
          name: 'Kimi K2.7 Code',
          pricing: { prompt: '0.00000056', completion: '0.0000035' },
          architecture: { modality: 'text->text' },
        },
        {
          id: 'moonshotai/kimi-k3',
          name: 'Kimi K3',
          pricing: { prompt: '0.000003', completion: '0.000015' },
          architecture: { modality: 'text+image->text' },
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
      'anthropic/claude-sonnet-5',
      'google/gemini-3.5-flash',
      'z-ai/glm-5.2',
      'openai/gpt-5.6-sol',
      'moonshotai/kimi-k3',
      'openai/gpt-5.5',
      'moonshotai/kimi-k2.7-code',
    ]);
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-pricing'))).toMatchObject({
      'anthropic/claude-sonnet-4.6': { input: 3, output: 15 },
      'anthropic/claude-sonnet-5': { input: 2, output: 10 },
      'google/gemini-3.5-flash': { input: 0.7, output: 3.75 },
      'z-ai/glm-5.2': { input: 1, output: 3 },
      'moonshotai/kimi-k2.7-code': { input: 0.56, output: 3.5 },
      'moonshotai/kimi-k3': { input: 3, output: 15 },
      'openai/gpt-5.6-sol': { input: 5, output: 30 },
    });
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-vision-models'))).toContain('anthropic/claude-sonnet-4.6');
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-vision-models'))).toContain('anthropic/claude-sonnet-5');
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-vision-models'))).toContain('google/gemini-3.5-flash');
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-vision-models'))).toContain('moonshotai/kimi-k3');
    expect(localStorage.getItem('labcharts-openrouter-model')).toBe('openai/gpt-5.6-sol');

    expect(await fetchOpenRouterModelPricing('openai/gpt-5.6-sol')).toEqual({ input: 5, output: 30 });

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
        { id: 'claude-sonnet-5', name: 'Claude 5', enabled: true, pricing: { prompt: '0.000002', completion: '0.000010' }, architecture: { input_modalities: ['text', 'image'] } },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2', enabled: true, pricing: { prompt: '0.000001', completion: '0.000003' } },
        { id: 'claude-sonnet-4.6-20260101', name: 'Claude duplicate', enabled: true },
        { id: 'grok-41-fast', name: 'Grok 4.1 Fast', enabled: true, pricing: { prompt: '0.00000025', completion: '0.00000063' } },
        { id: 'x-ai/grok-4.3', name: 'Grok 4.3', enabled: true, pricing: { prompt: '0.000003', completion: '0.000015' } },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3', enabled: true, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text', 'image'] } },
        { id: 'gpt-5-preview', name: 'Preview', enabled: true },
        { id: 'grok-4', name: 'Disabled', enabled: false },
      ],
    }));

    const routstrModels = await fetchRoutstrModels();

    expect(fetch).toHaveBeenCalledWith('https://node.example.com/v1/models');
    expect(routstrModels.map(m => m.id)).toEqual(['claude-sonnet-4.6', 'claude-sonnet-5', 'z-ai/glm-5.2', 'grok-41-fast', 'x-ai/grok-4.3', 'moonshotai/kimi-k3', 'llama-3.1-8b']);
    expect(localStorage.getItem('labcharts-routstr-model')).toBe('claude-sonnet-5');
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-pricing'))['claude-sonnet-4.6']).toEqual({ input: 3, output: 15 });
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-pricing'))['claude-sonnet-5']).toEqual({ input: 2, output: 10 });
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-pricing'))['z-ai/glm-5.2']).toEqual({ input: 1, output: 3 });
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-pricing'))['x-ai/grok-4.3']).toEqual({ input: 3, output: 15 });
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-pricing'))['moonshotai/kimi-k3']).toEqual({ input: 3, output: 15 });
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-vision-models'))).toContain('claude-sonnet-4.6');
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-vision-models'))).toContain('claude-sonnet-5');
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-vision-models'))).toContain('moonshotai/kimi-k3');

    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'perplexity/sonar', name: 'Sonar', pricing: { input_per_1M_tokens: '2', output_per_1M_tokens: '8' }, architecture: { modality: 'text->text' } },
        { id: 'claude-sonnet-4.6', name: 'Claude', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' }, architecture: { modality: 'image->text' } },
        { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { input_per_1M_tokens: '2', output_per_1M_tokens: '10' }, architecture: { modality: 'image->text' } },
        { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash', pricing: { input_per_1M_tokens: '0.7', output_per_1M_tokens: '3.75' }, architecture: { modality: 'image->text' } },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2', pricing: { input_per_1M_tokens: '1', output_per_1M_tokens: '3.2' } },
        { id: 'x-ai/grok-4.3', name: 'Grok 4.3', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' } },
        { id: 'grok-4.20', name: 'Grok 4.20', pricing: { input_per_1M_tokens: '2', output_per_1M_tokens: '10' } },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code', pricing: { input_per_1M_tokens: '0.56', output_per_1M_tokens: '3.5' } },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3', pricing: { input_per_1M_tokens: '3.165', output_per_1M_tokens: '15.825' }, architecture: { modality: 'text+image->text' } },
        { id: 'gpt-4-audio-preview', name: 'Audio' },
      ],
    }));

    const ppqModels = await fetchPpqModels('sk-ppq');

    expect(ppqModels.map(m => m.id)).toEqual(['claude-sonnet-4.6', 'claude-sonnet-5', 'google/gemini-3.5-flash', 'z-ai/glm-5.2', 'grok-4.20', 'x-ai/grok-4.3', 'moonshotai/kimi-k3', 'moonshotai/kimi-k2.7-code', 'perplexity/sonar']);
    expect(localStorage.getItem('labcharts-ppq-model')).toBe('claude-sonnet-5');
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing'))['claude-sonnet-4.6']).toEqual({ input: 3, output: 15 });
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing'))['claude-sonnet-5']).toEqual({ input: 2, output: 10 });
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing'))['google/gemini-3.5-flash']).toEqual({ input: 0.7, output: 3.75 });
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing'))['z-ai/glm-5.2']).toEqual({ input: 1, output: 3.2 });
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing'))['moonshotai/kimi-k2.7-code']).toEqual({ input: 0.56, output: 3.5 });
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing'))['moonshotai/kimi-k3']).toEqual({ input: 3.165, output: 15.825 });
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-vision-models'))).toContain('claude-sonnet-4.6');
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-vision-models'))).toContain('claude-sonnet-5');
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-vision-models'))).toContain('google/gemini-3.5-flash');
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-vision-models'))).toContain('moonshotai/kimi-k3');
  });

  it('uses GPT 5.5 then Claude as fetched defaults and GLM 5.2 for private modes', async () => {
    setCustomApiUrl('https://custom.example/v1');
    updateKeyCache('labcharts-custom-key', 'sk-custom');
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'openai/gpt-5.5', name: 'GPT 5.5' },
        { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
      ],
    }));
    await fetchCustomApiModels('https://custom.example/v1', 'sk-custom');
    expect(getCustomApiModel()).toBe('openai/gpt-5.5');

    setCustomApiModel('');
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'model-a', name: 'Model A' },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      ],
    }));
    await fetchCustomApiModels('https://custom.example/v1', 'sk-custom');
    expect(getCustomApiModel()).toBe('claude-sonnet-5');

    setVeniceE2EE(true);
    setVeniceModel('missing-e2ee-model');
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'e2ee-qwen3-5-122b-a10b', name: 'Qwen E2EE', type: 'text', model_spec: { capabilities: { supportsE2EE: true } } },
        { id: 'e2ee-glm-5-2-p', name: 'GLM 5.2 E2EE', type: 'text', model_spec: { capabilities: { supportsE2EE: true } } },
        { id: 'llama-3.3-70b', name: 'Llama', type: 'text', model_spec: { capabilities: { supportsE2EE: false } } },
      ],
    }));
    await fetchVeniceModels('venice-key');
    expect(getVeniceModel()).toBe('e2ee-glm-5-2-p');

    setPpqPrivateMode(true);
    setPpqModel('missing-private-model');
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'claude-sonnet-4.6', name: 'Claude', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' } },
        { id: 'private/kimi-k2-6', name: 'Kimi K2.6 Private', pricing: { input_per_1M_tokens: '1.58', output_per_1M_tokens: '5.51' } },
        { id: 'private/glm-5-2', name: 'GLM 5.2 Private', pricing: { input_per_1M_tokens: '1.58', output_per_1M_tokens: '5.51' } },
      ],
    }));
    await fetchPpqModels('sk-ppq');
    expect(getPpqModel()).toBe('private/glm-5-2');
  });

  it('accepts newly API-listed PPQ private models without a local allowlist', async () => {
    setAIProvider('ppq');
    setPpqPrivateMode(true);
    setPpqModel('private/kimi-k3');
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
        {
          id: 'private/kimi-k3',
          name: 'Kimi K3 (Private via TEE)',
          pricing: { input_per_1M_tokens: 4.22, output_per_1M_tokens: 21.1 },
        },
        {
          id: 'private/future-tee-model',
          name: 'Future TEE Model',
          pricing: { input_per_1M_tokens: 1.25, output_per_1M_tokens: 2.5 },
        },
      ],
    }));

    const models = await fetchPpqModels('sk-ppq');

    expect(models.map(model => model.id)).toEqual([
      'private/future-tee-model',
      'private/kimi-k3',
    ]);
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-private-models'))
      .map(model => model.id)).toEqual([
      'private/future-tee-model',
      'private/kimi-k3',
    ]);
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-pricing'))).toMatchObject({
      'private/future-tee-model': { input: 1.25, output: 2.5 },
      'private/kimi-k3': { input: 4.22, output: 21.1 },
    });
    expect(JSON.parse(localStorage.getItem('labcharts-ppq-private-vision-models')))
      .toContain('private/kimi-k3');
    expect(getPpqModel()).toBe('private/kimi-k3');
    expect(isRecommendedModel('ppq', 'private/kimi-k3')).toBe(true);
    expect(isRecommendedModel('ppq', 'private/gpt-oss-120b')).toBe(false);
    expect(supportsVision()).toBe(true);
  });

  it('proxies Custom API validation for the explicit unsaved remote URL', async () => {
    setAIProvider('openrouter');
    setCustomApiUrl('http://localhost:11434/v1');
    fetch
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'model-a', name: 'Model A' }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(validateCustomApiKey('https://remote.example/v1', 'sk-custom')).resolves.toEqual({ valid: true });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/proxy', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"url":"https://remote.example/v1/models"'),
    }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      url: 'https://remote.example/v1/models',
      method: 'GET',
      headers: { Authorization: 'Bearer sk-custom' },
    });
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/proxy', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"url":"https://remote.example/v1/chat/completions"'),
    }));
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

    const onStream = vi.fn();
    fetch.mockResolvedValueOnce(jsonResponse({
      choices: [{ message: { content: 'forced json' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2, completion_tokens: 3 },
    }));
    await expect(callOpenRouterAPI({
      messages: [{ role: 'user', content: 'fallback' }],
      onStream,
      forceNonStream: true,
      requestTimeoutMs: 50,
    })).resolves.toEqual({
      text: 'forced json',
      usage: { inputTokens: 2, outputTokens: 3 },
      finishReason: 'stop',
      truncated: false,
    });
    const forcedBody = JSON.parse(fetch.mock.calls.at(-1)[1].body);
    expect(forcedBody).not.toHaveProperty('stream');
    expect(forcedBody).not.toHaveProperty('stream_options');
    expect(onStream).not.toHaveBeenCalled();

    const showInsufficientBalanceDialog = vi.fn();
    configureApiRuntimeCallbacks({ showInsufficientBalanceDialog });
    fetch.mockResolvedValueOnce(new Response('{}', { status: 402 }));
    await expect(callOpenRouterAPI({
      messages: [{ role: 'user', content: 'hello again' }],
      requestTimeoutMs: 50,
    })).rejects.toMatchObject({ _modalShown: true });
    expect(showInsufficientBalanceDialog).toHaveBeenCalledTimes(1);
  });

  it('reports model capabilities across providers', () => {
    expect(needsMaxCompletionTokens('openai/gpt-5.4')).toBe(true);
    expect(needsMaxCompletionTokens('o3-mini')).toBe(true);
    expect(needsMaxCompletionTokens('anthropic/claude-sonnet-4.6')).toBe(false);

    expect(isRecommendedModel('openrouter', 'anthropic/claude-sonnet-5')).toBe(true);
    expect(isRecommendedModel('openrouter', 'anthropic/claude-sonnet-4.6')).toBe(true);
    expect(isRecommendedModel('openrouter', 'anthropic/claude-opus-5')).toBe(true);
    expect(isRecommendedModel('openrouter', 'anthropic/claude-opus-4.8')).toBe(false);
    expect(isRecommendedModel('openrouter', 'openai/gpt-5.6-sol')).toBe(true);
    expect(isRecommendedModel('openrouter', 'openai/gpt-5.5')).toBe(false);
    expect(isRecommendedModel('openrouter', 'google/gemini-3.5-flash')).toBe(true);
    expect(isRecommendedModel('openrouter', 'z-ai/glm-5.2')).toBe(true);
    expect(isRecommendedModel('openrouter', 'moonshotai/kimi-k2.7-code')).toBe(false);
    expect(isRecommendedModel('openrouter', 'moonshotai/kimi-k2.6')).toBe(false);
    expect(isRecommendedModel('openrouter', 'moonshotai/kimi-k3')).toBe(true);
    expect(isRecommendedModel('openrouter', 'google/gemini-3.1-pro')).toBe(false);
    expect(isRecommendedModel('venice', 'claude-sonnet-5')).toBe(true);
    expect(isRecommendedModel('venice', 'claude-opus-5')).toBe(true);
    expect(isRecommendedModel('venice', 'claude-opus-4-8')).toBe(false);
    expect(isRecommendedModel('venice', 'gemini-3-5-flash')).toBe(true);
    expect(isRecommendedModel('venice', 'zai-org-glm-5-2')).toBe(true);
    expect(isRecommendedModel('venice', 'kimi-k2-7-code')).toBe(false);
    expect(isRecommendedModel('venice', 'kimi-k2-6')).toBe(false);
    expect(isRecommendedModel('venice', 'kimi-k3')).toBe(true);
    expect(isRecommendedModel('venice', 'e2ee-qwen3-5-122b')).toBe(true);
    expect(isRecommendedModel('routstr', 'claude-sonnet-5')).toBe(true);
    expect(isRecommendedModel('routstr', 'claude-sonnet-4.6')).toBe(true);
    expect(isRecommendedModel('routstr', 'claude-opus-5')).toBe(true);
    expect(isRecommendedModel('routstr', 'claude-opus-4.8')).toBe(false);
    expect(isRecommendedModel('routstr', 'x-ai/grok-4.3')).toBe(true);
    expect(isRecommendedModel('routstr', 'moonshotai/kimi-k3')).toBe(true);
    expect(isRecommendedModel('routstr', 'moonshotai/kimi-k2.7-code')).toBe(false);
    expect(isRecommendedModel('routstr', 'moonshotai/kimi-k2.6')).toBe(false);
    expect(isRecommendedModel('ppq', 'claude-sonnet-5')).toBe(true);
    expect(isRecommendedModel('ppq', 'claude-opus-5')).toBe(true);
    expect(isRecommendedModel('ppq', 'claude-opus-4.8')).toBe(false);
    expect(isRecommendedModel('ppq', 'x-ai/grok-4.3')).toBe(true);
    expect(isRecommendedModel('ppq', 'google/gemini-3.5-flash')).toBe(true);
    expect(isRecommendedModel('ppq', 'z-ai/glm-5.2')).toBe(true);
    expect(isRecommendedModel('ppq', 'moonshotai/kimi-k2.7-code')).toBe(false);
    expect(isRecommendedModel('ppq', 'moonshotai/kimi-k2.6')).toBe(false);
    expect(isRecommendedModel('ppq', 'moonshotai/kimi-k3')).toBe(true);
    expect(isRecommendedModel('ppq', 'gemini-3-flash-preview')).toBe(true);
    expect(isRecommendedModel('custom', 'claude-sonnet-5')).toBe(true);
    expect(isRecommendedModel('custom', 'anthropic/claude-opus-5')).toBe(true);
    expect(isRecommendedModel('custom', 'anthropic/claude-opus-4.8')).toBe(false);
    expect(isRecommendedModel('custom', 'gemini-3.5-flash')).toBe(true);
    expect(isRecommendedModel('custom', 'z-ai/glm-5.2')).toBe(true);
    expect(isRecommendedModel('custom', 'moonshotai/kimi-k2.7-code')).toBe(false);
    expect(isRecommendedModel('custom', 'moonshotai/kimi-k2.6')).toBe(false);
    expect(isRecommendedModel('custom', 'moonshotai/kimi-k3')).toBe(true);

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
