// Failure-only static PWA evidence. No worker instrumentation or storage writes.
import type { BrowserContext, Page, Request, Response, TestInfo } from '@playwright/test';

/** Record caught preload failures without changing requests, storage or retry behavior. */
export async function installOfflineStartupDiagnostics(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const errors: { name: string; message: string; stack: string }[] = [];
    Object.assign(window, { __getbasedOfflineStartupErrors: errors });
    window.addEventListener('vite:preloadError', event => {
      const error = (event as Event & { payload?: { name?: unknown; message?: unknown; stack?: unknown } }).payload;
      if (errors.length === 16) errors.shift();
      errors.push({ name: String(error?.name || ''), message: String(error?.message || ''), stack: String(error?.stack || '') });
    });
  });
}

/** Observe navigation without retries, page evaluations, or waits on the success path. */
export async function navigateWithOfflineLaunchDiagnostics(page: Page, url: string, info: TestInfo): Promise<void> {
  const events: { kind: string; path: string; status?: number; error?: string | undefined; reportedFromServiceWorker?: boolean }[] = [];
  const record = (event: typeof events[number]) => {
    if (events.length === 64) events.shift();
    events.push(event);
  };
  const failed = (request: Request) => record({ kind: 'requestfailed', path: new URL(request.url()).pathname, error: request.failure()?.errorText });
  const responded = (response: Response) => record({ kind: 'response', path: new URL(response.url()).pathname, status: response.status(), reportedFromServiceWorker: response.fromServiceWorker() });
  page.on('requestfailed', failed);
  page.on('response', responded);
  try {
    await page.goto(url);
  } catch (error) {
    await info.attach('offline-launch-navigation-state', {
      body: JSON.stringify({ requestedURL: url, pageURL: page.url(), error: String(error), events }, null, 2), contentType: 'application/json',
    });
    await captureOfflineLaunchDiagnostics(page, info);
    throw error;
  } finally {
    page.off('requestfailed', failed);
    page.off('response', responded);
  }
}

