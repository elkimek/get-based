import { afterEach, expect, it, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import { executeClassicServiceWorker } from './helpers/classic-service-worker.js';
const actualNetworkFetch = globalThis.fetch;

type Client = { id: string; url: string; postMessage: ReturnType<typeof vi.fn> };
type WaitEvent = { waitUntil: (promise: Promise<unknown>) => void };
type RuntimeListener = (event: WaitEvent & Record<string, unknown>) => void;
const origin = 'https://getbased.test';
const oldKey = 'labcharts-vbuild-a', currentKey = 'labcharts-vbuild-b';
interface FontRuntimeOptions {
  fontAliases?: Readonly<Record<string, string>>;
  sqliteAssetAliases?: Readonly<Record<string, string>>;
  origin?: string;
  appShell?: string[];
  buildId?: string;
  isProduction?: boolean;
}
function runtime(initialClients: Client[], options: FontRuntimeOptions = {}) {
  let clients = initialClients;
  const requestOrigin = options.origin ?? origin;
  const stores = new Map<string, Map<string, Response>>([[oldKey, new Map()], [currentKey, new Map()], ['transformers-cache', new Map()]]);
  const key = (request: Request | string) => { const url = new URL(typeof request === 'string' ? request : request.url, requestOrigin); return url.href; };
  const cacheStorage = {
    keys: vi.fn(async () => [...stores.keys()]), delete: vi.fn(async (name: string) => stores.delete(name)),
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return { match: async (request: Request | string) => entries.get(key(request))?.clone(),
        put: async (request: Request | string, response: Response) => { entries.set(key(request), response); } };
    }),
  };
  const listeners = new Map<string, RuntimeListener>();
  const scope = { APP_VERSION: 'test', location: { hostname: new URL(requestOrigin).hostname, origin: requestOrigin }, skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => clients), get: vi.fn(async (id: string) => clients.find(client => client.id === id)) },
    addEventListener: (type: string, callback: RuntimeListener) => listeners.set(type, callback) };
  vi.stubGlobal('caches', cacheStorage);
  const fetchImpl = vi.fn(async (_request: RequestInfo | URL) => new Response('fresh network'));
  vi.stubGlobal('fetch', fetchImpl);
  const restart = () => {
    executeClassicServiceWorker(scope, () => {});
    const api = Reflect.get(scope, 'GetBasedServiceWorkerRuntime') as { install(options: Record<string, unknown>): void };
    api.install({ scope, buildId: options.buildId ?? 'b', appShell: options.appShell ?? ['/app'],
      fontAliases: options.fontAliases, sqliteAssetAliases: options.sqliteAssetAliases, isProduction: options.isProduction ?? true,
      resolveCacheName: async () => currentKey, shouldUseNetworkOnly: () => false });
  };
  restart();
  const invoke = async (type: string, values: Record<string, unknown> = {}) => {
    const work: Promise<unknown>[] = [];
    listeners.get(type)!({ ...values, waitUntil: promise => work.push(promise) });
    await Promise.all(work);
  };
  return { stores, cacheStorage, scope, fetchImpl, restart, setClients: (next: Client[]) => { clients = next; },
    activate: () => invoke('activate'),
    skip: (requester: Client, messageOrigin = origin) => invoke('message', {origin: messageOrigin, source: requester, data: {type: 'SKIP_WAITING'}}),
    report: (client: Client, buildId: string, messageOrigin = origin) => invoke('message', { origin: messageOrigin, source: client, data: { type: 'CLIENT_BUILD_ID', buildId } }),
    async put(cache: string, url: string, body: string) { await (await cacheStorage.open(cache)).put(url, new Response(body)); },
    async fetch(url: string, options: RequestInit = {}, clientId = '', resultingClientId = '', navigation = false): Promise<Response | null> {
      const work: Promise<unknown>[] = []; let response: Promise<Response> | null = null;
      const request = new Request(new URL(url, requestOrigin), options);
      if (navigation) Object.defineProperty(request, 'mode', {value: 'navigate'});
      listeners.get('fetch')!({ clientId, resultingClientId, request, waitUntil: promise => work.push(promise),
        respondWith: (result: Promise<Response>) => { response = result; } });
      const result = await response; await Promise.all(work); return result;
    },
  };
}
const client = (id: string): Client => ({ id, url: origin + '/app', postMessage: vi.fn() });
async function expectUnavailableResponse(response: Response | null) {
  expect(response).not.toBeNull();
  expect(response!.status).toBe(503);
  expect(response!.headers.get('Cache-Control')).toBe('no-store');
  expect(await response!.text()).toBe('');
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('retains unknown legacy clients and their old immutable modules until the last old document leaves', async () => {
  const legacy = client('legacy'), current = client('current'); const worker = runtime([legacy, current]);
  await worker.put(oldKey, '/js/bundle-old-ABC.js', 'old module');
  await worker.put(oldKey, '/_app/immutable/chunks/ABC.js', 'old Kit module');
  await worker.activate(); expect(worker.scope.clients.claim).toHaveBeenCalled();
  expect(legacy.postMessage).toHaveBeenCalledWith({ type: 'REQUEST_CLIENT_BUILD_ID' });
  await worker.report(current, 'b'); expect(worker.stores.has(oldKey)).toBe(true);
  expect(await (await worker.fetch('/js/bundle-old-ABC.js'))!.text()).toBe('old module');
  expect(await (await worker.fetch('/_app/immutable/chunks/ABC.js'))!.text()).toBe('old Kit module');
  await worker.report(legacy, 'a'); expect(worker.stores.has(oldKey)).toBe(true);
  worker.setClients([current]); await worker.report(current, 'b');
  expect(worker.stores.has(oldKey)).toBe(false); expect(worker.stores.has(currentKey)).toBe(true);
  expect(worker.stores.has('transformers-cache')).toBe(true);
});

it('does not fall back to old mutable CSS or JSON and never intercepts API or cross-origin requests', async () => {
  const worker = runtime([client('legacy')]); await worker.activate();
  await worker.put(oldKey, '/css/settings.css', 'old mutable CSS'); await worker.put(oldKey, '/data/value.json', 'old JSON');
  await expectUnavailableResponse(await worker.fetch('/css/settings.css'));
  expect(await (await worker.fetch('/data/value.json'))!.text()).toBe('fresh network');
  expect(await worker.fetch('/api/private')).toBeNull();
  expect(await worker.fetch('https://outside.test/js/bundle-old-ABC.js')).toBeNull();
});

it('fails safe after worker restart and rejects foreign or invalid client build reports', async () => {
  const current = client('current'); const worker = runtime([current]);
  await worker.put(oldKey, '/js/bundle-old-ABC.js', 'old module'); await worker.activate();
  await worker.report(current, 'b', 'https://outside.test'); await worker.report(current, '../../invalid');
  expect(worker.stores.has(oldKey)).toBe(true);
  worker.restart(); await worker.activate(); expect(worker.stores.has(oldKey)).toBe(true);
  expect(await (await worker.fetch('/js/bundle-old-ABC.js'))!.text()).toBe('old module');
  await worker.report(current, 'b'); expect(worker.stores.has(oldKey)).toBe(false);
});

it('never retires caches prepared by a future installing or waiting worker', async () => {
  const current = client('current'); const worker = runtime([current]);
  const waiting = 'labcharts-vbuild-c';
  await worker.activate(); await worker.put(waiting, '/app', 'pending build');
  await worker.report(current, 'b');
  expect(worker.stores.has(oldKey)).toBe(false); expect(worker.stores.has(waiting)).toBe(true);
  worker.restart(); await worker.report(current, 'b');
  await worker.fetch('/css/settings.css');
  expect(worker.stores.has(waiting)).toBe(true);
});

const aliasFont = '/vendor/fonts/inter-700.woff2';
const canonicalFont = '/vendor/fonts/inter-400.woff2';
const aliasOptions = {fontAliases: {[aliasFont]: canonicalFont}, appShell: ['/app', canonicalFont]};
it('serves a legacy font alias offline from proven current canonical bytes without copying entries or reading old fonts', async () => {
  const worker = runtime([client('legacy')], aliasOptions);
  await worker.put(currentKey, canonicalFont, 'current proven font');
  await worker.put(oldKey, aliasFont, 'different old font');
  await worker.activate();
  worker.fetchImpl.mockRejectedValue(new Error('offline'));
  expect(await (await worker.fetch(aliasFont))!.text()).toBe('current proven font');
  expect(worker.fetchImpl).not.toHaveBeenCalled();
  expect(worker.stores.get(currentKey)!.size).toBe(1);
  worker.restart();
  expect(await (await worker.fetch(aliasFont))!.text()).toBe('current proven font');
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});
it('never widens a font alias to unknown paths, queries, mutable assets, non-GET or cross-origin traffic', async () => {
  const worker = runtime([client('legacy')], aliasOptions);
  await worker.put(currentKey, canonicalFont, 'current proven font'); await worker.activate();
  for (const url of ['/vendor/fonts/unknown.woff2', aliasFont + '?other=1', aliasFont + '#other', '/css/settings.css']) {
    if (url === '/css/settings.css') await expectUnavailableResponse(await worker.fetch(url));
    else {
      expect(await (await worker.fetch(url))!.text()).toBe('fresh network');
      expect(worker.fetchImpl.mock.calls.at(-1)?.[0]).toMatchObject({url: new URL(url, origin).href});
    }
  }
  const before = worker.fetchImpl.mock.calls.length;
  expect(await worker.fetch(aliasFont, {method: 'POST'})).toBeNull();
  expect(await worker.fetch('https://outside.test' + aliasFont)).toBeNull();
  expect(worker.fetchImpl).toHaveBeenCalledTimes(before);
});
it('does not fall back to an old font cache or rewrite network requests when a verified canonical entry is unavailable', async () => {
  const worker = runtime([client('legacy')], aliasOptions); await worker.activate();
  await worker.put(oldKey, aliasFont, 'old alias'); await worker.put(oldKey, canonicalFont, 'old canonical');
  const offline = new Error('offline'); worker.fetchImpl.mockRejectedValue(offline);
  await expect(worker.fetch(aliasFont)).rejects.toBe(offline);
  expect(worker.fetchImpl.mock.calls[0]?.[0]).toMatchObject({url: origin + aliasFont});
});
it('keeps native/default workers free of font alias behavior and snapshots the production map', async () => {
  const native = runtime([], {buildId: ''});
  await native.put(currentKey, canonicalFont, 'current font');
  expect(await (await native.fetch(aliasFont))!.text()).toBe('fresh network');
  const aliases: Record<string, string> = {[aliasFont]: canonicalFont};
  const worker = runtime([], {...aliasOptions, fontAliases: aliases});
  await worker.put(currentKey, canonicalFont, 'verified original');
  aliases['/vendor/fonts/unknown.woff2'] = canonicalFont;
  expect(await (await worker.fetch('/vendor/fonts/unknown.woff2'))!.text()).toBe('fresh network');
  expect(await (await worker.fetch(aliasFont))!.text()).toBe('verified original');
});
it.each([
  {fontAliases: {[aliasFont]: '/vendor/fonts/missing.woff2'}},
  {fontAliases: {[aliasFont + '?x=1']: canonicalFont}},
  {fontAliases: {[aliasFont]: canonicalFont + '#hash'}},
  {fontAliases: {'/vendor/fonts/%69nter-700.woff2': canonicalFont}},
  {fontAliases: {'/css/settings.css': canonicalFont}},
  {fontAliases: {[aliasFont]: 'https://outside.test/font.woff2'}},
  {fontAliases: {[canonicalFont]: canonicalFont}},
  {appShell: ['/app', canonicalFont, aliasFont]},
  {buildId: ''},
  {isProduction: false},
])('rejects unproven or non-production alias configuration: %j', invalid => {
  expect(() => runtime([], {...aliasOptions, ...invalid})).toThrow('Invalid build-proven font alias');
});

it('keeps an old module and fetch lifetime intact while an activation census and current-client report overlap', async () => {
  const legacy = client('legacy'), current = client('current'), worker = runtime([legacy, current]);
  await worker.put(oldKey, '/js/bundle-old-ABC.js', 'old graph bytes'); worker.cacheStorage.open.mockClear();
  let releaseCensus: (clients: Client[]) => void = () => {throw Error('Census gate was not initialized');};
  const census = new Promise<Client[]>(resolve => {releaseCensus = resolve;});
  worker.scope.clients.matchAll.mockImplementationOnce(() => census);
  const activation = worker.activate();
  await vi.waitFor(() => expect(worker.scope.clients.matchAll).toHaveBeenCalledOnce());
  const reported = worker.report(current, 'b'); let settled = false;
  const lookup = worker.fetch('/js/bundle-old-ABC.js').then(response => {settled = true; return response;});
  try {
    await vi.waitFor(() => expect(worker.cacheStorage.open).toHaveBeenCalledWith(oldKey));
    expect(settled).toBe(false); expect(worker.cacheStorage.delete).not.toHaveBeenCalled();
    expect(worker.scope.clients.matchAll).toHaveBeenCalledOnce();
  } finally {releaseCensus([legacy, current]); await Promise.all([activation, reported, lookup]);}
  expect(await (await lookup)!.text()).toBe('old graph bytes'); expect(worker.fetchImpl).not.toHaveBeenCalled();
  expect(worker.stores.has(oldKey)).toBe(true); expect(legacy.postMessage).toHaveBeenCalledWith({type: 'REQUEST_CLIENT_BUILD_ID'});
  worker.setClients([current]); await worker.report(current, 'b');
  expect(worker.stores.has(oldKey)).toBe(false); expect(worker.stores.has(currentKey)).toBe(true);
  expect(worker.stores.has('transformers-cache')).toBe(true);
});

const sqliteNames = [
  'sqlite3-bundler-friendly.mjs', 'sqlite3.wasm',
  'sqlite3-opfs-async-proxy.js', 'sqlite3-worker1-bundler-friendly.mjs',
];
const sqliteAliases = Object.fromEntries(sqliteNames.map(file => [
  '/vendor/evolu8/' + file, '/vendor/evolu/' + file,
]));
const sqliteShell = ['/app', ...Object.values(sqliteAliases)];
const sqliteOptions = { sqliteAssetAliases: sqliteAliases, appShell: sqliteShell };

it('returns a fresh URL-free SQLite alias Response with exact bytes, MIME/security headers and status, retaining canonical response identity', async () => {
  const canonical = '/vendor/evolu/sqlite3-bundler-friendly.mjs';
  const alias = '/vendor/evolu8/sqlite3-bundler-friendly.mjs';
  const body = 'export const syntheticSqlite = "complete payload";';
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/javascript',
      'Content-Length': Buffer.byteLength(body),
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected isolated loopback server');
    const networkOrigin = 'http://127.0.0.1:' + address.port;
    const original = await actualNetworkFetch(networkOrigin + canonical);
    expect(original.url).toBe(networkOrigin + canonical);
    const worker = runtime([], { ...sqliteOptions, origin: networkOrigin });
    worker.stores.get(currentKey)!.set(networkOrigin + canonical, original);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = (await worker.fetch(alias))!;
      expect(response.url).toBe('');
      expect(response.status).toBe(original.status);
      expect(response.statusText).toBe(original.statusText);
      expect([...response.headers]).toEqual([...original.headers]);
      expect(await response.text()).toBe(body);
    }
    expect((await worker.fetch(canonical))!.url).toBe(networkOrigin + canonical);
    expect(worker.fetchImpl).not.toHaveBeenCalled();
    expect([...worker.stores.get(currentKey)!.keys()]).toEqual([networkOrigin + canonical]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

it.each(sqliteNames)('serves only the current complete canonical SQLite entry for %s without copying alias cache keys', async file => {
  const worker = runtime([client('legacy')], sqliteOptions);
  const alias = '/vendor/evolu8/' + file;
  const canonical = '/vendor/evolu/' + file;
  await worker.put(oldKey, alias, 'old alias');
  await worker.put(oldKey, canonical, 'old canonical');
  await worker.put(currentKey, canonical, 'complete current ' + file);
  expect(await (await worker.fetch(alias))!.text()).toBe('complete current ' + file);
  expect(worker.fetchImpl).not.toHaveBeenCalled();
  expect(worker.stores.get(currentKey)!.has(origin + alias)).toBe(false);
});

it('never routes SQLite aliases for queries, hashes, cross-origin or non-GET requests and never broadens to unknown JS/worker names', async () => {
  const worker = runtime([], sqliteOptions);
  const alias = '/vendor/evolu8/sqlite3.wasm';
  await worker.put(currentKey, '/vendor/evolu/sqlite3.wasm', 'canonical');
  for (const url of [
    alias + '?foreign=1', alias + '#foreign', '/vendor/evolu8/v8.24.1-web3.6.5/Db.worker.js',
    '/vendor/evolu8/v8.24.1-web3.6.5/Shared.worker.js', '/vendor/evolu8/unqualified.js', '/vendor/evolu8/%73qlite3.wasm',
  ]) {
    expect(await (await worker.fetch(url))!.text()).toBe('fresh network');
  }
  expect(await worker.fetch(alias, { method: 'POST' })).toBeNull();
  expect(await worker.fetch('https://outside.test' + alias)).toBeNull();
});

it('fails offline when a current canonical SQLite entry is absent and never substitutes old-cache vendor bytes', async () => {
  const worker = runtime([client('legacy')], sqliteOptions);
  const alias = '/vendor/evolu8/sqlite3.wasm';
  await worker.activate();
  await worker.put(oldKey, alias, 'old alias');
  await worker.put(oldKey, '/vendor/evolu/sqlite3.wasm', 'old canonical');
  const offline = new Error('offline');
  worker.fetchImpl.mockRejectedValueOnce(offline);
  await expect(worker.fetch(alias)).rejects.toBe(offline);
  expect(worker.fetchImpl.mock.calls[0]?.[0]).toMatchObject({ url: origin + alias });
});

it.each([206, 404, 500])('never substitutes a cached non-complete SQLite response with status %s', async status => {
  const worker = runtime([], sqliteOptions);
  worker.stores.get(currentKey)!.set(origin + '/vendor/evolu/sqlite3.wasm', new Response('not a complete file', { status }));
  expect(await (await worker.fetch('/vendor/evolu8/sqlite3.wasm'))!.text()).toBe('fresh network');
  expect(worker.fetchImpl).toHaveBeenCalledOnce();
});

it('keeps raw/default workers free of SQLite aliases and snapshots the qualified production map', async () => {
  const raw = runtime([]);
  await raw.put(currentKey, '/vendor/evolu/sqlite3.wasm', 'canonical');
  expect(await (await raw.fetch('/vendor/evolu8/sqlite3.wasm'))!.text()).toBe('fresh network');
  const mutable = { ...sqliteAliases };
  const worker = runtime([], { ...sqliteOptions, sqliteAssetAliases: mutable });
  mutable['/vendor/evolu8/sqlite3.wasm'] = '/vendor/evolu/foreign.wasm';
  await worker.put(currentKey, '/vendor/evolu/sqlite3.wasm', 'original qualified payload');
  expect(await (await worker.fetch('/vendor/evolu8/sqlite3.wasm'))!.text()).toBe('original qualified payload');
});

it.each(['evolu-bundle.js', 'Db.worker.js', 'Shared.worker.js'])(
  'serves the exact previous %s offline from its retained build without copying it into the new precache', async file => {
    const worker = runtime([client('legacy')]);
    const url = '/vendor/evolu8/' + file;
    const bytes = await fs.readFile(new URL('../vendor/evolu8/' + file, import.meta.url));
    worker.stores.get(oldKey)!.set(origin + url, new Response(bytes, {headers: {'Content-Type': 'text/javascript', 'X-Content-Type-Options': 'nosniff'}}));
    await worker.put(currentKey, '/vendor/evolu8/v8.24.1-web3.6.5/' + file, 'different current runtime');
    const response = (await worker.fetch(url))!;
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('Content-Type')).toBe('text/javascript');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(worker.fetchImpl).not.toHaveBeenCalled();
    expect(worker.stores.get(currentKey)!.has(origin + url)).toBe(false);
  },
);

it('rejects corrupted, incomplete and substituted previous runtime bodies in every cache and on the network', async () => {
  for (const status of [200, 206, 404, 500]) {
    const worker = runtime([client('legacy')]); const url = '/vendor/evolu8/Db.worker.js';
    worker.stores.get(oldKey)!.set(origin + url, new Response('corrupted previous worker', {status}));
    await worker.put(currentKey, url, 'wrong current cache body');
    worker.fetchImpl.mockResolvedValueOnce(new Response('substituted network worker'));
    await expectUnavailableResponse(await worker.fetch(url));
    expect(worker.fetchImpl).toHaveBeenCalledOnce();
  }
});

it('qualifies a previous runtime network response without adding it to the current cache', async () => {
  const worker = runtime([]); const url = '/vendor/evolu8/evolu-bundle.js';
  const bytes = await fs.readFile(new URL('../vendor/evolu8/evolu-bundle.js', import.meta.url));
  worker.fetchImpl.mockResolvedValueOnce(new Response(bytes));
  expect(Buffer.from(await (await worker.fetch(url))!.arrayBuffer())).toEqual(bytes);
  expect(worker.stores.get(currentKey)!.has(origin + url)).toBe(false);
});

it('never substitutes legacy SQLite for the current versioned WASM, including offline misses', async () => {
  const worker = runtime([client('legacy')], sqliteOptions); const url = '/vendor/evolu8/v8.24.1-web3.6.5/sqlite3.wasm';
  await worker.put(currentKey, '/vendor/evolu/sqlite3.wasm', 'legacy SQLite');
  await worker.put(oldKey, url, 'foreign old-cache SQLite');
  await worker.put(currentKey, url, 'current SQLite');
  expect(await (await worker.fetch(url))!.text()).toBe('current SQLite');
  worker.stores.get(currentKey)!.delete(origin + url);
  const offline = new Error('offline'); worker.fetchImpl.mockRejectedValueOnce(offline);
  await expect(worker.fetch(url)).rejects.toBe(offline);
});

it.each([
  { sqliteAssetAliases: { '/vendor/evolu8/sqlite3.wasm': '/vendor/evolu/sqlite3.wasm' } },
  { sqliteAssetAliases: { ...sqliteAliases, '/vendor/evolu8/unqualified.js': '/vendor/evolu/unqualified.js' } },
  { sqliteAssetAliases: { ...sqliteAliases, '/vendor/evolu8/sqlite3.wasm': '/vendor/evolu/sqlite3.wasm?foreign=1' } },
  { sqliteAssetAliases: { ...sqliteAliases, '/vendor/evolu8/sqlite3.wasm': 'https://outside.test/sqlite3.wasm' } },
  { appShell: sqliteShell.filter(url => url !== '/vendor/evolu/sqlite3.wasm') },
  { appShell: [...sqliteShell, '/vendor/evolu8/sqlite3.wasm'] },
  { appShell: [...sqliteShell, '/vendor/evolu/sqlite3.wasm'] },
  { buildId: '' },
  { isProduction: false },
])('rejects an unqualified, incomplete, cross-origin or non-production SQLite alias contract: %j', invalid => {
  expect(() => runtime([], { ...sqliteOptions, ...invalid })).toThrow('Invalid build-proven SQLite asset aliases');
});


it('selects exact retained document stylesheet bytes and headers before the current build', async () => {
  const old = client('old'), current = client('current');
  const worker = runtime([old, current]);
  const stylesheet = '/css/light-setup.css';
  const oldResponse = new Response('.old-component {font-size:11px}', {headers: {
    'Content-Type': 'text/css', 'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin', 'X-Synthetic-Build': 'a',
  }});
  worker.stores.get(oldKey)!.set(origin + stylesheet, oldResponse);
  await worker.put(currentKey, stylesheet, '.new-component {font-size:11px}');
  await worker.put('transformers-cache', stylesheet, 'unrelated cache');
  await worker.activate(); await worker.report(old, 'a'); await worker.report(current, 'b');
  const oldResult = (await worker.fetch(stylesheet, {}, old.id))!;
  expect(oldResult.status).toBe(200);
  expect([...oldResult.headers]).toEqual([...oldResponse.headers]);
  expect(await oldResult.text()).toBe('.old-component {font-size:11px}');
  expect(await (await worker.fetch(stylesheet, {}, current.id))!.text()).toBe('.new-component {font-size:11px}');
  await expectUnavailableResponse(await worker.fetch(stylesheet));
  expect(worker.fetchImpl).not.toHaveBeenCalled();
  expect(worker.stores.get(oldKey)!.size).toBe(1);
  expect(worker.stores.get(currentKey)!.size).toBe(1);
});

it.each(['/styles.css', '/themes-extra.css', '/css/settings.css'])('keeps maintained stylesheet %s owned by its requesting old document', async stylesheet => {
  const old = client('old'), worker = runtime([old]);
  await worker.put(oldKey, stylesheet, 'old stylesheet');
  await worker.put(currentKey, stylesheet, 'new stylesheet');
  await worker.report(old, 'a');
  expect(await (await worker.fetch(stylesheet, {}, old.id))!.text()).toBe('old stylesheet');
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});

it.each([206, 404, 500])('never substitutes an incomplete retained stylesheet response with status %s', async status => {
  const old = client('old'), worker = runtime([old]);
  worker.stores.get(oldKey)!.set(origin + '/css/light-setup.css', new Response('incomplete old', {status}));
  await worker.put(currentKey, '/css/light-setup.css', 'complete current');
  await worker.report(old, 'a');
  await expectUnavailableResponse(await worker.fetch('/css/light-setup.css', {}, old.id));
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});

it('does not create a missing claimed cache or substitute another retained build for a missing stylesheet', async () => {
  const old = client('old'), worker = runtime([old]);
  await worker.put(oldKey, '/css/light-setup.css', 'unrelated retained stylesheet');
  await worker.put(currentKey, '/css/light-setup.css', 'current stylesheet');
  await worker.report(old, 'missing'); worker.cacheStorage.open.mockClear();
  await expectUnavailableResponse(await worker.fetch('/css/light-setup.css', {}, old.id));
  expect(worker.cacheStorage.open).not.toHaveBeenCalledWith('labcharts-vbuild-missing');
  expect(worker.cacheStorage.open).not.toHaveBeenCalledWith(oldKey);
  expect(worker.stores.has('labcharts-vbuild-missing')).toBe(false);
  await worker.report(old, 'a'); worker.stores.get(oldKey)!.clear();
  await worker.put('labcharts-vbuild-c', '/css/light-setup.css', 'different build');
  worker.cacheStorage.open.mockClear();
  await expectUnavailableResponse(await worker.fetch('/css/light-setup.css', {}, old.id));
  expect(worker.cacheStorage.open).not.toHaveBeenCalledWith('labcharts-vbuild-c');
});

it('keeps queries, hashes, other mutable resources and live traffic outside old-document stylesheet routing', async () => {
  const old = client('old'), worker = runtime([old]);
  const resources = ['/css/settings.css?different=1', '/css/settings.css#different', '/data/value.json',
    '/vendor/foreign.css', '/css/not-a-stylesheet.js'];
  for (const resource of resources) {
    await worker.put(oldKey, resource, 'old ' + resource);
    await worker.put(currentKey, resource, 'current ' + resource);
  }
  await worker.report(old, 'a');
  for (const resource of resources) expect(await (await worker.fetch(resource, {}, old.id))!.text()).toBe('current ' + resource);
  expect(await worker.fetch('/api/private.css', {}, old.id)).toBeNull();
  expect(await worker.fetch('https://outside.test/css/settings.css', {}, old.id)).toBeNull();
  expect(await worker.fetch('/css/settings.css', {method: 'POST'}, old.id)).toBeNull();
  expect(worker.scope.clients.get).not.toHaveBeenCalled();
});

it('recovers document ownership on the first stylesheet request after worker restart without another activation', async () => {
  const old = client('old'), worker = runtime([old]);
  await worker.put(oldKey, '/css/light-setup.css', 'old complete stylesheet');
  await worker.put(currentKey, '/css/light-setup.css', 'new complete stylesheet');
  await worker.activate(); await worker.report(old, 'a'); worker.restart();
  old.postMessage.mockImplementation(message => {
    expect(message).toEqual({type: 'REQUEST_CLIENT_BUILD_ID'});
    void worker.report(old, 'a');
  });
  old.postMessage.mockClear();
  expect(await (await worker.fetch('/css/light-setup.css', {}, old.id))!.text()).toBe('old complete stylesheet');
  expect(old.postMessage).toHaveBeenCalledOnce();
  expect(worker.scope.clients.get).toHaveBeenCalledWith(old.id);
  expect(worker.stores.has(oldKey)).toBe(true);
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});

it('coalesces concurrent stylesheet ownership requests and clears their deadline after a valid report', async () => {
  vi.useFakeTimers();
  const scheduled = vi.spyOn(globalThis, 'setTimeout'), cancelled = vi.spyOn(globalThis, 'clearTimeout');
  const old = client('old'), worker = runtime([old]);
  for (const file of ['/css/light-setup.css', '/themes-extra.css']) {
    await worker.put(oldKey, file, 'old ' + file); await worker.put(currentKey, file, 'new ' + file);
  }
  let settled = 0;
  const first = worker.fetch('/css/light-setup.css', {}, old.id).then(response => {settled++; return response;});
  const second = worker.fetch('/themes-extra.css', {}, old.id).then(response => {settled++; return response;});
  await vi.advanceTimersByTimeAsync(0); expect(old.postMessage).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1999); expect(settled).toBe(0);
  expect(scheduled.mock.calls.filter(call => call[1] === 2000)).toHaveLength(1);
  const deadline = scheduled.mock.results[scheduled.mock.calls.findIndex(call => call[1] === 2000)];
  if (!deadline || deadline.type !== 'return') throw new Error('Expected one real ownership deadline');
  await worker.report(old, 'a');
  expect(await (await first)!.text()).toBe('old /css/light-setup.css');
  expect(await (await second)!.text()).toBe('old /themes-extra.css');
  expect(settled).toBe(2);
  expect(cancelled).toHaveBeenCalledWith(deadline.value);
});

it('bounds unknown legacy-document waiting and accepts a later valid report for subsequent requests', async () => {
  vi.useFakeTimers();
  const old = client('old'), worker = runtime([old]);
  await worker.put(oldKey, '/css/light-setup.css', 'old stylesheet');
  await worker.put(currentKey, '/css/light-setup.css', 'new stylesheet');
  let settled = false;
  const first = worker.fetch('/css/light-setup.css', {}, old.id).then(response => {settled = true; return response;});
  await vi.advanceTimersByTimeAsync(0); expect(old.postMessage).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1999); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await expectUnavailableResponse(await first);
  expect(vi.getTimerCount()).toBe(0);
  await worker.report(old, 'a');
  expect(await (await worker.fetch('/css/light-setup.css', {}, old.id))!.text()).toBe('old stylesheet');
  expect(old.postMessage).toHaveBeenCalledOnce();
});

