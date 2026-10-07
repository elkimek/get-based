// Failure-only static PWA evidence. No worker instrumentation or storage writes.
import type { Page, TestInfo } from '@playwright/test';
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
          const url = new URL(request.url); return url.origin === location.origin && (/^\/_app\/immutable\//.test(url.pathname) || ['/app', '/index.html', '/css/context-editor.css', '/css/emf.css'].includes(url.pathname));
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
      return { path: location.pathname, readyState: document.readyState, shellFramework: document.documentElement.dataset.shellFramework, appReady: document.documentElement.dataset.appReady,
        controller: navigator.serviceWorker.controller && { scriptURL: navigator.serviceWorker.controller.scriptURL, state: navigator.serviceWorker.controller.state },
        registrations: Array.isArray(registrations) ? registrations.map(registration => ({ scope: registration.scope, active: registration.active?.scriptURL, state: registration.active?.state })) : registrations, caches: snapshots };
    });
    await info.attach('offline-launch-cache-state', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
  } catch (error) {
    await info.attach('offline-launch-diagnostic-error', { body: String(error), contentType: 'text/plain' });
  }
}
