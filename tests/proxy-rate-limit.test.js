import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const blobMock = vi.hoisted(() => {
  const store = new Map();
  return {
    store,
    list: vi.fn(async ({ prefix = '', limit = 1000 } = {}) => ({
      blobs: Array.from(store.keys())
        .filter(pathname => pathname.startsWith(prefix))
        .slice(0, limit)
        .map(pathname => ({ pathname })),
      hasMore: false,
    })),
    put: vi.fn(async (pathname, body) => {
      if (store.has(pathname)) throw new Error('already exists');
      store.set(pathname, body);
      return { pathname, url: `https://blob.example.com/${pathname}` };
    }),
    del: vi.fn(async (pathnames) => {
      for (const pathname of Array.isArray(pathnames) ? pathnames : [pathnames]) {
        store.delete(pathname);
      }
    }),
  };
});

vi.mock('@vercel/blob', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    list: blobMock.list,
    put: blobMock.put,
    del: blobMock.del,
  };
});

import { enforceProxyRateLimit } from '../lib/proxy-rate-limit.js';

const ENV_KEYS = [
  'BLOB_READ_WRITE_TOKEN',
  'PROXY_ALLOW_INSTANCE_RATE_LIMIT',
  'PROXY_RATE_LIMIT_BLOB_TOKEN',
  'PROXY_RATE_LIMIT_MAX',
  'PROXY_RATE_LIMIT_WINDOW_MS',
  'VERCEL',
];
let savedEnv;

function rateRequest(ip = '203.0.113.90') {
  return new Request('https://getbased.health/api/proxy', {
    headers: {
      origin: 'https://app.getbased.health',
      'x-forwarded-for': ip,
    },
  });
}

