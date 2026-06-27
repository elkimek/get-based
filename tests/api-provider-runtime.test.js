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
  getAgentRouterModelList,
  isRecommendedModel,
  needsMaxCompletionTokens,
  resolveAgentRouterConfig,
  setAgentRouterMode,
  setAgentRouterModel,
  setAgentRouterOpenRouterModel,
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
import { buildModelOptions, renderAIProviderPanel } from '../js/provider-panel-renderers.js';
import { onAgentRouterModelChange, onAgentRouterOpenRouterModelChange } from '../js/provider-model-controls.js';

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
          id: 'google/gemini-3.5-flash',
          name: 'Gemini 3.5 Flash',
          pricing: { prompt: '0.0000015', completion: '0.000009' },
          architecture: { modality: 'text->text' },
        },
        {
          id: 'google/gemini-3.5-flash-preview',
          name: 'Gemini 3.5 Flash Preview',
          pricing: { prompt: '0.0000005', completion: '0.000003' },
          architecture: { modality: 'text->text' },
        },
        {
          id: 'google/gemini-3.1-flash-lite',
          name: 'Gemini 3.1 Flash Lite',
          pricing: { prompt: '0.00000025', completion: '0.0000015' },
          architecture: { modality: 'text->text' },
        },
        {
          id: 'anthropic/claude-haiku-4.5',
          name: 'Claude Haiku 4.5',
          pricing: { prompt: '0.000001', completion: '0.000005' },
          architecture: { modality: 'text->text' },
        },
        {
          id: 'openai/gpt-5.4-mini',
          name: 'GPT-5.4 Mini',
          pricing: { prompt: '0.00000075', completion: '0.0000045' },
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
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-router-models')).map(m => m.id)).toEqual([
      'google/gemini-3.5-flash',
      'google/gemini-3.1-flash-lite',
      'anthropic/claude-haiku-4.5',
      'openai/gpt-5.4-mini',
    ]);
    expect(JSON.parse(localStorage.getItem('labcharts-openrouter-models-meta'))).toMatchObject({
      provider: 'openrouter',
      source: 'provider-api',
      endpoint: 'https://openrouter.ai/api/v1/models',
    });
    expect(getAgentRouterModelList('openrouter', JSON.parse(localStorage.getItem('labcharts-openrouter-router-models'))).map(m => m.id)).toEqual([
      'google/gemini-3.5-flash',
      'google/gemini-3.1-flash-lite',
      'anthropic/claude-haiku-4.5',
      'openai/gpt-5.4-mini',
    ]);
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
        { id: 'llama-3.1-8b', name: 'Llama', pricing: { prompt: '0.000001', completion: '0.000002' } },
        { id: 'claude-sonnet-4.6', name: 'Claude', pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { input_modalities: ['text', 'image'] } },
        { id: 'claude-sonnet-4.6-20260101', name: 'Claude duplicate' },
        { id: 'gpt-5-preview', name: 'Preview' },
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

    localStorage.setItem('labcharts-routstr-node', 'https://node.example.com/');
    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'new-provider/frontier-1', name: 'Frontier', pricing: { prompt: '0.000004', completion: '0.000012' } },
        { id: 'new-provider/frontier-image', name: 'Image only', architecture: { output_modalities: ['image'] } },
        { id: 'codex-only', name: 'Codex' },
      ],
    }));
    const fallbackRoutstrModels = await fetchRoutstrModels();
    expect(fallbackRoutstrModels.map(m => m.id)).toEqual(['new-provider/frontier-1']);

    fetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'new-ppq/frontier-chat', name: 'PPQ Frontier', type: 'chat', pricing: { input_per_1M_tokens: 4, output_per_1M_tokens: 12 } },
        { id: 'new-ppq/video-model', name: 'Video', type: 'video' },
      ],
    }));
    const fallbackPpqModels = await fetchPpqModels('sk-ppq');
    expect(fallbackPpqModels.map(m => m.id)).toEqual(['new-ppq/frontier-chat']);
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
      modelId: 'google/gemini-3.5-flash',
      requestTimeoutMs: 50,
    })).resolves.toEqual({
      text: 'answer',
      usage: { inputTokens: 11, outputTokens: 13 },
      finishReason: 'stop',
      truncated: false,
    });

    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: 'google/gemini-3.5-flash',
      max_tokens: 42,
      plugins: [{ id: 'web' }],
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'hello' },
      ],
    });
    expect(requestBody).not.toHaveProperty('max_completion_tokens');

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
    expect(isRecommendedModel('agent-router-openrouter', 'google/gemini-3.5-flash')).toBe(true);
    expect(isRecommendedModel('agent-router-ppq', 'gemini-3-flash-preview')).toBe(true);
    expect(isRecommendedModel('agent-router-ppq', 'claude-sonnet-4.6')).toBe(false);
    expect(getAgentRouterModelList('ppq', [
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet' },
      { id: 'gemini-3-flash-preview', name: 'Gemini Flash' },
      { id: 'openai/gpt-5.4-mini', name: 'GPT Mini' },
      { id: 'deepseek-coder-6.7b', name: 'Coder' },
    ]).map(m => m.id)).toEqual(['openai/gpt-5.4-mini', 'gemini-3-flash-preview']);
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

  it('resolves the agent router model for the active provider without leaking across providers', () => {
    setAIProvider('venice');
    setVeniceModel('llama-3.3-70b');
    setAgentRouterMode('auto');
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'auto', provider: 'venice', modelId: null, useMain: true });
    setAgentRouterModel('venice', 'qwen3-4b');
    setAgentRouterOpenRouterModel('google/gemini-3.5-flash');
    localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'qwen3-4b', name: 'Qwen 3 4B' }]));
    localStorage.setItem('labcharts-venice-models-meta', JSON.stringify({ provider: 'venice', source: 'provider-api', endpoint: 'https://api.venice.ai/api/v1/models' }));
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'auto', provider: 'venice', modelId: 'qwen3-4b', useMain: false });

    updateKeyCache('labcharts-openrouter-key', 'sk-or');
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'auto', provider: 'venice', modelId: 'qwen3-4b', useMain: false });

    setAgentRouterMode('openrouter');
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'openrouter', provider: 'venice', modelId: null, useMain: true });

    setAIProvider('openrouter');
    localStorage.setItem('labcharts-openrouter-router-models', JSON.stringify([{ id: 'google/gemini-3.5-flash', name: 'Gemini Flash' }]));
    localStorage.setItem('labcharts-openrouter-models-meta', JSON.stringify({ provider: 'openrouter', source: 'provider-api', endpoint: 'https://openrouter.ai/api/v1/models' }));
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'openrouter', provider: 'openrouter', modelId: 'google/gemini-3.5-flash', useMain: false });

    setAgentRouterMode('main');
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'main', provider: 'openrouter', modelId: null, useMain: true });
  });

  it('shows provider-scoped routing-model controls for OpenRouter and other providers', () => {
    localStorage.setItem('labcharts-openrouter-router-models', JSON.stringify([
      { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    ]));
    localStorage.setItem('labcharts-ppq-models', JSON.stringify([
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet' },
      { id: 'gemini-3-flash-preview', name: 'Gemini Flash' },
      { id: 'openai/gpt-5.4-mini', name: 'GPT Mini' },
      { id: 'grok-4', name: 'Grok Heavy' },
    ]));
    localStorage.setItem('labcharts-ollama-models', JSON.stringify(['llama3.3:70b', 'llama3.2:3b', 'qwen2.5:7b', 'deepseek-coder:6.7b']));
    localStorage.setItem('labcharts-openrouter-models-meta', JSON.stringify({ provider: 'openrouter', source: 'provider-api', endpoint: 'https://openrouter.ai/api/v1/models' }));
    localStorage.setItem('labcharts-ppq-models-meta', JSON.stringify({ provider: 'ppq', source: 'provider-api', endpoint: 'https://api.ppq.ai/v1/models?type=chat' }));
    setAgentRouterMode('openrouter');

    const openrouterPanel = renderAIProviderPanel('openrouter');
    expect(openrouterPanel).toContain('Agent routing: OpenRouter model');
    expect(openrouterPanel).toContain('data-router-provider="openrouter"');
    expect(openrouterPanel).toContain('agent-router-model-select');
    expect(openrouterPanel).toContain('Use main chat model');
    expect(openrouterPanel).not.toContain('agent-router-mode-select');

    setAgentRouterMode('auto');
    setAgentRouterModel('ppq', 'gemini-3-flash-preview');
    const ppqPanel = renderAIProviderPanel('ppq');
    expect(ppqPanel).toContain('Agent routing: PPQ model');
    expect(ppqPanel).toContain('data-router-provider="ppq"');
    const ppqRouterSelect = ppqPanel.match(/id="agent-router-model-select"[\s\S]*?<\/select>/)?.[0] || '';
    expect(ppqRouterSelect).toContain('Gemini Flash');
    expect(ppqRouterSelect).toContain('GPT Mini');
    expect(ppqRouterSelect).not.toContain('Claude Sonnet');
    expect(ppqRouterSelect).not.toContain('Grok Heavy');
    expect(ppqPanel).not.toContain('No separate router model to manage');

    setAgentRouterModel('ollama', 'llama3.2:3b');
    const staleLocalPanel = renderAIProviderPanel('ollama');
    expect(staleLocalPanel).toContain('Routing model: <span style="color:var(--text-primary)">main chat model</span>');
    expect(staleLocalPanel).not.toContain('data-router-provider="ollama"');

    localStorage.setItem('labcharts-ollama-models-meta', JSON.stringify({ provider: 'ollama', source: 'provider-api', endpoint: 'http://localhost:11434/v1/models' }));
    const localPanel = renderAIProviderPanel('ollama');
    expect(localPanel).toContain('Agent routing: Local AI model');
    expect(localPanel).toContain('data-router-provider="ollama"');
    const localRouterSelect = localPanel.match(/id="agent-router-model-select"[\s\S]*?<\/select>/)?.[0] || '';
    expect(localRouterSelect).toContain('llama3.2:3b');
    expect(localRouterSelect).toContain('qwen2.5:7b');
    expect(localRouterSelect).not.toContain('llama3.3:70b');
    expect(localRouterSelect).not.toContain('deepseek-coder:6.7b');
    expect(localPanel).not.toContain('No separate router model to manage');
  });

  it('escapes provider-controlled model ids in rendered option values', () => {
    const payload = 'x\"></option></select><img src=x onerror=alert(1)><select><option value=\"y';
    const html = `<select>${buildModelOptions('custom', [{ id: payload, name: 'Evil model' }], payload, m => m.name || m.id)}</select>`;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    expect(wrapper.querySelector('img')).toBeNull();
    expect(html).toContain('&quot;&gt;&lt;/option&gt;&lt;/select&gt;&lt;img');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('single routing-model dropdown toggles between main chat model and provider router model', async () => {
    setAIProvider('ppq');
    setAgentRouterModel('ppq', 'claude-sonnet-4.6');
    localStorage.setItem('labcharts-ppq-models', JSON.stringify([{ id: 'claude-haiku-4.5', name: 'Claude Haiku' }]));
    localStorage.setItem('labcharts-ppq-models-meta', JSON.stringify({ provider: 'ppq', source: 'provider-api', endpoint: 'https://api.ppq.ai/v1/models?type=chat' }));

    await onAgentRouterOpenRouterModelChange('__main');
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'main', provider: 'ppq', modelId: null, useMain: true });

    await onAgentRouterModelChange('claude-haiku-4.5', 'ppq');
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'ppq', provider: 'ppq', modelId: 'claude-haiku-4.5', useMain: false });
  });

  it('does not route with stale provider router ids when trusted model cache metadata is absent', () => {
    setAIProvider('ollama');
    setAgentRouterMode('ollama');
    setAgentRouterModel('ollama', 'llama3.2:3b');
    localStorage.setItem('labcharts-ollama-models', JSON.stringify(['llama3.2:3b']));
    localStorage.removeItem('labcharts-ollama-models-meta');
    expect(resolveAgentRouterConfig()).toMatchObject({ mode: 'ollama', provider: 'ollama', modelId: null, useMain: true });
  });
});
