import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/proxy-network.js', () => ({
  fetchWithPinnedProxyDns: (url: string, options: RequestInit) => globalThis.fetch(url, options),
}));

import {
  readRequestTextWithCap,
  readResponseTextWithCap,
} from '../lib/proxy-upstream.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('proxy upstream body boundaries', () => {
  it('cancels an oversized streaming request before buffering the remaining body', async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls === 1) controller.enqueue(new TextEncoder().encode('12345678'));
        else if (pulls === 2) controller.enqueue(new TextEncoder().encode('abcdefgh'));
        else controller.enqueue(new TextEncoder().encode('must-not-be-buffered'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = {
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body,
    };

    await expect(readRequestTextWithCap(request, 10)).rejects.toMatchObject({
      code: 'PROXY_REQUEST_TOO_LARGE',
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
  });

  it('counts response bytes while streaming and cancels when the cap is crossed', async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
      },
      cancel() {
        cancelled = true;
      },
    }), {
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    await expect(readResponseTextWithCap(response, 10)).rejects.toMatchObject({
      code: 'PROXY_RESPONSE_TOO_LARGE',
    });
    expect(cancelled).toBe(true);
  });

  it('preserves UTF-8 characters split across request chunks', async () => {
    const encoded = new TextEncoder().encode('{"value":"🙂"}');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 12));
        controller.enqueue(encoded.slice(12));
        controller.close();
      },
    });

    const text = await readRequestTextWithCap({
      headers: new Headers(),
      body,
    }, 100);

    expect(JSON.parse(text)).toEqual({ value: '🙂' });
  });
});

describe('validated upstream response identity', () => {
  it.each([false, true])('retains the final validated URL for body presence %s', async (hasBody) => {
    const { fetchWithValidatedRedirects } = await import('../lib/proxy-upstream.js');
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/final' } }))
      .mockResolvedValueOnce(new Response(hasBody ? 'final bytes' : null, { status: hasBody ? 200 : 204 }));
    globalThis.fetch = fetch;
    const response = await fetchWithValidatedRedirects('https://example.com/start');
    expect(response.url).toBe('https://example.com/final');
    expect(await response.text()).toBe(hasBody ? 'final bytes' : '');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps HEAD checks bodyless across a 303 redirect', async () => {
    const { fetchWithValidatedRedirects } = await import('../lib/proxy-upstream.js');
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { location: '/final' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetch;
    const response = await fetchWithValidatedRedirects('https://example.com/start', { method: 'HEAD' });
    expect(fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['HEAD', 'HEAD']);
    expect(response.url).toBe('https://example.com/final');
    expect(response.body).toBeNull();
  });
});
