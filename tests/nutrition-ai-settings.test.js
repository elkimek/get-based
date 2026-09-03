import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setAIProvider, setOllamaMainModel, setOpenRouterModel, setVeniceModel } from '../js/api.js';
import { updateKeyCache } from '../js/crypto-key-cache.js';
import { AGENT_HOST_TOKEN_KEY, setChatBackend } from '../js/agent-chat-settings.js';
import { cacheAgentModelCatalog } from '../js/agent-model-catalog.js';
import { discoverLocalAI } from '../js/local-ai-discovery.js';
import {
  getDefaultNutritionComparisonModelValues,
  getMealAISelection,
  getNutritionModelGuidance,
  isConfirmedMealVisionModel,
  listNutritionVisionModels,
  getNutritionAIRoute,
  hydrateNutritionLocalAICatalog,
  renderNutritionAISettings,
  setNutritionAIRoute,
  setNutritionAIRouteFromValue,
} from '../js/nutrition-ai-settings.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  updateKeyCache('labcharts-openrouter-key', '');
  updateKeyCache('labcharts-venice-key', '');
  updateKeyCache('labcharts-ollama', '');
  updateKeyCache(AGENT_HOST_TOKEN_KEY, '');
  window._lastOllamaModelDetails = [];
  window._lastIsOllamaServer = false;
  setAIProvider('ollama');
  setOllamaMainModel('qwen-vl-chat');
  window._lastOllamaModelDetails = [
    { name: 'qwen-vl-chat', vision: true },
    { name: 'llava-meal', vision: true },
  ];
  window._lastIsOllamaServer = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('meal-photo model routing', () => {
  it('follows a vision-capable Codex assistant and names a direct fallback when needed', () => {
    updateKeyCache(AGENT_HOST_TOKEN_KEY, 'paired-agent-token');
    localStorage.setItem('labcharts-agent-host-model', 'gpt-5.6-sol');
    setChatBackend('codex');
    cacheAgentModelCatalog([{
      id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true,
      inputModalities: ['text', 'image'], supportedReasoningEfforts: [],
    }]);

    expect(getMealAISelection()).toMatchObject({
      adapter: 'codex', provider: 'codex', model: 'gpt-5.6-sol', usesAssistant: true, available: true,
    });
    expect(renderNutritionAISettings()).toContain('Follow chat assistant — GPT-5.6-Sol');
    expect(renderNutritionAISettings()).not.toContain('Automatic fallback');

    cacheAgentModelCatalog([{
      id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true,
      inputModalities: ['text'], supportedReasoningEfforts: [],
    }]);
    expect(getMealAISelection()).toMatchObject({
      adapter: 'direct', provider: 'ollama', model: 'qwen-vl-chat', fallback: true, available: true,
    });
    expect(renderNutritionAISettings()).toContain('Automatic fallback — qwen-vl-chat via Local AI');
  });

  it('uses the chat model by default and keeps a dedicated override isolated', () => {
    expect(getMealAISelection()).toMatchObject({
      provider: 'ollama',
      model: 'qwen-vl-chat',
      usesChatModel: true,
      available: true,
    });

    setNutritionAIRoute({ provider: 'ollama', model: 'llava-meal' });
    expect(getMealAISelection()).toMatchObject({
      provider: 'ollama',
      model: 'llava-meal',
      usesChatModel: false,
      available: true,
    });
    expect(renderNutritionAISettings()).toContain('Meal photos and labels');
    expect(renderNutritionAISettings()).toContain('llava-meal');
    expect(localStorage.getItem('labcharts-ollama-model')).toBe('qwen-vl-chat');
  });

  it('returns to the chat route for an empty selector value', () => {
    setNutritionAIRoute({ provider: 'ollama', model: 'llava-meal' });
    setNutritionAIRouteFromValue('');

    expect(getNutritionAIRoute()).toBeNull();
    expect(getMealAISelection()).toMatchObject({ model: 'qwen-vl-chat', usesChatModel: true });
  });

  it('ignores an override from a provider that is no longer the main provider', () => {
    setNutritionAIRoute({ provider: 'openrouter', model: 'anthropic/claude-opus-5' });

    expect(getMealAISelection()).toMatchObject({
      provider: 'ollama',
      model: 'qwen-vl-chat',
      usesChatModel: true,
    });
    expect(renderNutritionAISettings()).toContain('Only models with confirmed image input are shown');
    expect(renderNutritionAISettings()).not.toContain('anthropic/claude-opus-5');
  });

  it('lists every current model family with a confirmed vision capability', () => {
    setOllamaMainModel('qwen3-vl:8b');
    window._lastOllamaModelDetails = [
      { name: 'qwen3-vl:8b', vision: true },
      { name: 'qwen3-vl:4b', vision: null },
      { name: 'llava:13b', vision: true },
    ];
    window._lastIsOllamaServer = true;
    const models = listNutritionVisionModels();

    expect(models).toEqual([
      expect.objectContaining({ provider: 'ollama', model: 'llava:13b' }),
      expect.objectContaining({ provider: 'ollama', model: 'qwen3-vl:8b', current: true }),
    ]);
    expect(renderNutritionAISettings()).toContain('qwen3-vl:8b');
    expect(renderNutritionAISettings()).toContain('llava:13b');
  });

  it('preselects the meal model and the active model from another configured provider', () => {
    updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    setOpenRouterModel('google/gemini-3.7-flash');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
      { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify([
      'anthropic/claude-opus-5', 'google/gemini-3.7-flash',
    ]));

    const models = listNutritionVisionModels();
    const defaults = getDefaultNutritionComparisonModelValues(models)
      .map(value => models.find(model => model.value === value));

    expect(defaults).toEqual([
      expect.objectContaining({ provider: 'ollama', model: 'qwen-vl-chat', current: true }),
      expect.objectContaining({
        provider: 'openrouter', model: 'google/gemini-3.7-flash', providerCurrent: true,
      }),
    ]);
  });

  it('restores Local AI vision capability after an application refresh without opening Settings', async () => {
    window._lastOllamaModelDetails = [];
    updateKeyCache('labcharts-ollama', JSON.stringify({
      url: 'http://nutrition-local.test', model: 'qwen-vl-chat', mode: 'unsloth', apiKey: '',
    }));
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input);
      if (url.endsWith('/api/v1/models')) return new Response('', { status: 404 });
      if (url.endsWith('/v1/models')) {
        return Response.json({
          data: [{
            id: 'qwen-vl-chat', owned_by: 'unsloth-studio',
            input_modalities: ['text', 'image'], context_length: 32768,
          }],
        });
      }
      if (url.endsWith('/api/inference/status')) {
        return Response.json({ active_model: 'qwen-vl-chat', context_length: 32768, is_vision: true });
      }
      throw new Error(`Unexpected Local AI request: ${url}`);
    }));

    expect(getMealAISelection()).toMatchObject({ provider: 'ollama', available: false });
    const result = await hydrateNutritionLocalAICatalog();

    expect(result).toMatchObject({ available: true, provider: 'unsloth' });
    expect(getMealAISelection()).toMatchObject({
      provider: 'ollama', model: 'qwen-vl-chat', available: true,
    });
  });

  it('restores a saved Local AI catalog for comparison while a cloud provider is main', async () => {
    window._lastOllamaModelDetails = [];
    updateKeyCache('labcharts-ollama', JSON.stringify({
      url: 'http://comparison-local.test', model: 'local-comparison-vision', mode: 'unsloth', apiKey: '',
    }));
    setOllamaMainModel('local-comparison-vision');
    setAIProvider('openrouter');
    let discoveredModel = 'stale-text-model';
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input);
      if (url.endsWith('/api/v1/models')) return new Response('', { status: 404 });
      if (url.endsWith('/v1/models')) {
        return Response.json({
          data: [{
            id: discoveredModel, owned_by: 'unsloth-studio',
            input_modalities: discoveredModel === 'stale-text-model' ? ['text'] : ['text', 'image'],
            context_length: 32768,
          }],
        });
      }
      if (url.endsWith('/api/inference/status')) {
        return Response.json({
          active_model: discoveredModel, context_length: 32768,
          is_vision: discoveredModel !== 'stale-text-model',
        });
      }
      throw new Error(`Unexpected Local AI request: ${url}`);
    }));

    await discoverLocalAI('http://comparison-local.test', '', { force: true });
    discoveredModel = 'local-comparison-vision';
    await hydrateNutritionLocalAICatalog({ includeConfigured: true });

    expect(listNutritionVisionModels()).toContainEqual(expect.objectContaining({
      provider: 'ollama', model: 'local-comparison-vision', providerCurrent: true,
    }));
  });

  it('does not inherit a local or custom text model without positive vision metadata', () => {
    window._lastOllamaModelDetails = [{ name: 'qwen-vl-chat', vision: null }];
    expect(isConfirmedMealVisionModel('ollama', 'qwen-vl-chat')).toBe(false);
    expect(getMealAISelection()).toMatchObject({ model: 'qwen-vl-chat', available: false });

    localStorage.setItem('labcharts-custom-vision-models', JSON.stringify(['verified-vision-model']));
    expect(isConfirmedMealVisionModel('custom', 'unverified-text-model')).toBe(false);
    expect(isConfirmedMealVisionModel('custom', 'verified-vision-model')).toBe(true);
  });

  it('prefers Gemini 3.8 Flash and excludes text-only GLM 5.3 from meal routes', () => {
    updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    setAIProvider('openrouter');
    setOpenRouterModel('google/gemini-3.8-flash');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
      { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
      { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { id: 'z-ai/glm-5.3', name: 'GLM 5.3' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify([
      'google/gemini-3.5-flash', 'google/gemini-3.7-flash', 'google/gemini-3.8-flash',
    ]));

    expect(listNutritionVisionModels().filter(model => model.provider === 'openrouter')).toEqual([
      expect.objectContaining({
        provider: 'openrouter', model: 'google/gemini-3.8-flash', current: true,
      }),
    ]);
    expect(renderNutritionAISettings()).toContain('Gemini 3.8 Flash');
    expect(renderNutritionAISettings()).not.toContain('Gemini 3.7 Flash');
    expect(renderNutritionAISettings()).not.toContain('Gemini 3.5 Flash');
    expect(renderNutritionAISettings()).not.toContain('GLM 5.3');
  });

  it('offers one current benchmark route per model family and prefers base Kimi K3', () => {
    updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    setAIProvider('openrouter');
    setOpenRouterModel('anthropic/claude-sonnet-5');
    const ids = [
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-sonnet-5',
      'anthropic/claude-opus-4.6',
      'anthropic/claude-opus-5',
      'moonshotai/kimi-k3-fastapi',
      'moonshotai/kimi-k3',
    ];
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(ids.map(id => ({ id, name: id }))));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(ids));

    expect(listNutritionVisionModels().filter(model => model.provider === 'openrouter').map(model => model.model)).toEqual([
      'anthropic/claude-opus-5',
      'anthropic/claude-sonnet-5',
      'moonshotai/kimi-k3',
    ]);
  });

  it('offers current Qwen 27B and 35B-A3B vision tiers without recommending text-only or superseded routes', () => {
    updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    setAIProvider('openrouter');
    setOpenRouterModel('anthropic/claude-sonnet-5');
    const models = [
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'qwen/qwen3.6-27b', name: 'Qwen3.6 27B' },
      { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B' },
      { id: 'qwen/qwen3.5-35b-a3b', name: 'Qwen3.5 35B-A3B' },
      { id: 'qwen/qwen3.6-35b-a3b', name: 'Qwen3.6 35B-A3B' },
      { id: 'qwen/qwen3.8-72b', name: 'Qwen3.8 72B' },
    ];
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(models));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify([
      'anthropic/claude-sonnet-5',
      'qwen/qwen3.6-27b',
      'qwen/qwen3.8-27b',
      'qwen/qwen3.5-35b-a3b',
      'qwen/qwen3.6-35b-a3b',
    ]));

    expect(listNutritionVisionModels()
      .filter(model => model.provider === 'openrouter' && model.model.includes('qwen'))
      .map(model => model.model)).toEqual([
      'qwen/qwen3.6-35b-a3b',
      'qwen/qwen3.8-27b',
    ]);
    expect(renderNutritionAISettings()).toContain('OpenRouter vision models');
    expect(renderNutritionAISettings()).toContain('Qwen3.8 27B');
    expect(renderNutritionAISettings()).toContain('Qwen3.6 35B-A3B');
    expect(renderNutritionAISettings()).not.toContain('Qwen3.8 72B');
  });

  it('orders connected vision families by provider token price', () => {
    updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    setAIProvider('openrouter');
    setOpenRouterModel('google/gemini-3.7-flash');
    const models = [
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'x-ai/grok-4.6', name: 'Grok 4.6' },
      { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
      { id: 'community/legacy-vision', name: 'Legacy Vision' },
    ];
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(models));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(models.map(model => model.id)));
    localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
      'anthropic/claude-sonnet-5': { input: 3, output: 15 },
      'x-ai/grok-4.6': { input: 2, output: 7 },
      'google/gemini-3.7-flash': { input: 0.5, output: 2 },
      'community/legacy-vision': { input: 0.01, output: 0.01 },
    }));

    expect(listNutritionVisionModels().filter(model => model.provider === 'openrouter').map(model => model.model)).toEqual([
      'google/gemini-3.7-flash',
      'x-ai/grok-4.6',
      'anthropic/claude-sonnet-5',
    ]);
    expect(renderNutritionAISettings()).toContain('OpenRouter vision models');
    expect(renderNutritionAISettings()).toContain('$0.5 in · $2 out / 1M');
  });

  it('keeps Venice GPT-5.6 Sol and Luna separately recommended and inherits vision-capable Sol', () => {
    updateKeyCache('labcharts-venice-key', 'test-venice-key');
    setAIProvider('venice');
    setVeniceModel('openai-gpt-56-sol');
    localStorage.setItem('labcharts-venice-models', JSON.stringify([
      { id: 'openai-gpt-56-luna', name: 'OpenAI GPT 5.6 Luna' },
      { id: 'openai-gpt-56-sol', name: 'OpenAI GPT 5.6 Sol' },
    ]));
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify([
      'openai-gpt-56-luna', 'openai-gpt-56-sol',
    ]));

    expect(getMealAISelection()).toMatchObject({
      provider: 'venice', model: 'openai-gpt-56-sol', usesChatModel: true, available: true,
    });
    expect(listNutritionVisionModels().filter(model => model.provider === 'venice')).toEqual([
      expect.objectContaining({ provider: 'venice', model: 'openai-gpt-56-luna' }),
      expect.objectContaining({ provider: 'venice', model: 'openai-gpt-56-sol', current: true }),
    ]);
    expect(renderNutritionAISettings()).toContain('Follow chat assistant — OpenAI GPT 5.6 Sol');
    expect(renderNutritionAISettings()).toContain('OpenAI GPT 5.6 Luna');
    expect(renderNutritionAISettings()).toContain('OpenAI GPT 5.6 Sol');
  });

  it('distinguishes exact food-study evidence from promising successor models', () => {
    expect(getNutritionModelGuidance('anthropic/claude-sonnet-4.6')).toMatchObject({
      rank: 1, level: 'published', label: 'Best studied balance',
    });
    expect(getNutritionModelGuidance('google/gemini-3.7-flash')).toMatchObject({
      rank: 2, level: 'candidate', label: 'Value candidate',
    });
    expect(getNutritionModelGuidance('google/gemini-3.8-flash')).toMatchObject({
      rank: 2, level: 'candidate', label: 'Value candidate',
    });
    expect(getNutritionModelGuidance('google/gemini-3.0-flash')).toMatchObject({
      rank: 3, level: 'preprint', label: 'Nutrition5k top performer',
    });
    expect(getNutritionModelGuidance('anthropic/claude-sonnet-5')).toMatchObject({
      level: 'candidate', label: 'Vision candidate',
    });
    expect(renderNutritionAISettings()).toContain('Claude study ↗');
    expect(renderNutritionAISettings()).toContain('Gemini preprint ↗');
    expect(renderNutritionAISettings()).toContain('Evidence informs ordering only');
    expect(renderNutritionAISettings()).toContain('does not prove accuracy');
  });
});