it('rejects invalid or foreign ownership reports while a stylesheet lookup awaits a genuine client response', async () => {
  vi.useFakeTimers();
  const old = client('old'), worker = runtime([old]);
  await worker.put(oldKey, '/css/light-setup.css', 'old stylesheet');
  await worker.put(currentKey, '/css/light-setup.css', 'new stylesheet');
  let settled = false;
  const response = worker.fetch('/css/light-setup.css', {}, old.id).then(value => {settled = true; return value;});
  await vi.advanceTimersByTimeAsync(0); expect(old.postMessage).toHaveBeenCalledOnce();
  await worker.report(old, 'a', 'https://outside.test'); await worker.report(old, '../../a');
  expect(settled).toBe(false); expect(vi.getTimerCount()).toBe(1);
  await worker.report(old, 'a');
  expect(await (await response)!.text()).toBe('old stylesheet');
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['missing-client', 'lookup-error', 'post-error', 'foreign-client'])('fails closed promptly when ownership handshake has %s', async mode => {
  vi.useFakeTimers();
  const old = client('old'), worker = runtime([old]);
  await worker.put(currentKey, '/css/light-setup.css', 'new stylesheet');
  if (mode === 'missing-client') worker.setClients([]);
  if (mode === 'lookup-error') worker.scope.clients.get.mockRejectedValueOnce(new Error('client unavailable'));
  if (mode === 'post-error') old.postMessage.mockImplementation(() => {throw new Error('client closed');});
  if (mode === 'foreign-client') old.url = 'https://outside.test/app';
  await expectUnavailableResponse(await worker.fetch('/css/light-setup.css', {}, old.id));
  expect(worker.fetchImpl).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not request client ownership when the current cache is the only app build', async () => {
  const old = client('old'), worker = runtime([old]); worker.stores.delete(oldKey);
  await worker.put(currentKey, '/css/light-setup.css', 'new stylesheet');
  expect(await (await worker.fetch('/css/light-setup.css', {}, old.id))!.text()).toBe('new stylesheet');
  expect(worker.scope.clients.get).not.toHaveBeenCalled();
  expect(old.postMessage).not.toHaveBeenCalled();
});


async function seedBuildVersions(worker: ReturnType<typeof runtime>) {
  await worker.put(oldKey, '/version.js', "self.APP_BUILD_ID = 'a';");
  await worker.put(currentKey, '/version.js', "self.APP_BUILD_ID = 'b';");
}
function replyToBuildProbe(worker: ReturnType<typeof runtime>, document: Client, id: string) {
  document.postMessage.mockImplementation(message => {
    if (message.type === 'REQUEST_CLIENT_BUILD_ID') void worker.report(document, id);
  });
}

it('requires fresh direct replies from every live document before production early activation', async () => {
  const old = client('old'), current = client('current'), worker = runtime([old, current]);
  await seedBuildVersions(worker);
  await worker.report(old, 'a'); await worker.report(current, 'b');
  replyToBuildProbe(worker, old, 'a'); replyToBuildProbe(worker, current, 'b');
  await worker.skip(current);
  expect(old.postMessage).toHaveBeenCalledWith({type: 'REQUEST_CLIENT_BUILD_ID'});
  expect(current.postMessage).toHaveBeenCalledWith({type: 'REQUEST_CLIENT_BUILD_ID'});
  expect(worker.scope.skipWaiting).toHaveBeenCalledOnce();
  expect(worker.scope.clients.matchAll).toHaveBeenCalledTimes(2);
});

it('coalesces simultaneous activation censuses but notifies each deferred requester', async () => {
  vi.useFakeTimers();
  const old = client('legacy'), first = client('first'), second = client('second');
  const worker = runtime([old, first, second]); await seedBuildVersions(worker);
  replyToBuildProbe(worker, first, 'b'); replyToBuildProbe(worker, second, 'b');
  const attempts = Promise.all([worker.skip(first), worker.skip(second)]);
  await vi.advanceTimersByTimeAsync(0);
  expect(old.postMessage).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2000); await attempts;
  expect(worker.scope.skipWaiting).not.toHaveBeenCalled();
  expect(first.postMessage).toHaveBeenCalledWith({type: 'UPDATE_ACTIVATION_DEFERRED'});
  expect(second.postMessage).toHaveBeenCalledWith({type: 'UPDATE_ACTIVATION_DEFERRED'});
  expect(old.postMessage).not.toHaveBeenCalledWith({type: 'UPDATE_ACTIVATION_DEFERRED'});
  expect(vi.getTimerCount()).toBe(0);
});

