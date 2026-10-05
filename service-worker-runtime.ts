interface ServiceWorkerRuntimeConfig {
  scope: ServiceWorkerGlobalScope;
  buildId?: string | undefined;
  appShell: readonly string[];
  isProduction: boolean;
  resolveCacheName: () => Promise<string>;
  shouldUseNetworkOnly: (url: URL, sameOrigin: boolean) => boolean;
}
interface ServiceWorkerGlobalScope {
  GetBasedServiceWorkerRuntime?: { install: typeof installServiceWorkerRuntime };
  GetBasedServiceWorkerAssets?: readonly string[];
}

function installServiceWorkerRuntime({
  scope,
  buildId = '',
  appShell,
  isProduction,
  resolveCacheName,
  shouldUseNetworkOnly,
}: ServiceWorkerRuntimeConfig) {
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

  async function cacheAppShellEntry(cache: Cache, url: string) {
    if (await cache.match(url)) return;

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= PRECACHE_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await cache.put(url, response);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`Failed to precache ${url}: ${errorMessage(lastError)}`);
  }

  async function precacheAppShell(cache: Cache) {
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
      .then((cache) => cache.put(request, clone))
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
      try {
        await verifyDeployment();
        await precacheAppShell(await caches.open(name));
        await verifyDeployment();
      } catch (error) {
        if (buildId) await caches.delete(name);
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

  scope.addEventListener('message', (event) => {
    if ((event.data as { type?: unknown } | null | undefined)?.type === 'SKIP_WAITING' && isSameOriginMessage(event)) {
      void scope.skipWaiting();
    }
  });

  // Activate: delete old caches (any key that isn't this build's).
  scope.addEventListener('activate', (event) => {
    event.waitUntil(
      resolveCacheName().then((name) =>
        caches.keys().then((keys) =>
          Promise.all(keys
            .filter((key) => key.startsWith('labcharts-v') && key !== name)
            .map((key) => caches.delete(key)))
        )
      ).then(() => scope.clients.claim())
    );
  });

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
        fetchAndCache(event.request, event).catch(() => matchCurrentCache(event.request)) as Promise<Response>
      );
      return;
    }

    // Cache API only supports GET, and the app cache owns same-origin files only.
    if (event.request.method !== 'GET' || !sameOrigin) return;

    // Installed PWAs launch at /app. Offline navigation falls back to the
    // cached application document.
    if (event.request.mode === 'navigate') {
      if (!isProduction) {
        event.respondWith(
          fetchAndCache(event.request, event).catch(() => cachedAppShell()) as Promise<Response>
        );
        return;
      }
      event.respondWith(
        matchCurrentCache(event.request).then((cached) => {
          if (cached) return cached;
          if (url.pathname === '/app' || url.pathname === '/app/' || url.pathname === '/index.html') {
            return cachedAppShell().then((shell) => shell || fetchAndCache(event.request, event));
          }
          return fetchAndCache(event.request, event).catch(() => cachedAppShell()) as Promise<Response>;
        }) as Promise<Response>
      );
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

    event.respondWith(
      matchCurrentCache(event.request).then((cached) => cached || fetchAndCache(event.request, event))
    );
  });
}

const serviceWorkerRuntimeScope = self as ServiceWorkerGlobalScope & typeof globalThis;

serviceWorkerRuntimeScope.GetBasedServiceWorkerRuntime = Object.freeze({
  install: installServiceWorkerRuntime,
});
