import { expect, test } from '../playwright/coverage-fixture.js';
import { startPwaServer } from './app-server.js';

test.use({ serviceWorkers: 'allow' });

async function openInstalledApp(page, origin) {
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
  });
  await page.goto(`${origin}/app?dev-sw=1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async () => {
    window.endTour?.();
    (await import('/js/chat-panel.js')).closeChatPanel();
    (await import('/js/changelog.js')).closeChangelog();
  });
}

test('installed shell opens lazy features and reloads with the origin disconnected', async ({ page, baseURL, isMobile }) => {
  const server = await startPwaServer(baseURL);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openInstalledApp(page, server.origin);
    await expect(page.locator('#version-update-banner')).toHaveCount(0);
    const manifest = await page.evaluate(async () => {
      const url = document.querySelector('link[rel="manifest"]').href;
      const body = await fetch(url).then(r => r.json());
      return { ...body, iconsOk: await Promise.all(body.icons.map(icon => fetch(new URL(icon.src, url)).then(r => r.ok))) };
    });
    expect(manifest).toMatchObject({ id: '/app', start_url: '/app', display: 'standalone', iconsOk: [true, true, true] });
    server.state.offline = true;
    expect(await page.evaluate(() => fetch('/api/offline-proof').then(() => false, () => true))).toBe(true);
    await page.locator('.settings-btn').evaluate(button => button.click());
    await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
    await expect(page.locator('#settings-modal .settings-layout')).toHaveCSS('display', isMobile ? 'flex' : 'grid');
    await page.locator('[data-settings-tab="wearables"]').click();
    await expect(page.locator('[data-tab-panel="wearables"]')).toHaveClass(/\bactive\b/);
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#settings-modal img')]
      .filter(img => img.loading !== 'lazy' || img.getBoundingClientRect().top < innerHeight)
      .every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    await page.evaluate(async () => {
      (await import('/js/settings-loader.js')).closeSettingsModal();
      await (await import('/js/views.js')).navigate('light');
    });
    await expect(page.locator('.light-page')).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});

test('failed update preserves the installed app; retry updates two tabs without losing local data', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const server = await startPwaServer(baseURL);
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
      const failed = new Promise(resolve => registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(worker.state); });
      }, { once: true }));
      await registration.update();
      return failed;
    });
    expect(failedState).toBe('redundant');
    expect(await page.evaluate(() => window.APP_BUILD_ID)).toBe('build-a');
    expect(await page.evaluate(() => localStorage.getItem('pwa-retained-data'))).toBe('retained');
    await expect(page.locator('#version-update-banner')).toHaveCount(0);
    await expect.poll(() => page.evaluate(async () => !(await navigator.serviceWorker.getRegistration()).installing)).toBe(true);
    server.state.failPath = '';
    server.state.holdPath = '/css/settings.css';
    await page.evaluate(async () => {
      const updates = await import('/js/service-worker-update.js');
      await updates.checkForAppVersionUpdate(await navigator.serviceWorker.getRegistration(), navigator.serviceWorker, window, { force: true });
    });
    await expect.poll(() => server.state.held).toBeGreaterThan(0);
    await expect(page.locator('#version-update-banner')).toHaveCount(0);
    expect(await page.evaluate(() => window.APP_BUILD_ID)).toBe('build-a');
    server.release();
    await expect(page.locator('#version-update-banner')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-version-update-action="apply"]')).toHaveText('Reload');
    await page.locator('[data-version-update-action="dismiss"]').click();
    expect(await page.evaluate(() => window.APP_BUILD_ID)).toBe('build-a');
    // A later visit offers the still-pending update again.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#version-update-banner')).toBeVisible();
    server.state.offline = true; // Applying an already cached build needs no download.
    await page.locator('[data-version-update-action="apply"]').click();
    await expect.poll(() => page.evaluate(() => window.APP_BUILD_ID).catch(() => null), { timeout: 30_000 }).toBe('build-b');
    await expect(other.locator('#version-update-banner')).toContainText('Reload');
    expect(await other.evaluate(() => window.APP_BUILD_ID)).toBe('build-a');
    await other.locator('[data-version-update-action="apply"]').click();
    await expect.poll(() => other.evaluate(() => window.APP_BUILD_ID).catch(() => null)).toBe('build-b');
    expect(await page.evaluate(() => localStorage.getItem('pwa-retained-data'))).toBe('retained');
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.entries))
      .toEqual([{ date: '2026-09-01', markers: { 'biochemistry.glucose': 5.8 } }]);
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['labcharts-vbuild-build-b']);
  } finally { await server.close(); }
});