it('does not reuse an earlier ownership report as a fresh early-activation reply', async () => {
  vi.useFakeTimers();
  const old = client('old'), worker = runtime([old]); await seedBuildVersions(worker);
  await worker.report(old, 'a');
  const attempt = worker.skip(old); await vi.advanceTimersByTimeAsync(2000); await attempt;
  expect(worker.scope.skipWaiting).not.toHaveBeenCalled();
  expect(old.postMessage).toHaveBeenCalledWith({type: 'UPDATE_ACTIVATION_DEFERRED'});
});

it('defers on a newly opened document in the fresh census without an unbounded re-probe', async () => {
  const old = client('old'), newcomer = client('new'), worker = runtime([old]); await seedBuildVersions(worker);
  old.postMessage.mockImplementation(message => {
    if (message.type !== 'REQUEST_CLIENT_BUILD_ID') return;
    worker.setClients([old, newcomer]); void worker.report(old, 'a');
  });
  await worker.skip(old);
  expect(worker.scope.skipWaiting).not.toHaveBeenCalled();
  expect(newcomer.postMessage).not.toHaveBeenCalled();
  expect(old.postMessage).toHaveBeenCalledWith({type: 'UPDATE_ACTIVATION_DEFERRED'});
});

it('does not let a closed unresponsive document block the final empty census', async () => {
  vi.useFakeTimers();
  const old = client('old'), worker = runtime([old]);
  old.postMessage.mockImplementation(() => worker.setClients([]));
  const attempt = worker.skip(old); await vi.advanceTimersByTimeAsync(2000); await attempt;
  expect(worker.scope.skipWaiting).toHaveBeenCalledOnce();
});

