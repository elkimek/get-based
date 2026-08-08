import { afterEach, describe, expect, it, vi } from 'vitest';

import { callOpenAICompatibleAPI } from '../js/api-openai-compatible.js';
import { fetchWithRetry } from '../js/api-transport.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchWithRetry request timeout lifecycle', () => {
  it('clears the initial-response timeout after headers arrive', async () => {
    vi.useFakeTimers();
    let capturedSignal;
    const response = await fetchWithRetry(
      'https://api.example.test/stream',
      { method: 'POST', headers: {} },
      {
        retries: 0,
        requestTimeoutMs: 1000,
        useProxy: false,
        directFetch: async (_url, options) => {
          capturedSignal = options.signal;
          return new Response('stream body', { status: 200 });
        },
        debug: () => false,
      },
    );

    expect(response.status).toBe(200);
    expect(capturedSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(capturedSignal.aborted).toBe(false);
  });

  it('keeps the caller stop signal active after headers arrive', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let capturedSignal;
    await fetchWithRetry(
      'https://api.example.test/stream',
      { method: 'POST', headers: {}, signal: caller.signal },
      {
        retries: 0,
        requestTimeoutMs: 1000,
        useProxy: false,
        directFetch: async (_url, options) => {
          capturedSignal = options.signal;
          return new Response('stream body', { status: 200 });
        },
        debug: () => false,
      },
    );

    caller.abort(new DOMException('Stopped', 'AbortError'));
    expect(capturedSignal.aborted).toBe(true);
  });

  it('still rejects when response headers exceed the timeout', async () => {
    vi.useFakeTimers();
    const pending = fetchWithRetry(
      'https://api.example.test/slow-headers',
      { method: 'POST', headers: {} },
      {
        retries: 0,
        requestTimeoutMs: 1000,
        useProxy: false,
        directFetch: async (_url, options) => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        }),
        debug: () => false,
      },
    );

    const rejection = expect(pending).rejects.toThrow('request timed out after 1s');
    await vi.advanceTimersByTimeAsync(1001);
    await rejection;
  });
});

