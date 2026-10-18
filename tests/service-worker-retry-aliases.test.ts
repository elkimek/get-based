import {createHash} from 'node:crypto';
import {afterEach, expect, it, vi} from 'vitest';
import {executeClassicServiceWorker} from './helpers/classic-service-worker.js';
const origin = 'https://getbased.test';
const buildA = 'a'.repeat(64), buildB = 'b'.repeat(64);
const canonical = '/js/bundle-feature-ABC123.js', alias = canonical + '?lazy-retry=1';
const body = 'export const syntheticValue=1;';
const hash = createHash('sha256').update(body).digest('hex');
const proofHeader = 'x-getbased-retry-proof';
type Client = {id: string; url: string; postMessage: ReturnType<typeof vi.fn>};
type Event = {waitUntil(promise: Promise<unknown>): void; [key: string]: unknown};
type Listener = (event: Event) => void;

type Stores = Map<string, Map<string, Response>>;
interface FixtureOptions {
  buildId?: string; aliases?: Record<string, string>; clients?: Client[];
  stores?: Stores; appShell?: string[];
}
function fixture({buildId = buildA, aliases = {[canonical]: hash}, clients = [],
  stores = new Map<string, Map<string, Response>>(), appShell = ['/index.html', canonical]}: FixtureOptions = {}) {
  const listeners = new Map<string, Listener>();
  const key = (request: string | Request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const storage = {
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return {match: async (request: string | Request) => entries.get(key(request))?.clone(),
        put: async (request: string | Request, response: Response) => { entries.set(key(request), response); }};
    }),
  };
  const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
    const url = new URL(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url, origin);
    return url.pathname === '/version.js' ? new Response("self.APP_BUILD_ID = '" + buildId + "';")
      : new Response(body, {status: 200, statusText: 'OK', headers: {'Content-Type': 'text/javascript', 'X-Original': 'preserve'}});
  });
  vi.stubGlobal('caches', storage);
  vi.stubGlobal('fetch', fetchImpl);
  const scope = {location: {origin, hostname: 'getbased.test'}, clients: {
    matchAll: vi.fn(async () => clients), claim: vi.fn(async () => {}),
  }, skipWaiting: vi.fn(), addEventListener: (name: string, handler: Listener) => listeners.set(name, handler)};
  executeClassicServiceWorker(scope, () => {});
  const api: unknown = Reflect.get(scope, 'GetBasedServiceWorkerRuntime');
  if (!api || typeof api !== 'object' || !('install' in api) || typeof api.install !== 'function') throw Error('Missing actual classic runtime');
  api.install({scope, buildId, appShell, isProduction: true,
    retryChunkAliases: aliases, resolveCacheName: async () => 'labcharts-vbuild-' + buildId,
    shouldUseNetworkOnly: () => false});
  async function invoke(name: string, values: Record<string, unknown> = {}) {
    const work: Promise<unknown>[] = [];
    const listener = listeners.get(name);
    if (!listener) throw Error('Missing actual listener');
    listener({...values, waitUntil: promise => work.push(promise)});
    await Promise.all(work);
  }
  return {stores, storage, fetchImpl, install: () => invoke('install'), activate: () => invoke('activate'),
    report: (client: Client, reported: string) => invoke('message', {origin, source: client,
      data: {type: 'CLIENT_BUILD_ID', buildId: reported}}),
    async request(url: string, clientId = '', init: RequestInit = {}): Promise<Response | null> {
      let response: Promise<Response> | null = null;
      const work: Promise<unknown>[] = [];
      const listener = listeners.get('fetch');
      if (!listener) throw Error('Missing actual fetch listener');
      listener({clientId, request: new Request(new URL(url, origin), init),
        waitUntil: pending => work.push(pending),
        respondWith: (pending: Promise<Response>) => { response = pending; }});
      const result = await response;
      await Promise.all(work);
      return result;
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

it('annotates only declared exact bodies without changing status/headers or adding cache resources', async () => {
  const f = fixture();
  await f.install();
  const entries = f.stores.get('labcharts-vbuild-' + buildA)!;
  expect([...entries.keys()].sort()).toEqual([origin + '/index.html', origin + canonical].sort());
  const cached = entries.get(origin + canonical)!;
  expect(await cached.clone().text()).toBe(body);
  expect(cached.status).toBe(200);
  expect(cached.statusText).toBe('OK');
  expect([...cached.headers].filter(([name]) => name !== proofHeader)).toEqual([
    ['content-type', 'text/javascript'], ['x-original', 'preserve'],
  ]);
  expect(JSON.parse(cached.headers.get(proofHeader)!)).toEqual({v: 1, build: buildA, canonical, sha256: hash});
  f.fetchImpl.mockRejectedValue(new Error('offline'));
  const response = await f.request(alias);
  expect(response).toBeInstanceOf(Response);
  expect(await response!.text()).toBe(body);
  expect(response!.url).toBe('');
  expect([...entries.keys()]).not.toContain(origin + alias);
});

it('keeps an older selected build proof usable when the new worker declares no aliases', async () => {
  const oldClient: Client = {id: 'old', url: origin + '/app', postMessage: vi.fn()};
  const f = fixture({buildId: buildB, aliases: {}, clients: [oldClient]});
  const oldCache = await f.storage.open('labcharts-vbuild-' + buildA);
  await oldCache.put(canonical, new Response(body, {headers: {[proofHeader]: JSON.stringify({v: 1,
    build: buildA, canonical, sha256: hash})}}));
  await f.activate();
  await f.report(oldClient, buildA);
  f.fetchImpl.mockRejectedValue(new Error('offline'));
  expect(await (await f.request(alias, oldClient.id))!.text()).toBe(body);
  expect(f.fetchImpl).not.toHaveBeenCalled();
  await expect(f.request(alias, 'unknown')).rejects.toThrow('offline');
});

it.each(['missing', 'wrong-build', 'wrong-path', 'wrong-hash', 'wrong-body'] as const)(
  'uses the original query request without caching on %s proof', async corruption => {
    const f = fixture();
    await f.install();
    const entries = f.stores.get('labcharts-vbuild-' + buildA)!;
    const proof = {v: 1, build: corruption === 'wrong-build' ? buildB : buildA,
      canonical: corruption === 'wrong-path' ? '/js/bundle-other-ABC.js' : canonical,
      sha256: corruption === 'wrong-hash' ? '0'.repeat(64) : hash};
    entries.set(origin + canonical, new Response(corruption === 'wrong-body' ? body + '/*wrong*/' : body,
      {headers: corruption === 'missing' ? {} : {[proofHeader]: JSON.stringify(proof)}}));
    f.fetchImpl.mockClear();
    f.fetchImpl.mockResolvedValue(new Response('network-query', {status: 200}));
    expect(await (await f.request(alias))!.text()).toBe('network-query');
    expect(f.fetchImpl).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({url: origin + alias}));
    expect([...entries.keys()]).not.toContain(origin + alias);
    const offline = new Error('exact original network failure');
    f.fetchImpl.mockRejectedValue(offline);
    await expect(f.request(alias)).rejects.toBe(offline);
    expect([...entries.keys()]).not.toContain(origin + alias);
  },
);

it('preserves ordinary other-query caching and leaves raw URLs, POST and other origins outside the new namespace', async () => {
  const f = fixture();
  await f.install();
  f.fetchImpl.mockClear();
  const ordinary = canonical + '?lazy-retry=2';
  expect(await (await f.request(ordinary))!.text()).toBe(body);
  expect(f.stores.get('labcharts-vbuild-' + buildA)!.has(origin + ordinary)).toBe(true);
  expect(await f.request(alias, '', {method: 'POST'})).toBeNull();
  expect(await f.request('https://outside.test' + alias)).toBeNull();
  expect(await (await f.request('/js/feature.js?lazy-retry=1'))!.text()).toBe(body);
  expect(f.stores.get('labcharts-vbuild-' + buildA)!.has(origin + '/js/feature.js?lazy-retry=1')).toBe(true);
});

it('revalidates a canonical network refill before preserving offline retry, ignoring forged server proof', async () => {
  const f = fixture();
  await f.install();
  const entries = f.stores.get('labcharts-vbuild-' + buildA)!;
  entries.delete(origin + canonical);
  f.fetchImpl.mockResolvedValue(new Response(body, {status: 200, statusText: 'Original', headers: {
    'Content-Type': 'text/javascript', 'X-Original': 'refilled', [proofHeader]: 'forged network value',
  }}));
  expect(await (await f.request(canonical))!.text()).toBe(body);
  const refilled = entries.get(origin + canonical)!;
  expect(await refilled.clone().text()).toBe(body);
  expect(refilled.statusText).toBe('Original');
  expect(refilled.headers.get('x-original')).toBe('refilled');
  expect(JSON.parse(refilled.headers.get(proofHeader)!)).toEqual({v: 1, build: buildA, canonical, sha256: hash});
  f.fetchImpl.mockRejectedValue(new Error('offline after verified refill'));
  expect(await (await f.request(alias))!.text()).toBe(body);
});

it('cannot retain proof after a canonical refill changes bytes, even with a forged matching old header', async () => {
  const f = fixture();
  await f.install();
  const entries = f.stores.get('labcharts-vbuild-' + buildA)!;
  const previousProof = entries.get(origin + canonical)!.headers.get(proofHeader)!;
  entries.delete(origin + canonical);
  f.fetchImpl.mockResolvedValue(new Response('different network bytes', {headers: {
    'Content-Type': 'text/javascript', 'X-Original': 'changed', [proofHeader]: previousProof,
  }}));
  expect(await (await f.request(canonical))!.text()).toBe('different network bytes');
  const cached = entries.get(origin + canonical)!;
  expect(await cached.clone().text()).toBe('different network bytes');
  expect(cached.headers.get('x-original')).toBe('changed');
  expect(cached.headers.has(proofHeader)).toBe(false);
  const offline = new Error('offline changed body');
  f.fetchImpl.mockRejectedValue(offline);
  await expect(f.request(alias)).rejects.toBe(offline);
  expect(entries.has(origin + alias)).toBe(false);
});

it('strips server proof on an unlisted install resource before any later retained-build lookup', async () => {
  const unlisted = '/js/bundle-unlisted-ABC.js';
  const oldClient: Client = {id: 'old', url: origin + '/app', postMessage: vi.fn()};
  const a = fixture({appShell: ['/index.html', canonical, unlisted], clients: [oldClient]});
  a.fetchImpl.mockImplementation(async request => {
    const url = new URL(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url, origin);
    if (url.pathname === '/version.js') return new Response("self.APP_BUILD_ID = '" + buildA + "';");
    return new Response(body, {headers: {'Content-Type': 'text/javascript', 'X-Original': 'untouched',
      [proofHeader]: JSON.stringify({v: 1, build: buildA, canonical: unlisted, sha256: hash})}});
  });
  await a.install();
  const oldEntries = a.stores.get('labcharts-vbuild-' + buildA)!;
  expect(oldEntries.get(origin + unlisted)!.headers.has(proofHeader)).toBe(false);
  expect(oldEntries.get(origin + unlisted)!.headers.get('x-original')).toBe('untouched');
  expect(await oldEntries.get(origin + unlisted)!.clone().text()).toBe(body);
  const b = fixture({buildId: buildB, aliases: {}, stores: a.stores, clients: [oldClient]});
  await b.activate();
  await b.report(oldClient, buildA);
  const offline = new Error('offline unlisted forged server proof');
  b.fetchImpl.mockRejectedValue(offline);
  expect(await (await b.request(alias, oldClient.id))!.text()).toBe(body);
  await expect(b.request(unlisted + '?lazy-retry=1', oldClient.id)).rejects.toBe(offline);
  expect(oldEntries.has(origin + unlisted + '?lazy-retry=1')).toBe(false);
});

it('also strips server proof from ordinary network cache insertions outside the declaration', async () => {
  const f = fixture();
  await f.install();
  const unlisted = '/js/bundle-ordinary-ABC.js';
  f.fetchImpl.mockResolvedValue(new Response(body, {headers: {'Content-Type': 'text/javascript',
    'X-Original': 'ordinary', [proofHeader]: JSON.stringify({v: 1, build: buildA, canonical: unlisted, sha256: hash})}}));
  expect(await (await f.request(unlisted))!.text()).toBe(body);
  const cached = f.stores.get('labcharts-vbuild-' + buildA)!.get(origin + unlisted)!;
  expect(cached.headers.has(proofHeader)).toBe(false);
  expect(cached.headers.get('x-original')).toBe('ordinary');
  f.fetchImpl.mockRejectedValue(new Error('offline ordinary unlisted'));
  await expect(f.request(unlisted + '?lazy-retry=1')).rejects.toThrow('offline ordinary unlisted');
});

it('rejects an install whose declared body hash disagrees and deletes its incomplete cache', async () => {
  const f = fixture({aliases: {[canonical]: '0'.repeat(64)}});
  await expect(f.install()).rejects.toThrow('Retry canonical body hash mismatch');
  expect(f.stores.has('labcharts-vbuild-' + buildA)).toBe(false);
});

it('does not scan another build or arbitrary cache when the selected proof is absent', async () => {
  const f = fixture();
  await f.install();
  const current = f.stores.get('labcharts-vbuild-' + buildA)!;
  const qualified = current.get(origin + canonical)!;
  const foreign = await f.storage.open('unrelated-user-cache');
  await foreign.put(canonical, qualified.clone());
  const otherBuild = await f.storage.open('labcharts-vbuild-' + buildB);
  await otherBuild.put(canonical, qualified.clone());
  current.delete(origin + canonical);
  const offline = new Error('offline selected cache missing');
  f.fetchImpl.mockRejectedValue(offline);
  await expect(f.request(alias)).rejects.toBe(offline);
});

it('leaves a successful query fallback uncached and retries after a non-success response', async () => {
  const f = fixture();
  await f.install();
  const unknown = '/js/bundle-unknown-ABC.js?lazy-retry=1';
  f.fetchImpl.mockClear();
  f.fetchImpl.mockResolvedValueOnce(new Response('not available', {status: 503}));
  f.fetchImpl.mockResolvedValueOnce(new Response('available', {status: 200}));
  expect((await f.request(unknown))!.status).toBe(503);
  expect(await (await f.request(unknown))!.text()).toBe('available');
  expect(f.fetchImpl).toHaveBeenCalledTimes(2);
  expect(f.fetchImpl.mock.calls.map(([request]) => typeof request === 'object' && 'url' in request ? request.url : String(request)))
    .toEqual([origin + unknown, origin + unknown]);
  expect(f.stores.get('labcharts-vbuild-' + buildA)!.has(origin + unknown)).toBe(false);
});

it('resumes exact annotated entries and strips unlisted cached proof without redownloading bodies', async () => {
  const unlisted = '/js/bundle-resumed-ABC.js';
  const f = fixture({appShell: ['/index.html', canonical, unlisted]});
  await f.install();
  const entries = f.stores.get('labcharts-vbuild-' + buildA)!;
  const originalProof = entries.get(origin + canonical)!.headers.get(proofHeader);
  entries.set(origin + unlisted, new Response(body, {headers: {'X-Original': 'resumed',
    [proofHeader]: JSON.stringify({v: 1, build: buildA, canonical: unlisted, sha256: hash})}}));
  f.fetchImpl.mockClear();
  await f.install();
  expect(f.fetchImpl).toHaveBeenCalledTimes(2);
  expect(f.fetchImpl.mock.calls.every(([request]) => String(request).startsWith('/version.js?update-check=1'))).toBe(true);
  expect(entries.get(origin + canonical)!.headers.get(proofHeader)).toBe(originalProof);
  expect(entries.get(origin + unlisted)!.headers.has(proofHeader)).toBe(false);
  expect(entries.get(origin + unlisted)!.headers.get('x-original')).toBe('resumed');
  expect(entries.size).toBe(3);
});

it('rejects a conflicting declared resume proof rather than trusting the cached header', async () => {
  const f = fixture();
  await f.install();
  f.stores.get('labcharts-vbuild-' + buildA)!.set(origin + canonical,
    new Response(body, {headers: {[proofHeader]: JSON.stringify({v: 1,
      build: buildA, canonical, sha256: '0'.repeat(64)})}}));
  await expect(f.install()).rejects.toThrow('Conflicting cached retry chunk proof');
  expect(f.stores.has('labcharts-vbuild-' + buildA)).toBe(false);
});

it.each([
  '/js/bundle-feature-ABC123.js?other=1',
  '/js/bundle-feature-ABC123.js?lazy-retry=1',
  '/js/source.js',
  '/js/bundle-missing-ABC.js',
])('rejects unqualified producer declaration %s', invalid => {
  expect(() => fixture({aliases: {[invalid]: hash}})).toThrow('Invalid build-proven retry chunk alias');
});
