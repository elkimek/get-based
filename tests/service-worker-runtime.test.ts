import { executeClassicServiceWorker } from './helpers/classic-service-worker.js';
import { jsonResponse } from './helpers/http-responses.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WaitFixture = {waitUntil: (promise: unknown) => void; done: () => Promise<unknown[]>};
type WorkerMessageFixture = {data: {type: string}; origin?: string; source?: {url: string}};
type RuntimeListener = (event: WaitFixture | ReturnType<typeof makeFetchEvent> | WorkerMessageFixture) => void;
type FetchFixture = (request: string | Request) => Promise<Response>;

const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;
const realImportScripts = (globalThis as {importScripts?: unknown}).importScripts;
const realSelf = globalThis.self;



function cacheKey(request: string | Request) {
  if (typeof request === 'string') return request;
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

function makeCaches() {
  const opened = new Map<string, unknown>();
  const matches = new Map<string, Response>();
  const cache = {
    addAll: vi.fn(async (entries: string[]) => {
      for (const entry of entries) matches.set(entry, new Response(`cached:${entry}`));
    }),
    match: vi.fn(async (request: string | Request) => {
      return matches.get(cacheKey(request));
    }),
    put: vi.fn(async (request: string | Request, response: Response) => {
      matches.set(cacheKey(request), response);
    }),
  };
  const caches = {
    open: vi.fn(async (name: string) => {
      opened.set(name, cache);
      return cache;
    }),
    match: vi.fn(async (request: string | Request) => {
      return matches.get(cacheKey(request));
    }),
    keys: vi.fn(async () => [
      'labcharts-vold',
      'labcharts-v9.9.9-deadbeef',
      'transformers-cache',
    ]),
    delete: vi.fn(async () => true),
  };
  return { cache, caches, matches, opened };
}

function makeWaitEvent() {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: unknown) => { promises.push(Promise.resolve(promise)); },
    done: () => Promise.all(promises),
  };
}

function makeFetchEvent(url: string, init: RequestInit = {}) {
  let responsePromise: Promise<Response> | null = null;
  return {
    ...makeWaitEvent(),
    request: new Request(url, init),
    respondWith: (promise: Response | Promise<Response>) => { responsePromise = Promise.resolve(promise); },
    response: () => responsePromise,
  };
}

async function loadServiceWorker({ hostname = 'preview.getbased.health', fetchImpl }: {hostname?: string; fetchImpl?: FetchFixture} = {}) {
  const listeners = new Map<string, RuntimeListener>();
  const { cache, caches, matches, opened } = makeCaches();
  const progressClient = { postMessage: vi.fn<(message: {type: string; completed: number; total: number}) => void>() };
  const self = {
    APP_VERSION: '9.9.9',
    location: { hostname, origin: `https://${hostname}` },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => [progressClient]),
    },
    addEventListener: vi.fn((type: string, listener: RuntimeListener) => {
      listeners.set(type, listener);
    }),
  };

  (globalThis as unknown as {self: unknown}).self = self;
  (globalThis as {importScripts?: unknown}).importScripts = vi.fn(() => {
    self.APP_VERSION = '9.9.9';
  });
  (globalThis as unknown as {caches: unknown}).caches = caches;
  (globalThis as unknown as {fetch: unknown}).fetch = fetchImpl || vi.fn(async (request: string | Request) => {
    const href = typeof request === 'string' ? request : request.url;
    if (href.endsWith('/api/commit') || href === '/api/commit') {
      return jsonResponse({ sha: 'deadbeefcafebabe' });
    }
    return new Response(`network:${href}`, { status: 200 });
  });

  vi.resetModules();
  executeClassicServiceWorker(self, () => { self.APP_VERSION = '9.9.9'; });
  return { cache, caches, listeners, matches, opened, progressClient, self };
}

beforeEach(() => {
  (globalThis as unknown as {fetch: unknown}).fetch = realFetch;
});

afterEach(() => {
  if (realSelf === undefined) delete (globalThis as {self?: unknown}).self;
  else globalThis.self = realSelf;
  if (realImportScripts === undefined) delete (globalThis as {importScripts?: unknown}).importScripts;
  else (globalThis as {importScripts?: unknown}).importScripts = realImportScripts;
  if (realCaches === undefined) delete (globalThis as {caches?: unknown}).caches;
  else globalThis.caches = realCaches;
  (globalThis as unknown as {fetch: unknown}).fetch = realFetch;
  vi.restoreAllMocks();
});

