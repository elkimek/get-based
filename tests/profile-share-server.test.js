import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSqliteProfileShareStore } from '../lib/profile-share-sqlite-store.js';
import { createProfileShareServer } from '../server/profile-share-server.js';

const resources = [];

afterEach(async () => {
  while (resources.length) await resources.pop()();
});

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validEnvelope() {
  return {
    schema: 'getbased-profile-share',
    version: 1,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000 },
    cipher: { name: 'AES-GCM', iv: 'synthetic-profile-share-iv' },
    ciphertext: 'syntheticciphertext',
  };
}

async function makeServer(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'getbased-profile-share-server-'));
  const store = createSqliteProfileShareStore({
    databasePath: join(directory, 'shares.sqlite'),
    rateLimitHmacKey: 'test-only-server-rate-limit-key-long-enough',
    maxDatabaseBytes: 64 * 1024 * 1024,
  });
  const { server } = createProfileShareServer({ store, ...options });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  resources.push(async () => {
    await new Promise(resolve => server.close(resolve));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { port, store };
}

function endpoint(port, query = '') {
  return `http://127.0.0.1:${port}/api/share${query}`;
}

const forwardedHeaders = {
  Origin: 'https://app.getbased.health',
  'Content-Type': 'application/json',
  'X-Forwarded-Host': 'sync.getbased.health',
  'X-Forwarded-Proto': 'https',
  'X-Forwarded-For': '198.51.100.22',
};

describe('SQLite profile-share Node adapter', () => {
  it('serves health and a complete synthetic create/read/delete flow', async () => {
    const { port, store } = await makeServer();
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });

    const id = 'syntheticShareId0123456789';
    const manageToken = 'synthetic-management-token';
    const envelope = validEnvelope();
    const created = await fetch(endpoint(port), {
      method: 'POST',
      headers: forwardedHeaders,
      body: JSON.stringify({
        id,
        manageTokenHash: await sha256Hex(manageToken),
        envelope,
      }),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get('access-control-allow-origin')).toBe('https://app.getbased.health');

    const loaded = await fetch(endpoint(port, `?id=${id}`), {
      headers: {
        Origin: forwardedHeaders.Origin,
        'X-Forwarded-Host': forwardedHeaders['X-Forwarded-Host'],
        'X-Forwarded-Proto': forwardedHeaders['X-Forwarded-Proto'],
        'X-Forwarded-For': forwardedHeaders['X-Forwarded-For'],
      },
    });
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toMatchObject({ id, envelope });

    const rateMarkers = await store.list({ prefix: 'profile-share-rate/v2/', limit: 100 });
    expect(rateMarkers.blobs).toHaveLength(1);
    expect(rateMarkers.blobs[0].pathname).not.toContain('198.51.100.22');

    const denied = await fetch(endpoint(port, `?id=${id}`), {
      method: 'DELETE',
      headers: forwardedHeaders,
      body: JSON.stringify({ manageToken: 'wrong' }),
    });
    expect(denied.status).toBe(403);

    const deleted = await fetch(endpoint(port, `?id=${id}`), {
      method: 'DELETE',
      headers: forwardedHeaders,
      body: JSON.stringify({ manageToken }),
    });
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({ ok: true });
  });

  it('rejects unrelated paths, hostile origins, and oversized bodies', async () => {
    const { port } = await makeServer({ maxRequestBytes: 64 * 1024 });
    expect((await fetch(`http://127.0.0.1:${port}/other`)).status).toBe(404);

    const hostile = await fetch(endpoint(port, '?id=syntheticShareId0123456789'), {
      headers: {
        Origin: 'https://evil.example',
        'X-Forwarded-Host': 'sync.getbased.health',
        'X-Forwarded-Proto': 'https',
      },
    });
    expect(hostile.status).toBe(403);

    const oversized = await fetch(endpoint(port), {
      method: 'POST',
      headers: forwardedHeaders,
      body: 'x'.repeat((64 * 1024) + 1),
    });
    expect(oversized.status).toBe(413);
  });
});
