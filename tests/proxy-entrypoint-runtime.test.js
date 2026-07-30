import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import proxyHandler from '../api/proxy.js';

const ENV_KEYS = [
  'BLOB_READ_WRITE_TOKEN',
  'PROXY_ALLOW_INSTANCE_RATE_LIMIT',
  'PROXY_RATE_LIMIT_BLOB_TOKEN',
  'UVDATA_BEARER',
  'UVDATA_UPSTREAM',
  'VERCEL',
];
let savedEnv;

function proxyRequest(method, body) {
  return new Request('https://getbased.health/api/proxy', {
    method,
    headers: {
      origin: 'https://getbased.health',
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
  it('pins the Blob runtime artifacts from the last healthy deployment', () => {
    const packageJson = JSON.parse(readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    ));
    const packageLock = JSON.parse(readFileSync(
      new URL('../package-lock.json', import.meta.url),
      'utf8',
    ));

    expect(packageJson.dependencies['@vercel/blob']).toBe('2.4.0');
    expect(packageLock.packages['node_modules/@vercel/blob'].version).toBe('2.4.0');
    expect(packageLock.packages['node_modules/@vercel/blob/node_modules/undici'].version)
      .toBe('6.27.0');
  });

  it('answers preflight and method probes without initializing Blob storage', async () => {
    process.env.VERCEL = '1';

    const preflight = await proxyHandler(proxyRequest('OPTIONS'));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin'))
      .toBe('https://getbased.health');

    const methodProbe = await proxyHandler(proxyRequest('GET'));
    expect(methodProbe.status).toBe(405);
  });

  it('loads the real limiter boundary and reaches CAMS validation', async () => {
    process.env.VERCEL = '1';
    process.env.PROXY_ALLOW_INSTANCE_RATE_LIMIT = '1';

    const response = await proxyHandler(proxyRequest('POST', {
      meteo: 'cams',
      latitude: 50.0755,
      longitude: 14.4378,
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining('CAMS hosted relay requires UVDATA_BEARER'),
    });
  });
});