it.each(['missing-cache', 'wrong-version', 'incomplete-version'])('rejects direct replies with %s instead of creating or guessing their build cache', async mode => {
  const old = client('old'), worker = runtime([old]); await seedBuildVersions(worker);
  if (mode === 'missing-cache') worker.stores.delete(oldKey);
  if (mode === 'wrong-version') await worker.put(oldKey, '/version.js', "self.APP_BUILD_ID = 'different';");
  if (mode === 'incomplete-version') worker.stores.get(oldKey)!.set(origin + '/version.js', new Response("self.APP_BUILD_ID = 'a';", {status: 206}));
  replyToBuildProbe(worker, old, 'a'); worker.cacheStorage.open.mockClear();
  await worker.skip(old);
  expect(worker.scope.skipWaiting).not.toHaveBeenCalled();
  expect(old.postMessage).toHaveBeenCalledWith({type: 'UPDATE_ACTIVATION_DEFERRED'});
  if (mode === 'missing-cache') expect(worker.cacheStorage.open).not.toHaveBeenCalledWith(oldKey);
});

it('recovers a deferred activation on a later direct reply and never forces a page reload', async () => {
  vi.useFakeTimers();
  const old = client('old'), worker = runtime([old]); await seedBuildVersions(worker);
  const first = worker.skip(old); await vi.advanceTimersByTimeAsync(2000); await first;
  expect(worker.scope.skipWaiting).not.toHaveBeenCalled();
  replyToBuildProbe(worker, old, 'a'); await worker.skip(old);
  expect(worker.scope.skipWaiting).toHaveBeenCalledOnce();
  expect(worker.scope.clients.claim).not.toHaveBeenCalled();
});

