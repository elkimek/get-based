import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/proxy-network.js', () => ({
  fetchWithPinnedProxyDns: vi.fn(async (..._args: Parameters<typeof import('../lib/proxy-network.js')['fetchWithPinnedProxyDns']>) =>
    new Response('inert upstream sentinel', { status: 418, headers: { 'content-type': 'text/plain' } })),
}));

import { fetchWithPinnedProxyDns } from '../lib/proxy-network.js';

import proxyEntrypoint, { handler as proxyHandler } from '../api/proxy.js';

const ENV_KEYS = [
  'BLOB_READ_WRITE_TOKEN',
  'OURA_CLIENT_ID',
  'WITHINGS_CLIENT_ID',
  'ULTRAHUMAN_CLIENT_ID',
  'POLAR_CLIENT_ID',
  'WHOOP_CLIENT_ID',
  'FITBIT_CLIENT_ID',
  'GOOGLE_HEALTH_CLIENT_ID',
  'ULTRAHUMAN_ENABLED',
  'WHOOP_ENABLED',
  'GOOGLE_HEALTH_ENABLED',
  'PROXY_ALLOW_INSTANCE_RATE_LIMIT',
  'PROXY_RATE_LIMIT_BLOB_TOKEN',
  'UVDATA_BEARER',
  'UVDATA_UPSTREAM',
  'VERCEL',
  'VERCEL_PROJECT_PRODUCTION_URL',
];
let savedEnv: Record<string, string | undefined>;