function vercelRateRequest(vercelIp, forwardedIp) {
  return new Request('https://getbased.health/api/proxy', {
    headers: {
      origin: 'https://app.getbased.health',
      'x-vercel-forwarded-for': vercelIp,
      'x-forwarded-for': forwardedIp,
    },
  });
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  blobMock.store.clear();
  blobMock.list.mockClear();
  blobMock.put.mockClear();
  blobMock.del.mockClear();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe('proxy distributed rate limit', () => {
  it('enforces a shared atomic-slot limit without storing the raw client subject', async () => {
    process.env.VERCEL = '1';
    process.env.PROXY_RATE_LIMIT_BLOB_TOKEN = 'vercel_blob_rw_store_secret';
    process.env.PROXY_RATE_LIMIT_MAX = '2';
    process.env.PROXY_RATE_LIMIT_WINDOW_MS = '1000';
    const request = rateRequest();

    expect(await enforceProxyRateLimit(request)).toMatchObject({
      limited: false,
      scope: 'distributed',
    });
    expect(await enforceProxyRateLimit(request)).toMatchObject({
      limited: false,
      scope: 'distributed',
    });
    expect(await enforceProxyRateLimit(request)).toMatchObject({
      limited: true,
      scope: 'distributed',
      retryAfterSeconds: expect.any(Number),
    });

    const requestMarkers = Array.from(blobMock.store.keys())
      .filter(path => path.startsWith('proxy-rate/v2/'));
    expect(requestMarkers).toHaveLength(2);
    expect(blobMock.list.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
    expect(blobMock.put.mock.calls[0][2].abortSignal).toBeInstanceOf(AbortSignal);
    expect(Array.from(blobMock.store.keys()).join('|')).not.toContain('203.0.113.90');
    expect(Array.from(blobMock.store.keys()).join('|')).not.toContain('app.getbased.health');
  });

  it('fails closed on Vercel when no distributed limiter is configured', async () => {
    process.env.VERCEL = '1';

    expect(await enforceProxyRateLimit(rateRequest('203.0.113.91'))).toEqual({
      limited: false,
      unavailable: true,
      retryAfterSeconds: 60,
      scope: 'unavailable',
    });
    expect(blobMock.list).not.toHaveBeenCalled();
    expect(blobMock.put).not.toHaveBeenCalled();
  });

  it('prefers Vercel’s non-overridable forwarding header for the shared subject', async () => {
    process.env.VERCEL = '1';
    process.env.PROXY_RATE_LIMIT_BLOB_TOKEN = 'vercel_blob_rw_store_secret';
    process.env.PROXY_RATE_LIMIT_MAX = '1';

    expect(await enforceProxyRateLimit(vercelRateRequest(
      '203.0.113.94',
      '198.51.100.1',
    ))).toMatchObject({ limited: false });
    expect(await enforceProxyRateLimit(vercelRateRequest(
      '203.0.113.94',
      '198.51.100.2',
    ))).toMatchObject({ limited: true });
  });

  it('globally removes stale one-off-subject markers in the next window', async () => {
    process.env.VERCEL = '1';
    process.env.PROXY_RATE_LIMIT_BLOB_TOKEN = 'vercel_blob_rw_store_secret';
    process.env.PROXY_RATE_LIMIT_MAX = '2';
    process.env.PROXY_RATE_LIMIT_WINDOW_MS = '1000';
    const now = vi.spyOn(Date, 'now');

    now.mockReturnValue(1_100);
    expect(await enforceProxyRateLimit(rateRequest('203.0.113.95')))
      .toMatchObject({ limited: false });
    expect(Array.from(blobMock.store.keys()).some(path => path.includes('/1000/')))
      .toBe(true);

    now.mockReturnValue(2_100);
    expect(await enforceProxyRateLimit(rateRequest('203.0.113.96')))
      .toMatchObject({ limited: false });

    expect(Array.from(blobMock.store.keys()).some(path => path.includes('/1000/')))
      .toBe(false);
    expect(Array.from(blobMock.store.keys()).some(path => path.includes('/2000/')))
      .toBe(true);
    expect(Array.from(blobMock.store.keys()).some(path => path.endsWith('/1000.json')))
      .toBe(false);
    expect(blobMock.del).toHaveBeenCalled();
  });

  it('does not publish cleanup completion when the global sweep fails', async () => {
    process.env.VERCEL = '1';
    process.env.PROXY_RATE_LIMIT_BLOB_TOKEN = 'vercel_blob_rw_store_secret';
    process.env.PROXY_RATE_LIMIT_MAX = '2';
    process.env.PROXY_RATE_LIMIT_WINDOW_MS = '1000';
    vi.spyOn(Date, 'now').mockReturnValue(3_100);
    blobMock.list
      .mockResolvedValueOnce({ blobs: [], hasMore: false })
      .mockRejectedValueOnce(new Error('cleanup unavailable'));

    await expect(enforceProxyRateLimit(rateRequest('203.0.113.97')))
      .rejects.toThrow('cleanup unavailable');
    expect(Array.from(blobMock.store.keys()).some(path => (
      path.startsWith('proxy-rate/v2/3000/')
    ))).toBe(false);
    expect(Array.from(blobMock.store.keys()).some(path => (
      path === 'proxy-rate-cleanup/v2/3000.json'
    ))).toBe(false);
  });

  it('allows an explicit per-instance fallback for self-hosted Vercel deployments', async () => {
    process.env.VERCEL = '1';
    process.env.PROXY_ALLOW_INSTANCE_RATE_LIMIT = '1';
    process.env.PROXY_RATE_LIMIT_MAX = '1';

    expect(await enforceProxyRateLimit(rateRequest('203.0.113.92'))).toMatchObject({
      limited: false,
      scope: 'instance',
    });
    expect(await enforceProxyRateLimit(rateRequest('203.0.113.92'))).toMatchObject({
      limited: true,
      scope: 'instance',
    });
  });

  it('propagates distributed storage failures so the route can return 503', async () => {
    process.env.VERCEL = '1';
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store_secret';
    blobMock.list.mockRejectedValueOnce(new Error('blob unavailable'));

    await expect(enforceProxyRateLimit(rateRequest('203.0.113.93')))
      .rejects.toThrow('blob unavailable');
  });
});