describe('custom secure fetch request timeout lifecycle', () => {
  it('does not abort a PPQ/Routstr-style decrypted stream after headers arrive', async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let capturedSignal;
    const secureFetch = vi.fn(async (_url, options) => {
      capturedSignal = options.signal;
      return new Response(new ReadableStream({
        start(controller) {
          const responseTimer = setTimeout(() => {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"secure stream ok"},"finish_reason":"stop"}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }, 1500);
          options.signal.addEventListener('abort', () => {
            clearTimeout(responseTimer);
            controller.error(options.signal.reason);
          }, { once: true });
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const pending = callOpenAICompatibleAPI(
      'https://private.example.test/v1/chat/completions',
      'sk-private-test',
      'glm-5-2',
      'Private TEE',
      {
        messages: [{ role: 'user', content: 'long private request' }],
        maxTokens: 32,
        onStream: vi.fn(),
        requestTimeoutMs: 1000,
      },
      {},
      { useProxy: false, fetchImpl: secureFetch },
    );

    await vi.advanceTimersByTimeAsync(1600);
    await expect(pending).resolves.toMatchObject({
      text: 'secure stream ok',
      finishReason: 'stop',
    });
    expect(capturedSignal.aborted).toBe(false);
  });

  it('still times out a secure fetch that has not returned response headers', async () => {
    vi.useFakeTimers();
    const secureFetch = vi.fn(async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const pending = callOpenAICompatibleAPI(
      'https://private.example.test/v1/chat/completions',
      'sk-private-test',
      'glm-5-2',
      'Private TEE',
      {
        messages: [{ role: 'user', content: 'slow headers' }],
        maxTokens: 32,
        forceNonStream: true,
        requestTimeoutMs: 1000,
      },
      {},
      { useProxy: false, fetchImpl: secureFetch },
    );

    const rejection = expect(pending).rejects.toThrow('request timed out after 1s');
    await vi.advanceTimersByTimeAsync(1001);
    await rejection;
  });

  it('surfaces reasoning-only secure responses when the stream ends', async () => {
    const onStream = vi.fn();
    const secureFetch = vi.fn(async () => new Response(
      'data: {"choices":[{"delta":{"reasoning_content":"reasoning fallback"}}]}\n\n'
      + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));

    await expect(callOpenAICompatibleAPI(
      'https://private.example.test/v1/chat/completions',
      'sk-private-test',
      'glm-5-2',
      'Private TEE',
      {
        messages: [{ role: 'user', content: 'reason only' }],
        maxTokens: 32,
        onStream,
        requestTimeoutMs: 1000,
      },
      {},
      { useProxy: false, fetchImpl: secureFetch },
    )).resolves.toMatchObject({ text: 'reasoning fallback', finishReason: 'stop' });
    expect(onStream).toHaveBeenCalledWith('reasoning fallback');
  });

  it('reports an empty secure stream instead of accepting a blank answer', async () => {
    const secureFetch = vi.fn(async () => new Response(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));

    await expect(callOpenAICompatibleAPI(
      'https://private.example.test/v1/chat/completions',
      'sk-private-test',
      'glm-5-2',
      'Private TEE',
      {
        messages: [{ role: 'user', content: 'empty result' }],
        maxTokens: 32,
        onStream: vi.fn(),
        requestTimeoutMs: 1000,
      },
      {},
      { useProxy: false, fetchImpl: secureFetch },
    )).rejects.toThrow('stream ended without response content');
  });
});

describe('stream stall guard', () => {
  it('gives the first read a longer stall window and reverts to the default afterwards', async () => {
    const { readWithStallTimeout, STREAM_STALL_TIMEOUT_MS } = await import('../js/api-transport.js');
    vi.useFakeTimers();
    const neverResolves = () => new Promise(() => {});

    // Default window: rejects at STREAM_STALL_TIMEOUT_MS.
    const defaultReader = { read: neverResolves, cancel: vi.fn() };
    const defaultRead = readWithStallTimeout(defaultReader, 'Test stream');
    const defaultRejection = expect(defaultRead).rejects.toThrow(/stalled — no data for 30s/);
    await vi.advanceTimersByTimeAsync(STREAM_STALL_TIMEOUT_MS + 1);
    await defaultRejection;
    expect(defaultReader.cancel).toHaveBeenCalled();

    // Extended first-read window: still pending after the default deadline.
    const { LOCAL_AI_FIRST_TOKEN_STALL_MS } = await import('../js/api-transport.js');
    const slowReader = { read: neverResolves, cancel: vi.fn() };
    const pending = readWithStallTimeout(slowReader, 'Test stream', LOCAL_AI_FIRST_TOKEN_STALL_MS);
    const pendingRejection = expect(pending).rejects.toThrow(new RegExp(`no data for ${LOCAL_AI_FIRST_TOKEN_STALL_MS / 1000}s`));
    await vi.advanceTimersByTimeAsync(STREAM_STALL_TIMEOUT_MS + 1);
    expect(slowReader.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LOCAL_AI_FIRST_TOKEN_STALL_MS);
    await pendingRejection;
    expect(slowReader.cancel).toHaveBeenCalled();
  });

  it('applies the first-read allowance to Local AI streams then guards subsequent reads', async () => {
    const { LOCAL_AI_FIRST_TOKEN_STALL_MS, STREAM_STALL_TIMEOUT_MS } = await import('../js/api-transport.js');
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let readCount = 0;
    const chunks = [
      'data: {"choices":[{"delta":{"content":"par"}}]}\n',
      'data: {"choices":[{"delta":{"content":"tial"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n',
    ];
    const stream = new ReadableStream({
      async pull(controller) {
        readCount++;
        if (readCount === 1) {
          // Simulate prompt prefill: first chunk arrives after the default
          // stall window but inside the local first-token allowance.
          await vi.advanceTimersByTimeAsync(STREAM_STALL_TIMEOUT_MS * 3);
          controller.enqueue(encoder.encode(chunks[0]));
          return;
        }
        controller.enqueue(encoder.encode(chunks[1]));
        controller.close();
      },
    });
    const result = await callOpenAICompatibleAPI(
      'http://localhost:1234/v1/chat/completions',
      '',
      'local-model',
      'Local AI',
      {
        messages: [{ role: 'user', content: 'long prompt' }],
        maxTokens: 32,
        onStream: vi.fn(),
        requestTimeoutMs: 1000,
      },
      {},
      {
        useProxy: false,
        firstReadStallMs: LOCAL_AI_FIRST_TOKEN_STALL_MS,
        fetchImpl: async () => new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      },
    );
    expect(result.text).toBe('partial');
    expect(result.finishReason).toBe('stop');
  });
});
