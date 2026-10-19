import type { Page, Request } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '../playwright/coverage-fixture.js';
import { startPwaServer } from './app-server.js';

test.use({ serviceWorkers: 'allow' });

async function openInstalledApp(page: Page, origin: string) {
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    // This is an installed, returning-user scenario. The delayed first-visit
    // analytics notice otherwise moves Reload between pointer targeting and click
    // (observed in the Firefox CI trace), without exercising worker activation.
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
  });
  await page.goto(`${origin}/app?dev-sw=1`, { waitUntil: 'networkidle' });
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.locator('#analytics-consent-banner')).toHaveCount(0);
  await page.evaluate(async () => {
    (window as typeof window & { endTour?: typeof import('../../js/tour.js').endTour }).endTour?.();
    (await import('/js/chat-panel.js')).closeChatPanel();
    (await import('/js/changelog.js')).closeChangelog();
  });
}

test('installed shell opens lazy features and reloads with the origin disconnected', async ({ page, baseURL, isMobile }) => {
  const server = await startPwaServer(baseURL);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openInstalledApp(page, server.origin);
    await expect(page.locator('#version-update-banner')).toHaveCount(0);
    const manifest = await page.evaluate(async () => {
      const url = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
      const body: unknown = await fetch(url).then(r => r.json());
      return { ...body as Record<string, unknown>, iconsOk: await Promise.all((body as { icons: { src: string }[] }).icons.map(icon => fetch(new URL(icon.src, url)).then(r => r.ok))) };
    });
    expect(manifest).toMatchObject({ id: '/app', start_url: '/app', display: 'standalone', iconsOk: [true, true, true] });
    await server.disconnect();
    expect(await page.evaluate(() => fetch('/api/offline-proof').then(() => false, () => true))).toBe(true);
    await page.locator('.settings-btn').evaluate(button => (button as HTMLElement).click());
    await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
    await expect(page.locator('#settings-modal .settings-layout')).toHaveCSS('display', isMobile ? 'flex' : 'grid');
    await page.locator('[data-settings-tab="wearables"]').click();
    await expect(page.locator('[data-tab-panel="wearables"]')).toHaveClass(/\bactive\b/);
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('#settings-modal img')]
      .filter(img => img.loading !== 'lazy' || img.getBoundingClientRect().top < innerHeight)
      .every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    await page.evaluate(async () => {
      (await import('/js/settings-loader.js')).closeSettingsModal();
      await (await import('/js/views.js')).navigate('light');
    });
    await expect(page.locator('.light-page')).toBeVisible();
    const offlineContext = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      state.importedData.sunDefaults = { fitzpatrick: 'III' };
      state.importedData.entries = [{ date: '2026-09-01', markers: { 'vitamins.vitaminD': 75 } }];
      return (await import('/js/sun-onboarding-ai.js')).buildOnboardingContext();
    });
    expect(offlineContext).toContain('Latest 25-OH-D: 75 nmol/l (2026-09-01)');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});