export async function captureOfflineLaunchDiagnostics(page: Page, info: TestInfo): Promise<void> {
  try {
    const current = await page.evaluate(() => ({
      pageURL: location.href, origin: location.origin, readyState: document.readyState,
      cacheStorageAvailable: 'caches' in globalThis, serviceWorkerAvailable: 'serviceWorker' in navigator,
    }));
    await info.attach('offline-launch-current-page', {body: JSON.stringify(current, null, 2), contentType: 'application/json'});
    if (!current.cacheStorageAvailable || !current.serviceWorkerAvailable || current.origin === 'null') {
      await info.attach('offline-launch-cache-state', {body: JSON.stringify({...current, unavailable: 'Current page has no usable origin-scoped CacheStorage and service-worker APIs.'}, null, 2), contentType: 'application/json'});
      return;
    }
    const state = await page.evaluate(async () => {
      const bounded = <Value>(promise: Promise<Value>, label: string): Promise<Value | { timeout: string }> => Promise.race([
        promise, new Promise<{ timeout: string }>(resolve => setTimeout(() => resolve({ timeout: label }), 2000)),
      ]);
      const keys = await bounded(caches.keys(), 'cache names'), snapshots = [];
      if (Array.isArray(keys)) for (const key of keys) {
        const cache = await bounded(caches.open(key), `open ${key}`);
        if (!('keys' in cache)) { snapshots.push({ key, cache }); continue; }
        const requests = await bounded(cache.keys(), `keys ${key}`);
        if (!Array.isArray(requests)) { snapshots.push({ key, requests }); continue; }
        const shell = requests.filter(request => {
          const url = new URL(request.url); return url.origin === location.origin && (/^\/_app\/immutable\//.test(url.pathname) || /^\/vendor\/fonts\//.test(url.pathname) || ['/app', '/index.html', '/css/context-editor.css', '/css/emf.css'].includes(url.pathname));
        });
        // Bounded parallel batches avoid a diagnostic flood after a stalled launch.
        const entries = [];
        for (let index = 0; index < Math.min(shell.length, 512); index += 16) entries.push(...await Promise.all(shell.slice(index, index + 16).map(async request => {
          const path = new URL(request.url).pathname;
          const response = await bounded(cache.match(request), `match ${path}`);
          if (!response || !('arrayBuffer' in response)) return { path, response };
          const body = await bounded(response.arrayBuffer(), `body ${path}`);
          return { path, status: response.status, bytes: body instanceof ArrayBuffer ? body.byteLength : body,
            sha256: body instanceof ArrayBuffer ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map(byte => byte.toString(16).padStart(2, '0')).join('') : null };
        })));
        snapshots.push({ key, declaredEntries: shell.length, entries });
      }
      const registrations = await bounded(navigator.serviceWorker.getRegistrations(), 'worker registrations');
      return { startupErrors: (window as unknown as { __getbasedOfflineStartupErrors?: unknown }).__getbasedOfflineStartupErrors, path: location.pathname, readyState: document.readyState, shellFramework: document.documentElement.dataset.shellFramework, appReady: document.documentElement.dataset.appReady,
        controller: navigator.serviceWorker.controller && { scriptURL: navigator.serviceWorker.controller.scriptURL, state: navigator.serviceWorker.controller.state },
        registrations: Array.isArray(registrations) ? registrations.map(registration => ({ scope: registration.scope, active: registration.active?.scriptURL, state: registration.active?.state })) : registrations, caches: snapshots };
    });
    await info.attach('offline-launch-cache-state', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
  } catch (error) {
    await info.attach('offline-launch-diagnostic-error', { body: String(error), contentType: 'text/plain' });
  }
}

/** Failure-only route evidence: bounded native reads of the actually requested static URLs. */
export async function captureOfflineRouteFailureDiagnostics(page: Page, info: TestInfo, requestedURLs: readonly string[]): Promise<void> {
  const capture = async () => {
    const current = await page.evaluate(() => {
      const controller = navigator.serviceWorker?.controller;
      const main = document.getElementById('main-content');
      return {
        url: location.href, origin: location.origin, readyState: document.readyState,
        appReady: document.documentElement.hasAttribute('data-app-ready'),
        shellFramework: document.documentElement.dataset.shellFramework,
        activeRoute: document.querySelector('[data-nav-route][aria-current="page"]')?.getAttribute('data-nav-route'),
        routeStatus: main?.querySelector('[role="status"]')?.textContent?.slice(0, 256),
        cacheStorageAvailable: typeof caches !== 'undefined', serviceWorkerAvailable: !!navigator.serviceWorker,
        controller: controller ? {scriptURL: controller.scriptURL, state: controller.state} : null,
      };
    });
    await info.attach('offline-route-current-page', {body: JSON.stringify(current, null, 2), contentType: 'application/json'});
    if (!current.cacheStorageAvailable || !current.serviceWorkerAvailable || current.origin === 'null') return;
    const urls = [...new Set(requestedURLs.filter(value => {
      try {
        const url = new URL(value);
        return url.origin === current.origin && !url.hash
          && (url.pathname.startsWith('/_app/immutable/') || url.pathname === '/css/genetics.css');
      } catch { return false; }
    }))].slice(0, 8);
    const state = await page.evaluate(async urls => {
      const deadline = performance.now() + 2000;
      type Read<Value> = {ok: true; value: Value} | {ok: false; operation: string; error?: string; timeout?: true};
      const bounded = async <Value>(operation: string, read: () => Promise<Value>): Promise<Read<Value>> => {
        const remaining = deadline - performance.now();
        if (remaining <= 0) return {ok: false, operation, timeout: true};
        let timer: number | undefined;
        try {
          return await Promise.race([
            read().then(value => ({ok: true as const, value})),
            new Promise<Read<Value>>(resolve => { timer = window.setTimeout(() => resolve({ok: false, operation, timeout: true}), remaining); }),
          ]);
        } catch (error) { return {ok: false, operation, error: String(error)}; }
        finally { if (timer !== undefined) window.clearTimeout(timer); }
      };
      let totalBodyBytes = 0;
      const maxBodyBytes = 4 * 1024 * 1024, maxTotalBodyBytes = 16 * 1024 * 1024;
      const bodyReceipt = async (response: globalThis.Response, url: string) => {
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        if (reader) for (;;) {
          const next = await bounded(`body ${url}`, () => reader.read());
          if (!next.ok) { void reader.cancel().catch(() => {}); return {bytes, complete: false, read: next}; }
          if (next.value.done) break;
          const chunk = next.value.value;
          if (bytes + chunk.byteLength > maxBodyBytes || totalBodyBytes + chunk.byteLength > maxTotalBodyBytes) {
            void reader.cancel().catch(() => {});
            return {bytes, complete: false, limit: 'diagnostic body byte limit'};
          }
          chunks.push(chunk); bytes += chunk.byteLength; totalBodyBytes += chunk.byteLength;
        }
        const body = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        const digest = await bounded(`hash ${url}`, () => crypto.subtle.digest('SHA-256', body));
        return digest.ok
          ? {bytes, complete: true, sha256: [...new Uint8Array(digest.value)].map(byte => byte.toString(16).padStart(2, '0')).join('')}
          : {bytes, complete: false, read: digest};
      };
      const [keys, registrations] = await Promise.all([
        bounded('cache names', () => caches.keys()),
        bounded('worker registrations', async () => (await navigator.serviceWorker.getRegistrations()).map(registration => ({
          scope: registration.scope, active: registration.active && {scriptURL: registration.active.scriptURL, state: registration.active.state},
          installing: registration.installing?.state, waiting: registration.waiting?.state,
        }))),
      ]);
      const snapshots = [];
      if (keys.ok) for (const cacheName of keys.value.slice(0, 8)) {
        const entries = await Promise.all(urls.map(async url => {
          // A named lookup reads existing caches without creating a missing/deleted cache.
          const matched = await bounded(`match ${cacheName} ${url}`, () => caches.match(url, {cacheName}));
          if (!matched.ok) return {url, read: matched};
          if (!matched.value) return {url, missing: true};
          const response = matched.value;
          return {url, status: response.status, responseURL: response.url,
            headers: {contentType: response.headers.get('content-type'), contentLength: response.headers.get('content-length'), cacheControl: response.headers.get('cache-control')},
            body: await bodyReceipt(response, url)};
        }));
        snapshots.push({cacheName, entries});
      }
      return {urls, cacheNames: keys, registrations, snapshots, totalBodyBytes,
        cacheNamesTruncated: keys.ok && keys.value.length > 8, deadlineReached: performance.now() >= deadline};
    }, urls);
    await info.attach('offline-route-native-cache-state', {body: JSON.stringify(state, null, 2), contentType: 'application/json'});
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      capture().catch(async error => {
        try { await info.attach('offline-route-diagnostic-error', {body: String(error), contentType: 'text/plain'}); } catch { /* Diagnostic attachment cannot replace acceptance failure. */ }
      }),
      new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); }),
    ]);
  } catch { /* Preserve the caller's original acceptance failure. */ }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
