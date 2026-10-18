import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderRequestOptions } from '../js/api-openai-compatible.js';
import { updateKeyCache } from '../js/crypto-key-cache.js';
import { jsonResponse } from './helpers/http-responses.js';

interface SyntheticSession {
  aesKey: string;
  publicKey: string;
  privateKey: string;
  pubKeyHex: string;
  modelPubKeyHex: string;
  attestation: { verificationLevel: string; errors: string[] };
}

// The SDK/crypto boundary is synthetic here. These tests exercise the real
// adapter's transport, stream assembly, cancellation and retry policy.
const sdk = vi.hoisted(() => ({
  createSession: vi.fn<(modelId: string) => Promise<SyntheticSession>>(),
  createClient: vi.fn<(config: Record<string, unknown>) => {
    createSession: (modelId: string) => Promise<SyntheticSession>;
    clearSession: () => void;
  }>(),
  encrypt: vi.fn(async (_aes: unknown, _key: unknown, text: string) => `synthetic-cipher:${text}`),
  decrypt: vi.fn(async (_key: unknown, text: string) => {
    if (!text.startsWith('synthetic-cipher:')) throw new Error('Unexpected synthetic ciphertext');
    return text.slice('synthetic-cipher:'.length);
  }),
  dcapVerifier: vi.fn(),
  gpuVerifier: vi.fn(),
  tokenVerifier: vi.fn(),
  createDcap: vi.fn(),
  createGpu: vi.fn(),
  createTokens: vi.fn(),
}));

vi.mock('../vendor/venice-e2ee.js', () => ({
  createVeniceE2EE: sdk.createClient,
  encryptMessage: sdk.encrypt,
  decryptChunk: sdk.decrypt,
}));
vi.mock('../vendor/venice-dcap.js', () => ({ createDcapVerifier: sdk.createDcap }));
vi.mock('../vendor/venice-nvidia.js', () => ({
  createNvidiaVerifier: sdk.createGpu,
  createNrasTokenVerifier: sdk.createTokens,
}));

import { callVeniceAPI } from '../js/api-venice.js';

const modelId = 'e2ee-synthetic-report-model';
const session: SyntheticSession = {
  aesKey: 'synthetic-aes',
  publicKey: 'synthetic-public',
  privateKey: 'synthetic-private',
  pubKeyHex: 'synthetic-client-public',
  modelPubKeyHex: 'synthetic-model-public',
  attestation: { verificationLevel: 'synthetic-fixture', errors: [] },
};
const fetchMock = vi.fn<typeof fetch>();
const cacheFields = [
  '_veniceE2EE', '_veniceE2EEKey', '_veniceE2EEDcapRequired',
  '_veniceE2EEGpuRequired', '_veniceAttestation', '_veniceLastStreamDiagnostics',
];

function clearSessionCache() {
  const cache = window as unknown as Record<string, unknown>;
  for (const field of cacheFields) delete cache[field];
}

function reportRequest(extra: Partial<ProviderRequestOptions> = {}): ProviderRequestOptions {
  return {
    system: 'Synthetic report instructions.',
    messages: [{ role: 'user', content: 'Synthetic selected report facts.' }],
    maxTokens: 900,
    forceNonStream: false,
    requestTimeoutMs: 120000,
    requestRetries: 0,
    ...extra,
  };
}