it.each([{isProduction: false}, {buildId: ''}])('retains immediate SKIP_WAITING for preview/unfingerprinted workers: %j', async options => {
  const old = client('old'), worker = runtime([old], options);
  await worker.skip(old);
  expect(worker.scope.skipWaiting).toHaveBeenCalledOnce();
  expect(worker.scope.clients.get).not.toHaveBeenCalled();
});

it('uses only the known owner canonical stylesheet for the exact lazy-retry query', async () => {
  const old = client('old'), worker = runtime([old]);
  await worker.put(oldKey, '/css/light-setup.css', 'old owned CSS');
  await worker.put(currentKey, '/css/light-setup.css', 'new CSS');
  await worker.put(currentKey, '/css/light-setup.css?different=1', 'ordinary query CSS');
  await worker.report(old, 'a');
  expect(await (await worker.fetch('/css/light-setup.css?lazy-retry=1', {}, old.id))!.text()).toBe('old owned CSS');
  expect(await (await worker.fetch('/css/light-setup.css?different=1', {}, old.id))!.text()).toBe('ordinary query CSS');
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});

it('fails closed for a known current owner whose exact stylesheet is absent even without a retained cache', async () => {
  const current = client('current'), worker = runtime([current]); worker.stores.delete(oldKey);
  await worker.report(current, 'b');
  await expectUnavailableResponse(await worker.fetch('/css/light-setup.css', {}, current.id));
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});