describe('service worker runtime cache behavior', () => {
  it('pre-caches the app shell and deletes only stale app caches using preview commit-specific names', async () => {
    const { cache, caches, listeners, progressClient, self } = await loadServiceWorker();

    expect((globalThis as {importScripts?: unknown}).importScripts).toHaveBeenCalledWith('/version.js');
    expect((globalThis as {importScripts?: unknown}).importScripts).toHaveBeenCalledWith('/service-worker-runtime.js');
    expect(listeners.has('install')).toBe(true);
    expect(listeners.has('activate')).toBe(true);
    expect(listeners.has('fetch')).toBe(true);

    const install = makeWaitEvent();
    listeners.get('install')!(install);
    await install.done();

    expect(caches.open).toHaveBeenCalledWith('labcharts-v9.9.9-deadbeef');
    expect(cache.addAll).not.toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalledWith('/app', expect.any(Response));
    expect(cache.put).toHaveBeenCalledWith('/js/main.js', expect.any(Response));
    expect(cache.put).toHaveBeenCalledWith('/js/service-worker-update.js', expect.any(Response));
    expect(self.skipWaiting).not.toHaveBeenCalled();
    const progressMessages = progressClient.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === 'PRECACHE_PROGRESS');
    expect(progressMessages[0]).toMatchObject({ completed: 0, total: expect.any(Number) });
    expect(progressMessages.at(-1)).toMatchObject({
      completed: progressMessages[0]!.total,
      total: progressMessages[0]!.total,
    });

    const activate = makeWaitEvent();
    listeners.get('activate')!(activate);
    await activate.done();

    expect(caches.delete).toHaveBeenCalledWith('labcharts-vold');
    expect(caches.delete).not.toHaveBeenCalledWith('labcharts-v9.9.9-deadbeef');
    expect(caches.delete).not.toHaveBeenCalledWith('transformers-cache');
    expect(self.clients.claim).toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/commit', { cache: 'no-store' });
  });

  it('prefers a composed-edition cache key over the public commit SHA', async () => {
    const fetchImpl = vi.fn(async (request: string | Request) => {
      const href = typeof request === 'string' ? request : request.url;
      if (href === '/api/commit') return jsonResponse({ sha: 'publiccore', cacheKey: 'core1234-hosted5678' });
      return new Response(`network:${href}`, { status: 200 });
    });
    const { caches, listeners } = await loadServiceWorker({ fetchImpl });

    const install = makeWaitEvent();
    listeners.get('install')!(install);
    await install.done();

    expect(caches.open).toHaveBeenCalledWith('labcharts-v9.9.9-core1234-hosted5678');
  });

  it('resumes partial app-shell caches and retries transient entry failures', async () => {
    let mainAttempts = 0;
    const fetchImpl = vi.fn(async (request: string | Request) => {
      const href = typeof request === 'string' ? request : request.url;
      if (href === '/api/commit') return jsonResponse({ sha: 'deadbeefcafebabe' });
      if (href === '/js/main.js') {
        mainAttempts += 1;
        if (mainAttempts < 3) throw new Error('temporary network failure');
      }
      return new Response(`network:${href}`, { status: 200 });
    });
    const { listeners, matches } = await loadServiceWorker({ fetchImpl });
    matches.set('/app', new Response('already-cached-app'));

    const install = makeWaitEvent();
    listeners.get('install')!(install);
    await install.done();

    expect(mainAttempts).toBe(3);
    expect(fetchImpl.mock.calls.some(([request]) => request === '/app')).toBe(false);
    expect(matches.get('/app')).toBeDefined();
    expect(matches.get('/js/main.js')).toBeDefined();
  });

  it('uses bounded high-concurrency precaching', async () => {
    let activeFetches = 0;
    let maxActiveFetches = 0;
    let releaseFetches: (() => void) | undefined;
    const fetchGate = new Promise<void>((resolve) => { releaseFetches = resolve; });
    const fetchImpl = vi.fn(async (request: string | Request) => {
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      await fetchGate;
      activeFetches -= 1;
      return new Response(`network:${request}`, { status: 200 });
    });
    const { listeners } = await loadServiceWorker({
      hostname: 'app.getbased.health',
      fetchImpl,
    });

    const install = makeWaitEvent();
    listeners.get('install')!(install);
    const completion = install.done();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(48));
    expect(maxActiveFetches).toBe(48);

    releaseFetches!();
    await completion;
    expect(maxActiveFetches).toBe(48);
  });

  it('rejects installation when a required app-shell entry stays unavailable', async () => {
    const fetchImpl = vi.fn(async (request: string | Request) => {
      const href = typeof request === 'string' ? request : request.url;
      if (href === '/api/commit') return jsonResponse({ sha: 'deadbeefcafebabe' });
      if (href === '/js/main.js') throw new Error('offline');
      return new Response(`network:${href}`, { status: 200 });
    });
    const { listeners, matches } = await loadServiceWorker({ fetchImpl });

    const install = makeWaitEvent();
    listeners.get('install')!(install);

    await expect(install.done()).rejects.toThrow('Failed to precache /js/main.js');
    expect(fetchImpl.mock.calls.filter(([request]) => request === '/js/main.js')).toHaveLength(3);
    expect(matches.get('/styles.css')).toBeDefined();
  });

  it('keeps activation alive until clients are claimed', async () => {
    const { listeners, self } = await loadServiceWorker();
    let resolveClaim: (() => void) | undefined;
    const claimPending = new Promise<void>((resolve) => { resolveClaim = resolve; });
    self.clients.claim.mockReturnValue(claimPending);

    const activate = makeWaitEvent();
    listeners.get('activate')!(activate);
    let completed = false;
    const completion = activate.done().then(() => { completed = true; });

    await vi.waitFor(() => expect(self.clients.claim).toHaveBeenCalled());
    expect(completed).toBe(false);
    resolveClaim!();
    await completion;
    expect(completed).toBe(true);
  });

  it('uses network-first preview assets, navigation fallback, and network-only APIs', async () => {
    const { cache, listeners, matches } = await loadServiceWorker();
    await Promise.resolve();

    const networkOnly = makeFetchEvent('https://openrouter.ai/api/v1/chat', { method: 'POST' });
    listeners.get('fetch')!(networkOnly);
    expect(networkOnly.response()).toBeNull();

    const localPrivate = makeFetchEvent('https://192.168.1.4/models');
    listeners.get('fetch')!(localPrivate);
    expect(localPrivate.response()).toBeNull();

    const nonGet = makeFetchEvent('https://preview.getbased.health/api/share', { method: 'POST' });
    listeners.get('fetch')!(nonGet);
    expect(nonGet.response()).toBeNull();

    const apiGet = makeFetchEvent('https://preview.getbased.health/api/share?id=encrypted-profile');
    listeners.get('fetch')!(apiGet);
    expect(apiGet.response()).toBeNull();

    const version = makeFetchEvent('https://preview.getbased.health/version.js');
    listeners.get('fetch')!(version);
    expect(await (await version.response()!).text()).toBe('network:https://preview.getbased.health/version.js');
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledWith(version.request, expect.any(Response)));

    matches.set('/', new Response('stale-navigation'));
    (globalThis as unknown as {fetch: unknown}).fetch = vi.fn(async () => new Response('fresh-navigation', { status: 200 }));
    const freshNavigate = makeFetchEvent('https://preview.getbased.health/', { method: 'GET' });
    Object.defineProperty(freshNavigate.request, 'mode', { value: 'navigate' });
    listeners.get('fetch')!(freshNavigate);
    expect(await (await freshNavigate.response()!).text()).toBe('fresh-navigation');

    matches.set('/app', new Response('cached-app-shell'));
    (globalThis as unknown as {fetch: unknown}).fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const navigate = makeFetchEvent('https://preview.getbased.health/deep/link', { method: 'GET' });
    Object.defineProperty(navigate.request, 'mode', { value: 'navigate' });
    listeners.get('fetch')!(navigate);
    expect(await (await navigate.response()!).text()).toBe('cached-app-shell');

    matches.set('/styles.css', new Response('cached-css'));
    const offlineAsset = makeFetchEvent('https://preview.getbased.health/styles.css');
    listeners.get('fetch')!(offlineAsset);
    expect(await (await offlineAsset.response()!).text()).toBe('cached-css');

    (globalThis as unknown as {fetch: unknown}).fetch = vi.fn(async () => new Response('fresh-module', { status: 200 }));
    const appModule = makeFetchEvent('https://preview.getbased.health/js/main.js');
    listeners.get('fetch')!(appModule);
    expect(await (await appModule.response()!).text()).toBe('fresh-module');
  });

  it('serves production static assets from the current version cache without revalidation', async () => {
    const { cache, listeners, matches } = await loadServiceWorker({ hostname: 'app.getbased.health' });
    await Promise.resolve();

    matches.set('/styles.css', new Response('cached-production-css'));
    matches.set('/version.js', new Response("self.APP_VERSION = '9.9.9';"));
    (globalThis as unknown as {fetch: unknown}).fetch = vi.fn(async () => new Response("self.APP_VERSION = '9.9.10';", { status: 200 }));
    const cachedAsset = makeFetchEvent('https://app.getbased.health/styles.css');
    listeners.get('fetch')!(cachedAsset);

    expect(await (await cachedAsset.response()!).text()).toBe('cached-production-css');
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const activeVersion = makeFetchEvent('https://app.getbased.health/version.js');
    listeners.get('fetch')!(activeVersion);
    expect(await (await activeVersion.response()!).text()).toContain("'9.9.9'");
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const versionProbe = makeFetchEvent('https://app.getbased.health/version.js?update-check=1');
    listeners.get('fetch')!(versionProbe);
    expect(await (await versionProbe.response()!).text()).toContain("'9.9.10'");
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledWith(versionProbe.request, expect.any(Response)));
  });

  it.each([false, true])('rejects a switched deployment and discards only its staging cache (after download=%s)', async afterDownload => {
    const { listeners, self, caches, cache } = await loadServiceWorker({ hostname: 'app.getbased.health' });
    (self as unknown as {GetBasedServiceWorkerRuntime: {install(options: {scope: typeof self; appShell: string[]; buildId: string; isProduction: boolean; resolveCacheName: () => Promise<string>; shouldUseNetworkOnly: () => boolean}): unknown}}).GetBasedServiceWorkerRuntime.install({
      scope: self, appShell: ['/app'], buildId: 'build-b', isProduction: true,
      resolveCacheName: async () => 'labcharts-vbuild-build-b', shouldUseNetworkOnly: () => false,
    });
    let probes = 0;
    (globalThis as unknown as {fetch: unknown}).fetch = vi.fn(async (url: string | Request) => {
      if (url === '/version.js?update-check=1') {
        probes += 1;
        return new Response(`self.APP_BUILD_ID = '${afterDownload && probes === 1 ? 'build-b' : 'build-c'}';`);
      }
      return new Response('build-b-html');
    });
    const install = makeWaitEvent();
    listeners.get('install')!(install);
    await expect(install.done()).rejects.toThrow('Deployment changed');
    expect(cache.put).toHaveBeenCalledTimes(afterDownload ? 1 : 0);
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith('labcharts-vbuild-build-b');
    expect(self.skipWaiting).not.toHaveBeenCalled();
    expect(self.clients.claim).not.toHaveBeenCalled();
  });

  it.each(['/app', '/app/', '/app?source=home', '/app/?source=home', '/index.html'])('keeps %s on the installed HTML when a new deployment is available', async entry => {
    const { listeners, matches } = await loadServiceWorker({ hostname: 'app.getbased.health' });
    matches.set('/app', new Response('installed-html'));
    (globalThis as unknown as {fetch: unknown}).fetch = vi.fn(async () => new Response('new-html'));
    const event = makeFetchEvent(`https://app.getbased.health${entry}`);
    Object.defineProperty(event.request, 'mode', { value: 'navigate' });
    listeners.get('fetch')!(event);
    expect(await (await event.response()!).text()).toBe('installed-html');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps a network cache write alive without delaying the response', async () => {
    const { cache, listeners } = await loadServiceWorker({ hostname: 'app.getbased.health' });
    let finishWrite: (() => void) | undefined;
    cache.put.mockImplementation(() => new Promise<void>(resolve => { finishWrite = resolve; }));
    const event = makeFetchEvent('https://app.getbased.health/new-module.js');
    listeners.get('fetch')!(event);
    expect(await (await event.response()!).text()).toContain('network:');
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce());
    let finished = false;
    const lifetime = event.done().then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    finishWrite!();
    await lifetime;
    expect(finished).toBe(true);
  });

  it('returns a successful network response even when offline cache storage is full', async () => {
    const { cache, listeners } = await loadServiceWorker({ hostname: 'app.getbased.health' });
    cache.put.mockRejectedValue(new DOMException('quota exceeded', 'QuotaExceededError'));
    const event = makeFetchEvent('https://app.getbased.health/new-module.js');
    listeners.get('fetch')!(event);
    expect((await event.response()!).status).toBe(200);
    await expect(event.done()).resolves.toEqual([undefined]);
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it.each([206, 404, 500])('does not cache partial or failed HTTP responses (%s)', async status => {
    const { cache, listeners } = await loadServiceWorker({ hostname: 'app.getbased.health' });
    (globalThis as unknown as {fetch: unknown}).fetch = vi.fn(async () => new Response('network body', { status }));
    const event = makeFetchEvent('https://app.getbased.health/new-module.js');
    listeners.get('fetch')!(event);
    expect((await event.response()!).status).toBe(status);
    await event.done();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('does not claim clients when stale-cache cleanup fails', async () => {
    const { listeners, caches, self } = await loadServiceWorker({ hostname: 'app.getbased.health' });
    caches.delete.mockRejectedValue(new Error('cache unavailable'));
    const event = makeWaitEvent();
    listeners.get('activate')!(event);
    await expect(event.done()).rejects.toThrow('cache unavailable');
    expect(self.clients.claim).not.toHaveBeenCalled();
  });

  it('validates source URLs when update messages omit origin', async () => {
    const { listeners, self } = await loadServiceWorker();
    const message = listeners.get('message')!;
    for (const url of ['not a URL', 'https://evil.example/page']) {
      message({ data: { type: 'SKIP_WAITING' }, source: { url } });
    }
    message({ data: { type: 'SKIP_WAITING' } });
    expect(self.skipWaiting).not.toHaveBeenCalled();
    message({ data: { type: 'SKIP_WAITING' }, source: { url: 'https://preview.getbased.health/app' } });
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });

  it('uses plain versioned cache names on production hosts', async () => {
    const { caches, listeners } = await loadServiceWorker({ hostname: 'app.getbased.health' });
    const install = makeWaitEvent();
    listeners.get('install')!(install);
    await install.done();

    expect(caches.open).toHaveBeenCalledWith('labcharts-v9.9.9');
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/commit', { cache: 'no-store' });
  });

  it('only skips waiting after an explicit update message', async () => {
    const { listeners, self } = await loadServiceWorker();

    expect(listeners.has('message')).toBe(true);
    listeners.get('message')!({ data: { type: 'NOOP' }, origin: 'https://preview.getbased.health' });
    expect(self.skipWaiting).not.toHaveBeenCalled();

    listeners.get('message')!({ data: { type: 'SKIP_WAITING' }, origin: 'https://evil.example' });
    expect(self.skipWaiting).not.toHaveBeenCalled();

    listeners.get('message')!({ data: { type: 'SKIP_WAITING' }, origin: 'https://preview.getbased.health' });
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

// Failed precaches must report useful diagnostics even for non-Error rejections.
it.each([['offline string', 'offline string'], [null, 'network error']] as const)('reports a precache rejection %j without losing the failed URL', async (failure, detail) => {
  const fetchImpl = vi.fn(async (request: string | Request) => {
    const href = typeof request === 'string' ? request : request.url;
    if (href === '/api/commit') return jsonResponse({ sha: 'deadbeefcafebabe' });
    if (href === '/js/main.js') throw failure;
    return new Response('asset');
  });
  const {listeners, matches} = await loadServiceWorker({fetchImpl});
  const event = makeWaitEvent();
  listeners.get('install')!(event);
  await expect(event.done()).rejects.toThrow(`Failed to precache /js/main.js: ${detail}`);
  const failureError: unknown = await event.done().catch((error: unknown) => error);
  expect(failureError).toBeInstanceOf(Error);
  expect((failureError as Error).stack).toContain(new URL('../service-worker-runtime.js', import.meta.url).href);
  expect(fetchImpl.mock.calls.filter(([request]) => request === '/js/main.js')).toHaveLength(3);
  expect(matches.has('/styles.css')).toBe(true);
});
