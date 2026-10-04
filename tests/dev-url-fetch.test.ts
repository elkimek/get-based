import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/proxy-upstream.js', async () => ({
  ...await vi.importActual<typeof import('../lib/proxy-upstream.js')>('../lib/proxy-upstream.js'),
  fetchWithValidatedRedirects: vi.fn(),
  readResponseTextWithCap: vi.fn(),
}));

import { createErrorWithCode } from '../lib/error-utils.js';
import { handleDevFetchPage, handleDevCheckUrl, handleDevRawProxy } from '../lib/dev-url-fetch.js';
import {
  fetchWithValidatedRedirects,
  readResponseTextWithCap,
} from '../lib/proxy-upstream.js';

function makeRequest() {
  return new EventEmitter();
}

class DevPageTestResponse extends EventEmitter {
  status: number | null = null;
  headers: Record<string, string> | null = null;
  body = '';
  bytes: Uint8Array | undefined;
  headersSent = false;
  destroyed = false;
  writeHead(status: number, headers: Record<string, string>) {
    this.status = status;
    this.headers = headers;
    this.headersSent = true;
  }
  end(body?: string | Uint8Array) {
    if (body instanceof Uint8Array) this.bytes = body;
    else this.body = String(body || '');
  }
}

function makeResponse() { return new DevPageTestResponse(); }
const fetchMock = vi.mocked(fetchWithValidatedRedirects);
const readMock = vi.mocked(readResponseTextWithCap);

const options = {
  corsHeaders: () => ({ 'Access-Control-Allow-Origin': 'http://localhost:8000' }),
};

describe('dev URL fetch guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks non-public URLs before transport', () => {
    const response = makeResponse();
    handleDevFetchPage(makeRequest(), response, 'http://127.0.0.1/private', options);

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ status: 0, error: 'URL blocked by SSRF guard' });
    expect(fetchWithValidatedRedirects).not.toHaveBeenCalled();
  });

  it('uses the shared DNS-pinned redirect guard and response cap', async () => {
    const upstream = new Response(null, { status: 206 });
    fetchMock.mockResolvedValue(upstream);
    readMock.mockResolvedValue('<html>safe</html>');
    const response = makeResponse();

    handleDevFetchPage(makeRequest(), response, 'https://example.com/product', options);
    await vi.waitFor(() => expect(response.status).toBe(200));

    expect(fetchWithValidatedRedirects).toHaveBeenCalledWith(
      'https://example.com/product',
      expect.objectContaining({ method: 'GET' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(readResponseTextWithCap).toHaveBeenCalledWith(upstream, 20 * 1024 * 1024);
    expect(JSON.parse(response.body)).toEqual({ status: 206, html: '<html>safe</html>' });
  });

  it('returns a stable public error when the response exceeds its cap', async () => {
    fetchMock.mockResolvedValue(new Response(null));
    readMock.mockRejectedValue(
      createErrorWithCode('PROXY_RESPONSE_TOO_LARGE', 'internal cap detail'),
    );
    const response = makeResponse();

    handleDevFetchPage(makeRequest(), response, 'https://example.com/product', options);
    await vi.waitFor(() => expect(response.status).toBe(200));

    expect(JSON.parse(response.body)).toEqual({
      status: 0,
      error: 'Page response exceeds size cap',
    });
    expect(response.body).not.toContain('internal cap detail');
  });
});

describe('local HEAD and binary proxy transport', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it.each([handleDevCheckUrl, handleDevRawProxy])('blocks literal private URLs before transport', (handler) => {
    const res = makeResponse();
    handler(makeRequest(), res, 'https://127.0.0.1/private', options);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses pinned HEAD transport, reports the validated final URL and releases its body', async () => {
    const cancel = vi.fn();
    const upstream = new Response(new ReadableStream({ cancel }), { status: 404 });
    Object.defineProperty(upstream, 'url', { value: 'https://example.com/final' });
    fetchMock.mockResolvedValue(upstream);
    const req = makeRequest(); const res = makeResponse();
    handleDevCheckUrl(req, res, 'https://example.com/start', options);
    await vi.waitFor(() => expect(res.status).toBe(200));
    expect(JSON.parse(res.body)).toEqual({ status: 404, redirected: 'https://example.com/final' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/start', { method: 'HEAD' }, {
      signal: expect.any(AbortSignal), maxRedirects: 1,
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('times out HEAD checks without exposing transport diagnostics', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, _options, { signal } = {}) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const req = makeRequest(); const res = makeResponse();
    handleDevCheckUrl(req, res, 'https://example.com/', options);
    await vi.advanceTimersByTimeAsync(6000);
    expect(JSON.parse(res.body)).toEqual({ status: 0, error: 'URL check failed' });
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([handleDevCheckUrl, handleDevRawProxy])('aborts disconnected clients and does not write after destruction', async (handler) => {
    let captured: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, _options, { signal } = {}) => new Promise((_resolve, reject) => {
      captured = signal;
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const req = makeRequest(); const res = makeResponse();
    handler(req, res, 'https://example.com/', options);
    res.destroyed = true; res.emit('close');
    await vi.waitFor(() => expect(req.listenerCount('aborted')).toBe(0));
    expect(captured?.aborted).toBe(true);
    expect(res.status).toBeNull();
  });

  it('preserves binary bytes, content type, status and CORS with pinned GET transport', async () => {
    const bytes = new Uint8Array([0, 255, 128, 65]);
    fetchMock.mockResolvedValue(new Response(bytes, { status: 206, headers: { 'content-type': 'image/png' } }));
    const req = makeRequest(); const res = makeResponse();
    handleDevRawProxy(req, res, 'https://example.com/image', options);
    await vi.waitFor(() => expect(res.status).toBe(206));
    expect(res.bytes).toEqual(bytes);
    expect(res.headers).toEqual({ 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/image', expect.objectContaining({ method: 'GET' }), {
      signal: expect.any(AbortSignal), maxRedirects: 1,
    });
    expect(req.listenerCount('aborted')).toBe(0);
  });

  it('preserves a bodyless response without fabricating content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = makeResponse();
    handleDevRawProxy(makeRequest(), res, 'https://example.com/', options);
    await vi.waitFor(() => expect(res.status).toBe(204));
    expect(res.bytes).toEqual(new Uint8Array());
    expect(res.headers?.['Content-Type']).toBe('application/octet-stream');
  });

  it.each(['PROXY_DNS_BLOCKED', 'PROXY_REDIRECT_BLOCKED'])('rejects %s before returning a binary response', async (code) => {
    fetchMock.mockRejectedValue(createErrorWithCode(code, 'private internal detail'));
    const res = makeResponse();
    handleDevRawProxy(makeRequest(), res, 'https://example.com/', options);
    await vi.waitFor(() => expect(res.status).toBe(400));
    expect(res.body).toBe('URL blocked by SSRF guard');
  });

  it('cancels an oversized binary stream and returns only a stable failure', async () => {
    const cancel = vi.fn();
    const upstream = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(20 * 1024 * 1024 + 1)); }, cancel,
    }));
    fetchMock.mockResolvedValue(upstream);
    const res = makeResponse();
    handleDevRawProxy(makeRequest(), res, 'https://example.com/', options);
    await vi.waitFor(() => expect(res.status).toBe(502));
    expect(cancel).toHaveBeenCalledOnce();
    expect(res.body).toBe('Proxy request failed');
    expect(res.bytes).toBeUndefined();
  });
});
