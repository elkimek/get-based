import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createTinfoilSecureFetchMock = vi.hoisted(() => vi.fn());
const veniceE2EEMocks = vi.hoisted(() => ({
  session: {
    aesKey: 'mock-aes-key',
    publicKey: 'mock-public-key',
    privateKey: 'mock-private-key',
    pubKeyHex: 'mock-client-pub-key',
    modelPubKeyHex: 'mock-model-pub-key',
    attestation: {
      verificationLevel: 'dcap',
      nonceVerified: true,
      signingKeyBound: true,
      debugMode: false,
      dcap: { status: 'UpToDate', advisoryIds: [] },
      dcapVerified: true,
      gpu: { overallResult: true, arch: 'HOPPER', gpus: { 'GPU-0': {} }, tokensVerified: true },
      gpuVerified: true,
      errors: [],
    },
  },
  createClient: vi.fn(),
  createSession: vi.fn(),
  clearSession: vi.fn(),
}));
const veniceDcapMocks = vi.hoisted(() => ({
  createVerifier: vi.fn(),
  verifier: vi.fn(),
}));
const veniceNvidiaMocks = vi.hoisted(() => ({
  createGpuVerifier: vi.fn(),
  createTokenVerifier: vi.fn(),
  gpuVerifier: vi.fn(),
  tokenVerifier: vi.fn(),
}));

vi.mock('../js/tinfoil-secure-fetch.js', () => ({
  createTinfoilSecureFetch: createTinfoilSecureFetchMock,
  clearTinfoilSecureFetchCache: vi.fn(),
}));

vi.mock('../vendor/venice-e2ee.js', () => ({
  createVeniceE2EE: veniceE2EEMocks.createClient,
  encryptMessage: vi.fn(async (_aesKey, _publicKey, text) => `encrypted:${text}`),
  decryptChunk: vi.fn(async (_privateKey, text) => `decrypted:${text}`),
}));

vi.mock('../vendor/venice-dcap.js', () => ({
  createDcapVerifier: veniceDcapMocks.createVerifier,
}));

vi.mock('../vendor/venice-nvidia.js', () => ({
  createNvidiaVerifier: veniceNvidiaMocks.createGpuVerifier,
  createNrasTokenVerifier: veniceNvidiaMocks.createTokenVerifier,
}));

import { updateKeyCache } from '../js/crypto.js';
import { checkOpenAICompatible, clearLocalAiDiscovery, discoverLocalAI } from '../js/local-ai-discovery.js';
import { estimateLocalAiPromptTokens } from '../js/api-local.js';
import { LOCAL_AI_PROVIDER_ADAPTERS, getLocalAiProviderCapabilities } from '../js/local-ai-provider-registry.js';
import { inferWithLMStudioNativeProvider, loadLMStudioModelWithContext } from '../js/local-ai-provider-lmstudio.js';
import { inferWithOllamaNativeProvider } from '../js/local-ai-provider-ollama.js';
import { getLocalAiExecutionLocation, isLocalAiLoopbackUrl } from '../js/local-ai-provider-shared.js';
import {
  clearLocalAiRuntimeUse,
  getLocalAiReleasePlan,
  localAiEndpointsShareMachine,
  rememberLocalAiRuntimeUse,
  releaseLocalAiModels,
} from '../js/local-ai-lifecycle.js';
import {
  callClaudeAPI,
  fetchRoutstrModels,
  isRoutstrPrivateModeActive,
  setAIProvider,
  setCustomApiModel,
  setCustomApiUrl,
  setOllamaMainModel,
  setOpenRouterModel,
  setPpqModel,
  setPpqPrivateMode,
  setRoutstrModel,
  setVeniceE2EE,
  setVeniceModel,
  supportsVision,
} from '../js/api.js';

const realFetch = globalThis.fetch;
const realLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');

const PROVIDER_KEY_CACHE_KEYS = [
  'labcharts-ollama',
  'labcharts-openrouter-key',
  'labcharts-venice-key',
  'labcharts-routstr-key',
  'labcharts-ppq-key',
  'labcharts-custom-key',
];

