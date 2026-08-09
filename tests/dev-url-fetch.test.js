import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/proxy-upstream.js', () => ({
  fetchWithValidatedRedirects: vi.fn(),
  readResponseTextWithCap: vi.fn(),
}));

import { createErrorWithCode } from '../lib/error-utils.js';
import { handleDevFetchPage } from '../lib/dev-url-fetch.js';
import {
  fetchWithValidatedRedirects,
  readResponseTextWithCap,
} from '../lib/proxy-upstream.js';

function makeRequest() {
  return new EventEmitter();
}

function makeResponse() {
  const response = new EventEmitter();
  response.status = null;
  response.headers = null;
  response.body = '';
  response.headersSent = false;
  response.destroyed = false;
  response.writeHead = (status, headers) => {
    response.status = status;
    response.headers = headers;
    response.headersSent = true;
  };
  response.end = body => {
    response.body = String(body || '');
  };
  return response;
}

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
    const upstream = { status: 206 };
    fetchWithValidatedRedirects.mockResolvedValue(upstream);
    readResponseTextWithCap.mockResolvedValue('<html>safe</html>');
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
    fetchWithValidatedRedirects.mockResolvedValue({ status: 200 });
    readResponseTextWithCap.mockRejectedValue(
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
