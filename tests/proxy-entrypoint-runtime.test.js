import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
let savedEnv;

function proxyRequest(method, body) {
  return new Request('https://health.example.net/api/proxy', {
    method,
    headers: {
      origin: 'https://health.example.net',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
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
