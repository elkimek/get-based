interface ServiceWorkerRuntimeConfig {
  scope: ServiceWorkerGlobalScope;
  buildId?: string | undefined;
  appShell: readonly string[];
  fontAliases?: Readonly<Record<string, string>> | undefined;
  sqliteAssetAliases?: Readonly<Record<string, string>> | undefined;
  retryChunkAliases?: Readonly<Record<string, string>> | undefined;
  isProduction: boolean;
  resolveCacheName: () => Promise<string>;
  shouldUseNetworkOnly: (url: URL, sameOrigin: boolean) => boolean;
}
interface InstallCache {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
}
interface ServiceWorkerGlobalScope {
  GetBasedServiceWorkerRuntime?: { install: typeof installServiceWorkerRuntime };
  GetBasedServiceWorkerAssets?: readonly string[];
}

function installServiceWorkerRuntime({
  scope,
  buildId = '',
  appShell,
  fontAliases = {},
  sqliteAssetAliases = {},
  retryChunkAliases = {},
  isProduction,
  resolveCacheName,
  shouldUseNetworkOnly,
}: ServiceWorkerRuntimeConfig) {
  // Only the build's byte-proven omitted font aliases may use a canonical entry.
  // Copy and validate once; callers cannot later widen the trusted routing table.
  const verifiedFontAliases = new Map<string, string>();
  const fontPath = /^\/vendor\/fonts\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.woff2$/;
  for (const [alias, canonical] of Object.entries(fontAliases)) {
    if (!buildId || !isProduction || !fontPath.test(alias) || typeof canonical !== 'string'
      || !fontPath.test(canonical) || alias === canonical || appShell.includes(alias) || !appShell.includes(canonical)) {
      throw new Error('Invalid build-proven font alias');
    }
    verifiedFontAliases.set(alias, canonical);
  }
  // This is deliberately separate from font routing and closed to four exact
  // SQLite names. Keep original module and worker URLs: their import.meta.url
  // selects sibling WASM/proxy files, so a canonical Response URL is unsafe.
  const verifiedSqliteAliases = new Map<string, string>();
  // Frozen previous runtime: not part of a new installation's precache. Open
  // old tabs/workers can finish offline from retained caches only when the
  // complete bytes match this independent immutable transition identity.
  const previousEvoluAssets = new Map([
    ['/vendor/evolu8/evolu-bundle.js', 'd48fd23aaa1f5f9610d4b5baf9154ca107558b3d045ab1fd272b751a665e8a5d'],
    ['/vendor/evolu8/Db.worker.js', 'e2cd4f42eb4e870f1be57d86a76e5a509a1f96f2e3ba3181cda38ea7ff7b3817'],
    ['/vendor/evolu8/Shared.worker.js', '9ef44230768f3e3d43d84d616b1f36d93a74481b5e8e43ecb6f8ec02192bc042'],
  ]);
  const sqliteNames = ['sqlite3-bundler-friendly.mjs', 'sqlite3.wasm',
    'sqlite3-opfs-async-proxy.js', 'sqlite3-worker1-bundler-friendly.mjs'] as const;
  if (Object.keys(sqliteAssetAliases).length) {
    if (!buildId || !isProduction || Object.keys(sqliteAssetAliases).length !== sqliteNames.length) {
      throw new Error('Invalid build-proven SQLite asset aliases');
    }
    for (const file of sqliteNames) {
      const alias = '/vendor/evolu8/' + file, canonical = '/vendor/evolu/' + file;
      if (!Object.hasOwn(sqliteAssetAliases, alias) || sqliteAssetAliases[alias] !== canonical
        || appShell.includes(alias) || appShell.filter(url => url === canonical).length !== 1) {
        throw new Error('Invalid build-proven SQLite asset aliases');
      }
      verifiedSqliteAliases.set(alias, canonical);
    }
  }
  // The native producer declares only byte-identical, independently evaluated
  // retry roots. Other builds supply no declarations but can retain older proofs.
  const RETRY_PROOF_HEADER = 'x-getbased-retry-proof';
  const RETRY_QUERY = '?lazy-retry=1';
  const retryPath = /^\/js\/bundle-[A-Za-z0-9_-]+\.js$/;
  const verifiedRetryChunks = new Map<string, string>();
  for (const [canonical, hash] of Object.entries(retryChunkAliases)) {
    if (!isProduction || !/^[a-f0-9]{64}$/.test(buildId) || !retryPath.test(canonical)
      || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)
      || appShell.filter(path => path === canonical).length !== 1) {
      throw new Error('Invalid build-proven retry chunk alias');
    }
    verifiedRetryChunks.set(canonical, hash);
  }

  async function retryBodyHash(bytes: ArrayBuffer) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
  }

  function retryProof(response: Response, canonical: string, selectedBuild: string): string | null {
    let proof: unknown;
    try { proof = JSON.parse(response.headers.get(RETRY_PROOF_HEADER) || 'null'); }
    catch { return null; }
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)
      || Object.keys(proof).sort().join(',') !== 'build,canonical,sha256,v'
      || !('v' in proof) || proof.v !== 1 || !('build' in proof) || proof.build !== selectedBuild
      || !('canonical' in proof) || proof.canonical !== canonical
      || !('sha256' in proof) || typeof proof.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(proof.sha256)) return null;
    return proof.sha256;
  }

  function withoutRetryProof(response: Response) {
    const headers = new Headers(response.headers);
    headers.delete(RETRY_PROOF_HEADER);
    return new Response(response.body, {status: response.status,
      statusText: response.statusText, headers});
  }

  async function networkCacheResponse(request: RequestInfo | URL, response: Response): Promise<Response> {
    const address = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
    const url = new URL(address, scope.location.origin);
    const expectedHash = url.origin === scope.location.origin && !url.search && !url.hash
      ? verifiedRetryChunks.get(url.pathname) : undefined;
    // Network headers never establish producer authority, including on ordinary
    // noneligible resources that a future worker might see in a retained cache.
    if (!expectedHash) return response.headers.has(RETRY_PROOF_HEADER) ? withoutRetryProof(response) : response;
    const bytes = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete(RETRY_PROOF_HEADER);
    if (response.status === 200 && await retryBodyHash(bytes) === expectedHash) {
      headers.set(RETRY_PROOF_HEADER, JSON.stringify({v: 1, build: buildId,
        canonical: url.pathname, sha256: expectedHash}));
    }
    return new Response(bytes, {status: response.status,
      statusText: response.statusText, headers});
  }

  class RetryCacheIntegrityError extends Error {
    readonly canonical: string;
    constructor(message: string, canonical: string) {
      super(message);
      this.canonical = canonical;
    }
  }

  async function annotateRetryChunks(cache: InstallCache) {
    for (const [canonical, expectedHash] of verifiedRetryChunks) {
      const response = await cache.match(canonical);
      if (response?.status !== 200) throw new RetryCacheIntegrityError('Missing successful retry canonical body', canonical);
      const bytes = await response.clone().arrayBuffer();
      if (await retryBodyHash(bytes) !== expectedHash) throw new RetryCacheIntegrityError('Retry canonical body hash mismatch', canonical);
      // A terminated installation may leave an already annotated matching entry.
      // It is safe to resume only the exact same build/path/body declaration.
      if (response.headers.has(RETRY_PROOF_HEADER)) {
        if (retryProof(response, canonical, buildId) !== expectedHash) {
          throw new RetryCacheIntegrityError('Conflicting cached retry chunk proof', canonical);
        }
        continue;
      }
      const headers = new Headers(response.headers);
      headers.set(RETRY_PROOF_HEADER, JSON.stringify({v: 1, build: buildId,
        canonical, sha256: expectedHash}));
      await cache.put(canonical, new Response(bytes, {
        status: response.status, statusText: response.statusText, headers,
      }));
    }
  }

  // Store successful responses one-by-one instead of using Cache.addAll(). If a
  // large install is interrupted, the next install attempt can resume from the
  // entries already written. The install still rejects when any required entry
  // cannot be fetched, so an incomplete app shell is never allowed to activate.
  const PRECACHE_CONCURRENCY = 48;
  const PRECACHE_ATTEMPTS = 3;
  const PRECACHE_PROGRESS_MESSAGE = 'PRECACHE_PROGRESS';
  let lastPrecacheProgressPercent = -1;

  async function reportPrecacheProgress(completed: number, total: number, { force = false }: { force?: boolean } = {}) {
    const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
    if (!force && percent <= lastPrecacheProgressPercent) return;
    lastPrecacheProgressPercent = percent;

    try {
      const clients = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const message = { type: PRECACHE_PROGRESS_MESSAGE, completed, total };
      clients.forEach((client) => client.postMessage(message));
    } catch {
      // Progress is optional; caching must continue even if no client is reachable.
    }
  }

  function errorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error) return error;
    return 'network error';
  }

  async function cacheAppShellEntry(cache: InstallCache, url: string) {
    const existing = await cache.match(url);
    if (existing) {
      // Resume only producer-owned annotations. Declared entries are rechecked
      // below after the full shell is present; unrelated headers cannot survive.
      if (!verifiedRetryChunks.has(url) && existing.headers.has(RETRY_PROOF_HEADER)) {
        await cache.put(url, withoutRetryProof(existing));
      }
      return;
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= PRECACHE_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await cache.put(url, await networkCacheResponse(url, response));
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`Failed to precache ${url}: ${errorMessage(lastError)}`);
  }

  async function precacheAppShell(cache: InstallCache) {
    let nextIndex = 0;
    let cachedCount = 0;
    const failures: string[] = [];
    lastPrecacheProgressPercent = -1;
    await reportPrecacheProgress(0, appShell.length, { force: true });

    async function cacheNextEntries() {
      while (nextIndex < appShell.length) {
        const url = appShell[nextIndex]!;
        nextIndex += 1;
        try {
          await cacheAppShellEntry(cache, url);
          cachedCount += 1;
          await reportPrecacheProgress(cachedCount, appShell.length);
        } catch (error) {
          failures.push(errorMessage(error));
        }
      }
    }

    const workerCount = Math.min(PRECACHE_CONCURRENCY, appShell.length);
    await Promise.all(Array.from({ length: workerCount }, () => cacheNextEntries()));
    await reportPrecacheProgress(cachedCount, appShell.length, { force: true });
    if (failures.length) {
      const detail = failures.slice(0, 3).join('; ');
      throw new Error(`App shell precache failed for ${failures.length} resource(s): ${detail}`);
    }
  }

  function cacheResponse(request: RequestInfo | URL, response: Response) {
    if (response.status === 206 || !response.ok) return Promise.resolve();
    const clone = response.clone();
    return resolveCacheName()
      .then((name) => caches.open(name))
      .then(async (cache) => cache.put(request, await networkCacheResponse(request, clone)))
      .catch(() => {});
  }

  function matchCurrentCache(request: RequestInfo | URL) {
    return resolveCacheName()
      .then((name) => caches.open(name))
      .then((cache) => cache.match(request));
  }

  function fetchAndCache(request: RequestInfo | URL, event: FetchEvent) {
    return fetch(request).then((response) => {
      // Keep the worker alive until the offline copy is durable, while still
      // returning the network response immediately to the page.
      event.waitUntil(cacheResponse(request, response));
      return response;
    });
  }

  function cachedAppShell() {
    return matchCurrentCache('/app').then((cachedApp) => cachedApp || matchCurrentCache('/index.html'));
  }

  // Pin every install to its build. A deployment switch during download must
  // not leave a partially mixed cache that a later retry could activate.
  async function verifyDeployment() {
    if (!buildId) return;
    const response = await fetch('/version.js?update-check=1', { cache: 'no-store' });
    const source = response.ok ? await response.text() : '';
    if (source.match(/\bAPP_BUILD_ID\s*=\s*(['"])([^'"]+)\1/)?.[2] !== buildId) {
      throw new Error('Deployment changed during app installation');
    }
  }

  scope.addEventListener('install', (event) => {
    event.waitUntil((async () => {
      const name = await resolveCacheName();
      const existing = !!buildId && (await caches.keys()).includes(name);
      // Imported-script changes can reinstall the same BUILD_ID. Keep only
      // changed/missing responses in memory until this attempt is verified;
      // existing bodies stay in the installed cache. An interrupted worker
      // therefore leaves neither mutations nor an orphaned persistent cache.
      const candidate = new Map<string, Response>();
      try {
        await verifyDeployment();
        const installed = await caches.open(name);
        const cache: InstallCache = existing ? {
          match: async url => candidate.get(url)?.clone() || installed.match(url),
          put: async (url, response) => {
            // Complete the body before the final deployment check, retaining
            // the original Response URL, status and headers for publication.
            await response.clone().arrayBuffer();
            candidate.set(url, response);
          },
        } : installed;
        await precacheAppShell(cache);
        await annotateRetryChunks(cache);
        await verifyDeployment();
        for (const [url, response] of candidate) await installed.put(url, response);
      } catch (error) {
        // Invalid cached producer proof still invalidates that cache. A failed
        // candidate or deployment probe cannot delete an existing valid build.
        if (buildId && (!existing || (error instanceof RetryCacheIntegrityError && !candidate.has(error.canonical)))) {
          await caches.delete(name);
        }
        throw error;
      }
    })());
  });

  function isSameOriginMessage(event: ExtendableMessageEvent) {
    try {
      const source = event.source;
      const sourceUrl = source && 'url' in source ? source.url : '';
      const origin = event.origin || (sourceUrl ? new URL(sourceUrl).origin : '');
      return origin === scope.location.origin;
    } catch {
      return false;
    }
  }

  // Pages can keep an older module graph after another tab accepts an update.
  // Keep its immutable assets until every live client identifies its build.
  // Unknown clients include pre-protocol releases and are retained safely.
  const clientBuilds = new Map<string, string>();
  const pendingClientBuilds = new Map<string, {
    promise: Promise<string | undefined>;
    complete: (id: string | undefined) => void;
  }>();

  // A reply must come from the requesting document. Build support in a cache
  // cannot establish which build any particular live window is executing.
  async function requestClientBuild(clientId: string, fresh = false): Promise<string | undefined> {
    const known = clientBuilds.get(clientId);
    if (!clientId || (known && !fresh)) return known;
    const pending = pendingClientBuilds.get(clientId);
    if (pending) return pending.promise;
    let client: Client | undefined;
    try { client = await scope.clients.get(clientId); }
    catch { return undefined; }
    if (!client || new URL(client.url).origin !== scope.location.origin) return undefined;
    const concurrent = pendingClientBuilds.get(clientId);
    if (concurrent) return concurrent.promise;
    if (!fresh && clientBuilds.has(clientId)) return clientBuilds.get(clientId);
    let complete!: (id: string | undefined) => void;
    const promise = new Promise<string | undefined>(resolve => {
      const timer = setTimeout(() => complete(undefined), 2000);
      complete = id => {
        clearTimeout(timer);
        pendingClientBuilds.delete(clientId);
        resolve(id);
      };
    });
    pendingClientBuilds.set(clientId, {promise, complete});
    try { client.postMessage({type: 'REQUEST_CLIENT_BUILD_ID'}); }
    catch { complete(undefined); }
    return promise;
  }

  async function hasRetainedBuilds(): Promise<boolean> {
    const current = await resolveCacheName();
    return (await caches.keys()).some(key => key.startsWith('labcharts-v') && key !== current);
  }

  async function hasExactBuildCache(id: string): Promise<boolean> {
    const name = `labcharts-vbuild-${id}`;
    if (!(await caches.keys()).includes(name)) return false;
    const version = await (await caches.open(name)).match('/version.js');
    return version?.status === 200
      && (await version.text()).match(/\bAPP_BUILD_ID\s*=\s*(['"])([^'"]+)\1/)?.[2] === id;
  }

  let activationRequest: Promise<boolean> | null = null;
  function canActivateWithLiveDocuments(): Promise<boolean> {
    if (activationRequest) return activationRequest;
    activationRequest = (async () => {
      const initial = await scope.clients.matchAll({type: 'window', includeUncontrolled: true});
      const proofs = new Map(await Promise.all(initial.map(async client => {
        const id = await requestClientBuild(client.id, true);
        return [client.id, id && await hasExactBuildCache(id) ? id : undefined] as const;
      })));
      // A window opened while replies were pending has supplied no proof for
      // this census. Closed windows no longer prevent normal safe activation.
      const current = await scope.clients.matchAll({type: 'window', includeUncontrolled: true});
      return current.every(client => proofs.get(client.id) !== undefined);
    })().catch(() => false).finally(() => { activationRequest = null; });
    return activationRequest;
  }

  function unavailableOwnedResponse(): Response {
    return new Response(null, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
  let retainedCaches = true;
  // Only activation can identify retired builds. A cache created later may
  // belong to the installing/waiting worker and must never be retired here.
  // After a worker restart, retain safely until the next activation census.
  let retirementCandidates: Set<string> | null = null;
  let cleanupPending: Promise<void> | null = null;
  function cleanupUnusedBuilds(): Promise<void> {
    if (!retirementCandidates) return Promise.resolve();
    if (cleanupPending) return cleanupPending;
    cleanupPending = (async () => {
      const current = await resolveCacheName();
      const old = (await caches.keys()).filter(key => retirementCandidates!.has(key) && key !== current);
      if (!old.length) { retainedCaches = false; return; }
      const keep = new Set([current]);
      if (buildId) {
        const clients = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const liveIds = new Set(clients.map(client => client.id));
        for (const id of clientBuilds.keys()) if (!liveIds.has(id)) clientBuilds.delete(id);
        let unknown = false;
        for (const client of clients) {
          const id = clientBuilds.get(client.id);
          if (id) keep.add(`labcharts-vbuild-${id}`);
          else { unknown = true; client.postMessage({ type: 'REQUEST_CLIENT_BUILD_ID' }); }
        }
        if (unknown) return;
      }
      await Promise.all(old.filter(key => !keep.has(key)).map(key => caches.delete(key)));
      retainedCaches = old.some(key => keep.has(key));
    })().finally(() => { cleanupPending = null; });
    return cleanupPending;
  }

  scope.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; buildId?: unknown } | null | undefined;
    const source = event.source;
    if (data?.type === 'SKIP_WAITING' && isSameOriginMessage(event)) {
      if (!isProduction || !buildId) { void scope.skipWaiting(); return; }
      event.waitUntil((async () => {
        if (await canActivateWithLiveDocuments()) await scope.skipWaiting();
        else if (source && 'postMessage' in source) {
          try { source.postMessage({type: 'UPDATE_ACTIVATION_DEFERRED'}); }
          catch { /* A closed requester cannot receive the conservative result. */ }
        }
      })());
      return;
    }
    if (!buildId || data?.type !== 'CLIENT_BUILD_ID' || !isSameOriginMessage(event)
      || !source || !('id' in source) || typeof source.id !== 'string'
      || typeof data.buildId !== 'string' || !/^[a-z\d._-]{1,128}$/i.test(data.buildId)) return;
    clientBuilds.set(source.id, data.buildId);
    pendingClientBuilds.get(source.id)?.complete(data.buildId);
    // Messages can arrive during activate's client census. Recheck after that
    // census rather than reusing a result which saw this client as unknown.
    event.waitUntil((cleanupPending || Promise.resolve()).then(() => cleanupUnusedBuilds()));
  });

  scope.addEventListener('activate', (event) => {
    event.waitUntil(Promise.all([resolveCacheName(), caches.keys()]).then(([current, keys]) => {
      retirementCandidates = new Set(keys.filter(key => key.startsWith('labcharts-v') && key !== current));
      return cleanupUnusedBuilds();
    }).then(() => scope.clients.claim()));
  });

  async function matchImmutableAsset(event: FetchEvent, url: URL) {
    const request = event.request;
    if (buildId && (!url.search || url.search === RETRY_QUERY) && !url.hash
      && (/^\/css\/.+\.css$/.test(url.pathname)
        || url.pathname === '/styles.css' || url.pathname === '/themes-extra.css')) {
      try {
        const selectedBuild = clientBuilds.get(event.clientId)
          || (await hasRetainedBuilds() ? await requestClientBuild(event.clientId) : undefined);
        if (selectedBuild) {
          const selectedCache = `labcharts-vbuild-${selectedBuild}`;
          if (!(await caches.keys()).includes(selectedCache)) return unavailableOwnedResponse();
          const owned = await (await caches.open(selectedCache)).match(url.search === RETRY_QUERY ? url.pathname : request);
          return owned?.status === 200 ? owned : unavailableOwnedResponse();
        }
        // No reply, no guessed build. Stable CSS must never silently cross the
        // document/build boundary when an incompatible retained build may be live.
        if (await hasRetainedBuilds()) return unavailableOwnedResponse();
      } catch { return unavailableOwnedResponse(); }
    }
    const current = await matchCurrentCache(request);
    if (!current && !url.search && !url.hash) {
      const canonical = verifiedFontAliases.get(url.pathname);
      if (canonical) {
        const font = await matchCurrentCache(canonical);
        if (font) return font;
      }
      const sqliteCanonical = verifiedSqliteAliases.get(url.pathname);
      if (sqliteCanonical) {
        const asset = await matchCurrentCache(sqliteCanonical);
        if (asset?.status === 200) {
          // A fresh Response has no canonical URL. Browsers therefore retain
          // the requested module/worker base, with identical bytes and headers.
          return new Response(asset.clone().body, {
            status: asset.status, statusText: asset.statusText, headers: asset.headers,
          });
        }
      }
    }
    if (current || !buildId || !retainedCaches
      || !(/^\/js\/bundle-[a-z\d_-]+\.js$/i.test(url.pathname)
        || /^\/_app\/immutable\/.+\.(?:js|css)$/.test(url.pathname))) return current;
    const currentName = await resolveCacheName();
    for (const key of (await caches.keys()).filter(key => key.startsWith('labcharts-v') && key !== currentName)) {
      const cached = await (await caches.open(key)).match(request);
      if (cached) return cached;
    }
    return undefined;
  }

  async function previousEvoluResponse(request: Request, expectedHash: string): Promise<Response> {
    const qualified = async (response: Response | undefined) => response?.status === 200
      && await retryBodyHash(await response.clone().arrayBuffer()) === expectedHash;
    try {
      const current = await matchCurrentCache(request);
      if (await qualified(current)) return current!;
      const currentName = await resolveCacheName();
      for (const name of (await caches.keys()).filter(key => key.startsWith('labcharts-v') && key !== currentName)) {
        const retained = await (await caches.open(name)).match(request);
        if (await qualified(retained)) return retained!;
      }
      // Do not add a previous runtime to the new build cache. Its URL base and
      // complete bytes remain unchanged whether served online or offline.
      const response = await fetch(request);
      return await qualified(response) ? response : unavailableOwnedResponse();
    } catch { return unavailableOwnedResponse(); }
  }

  async function matchRetryChunk(event: FetchEvent, url: URL): Promise<Response | undefined> {
    const selectedBuild = clientBuilds.get(event.clientId) || buildId;
    if (!/^[a-f0-9]{64}$/.test(selectedBuild)) return undefined;
    const selectedCache = `labcharts-vbuild-${selectedBuild}`;
    if (selectedBuild === buildId && await resolveCacheName() !== selectedCache) return undefined;
    if (!(await caches.keys()).includes(selectedCache)) return undefined;
    const response = await (await caches.open(selectedCache)).match(url.pathname);
    if (response?.status !== 200) return undefined;
    const hash = retryProof(response, url.pathname, selectedBuild);
    if (!hash || (selectedBuild === buildId && verifiedRetryChunks.get(url.pathname) !== hash)) return undefined;
    const bytes = await response.clone().arrayBuffer();
    if (await retryBodyHash(bytes) !== hash) return undefined;
    // No canonical Response.url: preserve the requested query module identity
    // and relative dependency base without a redirect or a second cached body.
    return new Response(bytes, {status: response.status,
      statusText: response.statusText, headers: response.headers});
  }

  async function retryChunkResponse(event: FetchEvent, url: URL): Promise<Response> {
    let response: Response | undefined;
    try { response = await matchRetryChunk(event, url); }
    catch { /* An unavailable/corrupt cache cannot replace the original request. */ }
    // This exact new private transport namespace never existed in old generated
    // callers. Unknown/missing/corrupt proof uses the original request, not a
    // canonical URL, redirect, generic ignoreSearch, or query Cache.put().
    return response || fetch(event.request);
  }

  // Fetch: route-based caching strategies.
  scope.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const sameOrigin = url.origin === scope.location.origin;

    // Skip non-http(s) schemes — Cache API only supports HTTP and HTTPS.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

    // API providers and cross-origin private/LAN hosts must stream directly.
    if (shouldUseNetworkOnly(url, sameOrigin)) return;

    // Live same-origin endpoints must never enter the versioned app cache.
    if (sameOrigin && url.pathname.startsWith('/api/')) return;

    // The lightweight update probe is always fresh. Preview/local builds also
    // fetch version.js afresh because they can change without version bumps.
    if (
      (url.pathname === '/version.js' && url.searchParams.get('update-check') === '1')
      || (url.pathname === '/version.js' && !isProduction)
    ) {
      event.respondWith(
        fetchAndCache(event.request, event).catch(async () => {
          // Offline metadata is unavailable, not an installed-version result.
          // An explicit non-cacheable failure avoids invalid/error SW responses.
          return (await matchCurrentCache(event.request)) || new Response(null, {
            status: 503,
            headers: { 'Cache-Control': 'no-store' },
          });
        })
      );
      return;
    }

    // Cache API only supports GET, and the app cache owns same-origin files only.
    if (event.request.method !== 'GET' || !sameOrigin) return;

    const previousEvoluHash = !url.search && !url.hash ? previousEvoluAssets.get(url.pathname) : undefined;
    if (buildId && isProduction && previousEvoluHash) {
      event.respondWith(previousEvoluResponse(event.request, previousEvoluHash));
      return;
    }

    // Same-origin auto-import feed and report checks mark themselves with this
    // exact URL fragment (js/auto-import-feed.ts) and go straight to the
    // network: live reports are never answered from or copied into the app
    // cache. Every other request, including ordinary no-store ones, keeps the
    // caching behaviour below.
    if (url.hash === '#getbased-fresh=auto-import') return;

    // Bind a new document only when returning the exact current cached app
    // shell. A network navigation can race a deployment and proves no build.
    const ownedNavigationShell = async () => {
      const shell = await cachedAppShell();
      if (shell?.status === 200 && buildId && event.resultingClientId
        && await resolveCacheName() === `labcharts-vbuild-${buildId}`) {
        clientBuilds.set(event.resultingClientId, buildId);
      }
      return shell;
    };
    if (event.request.mode === 'navigate') {
      if (!isProduction) {
        event.respondWith(
          fetchAndCache(event.request, event).catch(() => ownedNavigationShell()) as Promise<Response>
        );
        return;
      }
      event.respondWith((async () => {
        const appDocument = ['/', '/app', '/app/', '/index.html'].includes(url.pathname);
        // A fresh deployment's HTML is not evidence for this worker's build.
        // Never promote unproven network documents into its owned app cache.
        const fetchNavigation = () => buildId ? fetch(event.request) : fetchAndCache(event.request, event);
        const cached = await matchCurrentCache(event.request);
        if (cached) {
          if (appDocument && cached.status === 200 && buildId && event.resultingClientId
            && await resolveCacheName() === `labcharts-vbuild-${buildId}`) {
            clientBuilds.set(event.resultingClientId, buildId);
          }
          return cached;
        }
        if (appDocument) {
          const shell = await ownedNavigationShell();
          if (shell) return shell;
          // A fresh HTML document could execute this worker's cached version.js
          // and claim a false build. A missing atomic app shell fails closed.
          return buildId ? unavailableOwnedResponse() : fetchNavigation();
        }
        return fetchNavigation().catch(() => ownedNavigationShell()) as Promise<Response>;
      })() as Promise<Response>);
      return;
    }

    // Preview/local builds prefer the network to avoid stale commit-shaped
    // caches; production uses the atomic versioned cache first.
    if (!isProduction) {
      event.respondWith(
        fetchAndCache(event.request, event).catch(() => matchCurrentCache(event.request)) as Promise<Response>
      );
      return;
    }

    if (buildId && retainedCaches) event.waitUntil(cleanupUnusedBuilds());
    if (retryPath.test(url.pathname) && url.search === RETRY_QUERY && !url.hash) {
      event.respondWith(retryChunkResponse(event, url));
      return;
    }
    event.respondWith(
      matchImmutableAsset(event, url).then((cached) => cached || fetchAndCache(event.request, event))
    );
  });
}

const serviceWorkerRuntimeScope = self as ServiceWorkerGlobalScope & typeof globalThis;

serviceWorkerRuntimeScope.GetBasedServiceWorkerRuntime = Object.freeze({
  install: installServiceWorkerRuntime,
});