function proxyRequest(method: string, body?: unknown) {
  return new (Request as new (input: ConstructorParameters<typeof Request>[0], init: Omit<RequestInit, 'body'> & { body?: RequestInit['body'] }) => Request)('https://health.example.net/api/proxy', {
    method,
    headers: {
      origin: 'https://health.example.net',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(fetchWithPinnedProxyDns).mockClear();
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('proxy production entrypoint', () => {
  it('applies hosted execution limits to the canonical uploaded TypeScript function', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      functions: Record<string, { maxDuration?: number; supportsCancellation?: boolean }>;
    };
    expect(Object.keys(config.functions)).toEqual(['api/proxy.ts']);
    expect(config.functions['api/proxy.ts']).toEqual({ maxDuration: 190, supportsCancellation: true });
    expect(readFileSync(new URL('../api/proxy.ts', import.meta.url), 'utf8')).toContain('export');
  });
  it('uses Vercel Node.js Web-standard fetch handler contract', () => {
    expect(proxyEntrypoint).toEqual({ fetch: proxyHandler });
  });

  it('pins the Blob runtime artifacts from the last healthy deployment', () => {
    const packageJson = JSON.parse(readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    ));
    const packageLock = JSON.parse(readFileSync(
      new URL('../package-lock.json', import.meta.url),
      'utf8',
    ));

    expect(packageJson.dependencies['@vercel/blob']).toBe('2.8.0');
    expect(packageLock.packages['node_modules/@vercel/blob'].version).toBe('2.8.0');
    expect(packageLock.packages['node_modules/@vercel/blob/node_modules/undici'].version)
      .toBe('6.28.0');
  });

  it('answers preflight and method probes without initializing Blob storage', async () => {
    process.env.VERCEL = '1';

    const preflight = await proxyHandler(proxyRequest('OPTIONS'));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin'))
      .toBe('https://health.example.net');

    const methodProbe = await proxyHandler(proxyRequest('GET'));
    expect(methodProbe.status).toBe(405);
  });

  it('serves fixed hosted operations but rejects generic authenticated forwarding', async () => {
    const request = new Request('https://app.getbased.health/api/proxy', {
      method: 'POST',
      headers: { origin: 'https://app.getbased.health', 'content-type': 'application/json' },
      body: JSON.stringify({ wearable_runtime_config: true }),
    });
    const response = await proxyHandler(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      overrides: {},
      configured: { google_health: false, ultrahuman: false, whoop: false },
    });

    const generic = new Request('https://app.getbased.health/api/proxy', {
      method: 'POST',
      headers: { origin: 'https://app.getbased.health', 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { Authorization: 'Bearer user-key' },
        body: '{"messages":[]}',
      }),
    });
    const blocked = await proxyHandler(generic);
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({ code: 'HOSTED_PROXY_OPERATION_BLOCKED' });
  });

  it('uses the Vercel project identity for official Preview URLs without capturing other Vercel self-hosters', async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'get-based.vercel.app';
    const previewRequest = new Request('https://random-preview-owner.vercel.app/api/proxy', {
      method: 'POST',
      headers: { origin: 'https://random-preview-owner.vercel.app', 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://customer.example/chat',
        headers: { Authorization: 'Bearer key' },
        body: '{}',
      }),
    });
    const response = await proxyHandler(previewRequest);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'HOSTED_PROXY_OPERATION_BLOCKED' });
  });

  it.each(['app.getbased.health', 'getbased.health', 'beta.getbased.health', 'https://APP.GETBASED.HEALTH/', 'app.getbased.health.'])
    ('blocks generic forwarding on official Preview URLs identified by %s without an upstream fetch', async productionUrl => {
      process.env.VERCEL = '1';
      process.env.PROXY_ALLOW_INSTANCE_RATE_LIMIT = '1';
      process.env.VERCEL_PROJECT_PRODUCTION_URL = productionUrl;
      const response = await proxyHandler(new Request('https://random-preview-owner.vercel.app/api/proxy', {
        method: 'POST',
        headers: { origin: 'https://random-preview-owner.vercel.app', 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://openrouter.ai/api/v1/__host_policy_test__', method: 'GET' }),
      }));
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: 'HOSTED_PROXY_OPERATION_BLOCKED' });
      expect(fetchWithPinnedProxyDns).not.toHaveBeenCalled();
    });

  it.each(['unrelated.vercel.app', 'health.example.net', 'app.getbased.health.example', 'notgetbased.health', 'getbased.health.example', 'get-based.vercel.app.example'])
    ('preserves independent self-hosted forwarding for production identity %s', async productionUrl => {
      process.env.VERCEL = '1';
      process.env.VERCEL_PROJECT_PRODUCTION_URL = productionUrl;
      const response = await proxyHandler(new Request('https://random-self-hosted-preview.vercel.app/api/proxy', {
        method: 'POST',
        headers: { origin: 'https://random-self-hosted-preview.vercel.app', 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://openrouter.ai/api/v1/__host_policy_test__', method: 'GET' }),
      }));
      expect(response.status).toBe(418);
      await expect(response.text()).resolves.toBe('inert upstream sentinel');
      expect(fetchWithPinnedProxyDns).toHaveBeenCalledExactlyOnceWith('https://openrouter.ai/api/v1/__host_policy_test__', expect.objectContaining({ method: 'GET' }));
    });

  it('keeps official custom-domain previews fail closed when hosted rate-limit storage is absent', async () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'app.getbased.health';
    const response = await proxyHandler(new Request('https://random-preview-owner.vercel.app/api/proxy', {
      method: 'POST',
      headers: { origin: 'https://random-preview-owner.vercel.app', 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://openrouter.ai/api/v1/__host_policy_test__', method: 'GET' }),
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'Proxy rate limit is not configured for this hosted deployment.' });
    expect(fetchWithPinnedProxyDns).not.toHaveBeenCalled();
  });

  it('loads the real limiter boundary and requires a self-hosted CAMS upstream', async () => {
    process.env.VERCEL = '1';
    process.env.PROXY_ALLOW_INSTANCE_RATE_LIMIT = '1';

    const response = await proxyHandler(proxyRequest('POST', {
      meteo: 'cams',
      latitude: 50.0755,
      longitude: 14.4378,
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining('CAMS relay upstream is empty'),
    });
  });
});
