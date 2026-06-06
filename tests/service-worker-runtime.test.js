import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;
const realImportScripts = globalThis.importScripts;
const realSelf = globalThis.self;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

function makeCaches() {
  const opened = new Map();
  const matches = new Map();
  const cache = {
    addAll: vi.fn(async (entries) => {
      for (const entry of entries) matches.set(entry, new Response(`cached:${entry}`));
    }),
    put: vi.fn(async (request, response) => {
      const key = typeof request === 'string' ? request : new URL(request.url).pathname;
      matches.set(key, response);
    }),
  };
  const caches = {
    open: vi.fn(async (name) => {
      opened.set(name, cache);
      return cache;
    }),
    match: vi.fn(async (request) => {
      const key = typeof request === 'string' ? request : new URL(request.url).pathname;
      return matches.get(key);
    }),
    keys: vi.fn(async () => ['labcharts-vold', 'labcharts-v9.9.9-deadbeef']),
    delete: vi.fn(async () => true),
  };
  return { cache, caches, matches, opened };
}

function makeWaitEvent() {
  const promises = [];
  return {
    waitUntil: (promise) => { promises.push(Promise.resolve(promise)); },
    done: () => Promise.all(promises),
  };
}

function makeFetchEvent(url, init = {}) {
  let responsePromise = null;
  return {
    request: new Request(url, init),
    respondWith: (promise) => { responsePromise = Promise.resolve(promise); },
    response: () => responsePromise,
  };
}

async function loadServiceWorker({ hostname = 'preview.getbased.health', fetchImpl } = {}) {
  const listeners = new Map();
  const { cache, caches, matches, opened } = makeCaches();
  const self = {
    APP_VERSION: '9.9.9',
    location: { hostname, origin: `https://${hostname}` },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    addEventListener: vi.fn((type, listener) => {
      listeners.set(type, listener);
    }),
  };

  globalThis.self = self;
  globalThis.importScripts = vi.fn(() => {
    self.APP_VERSION = '9.9.9';
  });
  globalThis.caches = caches;
  globalThis.fetch = fetchImpl || vi.fn(async (request) => {
    const href = typeof request === 'string' ? request : request.url;
    if (href.endsWith('/api/commit') || href === '/api/commit') {
      return jsonResponse({ sha: 'deadbeefcafebabe' });
    }
    return new Response(`network:${href}`, { status: 200 });
  });

  vi.resetModules();
  await import('../service-worker.js');
  return { cache, caches, listeners, matches, opened, self };
}

beforeEach(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  if (realSelf === undefined) delete globalThis.self;
  else globalThis.self = realSelf;
  if (realImportScripts === undefined) delete globalThis.importScripts;
  else globalThis.importScripts = realImportScripts;
  if (realCaches === undefined) delete globalThis.caches;
  else globalThis.caches = realCaches;
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('service worker runtime cache behavior', () => {
  it('pre-caches the app shell and deletes stale caches using preview commit-specific names', async () => {
    const { cache, caches, listeners, self } = await loadServiceWorker();

    expect(globalThis.importScripts).toHaveBeenCalledWith('/version.js');
    expect(listeners.has('install')).toBe(true);
    expect(listeners.has('activate')).toBe(true);
    expect(listeners.has('fetch')).toBe(true);

    const install = makeWaitEvent();
    listeners.get('install')(install);
    await install.done();

    expect(caches.open).toHaveBeenCalledWith('labcharts-v9.9.9-deadbeef');
    expect(cache.addAll).toHaveBeenCalled();
    expect(cache.addAll.mock.calls[0][0]).toContain('/app');
    expect(cache.addAll.mock.calls[0][0]).toContain('/js/main.js');
    expect(self.skipWaiting).toHaveBeenCalled();

    const activate = makeWaitEvent();
    listeners.get('activate')(activate);
    await activate.done();

    expect(caches.delete).toHaveBeenCalledWith('labcharts-vold');
    expect(caches.delete).not.toHaveBeenCalledWith('labcharts-v9.9.9-deadbeef');
    expect(self.clients.claim).toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/commit', { cache: 'no-store' });
  });

  it('uses network-first, navigation fallback, and stale-while-revalidate fetch routes', async () => {
    const { cache, listeners, matches } = await loadServiceWorker();
    await Promise.resolve();

    const networkOnly = makeFetchEvent('https://openrouter.ai/api/v1/chat', { method: 'POST' });
    listeners.get('fetch')(networkOnly);
    expect(networkOnly.response()).toBeNull();

    const localPrivate = makeFetchEvent('https://192.168.1.4/models');
    listeners.get('fetch')(localPrivate);
    expect(localPrivate.response()).toBeNull();

    const nonGet = makeFetchEvent('https://preview.getbased.health/api/share', { method: 'POST' });
    listeners.get('fetch')(nonGet);
    expect(nonGet.response()).toBeNull();

    const version = makeFetchEvent('https://preview.getbased.health/version.js');
    listeners.get('fetch')(version);
    expect(await (await version.response()).text()).toBe('network:https://preview.getbased.health/version.js');
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledWith(version.request, expect.any(Response)));

    matches.set('/app', new Response('cached-app-shell'));
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const navigate = makeFetchEvent('https://preview.getbased.health/deep/link', { method: 'GET' });
    Object.defineProperty(navigate.request, 'mode', { value: 'navigate' });
    listeners.get('fetch')(navigate);
    expect(await (await navigate.response()).text()).toBe('cached-app-shell');

    matches.set('/styles.css', new Response('cached-css'));
    const staleWhileRevalidate = makeFetchEvent('https://preview.getbased.health/styles.css');
    listeners.get('fetch')(staleWhileRevalidate);
    expect(await (await staleWhileRevalidate.response()).text()).toBe('cached-css');

    globalThis.fetch = vi.fn(async () => new Response('fresh-module', { status: 200 }));
    const appModule = makeFetchEvent('https://preview.getbased.health/js/main.js');
    listeners.get('fetch')(appModule);
    expect(await (await appModule.response()).text()).toBe('fresh-module');
  });

  it('uses plain versioned cache names on production hosts', async () => {
    const { caches, listeners } = await loadServiceWorker({ hostname: 'getbased.health' });
    const install = makeWaitEvent();
    listeners.get('install')(install);
    await install.done();

    expect(caches.open).toHaveBeenCalledWith('labcharts-v9.9.9');
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/commit', { cache: 'no-store' });
  });
});