function encryptedStreamResponse() {
  const encoder = new TextEncoder();
  const events = [
    { choices: [{ delta: { content: 'synthetic-cipher:Synthetic ' } }] },
    { choices: [{ delta: { content: 'synthetic-cipher:encrypted overview.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 17, completion_tokens: 6 } },
  ];
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function postedBody() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  expect(String(url)).toBe('https://api.venice.ai/api/v1/chat/completions');
  expect(typeof init!.body).toBe('string');
  return JSON.parse(init!.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  updateKeyCache('labcharts-venice-key', 'synthetic-venice-test-key');
  localStorage.setItem('labcharts-ai-provider', 'venice');
  localStorage.setItem('labcharts-venice-model', modelId);
  localStorage.setItem('labcharts-venice-e2ee', 'on');
  localStorage.setItem('labcharts-venice-models', '[]');
  localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: modelId }]));
  localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
  clearSessionCache();
  vi.clearAllMocks();
  sdk.createSession.mockReset();
  sdk.createSession.mockResolvedValue(session);
  sdk.createClient.mockReturnValue({ createSession: sdk.createSession, clearSession: () => {} });
  sdk.createDcap.mockReturnValue(sdk.dcapVerifier);
  sdk.createGpu.mockReturnValue(sdk.gpuVerifier);
  sdk.createTokens.mockReturnValue(sdk.tokenVerifier);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => encryptedStreamResponse());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  clearSessionCache();
  updateKeyCache('labcharts-venice-key', '');
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Venice report transport', () => {
  it('collects the encrypted stream into final report text without a UI stream callback', async () => {
    await expect(callVeniceAPI(reportRequest())).resolves.toEqual({
      text: 'Synthetic encrypted overview.',
      usage: { inputTokens: 17, outputTokens: 6 },
      finishReason: 'stop',
      truncated: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sdk.createSession).toHaveBeenCalledExactlyOnceWith(modelId);
    expect(sdk.createClient).toHaveBeenCalledWith(expect.objectContaining({
      requireDcap: true,
      requireGpu: true,
      dcapVerifier: sdk.dcapVerifier,
      gpuVerifier: sdk.gpuVerifier,
    }));
    expect(sdk.createGpu).toHaveBeenCalledWith({ tokenVerifier: sdk.tokenVerifier, fetchImpl: expect.any(Function) });
    expect(postedBody()).toMatchObject({
      model: modelId,
      stream: true,
      stream_options: { include_usage: true },
      venice_parameters: { enable_e2ee: true },
      messages: [
        { role: 'system', content: 'synthetic-cipher:Synthetic report instructions.' },
        { role: 'user', content: 'synthetic-cipher:Synthetic selected report facts.' },
      ],
    });
    expect(sdk.decrypt).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels pending session setup and never sends completion after a late session result', async () => {
    let finish!: (value: SyntheticSession) => void;
    sdk.createSession.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const caller = new AbortController();
    const pending = callVeniceAPI(reportRequest({ signal: caller.signal }));
    const rejection = expect(pending).rejects.toThrow('Synthetic report cancelled');
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.createSession).toHaveBeenCalledOnce();
    caller.abort(new DOMException('Synthetic report cancelled', 'AbortError'));
    await rejection;
    finish(session);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sdk.encrypt).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    // A later explicit request remains usable after the abandoned setup.
    sdk.createSession.mockResolvedValue(session);
    await expect(callVeniceAPI(reportRequest())).resolves.toMatchObject({ text: 'Synthetic encrypted overview.' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ['explicit zero', 0, 1],
    ['default policy', undefined, 3],
  ] as const)('honors %s completion retry count', async (_label, retries, attempts) => {
    fetchMock.mockRejectedValue(new TypeError('Synthetic network unavailable'));
    const request = reportRequest();
    if (retries === undefined) delete request.requestRetries;
    else request.requestRetries = retries;
    const rejection = expect(callVeniceAPI(request)).rejects.toThrow('Synthetic network unavailable');
    await vi.runAllTimersAsync();
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(attempts);
    expect(sdk.createSession).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps regular Venice report responses as JSON without an onStream callback', async () => {
    const regularModel = 'synthetic-regular-report-model';
    localStorage.setItem('labcharts-venice-e2ee', 'off');
    localStorage.setItem('labcharts-venice-model', regularModel);
    localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: regularModel }]));
    localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    fetchMock.mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'Synthetic regular overview.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    }));
    await expect(callVeniceAPI(reportRequest())).resolves.toMatchObject({
      text: 'Synthetic regular overview.',
      usage: { inputTokens: 12, outputTokens: 5 },
      finishReason: 'stop',
      truncated: false,
    });
    const body = postedBody();
    expect(body.model).toBe(regularModel);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Synthetic report instructions.' },
      { role: 'user', content: 'Synthetic selected report facts.' },
    ]);
    expect(body).not.toHaveProperty('stream');
    expect(body).not.toHaveProperty('stream_options');
    expect(sdk.createClient).not.toHaveBeenCalled();
    expect(sdk.encrypt).not.toHaveBeenCalled();
    expect(sdk.decrypt).not.toHaveBeenCalled();
  });
});
