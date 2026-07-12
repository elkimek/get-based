import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createTinfoilSecureFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../js/tinfoil-secure-fetch.js', () => ({
  createTinfoilSecureFetch: createTinfoilSecureFetchMock,
  clearTinfoilSecureFetchCache: vi.fn(),
}));

vi.mock('../vendor/venice-e2ee.js', () => ({
  createVeniceE2EE: vi.fn(() => ({
    createSession: vi.fn(async () => ({
      aesKey: 'mock-aes-key',
      publicKey: 'mock-public-key',
      privateKey: 'mock-private-key',
      pubKeyHex: 'mock-client-pub-key',
      modelPubKeyHex: 'mock-model-pub-key',
      attestation: { verified: true },
    })),
    clearSession: vi.fn(),
  })),
  encryptMessage: vi.fn(async (_aesKey, _publicKey, text) => `encrypted:${text}`),
  decryptChunk: vi.fn(async (_privateKey, text) => `decrypted:${text}`),
}));

import { updateKeyCache } from '../js/crypto.js';
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
const realGetOllamaConfig = globalThis.getOllamaConfig;

const PROVIDER_KEY_CACHE_KEYS = [
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
  globalThis.fetch = vi.fn(async () => chatCompletionResponse());
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    writable: true,
    value: { origin: 'https://app.getbased.health', pathname: '/app', href: 'https://app.getbased.health/app' },
  });
  globalThis.getOllamaConfig = () => ({
    url: 'http://localhost:11434',
    model: 'llama3.2',
    apiKey: 'local-api-key',
  });
  globalThis.showInsufficientBalanceDialog = undefined;
  delete globalThis._routstrAttestation;
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
  if (realGetOllamaConfig) globalThis.getOllamaConfig = realGetOllamaConfig;
  else delete globalThis.getOllamaConfig;
  clearProviderKeyCaches();
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
        response_format: { type: 'json_object' },
      });
    },
  },
];

describe('AI provider request contracts', () => {
  it.each(providerContracts)('routes $name through its expected chat-completion contract', async (contract) => {
    contract.setup();

    await expect(callClaudeAPI(baseChatOptions(contract.options))).resolves.toEqual({
      text: 'contract ok',
      usage: { inputTokens: 11, outputTokens: 13 },
      finishReason: 'stop',
      truncated: false,
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const request = providerRequestFromFetchCall();
    contract.assertRequest(request);
    expect(JSON.stringify(request.body)).not.toContain(contract.key);
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

  it('returns encrypted Venice reasoning when a reasoning model emits no final content', async () => {
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', 'sk-venice-reasoning');
    setVeniceE2EE(true);
    setVeniceModel('e2ee-glm-contract');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-glm-contract' }]));
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
      venice_parameters: {
        enable_e2ee: true,
        disable_thinking: true,
        strip_thinking_response: true,
      },
      reasoning: { enabled: false },
    });
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

  it('cancels a runaway Venice reasoning-only stream', async () => {
    setAIProvider('venice');
    updateKeyCache('labcharts-venice-key', 'sk-venice-runaway');
    setVeniceE2EE(true);
    setVeniceModel('e2ee-glm-runaway');
    localStorage.setItem('labcharts-venice-models', '[]');
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-glm-runaway' }]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    const reasoningEvents = Array.from({ length: 129 }, (_, index) =>
      `data: {"choices":[{"delta":{"reasoning_content":"encrypted-r${index}"}}]}\n\n`
    );
    globalThis.fetch = vi.fn(async () => streamResponse(reasoningEvents));

    await expect(callClaudeAPI({
      messages: [{ role: 'user', content: 'runaway reasoning' }],
      maxTokens: 16384,
      onStream: vi.fn(),
      requestTimeoutMs: 1000,
    })).rejects.toThrow('cancelled to limit further charges');
    expect(globalThis._veniceLastStreamDiagnostics).toMatchObject({
      contentChunks: 0,
      reasoningChunks: 129,
      status: 'cancelled-reasoning-only',
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