function clearProviderKeyCaches() {
  for (const key of PROVIDER_KEY_CACHE_KEYS) updateKeyCache(key, '');
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

function chatCompletionResponse(text = 'contract ok') {
  return jsonResponse({
    choices: [{ message: { content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 13 },
  });
}

function streamResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function requestFromLastFetch() {
  const [url, init] = globalThis.fetch.mock.calls.at(-1);
  return {
    url,
    init,
    headers: init.headers || {},
    body: init.body ? JSON.parse(init.body) : null,
  };
}

function providerRequestFromFetchCall() {
  const request = requestFromLastFetch();
  if (request.url !== '/api/proxy') {
    return {
      proxied: false,
      url: request.url,
      headers: request.headers,
      body: request.body,
    };
  }

  const envelope = request.body;
  return {
    proxied: true,
    url: envelope.url,
    headers: envelope.headers || {},
    body: JSON.parse(envelope.body),
    proxyEnvelope: envelope,
  };
}

function baseChatOptions(overrides = {}) {
  return {
    system: 'system prompt',
    messages: [{ role: 'user', content: 'hello provider' }],
    maxTokens: 32,
    requestTimeoutMs: 1000,
    forceNonStream: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearProviderKeyCaches();
  clearLocalAiDiscovery();
  clearLocalAiRuntimeUse();
  globalThis.fetch = vi.fn(async () => chatCompletionResponse());
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    writable: true,
    value: { origin: 'https://app.getbased.health', pathname: '/app', href: 'https://app.getbased.health/app' },
  });
  updateKeyCache('labcharts-ollama', JSON.stringify({
    url: 'http://localhost:11434',
    model: 'llama3.2',
    apiKey: 'local-api-key',
  }));
  globalThis.showInsufficientBalanceDialog = undefined;
  delete globalThis._veniceE2EE;
  delete globalThis._veniceE2EEKey;
  delete globalThis._veniceE2EEDcapRequired;
  delete globalThis._veniceE2EEGpuRequired;
  delete globalThis._veniceAttestation;
  delete globalThis._routstrAttestation;
  veniceE2EEMocks.createSession.mockReset();
  veniceE2EEMocks.createSession.mockResolvedValue(veniceE2EEMocks.session);
  veniceE2EEMocks.clearSession.mockReset();
  veniceE2EEMocks.createClient.mockReset();
  veniceE2EEMocks.createClient.mockReturnValue({
    createSession: veniceE2EEMocks.createSession,
    clearSession: veniceE2EEMocks.clearSession,
  });
  veniceDcapMocks.verifier.mockReset();
  veniceDcapMocks.createVerifier.mockReset();
  veniceDcapMocks.createVerifier.mockReturnValue(veniceDcapMocks.verifier);
  veniceNvidiaMocks.gpuVerifier.mockReset();
  veniceNvidiaMocks.tokenVerifier.mockReset();
  veniceNvidiaMocks.createGpuVerifier.mockReset();
  veniceNvidiaMocks.createGpuVerifier.mockReturnValue(veniceNvidiaMocks.gpuVerifier);
  veniceNvidiaMocks.createTokenVerifier.mockReset();
  veniceNvidiaMocks.createTokenVerifier.mockReturnValue(veniceNvidiaMocks.tokenVerifier);
  createTinfoilSecureFetchMock.mockReset();
  createTinfoilSecureFetchMock.mockResolvedValue({
    verification: { securityVerified: true, codeFingerprint: 'verified-routstr-code' },
    fetch: (...args) => globalThis.fetch(...args),
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realLocationDescriptor) Object.defineProperty(globalThis, 'location', realLocationDescriptor);
  else delete globalThis.location;
  clearProviderKeyCaches();
  clearLocalAiDiscovery();
  clearLocalAiRuntimeUse();
  vi.restoreAllMocks();
});

const providerContracts = [
  {
    name: 'OpenRouter',
    key: 'sk-or-contract',
    setup() {
      setAIProvider('openrouter');
      updateKeyCache('labcharts-openrouter-key', this.key);
      setOpenRouterModel('openai/gpt-5.5');
    },
    options: { webSearch: true },
    assertRequest(request) {
      expect(request.proxied).toBe(false);
      expect(request.url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(request.headers).toMatchObject({
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://app.getbased.health',
        'X-Title': 'getbased',
      });
      expect(request.body).toMatchObject({
        model: 'openai/gpt-5.5',
        max_completion_tokens: 32,
        plugins: [{ id: 'web' }],
      });
      expect(request.body).not.toHaveProperty('max_tokens');
    },
  },
  {
    name: 'Venice',
    key: 'sk-venice-contract',
    setup() {
      setAIProvider('venice');
      updateKeyCache('labcharts-venice-key', this.key);
      setVeniceE2EE(false);
      setVeniceModel('llama-3.3-70b');
      localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'llama-3.3-70b' }]));
      localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    },
    options: { webSearch: true },
    assertRequest(request) {
      expect(request.proxied).toBe(false);
      expect(request.url).toBe('https://api.venice.ai/api/v1/chat/completions');
      expect(request.headers).toMatchObject({
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      });
      expect(request.body).toMatchObject({
        model: 'llama-3.3-70b',
        max_tokens: 32,
        venice_parameters: { enable_web_search: 'on' },
      });
    },
  },
  {
    name: 'Routstr',
    key: 'sk-routstr-contract',
    setup() {
      setAIProvider('routstr');
      updateKeyCache('labcharts-routstr-key', this.key);
      setRoutstrModel('llama-3.1-8b');
      localStorage.setItem('labcharts-routstr-node', 'https://node.example.com/');
    },
    assertRequest(request) {
      expect(request.proxied).toBe(false);
      expect(request.url).toBe('https://node.example.com/v1/chat/completions');
      expect(request.headers).toMatchObject({
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      });
      expect(request.body).toMatchObject({
        model: 'llama-3.1-8b',
        max_tokens: 32,
      });
    },
  },
  {
    name: 'PPQ',
    key: 'sk-ppq-contract',
    setup() {
      setAIProvider('ppq');
      updateKeyCache('labcharts-ppq-key', this.key);
      setPpqPrivateMode(false);
      setPpqModel('perplexity/sonar');
    },
    options: { webSearch: true },
    assertRequest(request) {
      expect(request.proxied).toBe(false);
      expect(request.url).toBe('https://api.ppq.ai/chat/completions');
      expect(request.headers).toMatchObject({
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      });
      expect(request.body).toMatchObject({
        model: 'perplexity/sonar',
        max_tokens: 32,
        plugins: [{ id: 'web' }],
      });
    },
  },
  {
    name: 'Custom remote',
    key: 'custom-contract-key',
    setup() {
      setAIProvider('custom');
      updateKeyCache('labcharts-custom-key', this.key);
      setCustomApiUrl('https://custom.example/v1/');
      setCustomApiModel('custom-model');
    },
    assertRequest(request) {
      expect(request.proxied).toBe(true);
      expect(request.url).toBe('https://custom.example/v1/chat/completions');
      expect(request.headers).toEqual({ Authorization: `Bearer ${this.key}` });
      expect(request.proxyEnvelope).not.toHaveProperty('method');
      expect(request.body).toMatchObject({
        model: 'custom-model',
        max_tokens: 32,
      });
    },
  },
  {
    name: 'Local AI',
    key: 'local-api-key',
    setup() {
      setAIProvider('ollama');
      setOllamaMainModel('llama3.2');
    },
    options: { jsonMode: true },
    assertRequest(request) {
      expect(request.proxied).toBe(false);
      expect(request.url).toBe('http://localhost:11434/v1/chat/completions');
      expect(request.headers).toMatchObject({
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      });
      expect(request.body).toMatchObject({
        model: 'llama3.2',
        max_tokens: 32,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'structured_response',
            schema: { type: 'object' },
          },
        },
      });
    },
  },
];

