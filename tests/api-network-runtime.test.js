import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import commitHandler from '../api/commit.js';
import proxyHandler from '../api/proxy.js';
import {
  PROXY_MAX_REQUEST_BYTES,
  PROXY_MAX_RESPONSE_BYTES,
} from '../lib/proxy-policy.js';
import shareHandler from '../api/share.js';

const realFetch = globalThis.fetch;
const ENV_KEYS = [
  'BLOB_READ_WRITE_TOKEN',
  'NODE_ENV',
  'OURA_CLIENT_ID',
  'WITHINGS_CLIENT_ID',
  'ULTRAHUMAN_CLIENT_ID',
  'POLAR_CLIENT_ID',
  'WHOOP_CLIENT_ID',
  'FITBIT_CLIENT_ID',
  'OURA_CLIENT_SECRET',
  'WITHINGS_CLIENT_SECRET',
  'ULTRAHUMAN_CLIENT_SECRET',
  'POLAR_CLIENT_SECRET',
  'UVDATA_UPSTREAM',
  'UVDATA_BEARER',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_REF',
];

let savedEnv;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function makeShareRequest(method, body, { id, origin = 'https://app.getbased.health', rawBody } = {}) {
  const url = new URL('https://getbased.health/api/share');
  if (id) url.searchParams.set('id', id);
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  if (body !== undefined || rawBody !== undefined) headers.set('content-type', 'application/json');
  return new Request(url.toString(), {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeProxyRequest(body, { method = 'POST', origin = 'https://app.getbased.health', rawBody } = {}) {
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  if (body !== undefined || rawBody !== undefined) headers.set('content-type', 'application/json');
  return new Request('https://getbased.health/api/proxy', {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validEnvelope(overrides = {}) {
  return {
    schema: 'getbased-profile-share',
    version: 1,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000 },
    cipher: { name: 'AES-GCM', iv: 'profile-share-iv' },
    ciphertext: 'abcdefghijklmnop',
    ...overrides,
  };
}

function installBlobStoreMock({ conflictRateLimit = false } = {}) {
  const store = new Map();
  const apiCalls = [];
  const directCalls = [];

  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const href = typeof url === 'string' ? url : url.url;
    if (href.startsWith('https://vercel.com/api/blob')) {
      const parsed = new URL(href);
      const method = String(init.method || 'GET').toUpperCase();
      apiCalls.push({ href, method, init });

      if (parsed.pathname.endsWith('/delete')) {
        const { urls = [] } = JSON.parse(String(init.body || '{}'));
        for (const item of urls) {
          const path = String(item || '').replace(/^https:\/\/[^/]+\//, '');
          store.delete(path);
        }
        return jsonResponse({});
      }

      if (method === 'GET') {
        const prefix = parsed.searchParams.get('prefix') || '';
        const blobs = Array.from(store.keys())
          .filter(path => path.startsWith(prefix))
          .map(path => ({ pathname: path, uploadedAt: new Date().toISOString() }));
        return jsonResponse({ blobs, hasMore: false });
      }

      if (method === 'PUT') {
        const pathname = parsed.searchParams.get('pathname');
        if (conflictRateLimit && pathname?.startsWith('profile-share-rate/v1/')) {
          return jsonResponse({ error: { code: 'precondition_failed', message: 'slot exists' } }, { status: 412 });
        }
        if (init.headers?.['x-allow-overwrite'] === '0' && store.has(pathname)) {
          return jsonResponse({ error: { code: 'precondition_failed', message: 'already exists' } }, { status: 412 });
        }
        store.set(pathname, String(init.body || ''));
        return jsonResponse({ url: `https://store123.private.blob.vercel-storage.com/${pathname}` });
      }
    }

    if (href.startsWith('https://store123.private.blob.vercel-storage.com/')) {
      const parsed = new URL(href);
      const pathname = decodeURIComponent(parsed.pathname.slice(1));
      directCalls.push({ href, pathname, init });
      if (!store.has(pathname)) {
        return jsonResponse({ error: { code: 'not_found', message: 'missing' } }, { status: 404 });
      }
      return new Response(store.get(pathname), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch in blob store mock: ${href}`);
  });

  return { apiCalls, directCalls, store };
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  globalThis.fetch = realFetch;
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('profile share API runtime behavior', () => {
  it('enforces CORS and storage configuration before accepting share requests', async () => {
    const preflight = await shareHandler(makeShareRequest('OPTIONS', undefined, {
      origin: 'https://app.getbased.health',
    }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://app.getbased.health');

    const blockedPreflight = await shareHandler(makeShareRequest('OPTIONS', undefined, {
      origin: 'https://evil.example',
    }));
    expect(blockedPreflight.status).toBe(204);
    expect(blockedPreflight.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const blocked = await shareHandler(makeShareRequest('GET', undefined, {
      id: 'shareRuntimeId0123456789',
      origin: 'https://evil.example',
    }));
    expect(blocked.status).toBe(403);
    expect(await responseJson(blocked)).toEqual({ error: 'Origin not allowed.' });

    const missingStorage = await shareHandler(makeShareRequest('POST', {
      id: 'shareRuntimeId0123456789',
      manageTokenHash: 'a'.repeat(64),
      envelope: validEnvelope(),
    }));
    expect(missingStorage.status).toBe(503);
    expect(await responseJson(missingStorage)).toEqual({
      error: 'Profile sharing storage is not configured.',
    });
  });

  it('stores, reads, and deletes encrypted share envelopes through the Vercel Blob REST boundary', async () => {
    process.env.NODE_ENV = 'development';
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { apiCalls, directCalls, store } = installBlobStoreMock();
    const id = 'shareRuntimeId0123456789';
    const manageToken = 'local-stop-token';
    const manageTokenHash = await sha256Hex(manageToken);
    const envelope = validEnvelope();

    const created = await shareHandler(makeShareRequest('POST', {
      id,
      manageTokenHash,
      envelope,
    }, {
      origin: 'http://localhost:5173',
    }));

    expect(created.status).toBe(201);
    expect(created.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(await responseJson(created)).toMatchObject({ id, sizeBytes: expect.any(Number) });
    expect(store.has(`profile-shares/v1/${id}.json`)).toBe(true);
    expect(apiCalls.some(call => call.href.includes('profile-share-rate%2Fv1%2F'))).toBe(true);

    const loaded = await shareHandler(makeShareRequest('GET', undefined, { id }));
    expect(loaded.status).toBe(200);
    expect(await responseJson(loaded)).toMatchObject({ id, envelope });
    expect(directCalls.at(-1)).toMatchObject({ pathname: `profile-shares/v1/${id}.json` });

    const deniedDelete = await shareHandler(new Request(`https://getbased.health/api/share?id=${id}`, {
      method: 'DELETE',
      headers: { origin: 'https://app.getbased.health', 'content-type': 'application/json' },
      body: JSON.stringify({ manageToken: 'wrong-token' }),
    }));
    expect(deniedDelete.status).toBe(403);

    const deleted = await shareHandler(new Request(`https://getbased.health/api/share?id=${id}`, {
      method: 'DELETE',
      headers: { origin: 'https://app.getbased.health', 'x-profile-share-manage-token': manageToken },
    }));
    expect(deleted.status).toBe(200);
    expect(await responseJson(deleted)).toEqual({ ok: true });
    expect(store.has(`profile-shares/v1/${id}.json`)).toBe(false);
  });

  it('rejects invalid share payloads and reports a full rate-limit window', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { store } = installBlobStoreMock();

    const badId = await shareHandler(makeShareRequest('POST', {
      id: 'short',
      manageTokenHash: 'a'.repeat(64),
      envelope: validEnvelope(),
    }));
    expect(badId.status).toBe(400);
    expect(await responseJson(badId)).toEqual({ error: 'Invalid share id.' });

    const badToken = await shareHandler(makeShareRequest('POST', {
      id: 'shareRuntimeId0123456789',
      manageTokenHash: 'not-hex',
      envelope: validEnvelope(),
    }));
    expect(badToken.status).toBe(400);
    expect(await responseJson(badToken)).toEqual({ error: 'Invalid share management token.' });

    const weakEnvelope = await shareHandler(makeShareRequest('POST', {
      id: 'shareRuntimeId0123456789',
      manageTokenHash: 'a'.repeat(64),
      envelope: validEnvelope({ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 99_999 } }),
    }));
    expect(weakEnvelope.status).toBe(400);
    expect(await responseJson(weakEnvelope)).toEqual({
      error: 'PBKDF2 iterations must be at least 100000.',
    });
    const storedPaths = Array.from(store.keys());
    const rateLimitMarkersFromMalformedPosts = storedPaths.filter(path => path.startsWith('profile-share-rate/v1/'));
    expect(rateLimitMarkersFromMalformedPosts).toHaveLength(3);
    expect(storedPaths.filter(path => path.startsWith('profile-shares/v1/'))).toEqual([]);

    installBlobStoreMock({ conflictRateLimit: true });
    const limited = await shareHandler(makeShareRequest('POST', {
      id: 'shareRuntimeId0123456789',
      manageTokenHash: 'a'.repeat(64),
      envelope: validEnvelope(),
    }, {
      origin: 'https://getbased.health',
    }));

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await responseJson(limited)).toMatchObject({
      error: 'Too many profile share links created. Try again later.',
      retryAfterSeconds: expect.any(Number),
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(20);
  });
});

describe('AI proxy runtime behavior', () => {
  it('applies caller CORS rails, JSON guards, and runtime OAuth client-id overrides', async () => {
    const preflight = await proxyHandler(makeProxyRequest(undefined, {
      method: 'OPTIONS',
      origin: 'https://app.getbased.health',
    }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://app.getbased.health');

    const blockedPreflight = await proxyHandler(makeProxyRequest(undefined, {
      method: 'OPTIONS',
      origin: 'https://evil.example',
    }));
    expect(blockedPreflight.status).toBe(204);
    expect(blockedPreflight.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const wrongMethod = await proxyHandler(makeProxyRequest(undefined, { method: 'GET' }));
    expect(wrongMethod.status).toBe(405);
    expect(await responseJson(wrongMethod)).toEqual({
      error: 'Method not allowed. Use POST with {url, headers, body?, method?}',
    });

    const badJson = await proxyHandler(makeProxyRequest(undefined, { rawBody: '{' }));
    expect(badJson.status).toBe(400);
    expect(await responseJson(badJson)).toEqual({ error: 'Invalid JSON body' });

    process.env.OURA_CLIENT_ID = 'oura-selfhost';
    process.env.FITBIT_CLIENT_ID = 'fitbit-selfhost';
    process.env.WITHINGS_CLIENT_ID = '   ';
    const runtime = await proxyHandler(makeProxyRequest({ wearable_runtime_config: true }));
    expect(runtime.status).toBe(200);
    expect(await responseJson(runtime)).toEqual({
      overrides: {
        oura: 'oura-selfhost',
        fitbit: 'fitbit-selfhost',
      },
    });
  });

  it('blocks SSRF targets and forwards allowed custom HTTPS endpoints', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true }, {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }));

    for (const url of [
      'http://api.example.com/v1/chat',
      'https://127.0.0.1/private',
      'https://10.0.0.2/private',
      'https://192.168.1.1/secret',
      'https://172.16.0.1/secret',
      'https://169.254.169.254/latest/meta-data/',
      'https://168.63.129.16/metadata',
      'https://[::ffff:127.0.0.1]/private',
      'https://[::ffff:c0a8:101]/private',
      'https://[::ffff:ac10:1]/private',
      'https://[2002:c0a8:0101::1]/private',
      'not a url',
    ]) {
      const response = await proxyHandler(makeProxyRequest({ url }));
      expect(response.status).toBe(403);
      expect(await responseJson(response)).toEqual({ error: 'URL not allowed' });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const forwarded = await proxyHandler(makeProxyRequest({
      url: 'https://models.example.com/v1/list',
      method: 'GET',
      headers: { Authorization: 'Bearer model-key' },
      body: { ignored: true },
    }));

    expect(forwarded.status).toBe(202);
    expect(await responseJson(forwarded)).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith('https://models.example.com/v1/list', {
      method: 'GET',
      headers: { Authorization: 'Bearer model-key' },
    });

    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const failed = await proxyHandler(makeProxyRequest({
      url: 'https://models.example.com/v1/chat',
      body: { prompt: 'hello' },
    }));
    expect(failed.status).toBe(502);
    expect(await responseJson(failed)).toEqual({ error: 'Upstream error: offline' });
  });

  it('preserves provider-compatible headers for proxied custom API calls', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true }));

    const modelList = await proxyHandler(makeProxyRequest({
      url: 'https://custom.example.com/v1/models',
      method: 'GET',
      headers: {
        Authorization: 'Bearer custom-key',
        'api-key': 'azure-key',
        'OpenAI-Organization': 'org_123',
        'OpenAI-Project': 'proj_123',
      },
    }));
    expect(modelList.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith('https://custom.example.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer custom-key',
        'api-key': 'azure-key',
        'OpenAI-Organization': 'org_123',
        'OpenAI-Project': 'proj_123',
      },
    });

    const chatBody = JSON.stringify({
      model: 'openai/gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      max_completion_tokens: 32,
    });
    const chat = await proxyHandler(makeProxyRequest({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        Authorization: 'Bearer sk-or',
        'HTTP-Referer': 'https://app.getbased.health',
        'X-Title': 'getbased',
        'anthropic-version': '2023-06-01',
        'x-api-key': 'anthropic-key',
      },
      body: chatBody,
    }));
    expect(chat.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenLastCalledWith('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-or',
        'HTTP-Referer': 'https://app.getbased.health',
        'X-Title': 'getbased',
        'anthropic-version': '2023-06-01',
        'x-api-key': 'anthropic-key',
        'Content-Type': 'application/json',
      },
      body: chatBody,
    });
  });

  it('constrains the generic proxy envelope before forwarding upstream', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true }));

    const badMethod = await proxyHandler(makeProxyRequest({
      url: 'https://models.example.com/v1/delete',
      method: 'DELETE',
      headers: { Authorization: 'Bearer key' },
    }));
    expect(badMethod.status).toBe(405);
    expect(await responseJson(badMethod)).toEqual({ error: 'Proxy method not allowed' });

    const badHeader = await proxyHandler(makeProxyRequest({
      url: 'https://models.example.com/v1/chat',
      headers: { Host: 'metadata.google.internal' },
    }));
    expect(badHeader.status).toBe(400);
    expect(await responseJson(badHeader)).toEqual({ error: 'Proxy header not allowed: Host' });
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const oversizedRequest = await proxyHandler(makeProxyRequest(undefined, {
      rawBody: '{"pad":"' + 'x'.repeat(PROXY_MAX_REQUEST_BYTES + 1) + '"}',
    }));
    expect(oversizedRequest.status).toBe(413);
    expect(await responseJson(oversizedRequest)).toEqual({ error: 'Proxy request body too large' });

    globalThis.fetch = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'content-length': String(PROXY_MAX_RESPONSE_BYTES + 1),
      },
    }));
    const oversizedResponse = await proxyHandler(makeProxyRequest({
      url: 'https://models.example.com/v1/chat',
      headers: { Authorization: 'Bearer key' },
    }));
    expect(oversizedResponse.status).toBe(502);
    expect(await responseJson(oversizedResponse)).toEqual({
      error: 'Upstream error: Proxy response exceeds size cap',
    });

    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true }));
    const put = await proxyHandler(makeProxyRequest({
      url: 'https://www.polaraccesslink.com/v3/users/u/activity-transactions/t',
      method: 'PUT',
      headers: { Authorization: 'Bearer polar' },
    }));
    expect(put.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.polaraccesslink.com/v3/users/u/activity-transactions/t',
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer polar',
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('relays wearable OAuth token requests with server-side secrets', async () => {
    process.env.OURA_CLIENT_SECRET = 'oura-secret';
    process.env.WITHINGS_CLIENT_SECRET = 'withings-secret';
    process.env.ULTRAHUMAN_CLIENT_SECRET = 'ultrahuman-secret';
    process.env.POLAR_CLIENT_SECRET = 'polar-secret';
    globalThis.fetch = vi.fn(async (url) => jsonResponse({ url }, {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    const oura = await proxyHandler(makeProxyRequest({
      oura_token_exchange: { code: 'oura-code', redirect_uri: 'https://app/cb', client_id: 'oura-client' },
    }));
    expect(oura.status).toBe(201);
    let [url, init] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toBe('https://api.ouraring.com/oauth/token');
    expect(Object.fromEntries(new URLSearchParams(init.body))).toMatchObject({
      grant_type: 'authorization_code',
      code: 'oura-code',
      client_secret: 'oura-secret',
    });

    const withings = await proxyHandler(makeProxyRequest({
      withings_token_refresh: { refresh_token: 'withings-refresh', client_id: 'withings-client' },
    }));
    expect(withings.status).toBe(201);
    [url, init] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toBe('https://wbsapi.withings.net/v2/oauth2');
    expect(Object.fromEntries(new URLSearchParams(init.body))).toMatchObject({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_secret: 'withings-secret',
    });

    const ultrahuman = await proxyHandler(makeProxyRequest({
      ultrahuman_token_exchange: { code: 'ultra-code', redirect_uri: 'https://app/cb', client_id: 'ultra-client' },
    }));
    expect(ultrahuman.status).toBe(201);
    [url, init] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toBe('https://partner.ultrahuman.com/api/partners/oauth/token');
    expect(Object.fromEntries(new URLSearchParams(init.body))).toMatchObject({
      grant_type: 'authorization_code',
      client_secret: 'ultrahuman-secret',
    });

    const polar = await proxyHandler(makeProxyRequest({
      polar_token_refresh: { refresh_token: 'polar-refresh', client_id: 'polar-client' },
    }));
    expect(polar.status).toBe(201);
    [url, init] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toBe('https://polarremote.com/v2/oauth2/token');
    expect(init.headers.Authorization).toBe(`Basic ${btoa('polar-client:polar-secret')}`);
    expect(Object.fromEntries(new URLSearchParams(init.body))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'polar-refresh',
    });
  });

  it('validates and relays CAMS atmosphere requests without exposing the bearer token to callers', async () => {
    const hostedWithoutBearer = await proxyHandler(makeProxyRequest({
      meteo: 'cams',
      latitude: 50.1,
      longitude: 14.4,
    }));
    expect(hostedWithoutBearer.status).toBe(503);
    expect(await responseJson(hostedWithoutBearer)).toMatchObject({
      error: expect.stringContaining('CAMS hosted relay requires UVDATA_BEARER'),
    });

    process.env.UVDATA_UPSTREAM = 'https://uv.example.test/base/';
    const badCoords = await proxyHandler(makeProxyRequest({
      meteo: 'cams',
      latitude: 91,
      longitude: 14.4,
    }));
    expect(badCoords.status).toBe(400);
    expect(await responseJson(badCoords)).toEqual({ error: 'Invalid latitude/longitude' });

    process.env.UVDATA_BEARER = 'uv-secret';
    globalThis.fetch = vi.fn(async () => jsonResponse({ uv: 4.2 }, {
      headers: { 'Content-Type': 'application/json' },
    }));

    const relayed = await proxyHandler(makeProxyRequest({
      meteo: 'cams',
      latitude: 50.1,
      longitude: 14.4,
      time: '2026-06-06T12:00:00Z',
    }));
    expect(relayed.status).toBe(200);
    expect(await responseJson(relayed)).toEqual({ uv: 4.2 });
    const [url, init] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toBe('https://uv.example.test/base/uv?latitude=50.1&longitude=14.4&time=2026-06-06T12%3A00%3A00Z');
    expect(init.headers.Authorization).toBe('Bearer uv-secret');

    globalThis.fetch = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'content-length': String(300 * 1024) },
    }));
    const oversized = await proxyHandler(makeProxyRequest({
      meteo: 'cams',
      latitude: 50.1,
      longitude: 14.4,
    }));
    expect(oversized.status).toBe(502);
    expect(await responseJson(oversized)).toEqual({ error: 'CAMS response exceeds size cap' });
  });
});

describe('commit API runtime behavior', () => {
  it('returns 404 outside Vercel and commit metadata when Vercel env vars exist', async () => {
    const missing = await commitHandler(new Request('https://getbased.health/api/commit'));
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('not-on-vercel');

    process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890';
    process.env.VERCEL_GIT_COMMIT_REF = 'main';
    const found = await commitHandler(new Request('https://getbased.health/api/commit'));
    expect(found.status).toBe(200);
    expect(found.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await responseJson(found)).toEqual({
      sha: 'abcdef1234567890',
      ref: 'main',
    });
  });
});
