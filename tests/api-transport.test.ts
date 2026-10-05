import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithRetry } from '../js/api-transport.js';

afterEach(() => {
  vi.useRealTimers();
});
describe('fetchWithRetry request timeout lifecycle', () => {
  it('clears the initial-response timeout after headers arrive', async () => {
    vi.useFakeTimers();
    let capturedSignal!: AbortSignal;
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
    let capturedSignal!: AbortSignal;
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

describe('stream stall guard', () => {
it('gives the first read a longer stall window and reverts to the default afterwards', async () => {
    const { readWithStallTimeout, STREAM_STALL_TIMEOUT_MS } = await import('../js/api-transport.js');
    vi.useFakeTimers();
    const neverResolves = () => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {});

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
});
