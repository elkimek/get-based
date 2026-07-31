import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/proxy-network.js', () => ({
  fetchWithPinnedProxyDns: (url, options) => globalThis.fetch(url, options),
}));

import commitHandler from '../api/commit.js';
import { handler as proxyHandler } from '../api/proxy.js';
import {
  PROXY_MAX_REQUEST_BYTES,
  PROXY_MAX_RESPONSE_BYTES,
} from '../lib/proxy-policy.js';
import { fetchWithValidatedRedirects } from '../lib/proxy-upstream.js';
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
  'PROXY_RATE_LIMIT_MAX',
  'PROXY_RATE_LIMIT_WINDOW_MS',
  'PROXY_RATE_LIMIT_BLOB_TOKEN',
  'PROXY_ALLOW_INSTANCE_RATE_LIMIT',
  'PROXY_UPSTREAM_TIMEOUT_MS',
  'VERCEL',
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

function makeProxyRequest(body, {
  method = 'POST',
  origin = 'https://app.getbased.health',
  rawBody,
  clientIp,
  requestUrl = 'https://getbased.health/api/proxy',
} = {}) {
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  if (body !== undefined || rawBody !== undefined) headers.set('content-type', 'application/json');
  return new Request(requestUrl, {
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

function installBlobStoreMock({
  conflictRateLimit = false,
  failDelete = false,
  failMaintenanceList = false,
} = {}) {
  const store = new Map();
  const uploadedAtByPath = new Map();
  const apiCalls = [];
  const directCalls = [];

  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const href = typeof url === 'string' ? url : url.url;
    if (href.startsWith('https://vercel.com/api/blob')) {
      const parsed = new URL(href);
      const method = String(init.method || 'GET').toUpperCase();
      apiCalls.push({ href, method, init });

      if (parsed.pathname.endsWith('/delete')) {
        if (failDelete) {
          return jsonResponse({ error: { code: 'upstream_error', message: 'blob delete unavailable' } }, { status: 503 });
        }
        const { urls = [] } = JSON.parse(String(init.body || '{}'));
        for (const item of urls) {
          const path = String(item || '').replace(/^https:\/\/[^/]+\//, '');
          store.delete(path);
        }
        return jsonResponse({});
      }

      if (method === 'GET') {
        const prefix = parsed.searchParams.get('prefix') || '';
        if (failMaintenanceList && prefix === 'profile-share-expiry/v1/') {
          return jsonResponse({
            error: { code: 'upstream_error', message: 'internal blob maintenance detail' },
          }, { status: 503 });
        }
        const cursor = parsed.searchParams.get('cursor') || '';
        const limit = Number(parsed.searchParams.get('limit')) || 1000;
        const matchingPaths = Array.from(store.keys())
          .filter(path => path.startsWith(prefix))
          .filter(path => !cursor || path > cursor)
          .sort();
        const pagePaths = matchingPaths.slice(0, limit);
        const blobs = pagePaths
          .map(path => ({
            pathname: path,
            uploadedAt: uploadedAtByPath.get(path) || new Date().toISOString(),
          }));
        const hasMore = matchingPaths.length > pagePaths.length;
        return jsonResponse({
          blobs,
          hasMore,
          ...(hasMore && pagePaths.length ? { cursor: pagePaths.at(-1) } : {}),
        });
      }

      if (method === 'PUT') {
        const pathname = parsed.searchParams.get('pathname');
        if (conflictRateLimit && pathname?.startsWith('profile-share-rate/v2/')) {
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

  return { apiCalls, directCalls, store, uploadedAtByPath };
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
    const sharePath = `profile-shares/v2/${id}.json`;
    expect(store.has(sharePath)).toBe(true);
    expect(apiCalls.some(call => call.href.includes('profile-share-rate%2Fv2%2F'))).toBe(true);
    expect(apiCalls.every(call => (
      call.init.headers?.['x-api-version'] === '12'
      && call.init.headers?.['x-vercel-blob-store-id'] === 'store123'
      && call.init.headers?.authorization === 'Bearer vercel_blob_rw_store123_secret'
    ))).toBe(true);
    const sharePut = apiCalls.find(call => (
      call.method === 'PUT'
      && call.href.includes(`profile-shares%2Fv2%2F${id}.json`)
    ));
    expect(sharePut?.init.headers).toMatchObject({
      'x-vercel-blob-access': 'private',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '0',
      'x-content-type': 'application/json',
    });

    const loaded = await shareHandler(makeShareRequest('GET', undefined, { id }));
    expect(loaded.status).toBe(200);
    expect(await responseJson(loaded)).toMatchObject({ id, envelope });
    expect(directCalls.at(-1)).toMatchObject({ pathname: sharePath });
    expect(directCalls.at(-1)?.init.headers).toEqual({
      authorization: 'Bearer vercel_blob_rw_store123_secret',
    });

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
    expect(store.has(sharePath)).toBe(false);
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
    const rateLimitMarkersFromMalformedPosts = storedPaths.filter(path => path.startsWith('profile-share-rate/v2/'));
    expect(rateLimitMarkersFromMalformedPosts).toHaveLength(3);
    expect(storedPaths.filter(path => path.startsWith('profile-shares/v2/'))).toEqual([]);

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
    const rateLimitPuts = globalThis.fetch.mock.calls.filter(([url, init]) => (
      String(url).includes('profile-share-rate%2Fv2%2F')
      && String(init?.method || '').toUpperCase() === 'PUT'
    ));
    expect(rateLimitPuts).toHaveLength(20);
    expect(globalThis.fetch.mock.calls.some(([url]) => (
      String(url).includes('profile-share-maintenance%2Fv2%2F')
      || String(url).includes('profile-share-expiry%2Fv1%2F')
    ))).toBe(false);
  });

  it('dynamically enforces every encrypted-envelope boundary before storing a share', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { store } = installBlobStoreMock();
    const id = 'shareBoundaryId012345678';
    const manageTokenHash = 'a'.repeat(64);
    const cases = [
      {
        label: 'invalid JSON',
        request: () => makeShareRequest('POST', undefined, { rawBody: '{' }),
        error: 'Invalid JSON body.',
      },
      {
        label: 'missing envelope',
        request: () => makeShareRequest('POST', { id, manageTokenHash, envelope: null }),
        error: 'Missing encrypted profile payload.',
      },
      {
        label: 'unsupported schema',
        request: () => makeShareRequest('POST', {
          id, manageTokenHash, envelope: validEnvelope({ schema: 'other' }),
        }),
        error: 'Unsupported encrypted profile payload.',
      },
      {
        label: 'expired envelope',
        request: () => makeShareRequest('POST', {
          id,
          manageTokenHash,
          envelope: validEnvelope({ expiresAt: '2000-01-01T00:00:00.000Z' }),
        }),
        error: 'Share expiry must be in the future.',
      },
      {
        label: 'excessive lifetime',
        request: () => makeShareRequest('POST', {
          id,
          manageTokenHash,
          envelope: validEnvelope({ expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString() }),
        }),
        error: 'Share expiry cannot exceed 30 days.',
      },
      {
        label: 'unsupported key derivation',
        request: () => makeShareRequest('POST', {
          id,
          manageTokenHash,
          envelope: validEnvelope({ kdf: { name: 'scrypt', hash: 'SHA-256', iterations: 100_000 } }),
        }),
        error: 'Unsupported key derivation.',
      },
      {
        label: 'unsupported cipher',
        request: () => makeShareRequest('POST', {
          id,
          manageTokenHash,
          envelope: validEnvelope({ cipher: { name: 'AES-CBC', iv: 'profile-share-iv' } }),
        }),
        error: 'Unsupported cipher.',
      },
      {
        label: 'empty ciphertext',
        request: () => makeShareRequest('POST', {
          id, manageTokenHash, envelope: validEnvelope({ ciphertext: '' }),
        }),
        error: 'Encrypted profile payload is empty.',
      },
      {
        label: 'oversized ciphertext',
        request: () => makeShareRequest('POST', {
          id, manageTokenHash, envelope: validEnvelope({ ciphertext: 'a'.repeat(3_750_000) }),
        }),
        error: 'Encrypted profile payload is too large for link sharing.',
      },
    ];

    for (const testCase of cases) {
      const response = await shareHandler(testCase.request());
      expect(response.status, testCase.label).toBe(400);
      expect(await responseJson(response), testCase.label).toEqual({ error: testCase.error });
    }
    expect(Array.from(store.keys()).filter(path => path.startsWith('profile-shares/v2/'))).toEqual([]);
  });

  it('handles missing, expired, corrupt, duplicate, and unsupported-method records', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { store } = installBlobStoreMock();
    const id = 'shareRecordEdge0123456789';
    const path = `profile-shares/v1/${id}.json`;
    const manageTokenHash = 'b'.repeat(64);

    const missingGet = await shareHandler(makeShareRequest('GET', undefined, { id }));
    expect(missingGet.status).toBe(404);
    expect(await responseJson(missingGet)).toEqual({ error: 'Shared profile not found.' });

    const missingDelete = await shareHandler(makeShareRequest('DELETE', {}, { id }));
    expect(missingDelete.status).toBe(200);
    expect(await responseJson(missingDelete)).toEqual({ ok: true, missing: true });

    store.set(path, '{invalid-record');
    const corrupt = await shareHandler(makeShareRequest('GET', undefined, { id }));
    expect(corrupt.status).toBe(500);

    store.set(path, JSON.stringify({
      id,
      expiresAt: '2000-01-01T00:00:00.000Z',
      manageTokenHash,
      envelope: validEnvelope(),
    }));
    const expired = await shareHandler(makeShareRequest('GET', undefined, { id }));
    expect(expired.status).toBe(410);
    expect(await responseJson(expired)).toEqual({ error: 'Shared profile link has expired.' });
    await vi.waitFor(() => expect(store.has(path)).toBe(false));

    const createBody = { id, manageTokenHash, envelope: validEnvelope() };
    const created = await shareHandler(makeShareRequest('POST', createBody));
    expect(created.status).toBe(201);
    const duplicate = await shareHandler(makeShareRequest('POST', {
      ...createBody,
      envelope: validEnvelope({ expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }),
    }));
    expect(duplicate.status).toBe(409);

    const unsupported = await shareHandler(makeShareRequest('PATCH', undefined, { id }));
    expect(unsupported.status).toBe(405);
    expect(await responseJson(unsupported)).toEqual({ error: 'Method not allowed.' });
  });

  it('atomically owns a public id across concurrent creates and fully revokes the winner', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { store } = installBlobStoreMock();
    const id = 'shareConcurrent0123456789';
    const firstToken = 'concurrent-first-token';
    const secondToken = 'concurrent-second-token';
    const firstEnvelope = validEnvelope({
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ciphertext: 'first-ciphertext-value',
    });
    const secondEnvelope = validEnvelope({
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      ciphertext: 'second-ciphertext-value',
    });

    const [first, second] = await Promise.all([
      shareHandler(makeShareRequest('POST', {
        id,
        manageTokenHash: await sha256Hex(firstToken),
        envelope: firstEnvelope,
      })),
      shareHandler(makeShareRequest('POST', {
        id,
        manageTokenHash: await sha256Hex(secondToken),
        envelope: secondEnvelope,
      })),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(Array.from(store.keys()).filter(path => path === `profile-shares/v2/${id}.json`)).toHaveLength(1);

    const loaded = await shareHandler(makeShareRequest('GET', undefined, { id }));
    const loadedBody = await responseJson(loaded);
    expect(loaded.status).toBe(200);
    const winningToken = loadedBody.envelope.ciphertext === firstEnvelope.ciphertext
      ? firstToken
      : secondToken;

    const deleted = await shareHandler(makeShareRequest('DELETE', {
      manageToken: winningToken,
    }, { id }));
    expect(deleted.status).toBe(200);
    expect(store.has(`profile-shares/v2/${id}.json`)).toBe(false);

    const afterDelete = await shareHandler(makeShareRequest('GET', undefined, { id }));
    expect(afterDelete.status).toBe(404);
  });

  it('runs globally bounded cleanup only after abuse control and records an hourly lease', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { apiCalls, store, uploadedAtByPath } = installBlobStoreMock();
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const currentWindow = Math.floor(now / windowMs) * windowMs;
    const staleId = 'staleShareId01234567890';
    const liveId = 'liveShareId012345678901';
    const staleExpiry = now - 1;
    const liveExpiry = now + windowMs;
    const staleV2Share = `profile-shares/v2/${staleId}.json`;
    const liveV2Share = `profile-shares/v2/${liveId}.json`;
    const staleExpiryMarker = `profile-share-expiry/v1/${staleExpiry}/${staleId}.json`;
    const liveExpiryMarker = `profile-share-expiry/v1/${liveExpiry}/${liveId}.json`;
    const staleLegacyShare = 'profile-shares/v1/legacyShareId0123456789.json';
    const staleV2Rate = `profile-share-rate/v2/${currentWindow - windowMs}/other-client/0.json`;
    const currentV2Rate = `profile-share-rate/v2/${currentWindow}/other-client/0.json`;
    const staleLegacyRate = `profile-share-rate/v1/legacy-client/${currentWindow - windowMs}/0.json`;
    const staleMaintenance = `profile-share-maintenance/v2/${currentWindow - windowMs}.json`;

    for (const path of [
      staleExpiryMarker,
      liveExpiryMarker,
      staleLegacyShare,
      staleV2Rate,
      currentV2Rate,
      staleLegacyRate,
      staleMaintenance,
    ]) {
      store.set(path, '{}');
    }
    store.set(staleV2Share, JSON.stringify({
      id: staleId,
      expiresAt: new Date(staleExpiry).toISOString(),
      envelope: validEnvelope(),
    }));
    store.set(liveV2Share, JSON.stringify({
      id: liveId,
      expiresAt: new Date(liveExpiry).toISOString(),
      envelope: validEnvelope(),
    }));
    uploadedAtByPath.set(
      staleLegacyShare,
      new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
    );

    const response = await shareHandler(makeShareRequest('POST', {
      id: 'cleanupTriggerId012345678',
      manageTokenHash: 'c'.repeat(64),
      envelope: validEnvelope(),
    }));

    expect(response.status).toBe(201);
    expect(store.has(staleV2Share)).toBe(false);
    expect(store.has(staleExpiryMarker)).toBe(false);
    expect(store.has(staleLegacyShare)).toBe(false);
    expect(store.has(staleV2Rate)).toBe(false);
    expect(store.has(staleLegacyRate)).toBe(false);
    expect(store.has(staleMaintenance)).toBe(false);
    expect(store.has(liveV2Share)).toBe(true);
    expect(store.has(liveExpiryMarker)).toBe(true);
    expect(store.has(currentV2Rate)).toBe(true);
    expect(store.has(`profile-share-maintenance/v2/${currentWindow}.json`)).toBe(true);
    expect(store.has('profile-share-maintenance-state/v1/cursors.json')).toBe(true);

    const ratePutIndex = apiCalls.findIndex(call => (
      call.method === 'PUT'
      && call.href.includes('profile-share-rate%2Fv2%2F')
    ));
    const maintenancePutIndex = apiCalls.findIndex(call => (
      call.method === 'PUT'
      && call.href.includes('profile-share-maintenance%2Fv2%2F')
    ));
    expect(ratePutIndex).toBeGreaterThanOrEqual(0);
    expect(maintenancePutIndex).toBeGreaterThan(ratePutIndex);
    const cleanupLists = apiCalls.filter(call => (
      call.method === 'GET'
      && ['20', '100'].includes(new URL(call.href).searchParams.get('limit') || '')
      && [
        'profile-share-expiry/v1/',
        'profile-shares/v1/',
        'profile-share-rate/v2/',
        'profile-share-rate/v1/',
        'profile-share-maintenance/v2/',
      ].some(prefix => call.href.includes(encodeURIComponent(prefix)))
    ));
    expect(cleanupLists).toHaveLength(5);
    const cleanupLimits = Object.fromEntries(cleanupLists.map(call => {
      const url = new URL(call.href);
      return [url.searchParams.get('prefix'), url.searchParams.get('limit')];
    }));
    expect(cleanupLimits).toMatchObject({
      'profile-share-expiry/v1/': '20',
      'profile-shares/v1/': '100',
      'profile-share-rate/v2/': '100',
      'profile-share-rate/v1/': '100',
      'profile-share-maintenance/v2/': '100',
    });
  });

  it('rotates the bounded cleanup cursor until every expired canonical share is removed', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { store } = installBlobStoreMock();
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    const stalePaths = [];

    for (let index = 0; index < 21; index++) {
      const id = `expiredBatchId${String(index).padStart(8, '0')}`;
      const expiresAt = now - 1_000 - index;
      const path = `profile-shares/v2/${id}.json`;
      const markerPath = `profile-share-expiry/v1/${expiresAt}/${id}.json`;
      stalePaths.push(path);
      store.set(path, JSON.stringify({
        id,
        expiresAt: new Date(expiresAt).toISOString(),
        envelope: validEnvelope(),
      }));
      store.set(markerPath, '{}');
    }

    const first = await shareHandler(makeShareRequest('POST', {
      id: 'cleanupCursorTrigger012345',
      manageTokenHash: 'd'.repeat(64),
      envelope: validEnvelope(),
    }));

    expect(first.status).toBe(201);
    expect(stalePaths.filter(path => store.has(path))).toHaveLength(1);
    const firstState = JSON.parse(store.get('profile-share-maintenance-state/v1/cursors.json'));
    expect(firstState.shares).toMatch(/^profile-share-expiry\/v1\//);

    nowSpy.mockReturnValue(now + hourMs);
    const second = await shareHandler(makeShareRequest('POST', {
      id: 'cleanupCursorTrigger123456',
      manageTokenHash: 'e'.repeat(64),
      envelope: validEnvelope(),
    }));

    expect(second.status).toBe(201);
    expect(stalePaths.filter(path => store.has(path))).toEqual([]);
    const secondState = JSON.parse(store.get('profile-share-maintenance-state/v1/cursors.json'));
    expect(secondState.shares).toBe('');
  });

  it('keeps maintenance best-effort after consuming a rate slot and hides upstream errors', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { store } = installBlobStoreMock({ failMaintenanceList: true, failDelete: true });
    const id = 'shareMaintenanceFail012345';
    const manageToken = 'maintenance-delete-token';

    const created = await shareHandler(makeShareRequest('POST', {
      id,
      manageTokenHash: await sha256Hex(manageToken),
      envelope: validEnvelope(),
    }));

    expect(created.status).toBe(201);
    expect(Array.from(store.keys()).filter(path => path.startsWith('profile-share-rate/v2/'))).toHaveLength(1);
    expect(store.has(`profile-shares/v2/${id}.json`)).toBe(true);

    const deletion = await shareHandler(makeShareRequest('DELETE', { manageToken }, { id }));
    expect(deletion.status).toBe(500);
    expect(await responseJson(deletion)).toEqual({ error: 'Could not stop sharing link.' });
  });

  it('returns a JSON error and keeps the share record when Blob deletion fails', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store123_secret';
    const { store } = installBlobStoreMock({ failDelete: true });
    const id = 'shareDeleteFailure01234567';
    const manageToken = 'delete-failure-token';
    const manageTokenHash = await sha256Hex(manageToken);
    const path = `profile-shares/v1/${id}.json`;
    store.set(path, JSON.stringify({
      id,
      expiresAt: validEnvelope().expiresAt,
      manageTokenHash,
      envelope: validEnvelope(),
    }));

    const response = await shareHandler(makeShareRequest('DELETE', { manageToken }, { id }));

    expect(response.status).toBe(500);
    expect(await responseJson(response)).toEqual({ error: 'Could not stop sharing link.' });
    expect(store.has(path)).toBe(true);
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
    expect(blockedPreflight.status).toBe(403);
    expect(blockedPreflight.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const blocked = await proxyHandler(makeProxyRequest({ wearable_runtime_config: true }, {
      origin: 'https://evil.example',
    }));
    expect(blocked.status).toBe(403);
    expect(await responseJson(blocked)).toEqual({ error: 'Origin not allowed.' });

    const missingOrigin = await proxyHandler(makeProxyRequest({ wearable_runtime_config: true }, {
      origin: '',
    }));
    expect(missingOrigin.status).toBe(403);
    expect(await responseJson(missingOrigin)).toEqual({ error: 'Origin not allowed.' });

    const wrongMethod = await proxyHandler(makeProxyRequest(undefined, { method: 'GET' }));
    expect(wrongMethod.status).toBe(405);
    expect(await responseJson(wrongMethod)).toEqual({
      error: 'Method not allowed. Use POST with {url, headers, body?, method?}',
    });

    const badJson = await proxyHandler(makeProxyRequest(undefined, { rawBody: '{' }));
    expect(badJson.status).toBe(400);
    expect(await responseJson(badJson)).toEqual({ error: 'Invalid JSON body' });

    const nullPayload = await proxyHandler(makeProxyRequest(null));
    expect(nullPayload.status).toBe(400);
    expect(await responseJson(nullPayload)).toEqual({ error: 'Proxy payload must be an object' });

    process.env.OURA_CLIENT_ID = 'oura-selfhost';
    process.env.FITBIT_CLIENT_ID = 'fitbit-selfhost';
    process.env.WITHINGS_CLIENT_ID = '   ';
    const runtime = await proxyHandler(makeProxyRequest({ wearable_runtime_config: true }));
    expect(runtime.status).toBe(200);
    expect(runtime.headers.get('Cache-Control')).toBe('no-store');
    expect(await responseJson(runtime)).toEqual({
      overrides: {
        oura: 'oura-selfhost',
        fitbit: 'fitbit-selfhost',
      },
    });

    const selfHosted = await proxyHandler(makeProxyRequest({ wearable_runtime_config: true }, {
      origin: 'https://health.example.net',
      requestUrl: 'https://health.example.net/api/proxy',
    }));
    expect(selfHosted.status).toBe(200);
  });

  it('fails closed when a hosted deployment has no distributed proxy limiter', async () => {
    process.env.VERCEL = '1';

    const response = await proxyHandler(makeProxyRequest({
      wearable_runtime_config: true,
    }, { clientIp: '203.0.113.79' }));

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(await responseJson(response)).toEqual({
      error: 'Proxy rate limit is not configured for this hosted deployment.',
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
      'https://metadata.google.internal/computeMetadata/v1/',
      'https://user:secret@api.example.com/v1/chat',
      'not a url',
      { href: 'https://api.example.com/v1/chat' },
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
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    });

    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const failed = await proxyHandler(makeProxyRequest({
      url: 'https://models.example.com/v1/chat',
      body: { prompt: 'hello' },
    }));
    expect(failed.status).toBe(502);
    expect(await responseJson(failed)).toEqual({ error: 'Upstream request failed' });
  });

  it('revalidates redirect targets and never forwards credentials across origins', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { Location: 'https://169.254.169.254/latest/meta-data/' },
    }));
    const privateRedirect = await proxyHandler(makeProxyRequest({
      url: 'https://custom.example.com/v1/chat',
      headers: { Authorization: 'Bearer private-key' },
      body: { prompt: 'hello' },
    }));
    expect(privateRedirect.status).toBe(502);
    expect(await responseJson(privateRedirect)).toEqual({
      error: 'Proxy redirect target not allowed',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    globalThis.fetch = vi.fn(async () => new Response(null, {
      status: 307,
      headers: { Location: 'https://collector.example.net/capture' },
    }));
    const crossOriginRedirect = await proxyHandler(makeProxyRequest({
      url: 'https://custom.example.com/v1/chat',
      headers: { 'x-api-key': 'private-key' },
      body: { prompt: 'hello' },
    }));
    expect(crossOriginRedirect.status).toBe(502);
    expect(await responseJson(crossOriginRedirect)).toEqual({
      error: 'Cross-origin proxy redirects with a request body are not allowed',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    globalThis.fetch = vi.fn(async (url) => {
      if (url === 'https://shop.example.com/product') {
        return new Response(null, {
          status: 301,
          headers: { Location: 'https://www.example.com/product' },
        });
      }
      return new Response('<html><body>product</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      });
    });
    const safePageRedirect = await proxyHandler(makeProxyRequest({
      url: 'https://shop.example.com/product',
      method: 'GET',
      headers: { 'x-api-key': 'must-not-cross-origins' },
    }));
    expect(safePageRedirect.status).toBe(200);
    expect(await safePageRedirect.text()).toContain('product');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const [pageRedirectUrl, pageRedirectInit] = globalThis.fetch.mock.calls[1];
    expect(pageRedirectUrl).toBe('https://www.example.com/product');
    expect(pageRedirectInit.headers).not.toHaveProperty('x-api-key');

    globalThis.fetch = vi.fn(async url => {
      if (url === 'https://api.elevenlabs.io/v2/voices') {
        return new Response(null, {
          status: 301,
          headers: { Location: 'https://voices.elevenlabs.io/v2/voices' },
        });
      }
      return jsonResponse({ voices: [] });
    });
    const voiceRedirect = await fetchWithValidatedRedirects(
      'https://api.elevenlabs.io/v2/voices',
      { headers: { 'xi-api-key': 'must-not-cross-origins' } },
    );
    expect(await responseJson(voiceRedirect)).toEqual({ voices: [] });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const [, voiceRedirectInit] = globalThis.fetch.mock.calls[1];
    expect(voiceRedirectInit.headers).not.toHaveProperty('xi-api-key');

    globalThis.fetch = vi.fn(async (url) => {
      if (url === 'https://custom.example.com/v1/chat') {
        return new Response(null, {
          status: 303,
          headers: { Location: '/v1/result' },
        });
      }
      return jsonResponse({ redirected: true });
    });
    const sameOriginRedirect = await proxyHandler(makeProxyRequest({
      url: 'https://custom.example.com/v1/chat',
      headers: { Authorization: 'Bearer private-key' },
      body: { prompt: 'hello' },
    }));
    expect(sameOriginRedirect.status).toBe(200);
    expect(await responseJson(sameOriginRedirect)).toEqual({ redirected: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const [redirectUrl, redirectInit] = globalThis.fetch.mock.calls[1];
    expect(redirectUrl).toBe('https://custom.example.com/v1/result');
    expect(redirectInit).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer private-key' },
      redirect: 'manual',
    });
    expect(redirectInit.body).toBeUndefined();

    globalThis.fetch = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { Location: '/v1/loop' },
    }));
    const redirectLoop = await proxyHandler(makeProxyRequest({
      url: 'https://custom.example.com/v1/loop',
      method: 'GET',
    }));
    expect(redirectLoop.status).toBe(502);
    expect(await responseJson(redirectLoop)).toEqual({
      error: 'Proxy redirect limit exceeded',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
  });

  it('bounds upstream header waits and throttles repeated clients', async () => {
    process.env.PROXY_UPSTREAM_TIMEOUT_MS = '10';
    globalThis.fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const timedOut = await proxyHandler(makeProxyRequest({
      url: 'https://slow.example.com/v1/chat',
    }, { clientIp: '203.0.113.80' }));
    expect(timedOut.status).toBe(504);
    expect(await responseJson(timedOut)).toEqual({
      error: 'Proxy upstream timed out',
    });

    delete process.env.PROXY_UPSTREAM_TIMEOUT_MS;
    process.env.PROXY_RATE_LIMIT_MAX = '2';
    process.env.PROXY_RATE_LIMIT_WINDOW_MS = '1000';
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true }));
    const request = () => proxyHandler(makeProxyRequest({
      url: 'https://models.example.com/v1/chat',
    }, { clientIp: '203.0.113.81' }));
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await responseJson(limited)).toMatchObject({
      error: 'Too many proxy requests. Try again later.',
      retryAfterSeconds: expect.any(Number),
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the timeout active while an upstream response body is stalled', async () => {
    process.env.PROXY_UPSTREAM_TIMEOUT_MS = '10';
    globalThis.fetch = vi.fn(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init.signal.addEventListener('abort', () => {
          controller.error(new Error('aborted'));
        }, { once: true });
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    }));

    const timedOut = await proxyHandler(makeProxyRequest({
      url: 'https://slow-body.example.com/v1/chat',
    }, { clientIp: '203.0.113.82' }));

    expect(timedOut.status).toBe(504);
    expect(await responseJson(timedOut)).toEqual({
      error: 'Proxy upstream timed out',
    });
  });

  it('streams responses to completion and propagates downstream cancellation', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      'data: {"ok":true}\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    ));
    const completed = await proxyHandler(makeProxyRequest({
      url: 'https://stream.example.com/v1/chat',
    }, { clientIp: '203.0.113.86' }));

    expect(completed.status).toBe(200);
    expect(completed.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await completed.text()).toBe('data: {"ok":true}\n\n');

    let upstreamCancelled = false;
    globalThis.fetch = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'));
      },
      cancel() {
        upstreamCancelled = true;
      },
    }), {
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    const cancellable = await proxyHandler(makeProxyRequest({
      url: 'https://stream.example.com/v1/chat',
    }, { clientIp: '203.0.113.87' }));
    const reader = cancellable.body.getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel('client stopped reading');

    expect(upstreamCancelled).toBe(true);
  });

  it('propagates timeout and byte-cap errors through the streaming response path', async () => {
    process.env.PROXY_UPSTREAM_TIMEOUT_MS = '10';
    globalThis.fetch = vi.fn(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init.signal.addEventListener('abort', () => {
          controller.error(new Error('aborted'));
        }, { once: true });
      },
    }), {
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    const stalled = await proxyHandler(makeProxyRequest({
      url: 'https://stream.example.com/v1/chat',
    }, { clientIp: '203.0.113.88' }));

    await expect(stalled.text()).rejects.toMatchObject({
      code: 'PROXY_UPSTREAM_TIMEOUT',
    });

    delete process.env.PROXY_UPSTREAM_TIMEOUT_MS;
    let upstreamCancelled = false;
    globalThis.fetch = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(PROXY_MAX_RESPONSE_BYTES + 1));
      },
      cancel() {
        upstreamCancelled = true;
      },
    }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    }));
    const oversized = await proxyHandler(makeProxyRequest({
      url: 'https://stream.example.com/v1/chat',
    }, { clientIp: '203.0.113.89' }));

    await expect(oversized.text()).rejects.toMatchObject({
      code: 'PROXY_RESPONSE_TOO_LARGE',
    });
    expect(upstreamCancelled).toBe(true);
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
      redirect: 'manual',
      signal: expect.any(AbortSignal),
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
      redirect: 'manual',
      signal: expect.any(AbortSignal),
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
      error: 'Proxy response exceeds size cap',
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
        redirect: 'manual',
        signal: expect.any(AbortSignal),
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

  it('applies redirect, timeout, and response-size guardrails to secret-bearing OAuth relays', async () => {
    process.env.OURA_CLIENT_SECRET = 'oura-secret';
    globalThis.fetch = vi.fn(async () => new Response(null, {
      status: 307,
      headers: { Location: 'https://collector.example.com/capture' },
    }));

    const redirected = await proxyHandler(makeProxyRequest({
      oura_token_exchange: {
        code: 'oura-code',
        redirect_uri: 'https://app.example.com/cb',
        client_id: 'oura-client',
      },
    }, { clientIp: '203.0.113.83' }));

    expect(redirected.status).toBe(502);
    expect(await responseJson(redirected)).toEqual({
      error: 'Cross-origin proxy redirects with a request body are not allowed',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    globalThis.fetch = vi.fn(async () => new Response('{}', {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(300 * 1024),
      },
    }));
    const oversized = await proxyHandler(makeProxyRequest({
      oura_token_refresh: {
        refresh_token: 'oura-refresh',
        client_id: 'oura-client',
      },
    }, { clientIp: '203.0.113.84' }));

    expect(oversized.status).toBe(502);
    expect(await responseJson(oversized)).toEqual({
      error: 'Proxy response exceeds size cap',
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

    process.env.UVDATA_UPSTREAM = 'https://uv.example.com/base/';
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
    expect(url).toBe('https://uv.example.com/base/uv?latitude=50.1&longitude=14.4&time=2026-06-06T12%3A00%3A00Z');
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
    expect(await responseJson(oversized)).toEqual({ error: 'Proxy response exceeds size cap' });
  });

  it('strips the CAMS bearer before following an allowed cross-origin redirect', async () => {
    process.env.UVDATA_UPSTREAM = 'https://uv.example.com';
    process.env.UVDATA_BEARER = 'uv-secret';
    globalThis.fetch = vi.fn(async (url) => {
      if (url.startsWith('https://uv.example.com/uv?')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://uv-cdn.example.com/result' },
        });
      }
      return jsonResponse({ uv: 3.1 });
    });

    const relayed = await proxyHandler(makeProxyRequest({
      meteo: 'cams',
      latitude: 50.1,
      longitude: 14.4,
    }, { clientIp: '203.0.113.85' }));

    expect(relayed.status).toBe(200);
    expect(await responseJson(relayed)).toEqual({ uv: 3.1 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const [redirectUrl, redirectInit] = globalThis.fetch.mock.calls[1];
    expect(redirectUrl).toBe('https://uv-cdn.example.com/result');
    expect(redirectInit.headers).not.toHaveProperty('Authorization');
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
