import { afterEach, expect, it, vi } from 'vitest';
import { executeClassicServiceWorker } from './helpers/classic-service-worker.js';

type Client = { id: string; url: string; postMessage: ReturnType<typeof vi.fn> };
type WaitEvent = { waitUntil: (promise: Promise<unknown>) => void };
type RuntimeListener = (event: WaitEvent & Record<string, unknown>) => void;
const origin = 'https://getbased.test';
const oldKey = 'labcharts-vbuild-a', currentKey = 'labcharts-vbuild-b';
function runtime(initialClients: Client[]) {
  let clients = initialClients;
  const stores = new Map<string, Map<string, Response>>([[oldKey, new Map()], [currentKey, new Map()], ['transformers-cache', new Map()]]);
  const key = (request: Request | string) => { const url = new URL(typeof request === 'string' ? request : request.url, origin); return url.href; };
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
  const scope = { APP_VERSION: 'test', location: { hostname: 'getbased.test', origin }, skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => clients) },
    addEventListener: (type: string, callback: RuntimeListener) => listeners.set(type, callback) };
  vi.stubGlobal('caches', cacheStorage);
  const fetchImpl = vi.fn(async () => new Response('fresh network'));
  vi.stubGlobal('fetch', fetchImpl);
  const restart = () => {
    executeClassicServiceWorker(scope, () => {});
    const api = Reflect.get(scope, 'GetBasedServiceWorkerRuntime') as { install(options: Record<string, unknown>): void };
    api.install({ scope, buildId: 'b', appShell: ['/app'], isProduction: true,
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
    report: (client: Client, buildId: string, messageOrigin = origin) => invoke('message', { origin: messageOrigin, source: client, data: { type: 'CLIENT_BUILD_ID', buildId } }),
    async put(cache: string, url: string, body: string) { await (await cacheStorage.open(cache)).put(url, new Response(body)); },
    async fetch(url: string): Promise<Response | null> {
      const work: Promise<unknown>[] = []; let response: Promise<Response> | null = null;
      listeners.get('fetch')!({ request: new Request(new URL(url, origin)), waitUntil: promise => work.push(promise),
        respondWith: (result: Promise<Response>) => { response = result; } });
      const result = await response; await Promise.all(work); return result;
    },
  };
}
const client = (id: string): Client => ({ id, url: origin + '/app', postMessage: vi.fn() });
afterEach(() => vi.unstubAllGlobals());

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
  expect(await (await worker.fetch('/css/settings.css'))!.text()).toBe('fresh network');
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