it('binds startup CSS to the resulting document only when returning the exact current cached application shell', async () => {
  const document = client('new-document'), worker = runtime([document]);
  await worker.put(currentKey, '/app', '<!doctype html>cached current app');
  await worker.put(currentKey, '/css/light-setup.css', 'current startup CSS');
  const navigation = await worker.fetch('/app', {}, '', document.id, true);
  expect(await navigation!.text()).toBe('<!doctype html>cached current app');
  expect(await (await worker.fetch('/css/light-setup.css', {}, document.id))!.text()).toBe('current startup CSS');
  expect(document.postMessage).not.toHaveBeenCalled(); expect(worker.fetchImpl).not.toHaveBeenCalled();
});

it('does not establish ownership from a failed atomic app-shell navigation', async () => {
  vi.useFakeTimers();
  const document = client('new-document'), worker = runtime([document]);
  await expectUnavailableResponse(await worker.fetch('/app', {}, '', document.id, true));
  expect(worker.fetchImpl).not.toHaveBeenCalled();
  await worker.put(currentKey, '/css/light-setup.css', 'current CSS');
  const css = worker.fetch('/css/light-setup.css', {}, document.id);
  await vi.advanceTimersByTimeAsync(2000); await expectUnavailableResponse(await css);
  expect(document.postMessage).toHaveBeenCalledWith({type: 'REQUEST_CLIENT_BUILD_ID'});
});


