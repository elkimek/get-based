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
