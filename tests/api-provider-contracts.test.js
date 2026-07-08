import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