test('failed update preserves the installed app; retry updates two tabs without losing local data', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const server = await startPwaServer(baseURL);
  const failedScripts: { path: string; error: string }[] = [];
  let droppedFailures = 0;
  const observeFailedScript = (request: Request) => {
    try {
      const url = new URL(request.url());
      if (request.method() !== 'GET' || request.resourceType() !== 'script'
        || url.origin !== server.origin
        || !/^\/(?:js\/|_app\/immutable\/)[A-Za-z0-9_./-]+\.js$/.test(url.pathname)) return;
      if (failedScripts.length === 16) { droppedFailures += 1; return; }
      const error = request.failure()?.errorText || 'unknown';
      failedScripts.push({ path: url.pathname.slice(0, 256),
        error: /^[A-Za-z0-9_: -]{1,96}$/.test(error) ? error : 'unknown' });
    } catch { /* Passive evidence must not interrupt the original case. */ }
  };
  page.on('requestfailed', observeFailedScript);
  try {
    await openInstalledApp(page, server.origin);
    await page.evaluate(() => localStorage.setItem('pwa-retained-data', 'retained'));
    await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      state.importedData.entries = [{ date: '2026-09-01', markers: { 'biochemistry.glucose': 5.8 } }];
      await (await import('/js/data.js')).saveImportedData();
    });
    const other = await context.newPage();
    await openInstalledApp(other, server.origin);
    server.state.buildId = 'build-b';
    server.state.failPath = '/css/settings.css';
    const failedState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const failed = new Promise(resolve => registration!.addEventListener('updatefound', () => {
        const worker = registration!.installing;
        worker!.addEventListener('statechange', () => { if (worker!.state === 'redundant') resolve(worker!.state); });
      }, { once: true }));
      await registration!.update();
      return failed;
    });
    expect(failedState).toBe('redundant');
    expect(await page.evaluate(() => (window as typeof window & { APP_BUILD_ID?: unknown }).APP_BUILD_ID)).toBe('build-a');
    expect(await page.evaluate(() => localStorage.getItem('pwa-retained-data'))).toBe('retained');
    await expect(page.locator('#version-update-banner')).toHaveCount(0);
    // Worker state and registration.installing propagate separately across
    // browser processes. Require the slot to clear before triggering retry,
    // using the same lifecycle budget as installation/activation below.
    await expect.poll(() => page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())!.installing?.state ?? 'none'
    ), { timeout: 30_000 }).toBe('none');
    server.state.failPath = '';
    server.state.holdPath = '/css/settings.css';
    await page.evaluate(async () => {
      const updates = await import('/js/service-worker-update.js');
      await updates.checkForAppVersionUpdate(await navigator.serviceWorker.getRegistration(), navigator.serviceWorker, window, { force: true });
    });
    await expect.poll(() => server.state.held).toBeGreaterThan(0);
    await expect(page.locator('#version-update-banner')).toHaveCount(0);
    expect(await page.evaluate(() => (window as typeof window & { APP_BUILD_ID?: unknown }).APP_BUILD_ID)).toBe('build-a');
    server.release();
    await expect(page.locator('#version-update-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-version-update-action="apply"]')).toHaveText('Reload');
    await page.locator('[data-version-update-action="dismiss"]').click();
    expect(await page.evaluate(() => (window as typeof window & { APP_BUILD_ID?: unknown }).APP_BUILD_ID)).toBe('build-a');
    // A later visit offers the still-pending update again.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#version-update-banner')).toBeVisible();
    await server.disconnect(); // Applying an already cached build needs no download.
    await page.locator('[data-version-update-action="apply"]').click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { APP_BUILD_ID?: unknown }).APP_BUILD_ID).catch(() => null), { timeout: 30_000 }).toBe('build-b');
    await expect(other.locator('#version-update-banner')).toContainText('Reload');
    expect(await other.evaluate(() => (window as typeof window & { APP_BUILD_ID?: unknown }).APP_BUILD_ID)).toBe('build-a');
    await other.locator('[data-version-update-action="apply"]').click();
    await expect.poll(() => other.evaluate(() => (window as typeof window & { APP_BUILD_ID?: unknown }).APP_BUILD_ID).catch(() => null), { timeout: 30_000 }).toBe('build-b');
    // Build ID is stamped before async profile hydration finishes. Give both
    // offline reloads the same bounded lifecycle budget as worker activation.
    await expect(page.locator('html[data-app-ready]')).toBeAttached({ timeout: 30_000 });
    await expect(other.locator('html[data-app-ready]')).toBeAttached({ timeout: 30_000 });
    expect(await page.evaluate(() => localStorage.getItem('pwa-retained-data'))).toBe('retained');
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.entries))
      .toEqual([{ date: '2026-09-01', markers: { 'biochemistry.glucose': 5.8 } }]);
    expect(await other.evaluate(async () => (await import('/js/state.js')).state.importedData.entries))
      .toEqual([{ date: '2026-09-01', markers: { 'biochemistry.glucose': 5.8 } }]);
    // WebKit can transiently reject CacheStorage reads while activation settles.
    // Retry the read, while still requiring exactly the new build's cache.
    await expect(async () => {
      expect(await page.evaluate(() => caches.keys())).toEqual(['labcharts-vbuild-build-b']);
    }).toPass({ timeout: 5_000 });
  } catch (originalError) {
    // Only a failed original case performs these bounded, read-only observations.
    // A timeout can leave the read-only evaluation pending until page teardown.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([
        page.evaluate(async () => {
          const failure = (error: unknown) => ({ state: 'error',
            name: error instanceof Error ? error.name.slice(0, 64) : typeof error });
          const workerState = (worker: ServiceWorker | null) => worker ? { state: worker.state } : null;
          const buildId: unknown = (window as typeof window & { APP_BUILD_ID?: unknown }).APP_BUILD_ID;
          const documentState = { readyState: document.readyState,
            appReady: document.documentElement.hasAttribute('data-app-ready'),
            buildId: typeof buildId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(buildId)
              ? buildId : null };
          const readWorkers = async () => {
            try {
              const registrations = await navigator.serviceWorker.getRegistrations();
              return { state: 'complete', controller: workerState(navigator.serviceWorker.controller),
                count: registrations.length, registrations: registrations.slice(0, 4).map(registration => ({
                  installing: workerState(registration.installing), waiting: workerState(registration.waiting),
                  active: workerState(registration.active),
                })) };
            } catch (error) { return failure(error); }
          };
          const readCachedScript = async () => {
            try {
              // CacheStorage.match with cacheName never creates a missing cache.
              const response = await caches.match('/js/url-safety.js', { cacheName: 'labcharts-vbuild-build-a' });
              if (!response) return { state: 'missing' };
              const metadata = { status: response.status, contentType: (response.headers.get('content-type') || '').slice(0, 96) };
              if (!response.body) return { state: 'no-body', ...metadata };
              const reader = response.body.getReader();
              const chunks: Uint8Array[] = [];
              let bytes = 0;
              try {
                while (true) {
                  const chunk = await reader.read();
                  if (chunk.done) break;
                  bytes += chunk.value.byteLength;
                  if (bytes > 65_536) {
                    await reader.cancel();
                    return { state: 'oversize', ...metadata, maxBytes: 65_536 };
                  }
                  chunks.push(chunk.value);
                }
              } finally { reader.releaseLock(); }
              const body = new Uint8Array(bytes);
              let offset = 0;
              for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
              const digest = await crypto.subtle.digest('SHA-256', body);
              const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
              return { state: 'complete', ...metadata, bytes, sha256 };
            } catch (error) { return failure(error); }
          };
          const [workers, cachedScript] = await Promise.all([readWorkers(), readCachedScript()]);
          return { document: documentState, workers, cachedScript };
        }).then(value => ({ state: 'complete', value }), error => ({ state: 'error',
          name: error instanceof Error ? error.name.slice(0, 64) : typeof error })),
        new Promise<{ state: 'timeout'; timeoutMs: number }>(resolve => {
          timer = setTimeout(() => resolve({ state: 'timeout', timeoutMs: 2_000 }), 2_000);
        }),
      ]);
      const file = test.info().outputPath('pwa-lifecycle-failure-state.json');
      await writeFile(file, JSON.stringify({ schemaVersion: 1, failedScripts, droppedFailures, snapshot }, null, 2),
        { encoding: 'utf8', flag: 'wx' });
      await test.info().attach('pwa-lifecycle-failure-state', { path: file, contentType: 'application/json' });
    } catch {
      // Diagnostic errors never replace the original assertion/navigation error.
      try {
        test.info().annotations.push({ type: 'pwa-diagnostic-error', description: 'Failure evidence could not be written or attached.' });
      } catch { /* Reporting cannot replace the original error either. */ }
    } finally { if (timer !== undefined) clearTimeout(timer); }
    throw originalError;
  } finally {
    try { page.off('requestfailed', observeFailedScript); }
    catch { /* Listener cleanup cannot replace the original case outcome. */ }
    await server.close();
  }
});