it('defers conservatively when either activation census is unavailable', async () => {
  const old = client('old'), worker = runtime([old]);
  worker.scope.clients.matchAll.mockRejectedValueOnce(new Error('client census unavailable'));
  await worker.skip(old);
  expect(worker.scope.skipWaiting).not.toHaveBeenCalled();
  expect(old.postMessage).toHaveBeenCalledWith({type: 'UPDATE_ACTIVATION_DEFERRED'});
});

it('fails closed when the owned stylesheet cache cannot be read', async () => {
  const old = client('old'), worker = runtime([old]); await worker.report(old, 'a');
  worker.cacheStorage.open.mockRejectedValueOnce(new Error('owned cache unavailable'));
  await expectUnavailableResponse(await worker.fetch('/css/light-setup.css', {}, old.id));
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});


it('serves root-query navigation from the exact cached app shell and owns its startup CSS without a JavaScript reply', async () => {
  const document = client('root-document'), worker = runtime([document]);
  await worker.put(currentKey, '/app', '<!doctype html>exact current cached app');
  await worker.put(currentKey, '/css/light-setup.css', 'current startup CSS');
  const response = await worker.fetch('/?dev-sw=1', {}, '', document.id, true);
  expect(response!.status).toBe(200);
  expect(await response!.text()).toBe('<!doctype html>exact current cached app');
  expect(await (await worker.fetch('/css/light-setup.css', {}, document.id))!.text()).toBe('current startup CSS');
  expect(document.postMessage).not.toHaveBeenCalled();
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});