describe('AI provider request contracts', () => {
  it('registers cohesive local provider adapters with normalized capabilities', () => {
    expect(LOCAL_AI_PROVIDER_ADAPTERS.map(adapter => adapter.id)).toEqual([
      'lmstudio',
      'ollama',
      'openai-compatible',
    ]);
    expect(getLocalAiProviderCapabilities('lmstudio')).toMatchObject({
      nativeModelDiscovery: true,
      contextOverride: true,
      performanceStats: 'native',
    });
    expect(getLocalAiProviderCapabilities('ollama')).toMatchObject({
      nativeStreaming: true,
      structuredOutput: true,
      modelUnload: true,
    });
    expect(getLocalAiProviderCapabilities('unknown-provider')).toMatchObject({
      nativeModelDiscovery: false,
      performanceStats: 'endpoint-dependent',
    });
    expect(isLocalAiLoopbackUrl('http://[::1]:11434')).toBe(true);
    expect(getLocalAiExecutionLocation('http://[::1]:11434')).toBe('local');
  });

  it('releases loaded models through each provider native lifecycle contract', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true }));
    const lmDiscovery = {
      provider: 'lmstudio',
      modelDetails: [
        {
          name: 'qwen/qwen3.6-27b',
          loaded: true,
          loadedInstanceId: 'qwen-instance-1',
          vramAllocated: 18_000_000_000,
          executionLocation: 'lan',
        },
        { name: 'other-model', loaded: false, executionLocation: 'lan' },
      ],
    };

    const lmResult = await releaseLocalAiModels({
      baseUrl: 'http://lmstudio.test/',
      apiKey: 'lm-key',
      discovery: lmDiscovery,
    });

    expect(getLocalAiReleasePlan(lmDiscovery)).toMatchObject({
      providerLabel: 'LM Studio',
      supported: true,
      allocatedVram: 18_000_000_000,
    });
    expect(lmResult).toMatchObject({
      complete: true,
      releasedModels: ['qwen/qwen3.6-27b'],
      failedModels: [],
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://lmstudio.test/api/v1/models/unload',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ instance_id: 'qwen-instance-1' }),
      }),
    );

    globalThis.fetch.mockClear();
    const ollamaResult = await releaseLocalAiModels({
      baseUrl: 'http://ollama.test',
      discovery: {
        provider: 'ollama',
        modelDetails: [{ name: 'qwen3.6:27b', loaded: true, executionLocation: 'lan' }],
      },
    });
    expect(ollamaResult.complete).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://ollama.test/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ model: 'qwen3.6:27b', prompt: '', stream: false, keep_alive: 0 }),
      }),
    );

    expect(getLocalAiReleasePlan({
      provider: 'openai-compatible',
      modelDetails: [{ name: 'jan-model', loaded: true, executionLocation: 'local' }],
    }).supported).toBe(false);
    expect(localAiEndpointsShareMachine('http://localhost:1234', 'http://127.0.0.1:11434')).toBe(true);
    expect(localAiEndpointsShareMachine('http://[::1]:1234', 'http://localhost:11434')).toBe(true);
    expect(localAiEndpointsShareMachine('http://10.0.0.2:1234', 'http://10.0.0.3:11434')).toBe(false);
  });

  it('automatically releases the previous same-machine backend before the next Local AI task', async () => {
    setAIProvider('ollama');
    rememberLocalAiRuntimeUse({
      baseUrl: 'http://localhost:1234',
      providerId: 'lmstudio',
      model: 'lm-model',
    });
    updateKeyCache('labcharts-ollama', JSON.stringify({
      url: 'http://localhost:11434',
      model: 'ollama-model',
      apiKey: '',
    }));
    setOllamaMainModel('ollama-model');
    const lifecycleEvents = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const href = String(url);
      if (href === 'http://localhost:1234/api/v1/models') {
        return jsonResponse({ models: [
          {
            type: 'llm',
            key: 'lm-model',
            loaded_instances: [{ id: 'lm-instance', config: { context_length: 32768 } }],
          },
          {
            type: 'llm',
            key: 'other-app-model',
            loaded_instances: [{ id: 'other-app-instance', config: { context_length: 8192 } }],
          },
        ] });
      }
      if (href === 'http://localhost:1234/v1/models') {
        return jsonResponse({ data: [{ id: 'lm-model' }, { id: 'other-app-model' }] });
      }
      if (href === 'http://localhost:1234/api/v1/models/unload') {
        lifecycleEvents.push({ action: 'release', body: JSON.parse(init.body) });
        return jsonResponse({ ok: true });
      }
      if (href === 'http://localhost:11434/api/v1/models') return jsonResponse({}, { status: 404 });
      if (href === 'http://localhost:11434/v1/models') return jsonResponse({ data: [{ id: 'ollama-model' }] });
      if (href === 'http://localhost:11434/api/tags') {
        return jsonResponse({ models: [{ name: 'ollama-model', details: { context_length: 32768 } }] });
      }
      if (href === 'http://localhost:11434/api/ps') return jsonResponse({ models: [] });
      if (href === 'http://localhost:11434/api/chat') {
        lifecycleEvents.push({ action: 'infer', body: JSON.parse(init.body) });
        return jsonResponse({
          message: { role: 'assistant', content: '{"markers":[]}' },
          done: true,
          done_reason: 'stop',
        });
      }
      throw new Error(`Unexpected Local AI handoff URL: ${href}`);
    });

    const taskOptions = baseChatOptions({
      jsonMode: true,
      reasoningEffort: 'none',
      preferNativeContext: true,
    });
    await callClaudeAPI(taskOptions);
    await callClaudeAPI(taskOptions);

    expect(lifecycleEvents.map(event => event.action)).toEqual(['release', 'infer', 'infer']);
    expect(lifecycleEvents[0].body).toEqual({ instance_id: 'lm-instance' });
    expect(sessionStorage.getItem('labcharts-local-ai-runtime-use')).toBeNull();
  });

  it.each(providerContracts)('routes $name through its expected chat-completion contract', async (contract) => {
    contract.setup();

    const result = await callClaudeAPI(baseChatOptions(contract.options));
    expect(result).toMatchObject({
      text: 'contract ok',
      usage: { inputTokens: 11, outputTokens: 13 },
      finishReason: 'stop',
      truncated: false,
    });

    const postCalls = globalThis.fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(postCalls).toHaveLength(1);
    const request = providerRequestFromFetchCall();
    contract.assertRequest(request);
    expect(JSON.stringify(request.body)).not.toContain(contract.key);
  });

  it('retries Local AI JSON requests without structured output when the server rejects it', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('llama3.2');
    let postCount = 0;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (init.method !== 'POST') {
        if (String(url).endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'llama3.2' }] });
        return jsonResponse({}, { status: 404 });
      }
      postCount++;
      if (postCount === 1) {
        return jsonResponse({ error: { message: 'structured output is not supported by this model' } }, { status: 400 });
      }
      return chatCompletionResponse('{"ok":true}');
    });

    await expect(callClaudeAPI(baseChatOptions({ jsonMode: true }))).resolves.toMatchObject({
      text: '{"ok":true}',
      diagnostics: { structuredOutputFallback: true },
    });

    const postCalls = globalThis.fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(postCalls).toHaveLength(2);
    const firstBody = JSON.parse(postCalls[0][1].body);
    const fallbackBody = JSON.parse(postCalls[1][1].body);
    expect(firstBody.response_format.type).toBe('json_schema');
    expect(fallbackBody).not.toHaveProperty('response_format');
  });

  it('keeps the context-planned output cap for Local AI thinking models', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('thinkingcap-qwen3.6-27b');
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (init.method !== 'POST') {
        if (String(url).endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'thinkingcap-qwen3.6-27b' }] });
        return jsonResponse({}, { status: 404 });
      }
      return chatCompletionResponse('short answer');
    });

    await callClaudeAPI(baseChatOptions({ maxTokens: 512, reasoningEffort: 'none' }));

    const postCall = globalThis.fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(postCall[1].body);
    expect(body.max_tokens).toBe(512);
    expect(body.reasoning_effort).toBe('none');
  });

  it('can remove both unsupported schema and reasoning controls in validation-only retries', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('llama3.2');
    let postCount = 0;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (init.method !== 'POST') {
        if (String(url).endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'llama3.2' }] });
        return jsonResponse({}, { status: 404 });
      }
      postCount++;
      if (postCount === 1) return jsonResponse({ error: { message: 'response_format json_schema unsupported' } }, { status: 400 });
      if (postCount === 2) return jsonResponse({ error: { message: 'reasoning_effort is invalid' } }, { status: 422 });
      return chatCompletionResponse('{"ok":true}');
    });

    await expect(callClaudeAPI(baseChatOptions({ jsonMode: true, reasoningEffort: 'none' }))).resolves.toMatchObject({
      diagnostics: { structuredOutputFallback: true, reasoningControlFallback: true },
    });

    const bodies = globalThis.fetch.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(init.body));
    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toHaveProperty('response_format');
    expect(bodies[1]).not.toHaveProperty('response_format');
    expect(bodies[1]).toHaveProperty('reasoning_effort');
    expect(bodies[2]).not.toHaveProperty('reasoning_effort');
  });

  it('budgets vision inputs and deduplicates LM Studio loaded-instance aliases', async () => {
    const imageEstimate = estimateLocalAiPromptTokens({
      system: 'extract',
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }],
    });
    expect(imageEstimate).toBeGreaterThan(1600);

    // Dense numeric inputs (lab tables) opt into a lower chars-per-token ratio.
    const proseEstimate = estimateLocalAiPromptTokens({
      messages: [{ role: 'user', content: 'x'.repeat(3500) }],
    });
    const denseEstimate = estimateLocalAiPromptTokens({
      messages: [{ role: 'user', content: 'x'.repeat(3500) }],
      promptCharsPerToken: 3,
    });
    expect(proseEstimate).toBe(1006);
    expect(denseEstimate).toBe(1173);

    globalThis.fetch = vi.fn(async url => {
      if (String(url).endsWith('/api/v1/models')) {
        return jsonResponse({ models: [
          {
            type: 'llm',
            key: 'thinkingcap-qwen3.6-27b@q4_k_m',
            size_bytes: 17_741_858_944,
            quantization: { name: 'Q4_K_M' },
            loaded_instances: [{ id: 'thinkingcap-qwen3.6-27b', config: { context_length: 8192 } }],
            max_context_length: 262144,
          },
        ] });
      }
      return jsonResponse({ data: [
        { id: 'thinkingcap-qwen3.6-27b' },
        { id: 'thinkingcap-qwen3.6-27b@q4_k_m' },
      ] });
    });
    const discovery = await checkOpenAICompatible('http://lmstudio.test', '');
    expect(discovery.models).toEqual(['thinkingcap-qwen3.6-27b']);
    expect(discovery.modelDetails[0]).toMatchObject({ loaded: true, contextLength: 8192, maxContextLength: 262144 });
  });

  it('does not send Ollama-only discovery probes to an identified LM Studio server', async () => {
    const requestedUrls = [];
    globalThis.fetch = vi.fn(async url => {
      requestedUrls.push(String(url));
      if (String(url).endsWith('/api/v1/models')) {
        return jsonResponse({ models: [{
          type: 'llm',
          key: 'thinkingcap-qwen3.6-27b',
          loaded_instances: [{ id: 'thinkingcap-qwen3.6-27b', config: { context_length: 8192 } }],
        }] });
      }
      if (String(url).endsWith('/v1/models')) {
        return jsonResponse({ data: [{ id: 'thinkingcap-qwen3.6-27b' }] });
      }
      throw new Error(`Unexpected discovery URL: ${url}`);
    });

    const discovery = await discoverLocalAI('http://lmstudio.test', '', { force: true });

    expect(discovery.provider).toBe('lmstudio');
    expect(requestedUrls).toEqual([
      'http://lmstudio.test/api/v1/models',
      'http://lmstudio.test/v1/models',
    ]);
    expect(requestedUrls.some(url => url.endsWith('/api/tags') || url.endsWith('/api/ps'))).toBe(false);
  });

  it('includes native LM Studio downloads when the OpenAI model list contains only loaded models', async () => {
    globalThis.fetch = vi.fn(async url => {
      if (String(url).endsWith('/api/v1/models')) {
        return jsonResponse({ models: [{
          type: 'llm',
          key: 'vendor/unloaded-model@q4_k_m',
          loaded_instances: [],
          max_context_length: 32768,
        }] });
      }
      if (String(url).endsWith('/v1/models')) return jsonResponse({ data: [] });
      throw new Error(`Unexpected discovery URL: ${url}`);
    });

    const discovery = await checkOpenAICompatible('http://lmstudio.test', '');

    expect(discovery.provider).toBe('lmstudio');
    expect(discovery.models).toEqual(['vendor/unloaded-model@q4_k_m']);
    expect(discovery.modelDetails[0]).toMatchObject({
      loaded: false,
      maxContextLength: 32768,
      source: 'lmstudio',
    });
  });

  it('reloads LM Studio with expanded context then streams a large import request', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('thinkingcap-qwen3.6-27b');
    let loadedCtx = 8192;
    const lifecycle = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const href = String(url);
      if (init.method === 'POST') {
        if (href.endsWith('/api/v1/models/unload')) {
          lifecycle.push(['unload', JSON.parse(init.body)]);
          return jsonResponse({ ok: true });
        }
        if (href.endsWith('/api/v1/models/load')) {
          const body = JSON.parse(init.body);
          lifecycle.push(['load', body]);
          loadedCtx = body.context_length;
          return jsonResponse({ ok: true });
        }
        if (href.endsWith('/v1/chat/completions')) {
          lifecycle.push(['chat', JSON.parse(init.body)]);
          return chatCompletionResponse('{"markers":[]}');
        }
        throw new Error(`Unexpected POST URL: ${href}`);
      }
      if (href.endsWith('/api/v1/models')) {
        return jsonResponse({ models: [{
          type: 'llm',
          key: 'thinkingcap-qwen3.6-27b@q4_k_m',
          loaded_instances: [{ id: 'thinkingcap-qwen3.6-27b', config: { context_length: loadedCtx } }],
          max_context_length: 262144,
          capabilities: { reasoning: { allowed_options: ['off', 'on'], default: 'on' } },
        }] });
      }
      if (href.endsWith('/v1/models')) {
        return jsonResponse({ data: [{ id: 'thinkingcap-qwen3.6-27b' }] });
      }
      return jsonResponse({}, { status: 404 });
    });

    const result = await callClaudeAPI(baseChatOptions({
      system: 'Extract the report as JSON.',
      messages: [{ role: 'user', content: 'x'.repeat(25_000) }],
      maxTokens: 4096,
      jsonMode: true,
      reasoningEffort: 'none',
      preferNativeContext: true,
    }));

    // Unload the small-context instance, reload at the planned context, then
    // generate over the streaming-capable compatible endpoint.
    expect(lifecycle.map(([action]) => action)).toEqual(['unload', 'load', 'chat']);
    expect(lifecycle[0][1]).toEqual({ instance_id: 'thinkingcap-qwen3.6-27b' });
    expect(lifecycle[1][1]).toEqual({
      model: 'thinkingcap-qwen3.6-27b@q4_k_m',
      context_length: 16384,
    });
    expect(lifecycle[2][1]).toMatchObject({ model: 'thinkingcap-qwen3.6-27b' });
    expect(result).toMatchObject({
      text: '{"markers":[]}',
      diagnostics: {
        providerApi: 'openai-compatible',
        localPlan: { contextLength: 16384 },
      },
    });
  });

  it('falls back to LM Studio native chat when the load endpoint is missing', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('thinkingcap-qwen3.6-27b');
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const href = String(url);
      if (init.method === 'POST') {
        if (href.endsWith('/api/v1/models/unload')) return jsonResponse({ ok: true });
        if (href.endsWith('/api/v1/models/load')) return jsonResponse({ error: { message: 'Not found' } }, { status: 404 });
        expect(href).toBe('http://localhost:11434/api/v1/chat');
        return jsonResponse({
          output: [{ type: 'message', content: '{"markers":[]}' }],
          stats: {
            input_tokens: 7200,
            total_output_tokens: 24,
            tokens_per_second: 31.5,
            reasoning_output_tokens: 0,
          },
        });
      }
      if (href.endsWith('/api/v1/models')) {
        return jsonResponse({ models: [{
          type: 'llm',
          key: 'thinkingcap-qwen3.6-27b@q4_k_m',
          loaded_instances: [{ id: 'thinkingcap-qwen3.6-27b', config: { context_length: 8192 } }],
          max_context_length: 262144,
          capabilities: { reasoning: { allowed_options: ['off', 'on'], default: 'on' } },
        }] });
      }
      if (href.endsWith('/v1/models')) {
        return jsonResponse({ data: [{ id: 'thinkingcap-qwen3.6-27b' }] });
      }
      return jsonResponse({}, { status: 404 });
    });

    const result = await callClaudeAPI(baseChatOptions({
      system: 'Extract the report as JSON.',
      messages: [{ role: 'user', content: 'x'.repeat(25_000) }],
      maxTokens: 4096,
      jsonMode: true,
      reasoningEffort: 'none',
      preferNativeContext: true,
    }));

    const chatCall = globalThis.fetch.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/v1/chat'));
    const body = JSON.parse(chatCall[1].body);
    expect(body).toMatchObject({
      model: 'thinkingcap-qwen3.6-27b',
      context_length: 16384,
      max_output_tokens: 4096,
      reasoning: 'off',
      stream: false,
      store: false,
    });
    expect(result).toMatchObject({
      text: '{"markers":[]}',
      truncated: false,
      diagnostics: {
        nativeContextOverride: true,
        contextLength: 16384,
        performance: { tokensPerSecond: 31.5 },
        localPlan: { contextLength: 16384 },
      },
    });
  });

  it('refuses inference when LM Studio cannot verify the context after loading', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('thinkingcap-qwen3.6-27b');
    let nativeDiscoveryCalls = 0;
    let loaded = false;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const href = String(url);
      if (init.method === 'POST') {
        if (href.endsWith('/api/v1/models/unload')) return jsonResponse({ ok: true });
        if (href.endsWith('/api/v1/models/load')) { loaded = true; return jsonResponse({ ok: true }); }
        if (href.endsWith('/v1/chat/completions')) throw new Error('Inference must not run with an unverified context.');
      }
      if (href.endsWith('/api/v1/models')) {
        nativeDiscoveryCalls++;
        if (nativeDiscoveryCalls > 1) return jsonResponse({ error: 'unavailable' }, { status: 503 });
        return jsonResponse({ models: [{
          type: 'llm',
          key: 'thinkingcap-qwen3.6-27b@q4_k_m',
          loaded_instances: [{ id: 'thinkingcap-qwen3.6-27b', config: { context_length: 8192 } }],
          max_context_length: 262144,
        }] });
      }
      if (href.endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'thinkingcap-qwen3.6-27b' }] });
      return jsonResponse({}, { status: 404 });
    });

    await expect(callClaudeAPI(baseChatOptions({
      system: 'Extract the report as JSON.',
      messages: [{ role: 'user', content: 'x'.repeat(25_000) }],
      maxTokens: 4096,
      jsonMode: true,
      reasoningEffort: 'none',
      preferNativeContext: true,
    }))).rejects.toThrow(/could not verify its active context length/i);
    expect(loaded).toBe(true);
  });

  it('refuses to load a second copy when the prior LM Studio instance cannot be unloaded', async () => {
    const loadedDetail = { loaded: true, loadedInstanceId: 'big-model-1', nativeModelKey: 'big-model@q4' };
    const modelsBody = (loaded) => ({ models: [{
      type: 'llm',
      key: 'big-model@q4',
      loaded_instances: loaded ? [{ id: 'big-model-1', config: { context_length: 8192 } }] : [],
      max_context_length: 131072,
    }] });

    // Unload fails and the server still reports the instance loaded → refuse.
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (String(url).endsWith('/api/v1/models/unload')) return jsonResponse({ error: 'busy' }, { status: 500 });
      if (String(url).endsWith('/api/v1/models/load')) throw new Error('Load must not run while the old instance is resident.');
      if (String(url).endsWith('/api/v1/models')) return jsonResponse(modelsBody(true));
      return jsonResponse({}, { status: 404 });
    });
    await expect(loadLMStudioModelWithContext({
      baseUrl: 'http://lmstudio.test',
      model: 'big-model',
      modelDetail: loadedDetail,
      contextLength: 16384,
    })).rejects.toThrow(/could not unload big-model/i);

    // Unload fails but the instance is already gone (stale state) → proceed.
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (String(url).endsWith('/api/v1/models/unload')) return jsonResponse({ error: 'not found' }, { status: 404 });
      if (String(url).endsWith('/api/v1/models/load')) return jsonResponse({ ok: true });
      if (String(url).endsWith('/api/v1/models')) return jsonResponse(modelsBody(false));
      return jsonResponse({}, { status: 404 });
    });
    await expect(loadLMStudioModelWithContext({
      baseUrl: 'http://lmstudio.test',
      model: 'big-model',
      modelDetail: loadedDetail,
      contextLength: 16384,
    })).resolves.toBe(true);

    // Unload fails and discovery cannot verify residency → fail closed.
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (String(url).endsWith('/api/v1/models/unload')) return jsonResponse({ error: 'busy' }, { status: 500 });
      if (String(url).endsWith('/api/v1/models/load')) throw new Error('Load must not run without an authoritative residency check.');
      if (String(url).endsWith('/api/v1/models')) return jsonResponse({ error: 'unavailable' }, { status: 503 });
      return jsonResponse({}, { status: 404 });
    });
    await expect(loadLMStudioModelWithContext({
      baseUrl: 'http://lmstudio.test',
      model: 'big-model',
      modelDetail: loadedDetail,
      contextLength: 16384,
    })).rejects.toThrow(/could not verify that big-model was unloaded/i);
  });

  it('flags a native LM Studio response that stopped at the output or context cap as truncated', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      output: [{ type: 'message', content: '{"markers":[{"rawName":"Potas' }],
      stats: { input_tokens: 11057, total_output_tokens: 1854 },
    }));
    const result = await inferWithLMStudioNativeProvider({
      config: { url: 'http://lmstudio.test', apiKey: '' },
      model: 'local-model',
      opts: { messages: [{ role: 'user', content: 'extract' }], requestTimeoutMs: 1000 },
      plan: { maxTokens: 4096 },
      contextLength: 12912,
      modelDetail: null,
    });
    expect(result.truncated).toBe(true);
    expect(result.finishReason).toBe('length');

    const atOutputCap = await inferWithLMStudioNativeProvider({
      config: { url: 'http://lmstudio.test', apiKey: '' },
      model: 'local-model',
      opts: { messages: [{ role: 'user', content: 'extract' }], requestTimeoutMs: 1000 },
      plan: { maxTokens: 1854 },
      contextLength: 65536,
      modelDetail: null,
    });
    expect(atOutputCap.truncated).toBe(true);

    const finishedNaturally = await inferWithLMStudioNativeProvider({
      config: { url: 'http://lmstudio.test', apiKey: '' },
      model: 'local-model',
      opts: { messages: [{ role: 'user', content: 'extract' }], requestTimeoutMs: 1000 },
      plan: { maxTokens: 4096 },
      contextLength: 65536,
      modelDetail: null,
    });
    expect(finishedNaturally.truncated).toBe(false);
    expect(finishedNaturally.finishReason).toBe(null);
  });

  it('loads sufficient LM Studio context when switching to an unloaded model', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('new-model-q4');
    let loadedCtx = 0;
    const lifecycle = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const href = String(url);
      if (init.method === 'POST') {
        if (href.endsWith('/api/v1/models/unload')) {
          lifecycle.push(['unload', JSON.parse(init.body)]);
          return jsonResponse({ ok: true });
        }
        if (href.endsWith('/api/v1/models/load')) {
          const body = JSON.parse(init.body);
          lifecycle.push(['load', body]);
          loadedCtx = body.context_length;
          return jsonResponse({ ok: true });
        }
        if (href.endsWith('/v1/chat/completions')) {
          lifecycle.push(['chat', JSON.parse(init.body)]);
          return chatCompletionResponse('{"markers":[]}');
        }
        throw new Error(`Unexpected POST URL: ${href}`);
      }
      if (href.endsWith('/api/v1/models')) {
        return jsonResponse({ models: [{
          type: 'llm',
          key: 'new-model-q4',
          loaded_instances: loadedCtx > 0 ? [{ id: 'new-model-q4', config: { context_length: loadedCtx } }] : [],
          max_context_length: 131072,
          capabilities: { reasoning: { allowed_options: ['on'], default: 'on' } },
        }] });
      }
      if (href.endsWith('/v1/models')) {
        return jsonResponse({ data: [] });
      }
      return jsonResponse({}, { status: 404 });
    });

    const result = await callClaudeAPI(baseChatOptions({
      system: 'Extract the report as JSON.',
      messages: [{ role: 'user', content: 'x'.repeat(25_000) }],
      maxTokens: 4096,
      jsonMode: true,
      reasoningEffort: 'none',
      preferNativeContext: true,
    }));

    // Nothing was loaded, so no unload call precedes the load.
    expect(lifecycle.map(([action]) => action)).toEqual(['load', 'chat']);
    expect(lifecycle[0][1]).toEqual({
      model: 'new-model-q4',
      context_length: 16384,
    });
    expect(result).toMatchObject({
      text: '{"markers":[]}',
      diagnostics: {
        providerApi: 'openai-compatible',
        localPlan: { contextLength: 16384 },
      },
    });
  });

  it('rejects an unloaded LM Studio model when its maximum context cannot fit the import', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('small-unloaded-model');
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      if (init.method === 'POST') throw new Error('Inference must not start with insufficient context.');
      if (String(url).endsWith('/api/v1/models')) {
        return jsonResponse({ models: [{
          type: 'llm',
          key: 'small-unloaded-model',
          loaded_instances: [],
          max_context_length: 8192,
        }] });
      }
      if (String(url).endsWith('/v1/models')) return jsonResponse({ data: [] });
      return jsonResponse({}, { status: 404 });
    });

    await expect(callClaudeAPI(baseChatOptions({
      system: 'Extract the report as JSON.',
      messages: [{ role: 'user', content: 'x'.repeat(25_000) }],
      maxTokens: 4096,
      jsonMode: true,
      reasoningEffort: 'none',
      preferNativeContext: true,
    }))).rejects.toThrow(/context is too small.*supports up to 8,192/i);
    expect(globalThis.fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('redacts configured secrets from LM Studio and Ollama native errors', async () => {
    const secret = 'private-local-token-123';
    const commonOptions = {
      messages: [{ role: 'user', content: 'hello' }],
      requestTimeoutMs: 1000,
    };
    globalThis.fetch = vi.fn(async () => jsonResponse({
      error: { message: `provider echoed ${secret}` },
    }, { status: 500 }));
    const lmStudioError = await inferWithLMStudioNativeProvider({
      config: { url: 'http://lmstudio.test', apiKey: secret },
      model: 'local-model',
      opts: commonOptions,
      plan: { maxTokens: 32 },
      contextLength: 4096,
      modelDetail: null,
    }).catch(error => error);
    expect(lmStudioError).toBeInstanceOf(Error);
    expect(lmStudioError.message).toContain('[redacted]');
    expect(lmStudioError.message).not.toContain(secret);

    globalThis.fetch = vi.fn(async () => jsonResponse({ error: `provider echoed ${secret}` }, { status: 500 }));
    const ollamaError = await inferWithOllamaNativeProvider({
      config: { url: 'http://ollama.test', apiKey: secret },
      model: 'local-model',
      opts: commonOptions,
      plan: { maxTokens: 32 },
      contextLength: 4096,
    }).catch(error => error);
    expect(ollamaError).toBeInstanceOf(Error);
    expect(ollamaError.message).toContain('[redacted]');
    expect(ollamaError.message).not.toContain(secret);

    globalThis.fetch = vi.fn(async () => streamResponse([
      `${JSON.stringify({ error: `stream echoed ${secret}` })}\n`,
    ]));
    const ollamaStreamError = await inferWithOllamaNativeProvider({
      config: { url: 'http://ollama.test', apiKey: secret },
      model: 'local-model',
      opts: { ...commonOptions, onStream: vi.fn() },
      plan: { maxTokens: 32 },
      contextLength: 4096,
    }).catch(error => error);
    expect(ollamaStreamError).toBeInstanceOf(Error);
    expect(ollamaStreamError.message).toContain('[redacted]');
    expect(ollamaStreamError.message).not.toContain(secret);
  });

  it('reports an Ollama streaming response without a readable body', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(inferWithOllamaNativeProvider({
      config: { url: 'http://ollama.test', apiKey: '' },
      model: 'local-model',
      opts: {
        messages: [{ role: 'user', content: 'hello' }],
        onStream: vi.fn(),
        requestTimeoutMs: 1000,
      },
      plan: { maxTokens: 32 },
      contextLength: 4096,
    })).rejects.toThrow('streaming response without a readable body');
  });

  it('uses the native Ollama adapter for imports and normalizes runtime metrics', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('qwen3.6:27b');
    const jsonSchema = {
      type: 'object',
      properties: { markers: { type: 'array' } },
      required: ['markers'],
    };
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const href = String(url);
      if (init.method === 'POST') {
        expect(href).toBe('http://localhost:11434/api/chat');
        return jsonResponse({
          message: { role: 'assistant', content: '{"markers":[]}' },
          done: true,
          done_reason: 'stop',
          load_duration: 200_000_000,
          prompt_eval_count: 100,
          prompt_eval_duration: 300_000_000,
          eval_count: 50,
          eval_duration: 1_000_000_000,
        });
      }
      if (href.endsWith('/api/v1/models')) return jsonResponse({}, { status: 404 });
      if (href.endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'qwen3.6:27b' }] });
      if (href.endsWith('/api/tags')) {
        return jsonResponse({ models: [{
          name: 'qwen3.6:27b',
          size: 17_420_432_739,
          details: {
            family: 'qwen35',
            format: 'gguf',
            parameter_size: '27.8B',
            quantization_level: 'Q4_K_M',
            context_length: 262144,
          },
          capabilities: ['vision', 'completion', 'thinking'],
        }] });
      }
      if (href.endsWith('/api/ps')) {
        return jsonResponse({ models: [{
          name: 'qwen3.6:27b',
          size_vram: 18_658_487_172,
          context_length: 8192,
        }] });
      }
      return jsonResponse({}, { status: 404 });
    });

    const result = await callClaudeAPI(baseChatOptions({
      jsonMode: true,
      jsonSchema,
      reasoningEffort: 'none',
      preferNativeContext: true,
      maxTokens: 4096,
    }));

    const postCall = globalThis.fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(postCall[1].body);
    expect(body).toMatchObject({
      model: 'qwen3.6:27b',
      stream: false,
      think: false,
      format: jsonSchema,
      options: {
        num_predict: 4096,
        num_ctx: 8192,
        temperature: 0,
      },
    });
    expect(result).toMatchObject({
      text: '{"markers":[]}',
      usage: { inputTokens: 100, outputTokens: 50 },
      diagnostics: {
        providerApi: 'native',
        nativeContextOverride: false,
        contextLength: 8192,
        performance: {
          tokensPerSecond: 50,
          timeToFirstTokenMs: 500,
          modelLoadMs: 200,
        },
        localPlan: {
          contextLength: 8192,
          maxContextLength: 262144,
        },
      },
    });
    expect(globalThis.fetch.mock.calls.some(([url]) => String(url).endsWith('/v1/chat/completions'))).toBe(false);
  });

  it('keeps native Ollama imports compatible when schema and thinking controls are unsupported', async () => {
    setAIProvider('ollama');
    setOllamaMainModel('legacy-ollama:8b');
    const postBodies = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const href = String(url);
      if (init.method === 'POST') {
        postBodies.push(JSON.parse(init.body));
        if (postBodies.length === 1) return jsonResponse({ error: 'format schema is unsupported' }, { status: 400 });
        if (postBodies.length === 2) return jsonResponse({ error: 'unknown field think' }, { status: 422 });
        return jsonResponse({
          message: { role: 'assistant', content: '{"markers":[]}' },
          done: true,
          done_reason: 'stop',
        });
      }
      if (href.endsWith('/api/v1/models')) return jsonResponse({}, { status: 404 });
      if (href.endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'legacy-ollama:8b' }] });
      if (href.endsWith('/api/tags')) {
        return jsonResponse({ models: [{
          name: 'legacy-ollama:8b',
          details: { context_length: 32768 },
        }] });
      }
      if (href.endsWith('/api/ps')) {
        return jsonResponse({ models: [{ name: 'legacy-ollama:8b', context_length: 8192 }] });
      }
      return jsonResponse({}, { status: 404 });
    });

    const result = await callClaudeAPI(baseChatOptions({
      jsonMode: true,
      jsonSchema: { type: 'object', properties: { markers: { type: 'array' } } },
      reasoningEffort: 'none',
      preferNativeContext: true,
    }));

    expect(postBodies).toHaveLength(3);
    expect(postBodies[0].format).toMatchObject({ type: 'object' });
    expect(postBodies[0].think).toBe(false);
    expect(postBodies[1].format).toBe('json');
    expect(postBodies[1].think).toBe(false);
    expect(postBodies[2].format).toBe('json');
    expect(postBodies[2]).not.toHaveProperty('think');
    expect(result).toMatchObject({
      text: '{"markers":[]}',
      diagnostics: {
        providerApi: 'native',
        structuredOutputFallback: true,
        reasoningControlFallback: true,
      },
    });
  });

  it('parses OpenAI-compatible SSE streams without changing provider headers', async () => {
    setAIProvider('openrouter');
    updateKeyCache('labcharts-openrouter-key', 'sk-or-stream');
    setOpenRouterModel('openai/gpt-4o');
    globalThis.fetch = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"max_tokens"}],"usage":{"prompt_tokens":7,"completion_tokens":8}}\n\n',
      'data: [DONE]\n\n',
    ]));
    const onStream = vi.fn();

    await expect(callClaudeAPI({
      messages: [{ role: 'user', content: 'stream please' }],
      maxTokens: 16,
      onStream,
      requestTimeoutMs: 1000,
    })).resolves.toEqual({
      text: 'Hello',
      usage: { inputTokens: 7, outputTokens: 8 },
      finishReason: 'max_tokens',
      truncated: true,
    });

    const request = providerRequestFromFetchCall();
    expect(request.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(request.headers.Authorization).toBe('Bearer sk-or-stream');
    expect(request.body).toMatchObject({
      model: 'openai/gpt-4o',
      max_tokens: 16,
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(onStream).toHaveBeenNthCalledWith(1, 'Hel');
    expect(onStream).toHaveBeenNthCalledWith(2, 'Hello');
  });

  it('retries transient Venice E2EE attestation gateway failures before sending the completion', async () => {
    vi.useFakeTimers();
    try {
      setAIProvider('venice');
      updateKeyCache('labcharts-venice-key', 'sk-venice-attestation-retry');
      setVeniceE2EE(true);
      setVeniceModel('e2ee-retry-contract');
      localStorage.setItem('labcharts-venice-models', '[]');
      localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-retry-contract' }]));
      localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
      veniceE2EEMocks.createSession
        .mockRejectedValueOnce(new Error('TEE attestation failed (502)'))
        .mockRejectedValueOnce(new Error('GPU attestation failed: NRAS rejected the GPU evidence (503)'))
        .mockResolvedValueOnce(veniceE2EEMocks.session);

      const expectation = expect(callClaudeAPI(baseChatOptions())).resolves.toMatchObject({ text: 'decrypted:contract ok' });
      await vi.runAllTimersAsync();
      await expectation;

      expect(veniceE2EEMocks.createSession).toHaveBeenCalledTimes(3);
      expect(veniceDcapMocks.createVerifier).toHaveBeenCalledTimes(1);
      expect(veniceNvidiaMocks.createTokenVerifier).toHaveBeenCalledTimes(1);
      expect(veniceNvidiaMocks.createGpuVerifier).toHaveBeenCalledWith({
        tokenVerifier: veniceNvidiaMocks.tokenVerifier,
        fetchImpl: expect.any(Function),
      });
      expect(veniceE2EEMocks.createClient).toHaveBeenCalledWith({
        apiKey: 'sk-venice-attestation-retry',
        dcapVerifier: veniceDcapMocks.verifier,
        requireDcap: true,
        gpuVerifier: veniceNvidiaMocks.gpuVerifier,
        requireGpu: true,
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      const nrasFetch = veniceNvidiaMocks.createGpuVerifier.mock.calls[0][0].fetchImpl;
      globalThis.fetch.mockClear();
      await nrasFetch('https://nras.attestation.nvidia.com/v3/attest/gpu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"evidence":"fixture"}',
      });
      expect(requestFromLastFetch()).toMatchObject({
        url: '/api/proxy',
        init: { method: 'POST' },
        body: {
          url: 'https://nras.attestation.nvidia.com/v3/attest/gpu',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: '{"evidence":"fixture"}',
        },
      });
      await expect(nrasFetch('https://example.com/not-nras', {
        method: 'POST',
        body: '{"evidence":"fixture"}',
      })).rejects.toThrow('Blocked unexpected NVIDIA NRAS proxy request');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed when client-side Venice DCAP verification is rejected', async () => {
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', 'sk-venice-dcap-rejected');
    setVeniceE2EE(true);
    setVeniceModel('e2ee-dcap-rejected');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-dcap-rejected' }]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    veniceE2EEMocks.createSession.mockRejectedValueOnce(
      new Error('Attestation verification failed: Full DCAP verification did not complete successfully')
    );

    await expect(callClaudeAPI(baseChatOptions())).rejects.toThrow(
      'Venice E2EE setup failed: Attestation verification failed: Full DCAP verification did not complete successfully'
    );

    expect(veniceE2EEMocks.createSession).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fails closed when NVIDIA NRAS verification is rejected', async () => {
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', 'sk-venice-nras-rejected');
    setVeniceE2EE(true);
    setVeniceModel('e2ee-nras-rejected');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-nras-rejected' }]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    veniceE2EEMocks.createSession.mockRejectedValueOnce(
      new Error('Attestation verification failed: GPU attestation did not complete successfully')
    );

    await expect(callClaudeAPI(baseChatOptions())).rejects.toThrow(
      'Venice E2EE setup failed: Attestation verification failed: GPU attestation did not complete successfully'
    );

    expect(veniceE2EEMocks.createSession).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports a persistent Venice E2EE attestation outage after bounded retries', async () => {
    vi.useFakeTimers();
    try {
      setAIProvider('venice');
      updateKeyCache('labcharts-venice-key', 'sk-venice-attestation-down');
      setVeniceE2EE(true);
      setVeniceModel('e2ee-down-contract');
      localStorage.setItem('labcharts-venice-models', '[]');
      localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-down-contract' }]));
      localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
      veniceE2EEMocks.createSession.mockRejectedValue(new Error('TEE attestation failed (502)'));

      const expectation = expect(callClaudeAPI(baseChatOptions())).rejects.toThrow(
        'Venice E2EE attestation stayed unavailable (502) after 3 attempts. Retry shortly or choose another E2EE model.'
      );
      await vi.runAllTimersAsync();
      await expectation;

      expect(veniceE2EEMocks.createSession).toHaveBeenCalledTimes(3);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces redacted Venice E2EE SSE provider errors', async () => {
    const secret = 'sk-venice-stream-secret';
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', secret);
    setVeniceE2EE(true);
    setVeniceModel('e2ee-contract-model');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-contract-model' }]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    globalThis.fetch = vi.fn(async () => streamResponse([
      `data: {"error":{"message":"provider echoed ${secret}"}}\n\n`,
    ]));

    let caught;
    try {
      await callClaudeAPI({
        messages: [{ role: 'user', content: 'stream through e2ee' }],
        maxTokens: 16,
        onStream: vi.fn(),
        requestTimeoutMs: 1000,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toContain('[redacted]');
    expect(caught.message).not.toContain(secret);
    const request = providerRequestFromFetchCall();
    expect(request.url).toBe('https://api.venice.ai/api/v1/chat/completions');
    expect(request.headers.Authorization).toBe(`Bearer ${secret}`);
    expect(request.body).toMatchObject({
      model: 'e2ee-contract-model',
      max_tokens: 16,
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('rejects a Venice E2EE streaming response without a body', async () => {
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', 'sk-venice-no-stream');
    setVeniceE2EE(true);
    setVeniceModel('e2ee-no-stream-contract');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-no-stream-contract' }]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(callClaudeAPI({
      messages: [{ role: 'user', content: 'stream through e2ee' }],
      maxTokens: 16,
      onStream: vi.fn(),
      requestTimeoutMs: 1000,
    })).rejects.toThrow('Venice E2EE returned no response stream');
  });

  it('returns encrypted Venice reasoning when a reasoning model emits no final content', async () => {
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', 'sk-venice-reasoning');
    setVeniceE2EE(true);
    setVeniceModel('e2ee-glm-5-2-p');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-glm-5-2-p' }]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    globalThis.fetch = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"encrypted-reasoning"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":12}}\n\n',
      'data: [DONE]\n\n',
    ]));
    const onStream = vi.fn();

    await expect(callClaudeAPI({
      messages: [{ role: 'user', content: 'reason carefully' }],
      maxTokens: 64,
      onStream,
      requestTimeoutMs: 1000,
    })).resolves.toEqual({
      text: 'decrypted:encrypted-reasoning',
      usage: { inputTokens: 20, outputTokens: 12 },
      finishReason: 'stop',
      truncated: false,
    });
    expect(onStream).toHaveBeenCalledWith('decrypted:encrypted-reasoning');
    const request = providerRequestFromFetchCall();
    expect(request.body).toMatchObject({
      venice_parameters: { enable_e2ee: true },
    });
    expect(request.body).not.toHaveProperty('reasoning');
    expect(request.body).not.toHaveProperty('venice_parameters.disable_thinking');
    expect(request.body).not.toHaveProperty('venice_parameters.strip_thinking_response');
  });

  it('reports an empty Venice E2EE stream instead of silently rendering a blank answer', async () => {
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', 'sk-venice-empty');
    setVeniceE2EE(true);
    setVeniceModel('e2ee-empty-contract');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-empty-contract' }]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    globalThis.fetch = vi.fn(async () => streamResponse([
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]));

    await expect(callClaudeAPI({
      messages: [{ role: 'user', content: 'empty response' }],
      maxTokens: 64,
      onStream: vi.fn(),
      requestTimeoutMs: 1000,
    })).rejects.toThrow('stream ended without encrypted response content');
  });

  it('allows long Venice reasoning streams to reach their final answer', async () => {
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', 'sk-venice-runaway');
    setVeniceE2EE(true);
    setVeniceModel('e2ee-glm-runaway');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-glm-runaway' }]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    const reasoningEvents = Array.from({ length: 160 }, (_, index) =>
      `data: {"choices":[{"delta":{"reasoning_content":"encrypted-r${index}"}}]}\n\n`
    );
    reasoningEvents.push(
      'data: {"choices":[{"delta":{"content":"encrypted-final-answer"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":120,"completion_tokens":240}}\n\n',
      'data: [DONE]\n\n'
    );
    globalThis.fetch = vi.fn(async () => streamResponse(reasoningEvents));

    await expect(callClaudeAPI({
      messages: [{ role: 'user', content: 'runaway reasoning' }],
      maxTokens: 16384,
      onStream: vi.fn(),
      requestTimeoutMs: 1000,
    })).resolves.toMatchObject({
      text: 'decrypted:encrypted-final-answer',
      usage: { inputTokens: 120, outputTokens: 240 },
      finishReason: 'stop',
    });
    expect(globalThis._veniceLastStreamDiagnostics).toMatchObject({
      contentChunks: 1,
      reasoningChunks: 160,
      status: 'complete',
    });
  });

  it('routes advertised Routstr Tinfoil models through attested EHBP with a plaintext model hint', async () => {
    const secret = 'sk-routstr-private-contract';
    setAIProvider('routstr');
    updateKeyCache('labcharts-routstr-key', secret);
    localStorage.setItem('labcharts-routstr-node', 'https://private-node.example/');
    localStorage.setItem('labcharts-routstr-private-models', JSON.stringify([{ id: 'tinfoil-glm-5-2' }]));
    setRoutstrModel('tinfoil-glm-5-2');

    await expect(callClaudeAPI(baseChatOptions({ webSearch: true }))).resolves.toMatchObject({
      text: 'contract ok',
      usage: { inputTokens: 11, outputTokens: 13 },
    });

    expect(createTinfoilSecureFetchMock).toHaveBeenCalledWith({ baseUrl: 'https://private-node.example' });
    const request = providerRequestFromFetchCall();
    expect(request.url).toBe('https://private-node.example/v1/chat/completions');
    expect(request.headers).toMatchObject({
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'X-Routstr-Model': 'tinfoil-glm-5-2',
    });
    expect(request.body).toMatchObject({ model: 'glm-5-2', max_tokens: 32 });
    expect(request.body).not.toHaveProperty('plugins');
    expect(globalThis._routstrAttestation).toMatchObject({ securityVerified: true });
    expect(isRoutstrPrivateModeActive()).toBe(true);
    expect(supportsVision()).toBe(false);
  });

  it('caps Routstr private output reservations and extends only the default request timeout', async () => {
    setAIProvider('routstr');
    updateKeyCache('labcharts-routstr-key', 'sk-routstr-reservation-contract');
    localStorage.setItem('labcharts-routstr-node', 'https://private-node.example');
    setRoutstrModel('tinfoil-glm-5-2');
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const options = baseChatOptions({ maxTokens: 16384 });
    delete options.requestTimeoutMs;

    await callClaudeAPI(options);

    expect(providerRequestFromFetchCall().body).toMatchObject({ max_tokens: 4096 });
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 180000);
    timeoutSpy.mockRestore();
  });

  it('reports failed private requests so visible Routstr balances can settle automatically', async () => {
    setAIProvider('routstr');
    updateKeyCache('labcharts-routstr-key', 'sk-routstr-failed-contract');
    localStorage.setItem('labcharts-routstr-node', 'https://private-node.example');
    setRoutstrModel('tinfoil-glm-5-2');
    createTinfoilSecureFetchMock.mockResolvedValue({
      verification: { securityVerified: true },
      fetch: vi.fn(async () => { throw new TypeError('connection dropped'); }),
    });
    let settledDetail = null;
    const listener = event => { settledDetail = event.detail; };
    globalThis.addEventListener('labcharts-routstr-request-settled', listener);

    await expect(callClaudeAPI(baseChatOptions())).rejects.toThrow('temporary reservation');

    globalThis.removeEventListener('labcharts-routstr-request-settled', listener);
    expect(settledDetail).toMatchObject({ failed: true, modelId: 'tinfoil-glm-5-2' });
  });

  it('explains a long encrypted connection failure without retrying the billable request', async () => {
    setAIProvider('routstr');
    updateKeyCache('labcharts-routstr-key', 'sk-routstr-slow-contract');
    localStorage.setItem('labcharts-routstr-node', 'https://private-node.example');
    setRoutstrModel('tinfoil-glm-5-2');
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const secureFetch = vi.fn(async () => {
      now = 62000;
      throw new TypeError('Failed to fetch');
    });
    createTinfoilSecureFetchMock.mockResolvedValue({
      verification: { securityVerified: true },
      fetch: secureFetch,
    });

    await expect(callClaudeAPI(baseChatOptions())).rejects.toThrow(
      'encrypted Routstr connection ended after 61s before tinfoil-glm-5-2 returned a response'
    );
    expect(secureFetch).toHaveBeenCalledOnce();
  });

  it('separates node-advertised Routstr Tinfoil models from the regular catalog', async () => {
    localStorage.setItem('labcharts-routstr-node', 'https://catalog.example');
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: [
      { id: 'claude-sonnet-5', name: 'Claude', enabled: true, pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'tinfoil-glm-5-2', name: 'Private GLM', enabled: true, pricing: { prompt: '0.000003', completion: '0.000004' } },
      { id: 'tinfoil-disabled', name: 'Disabled', enabled: false },
    ] }));

    await expect(fetchRoutstrModels()).resolves.toEqual([
      expect.objectContaining({ id: 'claude-sonnet-5' }),
    ]);
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-private-models'))).toEqual([
      expect.objectContaining({ id: 'tinfoil-glm-5-2' }),
    ]);
    expect(JSON.parse(localStorage.getItem('labcharts-routstr-pricing'))).toMatchObject({
      'claude-sonnet-5': { input: 1, output: 2 },
      'tinfoil-glm-5-2': { input: 3, output: 4 },
    });
  });

  it('fails before fetch for missing keys and redacts configured secrets from provider errors', async () => {
    setAIProvider('openrouter');
    setOpenRouterModel('openai/gpt-4o');

    await expect(callClaudeAPI(baseChatOptions())).rejects.toThrow('No OpenRouter API key configured');
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const secret = 'sk-or-contract-secret';
    updateKeyCache('labcharts-openrouter-key', secret);
    globalThis.fetch = vi.fn(async () => jsonResponse({
      error: { message: `upstream echoed ${secret}` },
    }, { status: 500 }));

    let caught;
    try {
      await callClaudeAPI(baseChatOptions());
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toContain('[redacted]');
    expect(caught.message).not.toContain(secret);
    const request = providerRequestFromFetchCall();
    expect(request.headers.Authorization).toBe(`Bearer ${secret}`);
  });
});