it('never promotes two successive unproven nonapp production network documents into the owned cache', async () => {
  const route = '/foreign-navigation';
  vi.useFakeTimers();
  const first = client('network-first'), second = client('network-second');
  const worker = runtime([first, second]);
  worker.fetchImpl.mockImplementation(async () => new Response('<!doctype html>next-build network document'));
  for (const document of [first, second]) {
    const response = await worker.fetch(route, {}, '', document.id, true);
    expect(await response!.text()).toBe('<!doctype html>next-build network document');
  }
  expect(worker.fetchImpl).toHaveBeenCalledTimes(2);
  expect(worker.stores.get(currentKey)!.has(origin + route)).toBe(false);
  expect(worker.stores.get(currentKey)!.size).toBe(0);
  await worker.put(currentKey, '/css/light-setup.css', 'current owned stylesheet');
  const css = worker.fetch('/css/light-setup.css', {}, second.id);
  await vi.advanceTimersByTimeAsync(2000);
  await expectUnavailableResponse(await css);
  expect(second.postMessage).toHaveBeenCalledWith({type: 'REQUEST_CLIENT_BUILD_ID'});
  expect(worker.fetchImpl).toHaveBeenCalledTimes(2);
});

it.each([{isProduction: false}, {buildId: ''}])('retains existing navigation-cache writes for preview or unfingerprinted workers: %j', async options => {
  const worker = runtime([], options);
  const response = await worker.fetch('/app', {}, '', 'unfingerprinted-document', true);
  expect(await response!.text()).toBe('fresh network');
  expect(await worker.stores.get(currentKey)!.get(origin + '/app')!.clone().text()).toBe('fresh network');
  expect(worker.fetchImpl).toHaveBeenCalledOnce();
});


it.each(['/', '/app', '/app/', '/index.html'])('fails two consecutive missing atomic app navigations closed without network HTML or false ownership: %s', async route => {
  vi.useFakeTimers();
  const first = client('missing-first'), second = client('missing-second');
  const worker = runtime([first, second]);
  await worker.put(currentKey, '/version.js', "self.APP_BUILD_ID = 'b';");
  await worker.put(currentKey, '/css/light-setup.css', 'current build B stylesheet');
  worker.fetchImpl.mockImplementation(async () => new Response('<!doctype html>next build C document'));
  for (const document of [first, second]) {
    await expectUnavailableResponse(await worker.fetch(route, {}, '', document.id, true));
  }
  expect(worker.fetchImpl).not.toHaveBeenCalled();
  expect(worker.stores.get(currentKey)!.has(origin + route)).toBe(false);
  expect(worker.stores.get(currentKey)!.size).toBe(2);
  const stylesheet = worker.fetch('/css/light-setup.css', {}, second.id);
  await vi.advanceTimersByTimeAsync(2000);
  await expectUnavailableResponse(await stylesheet);
  expect(second.postMessage).toHaveBeenCalledWith({type: 'REQUEST_CLIENT_BUILD_ID'});
  expect(worker.fetchImpl).not.toHaveBeenCalled();
});
