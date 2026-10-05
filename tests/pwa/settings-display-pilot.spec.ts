import { expect, test } from '../playwright/coverage-fixture.js';
import { startPwaServer } from './app-server.js';

test.use({ serviceWorkers: 'allow' });
test('Display Svelte component opens for the first time offline and retains preferences after cold reload', async ({ page, baseURL }) => {
  const server = await startPwaServer(baseURL);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
      localStorage.setItem('labcharts-analytics-consent-seen', '1');
    });
    await page.goto(`${server.origin}/app?dev-sw=1`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    expect(await page.locator('link[data-settings-stylesheet]').count()).toBe(0);
    expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('DisplaySettings.svelte.native.js')))).toBe(false);
    expect(await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const cache = await caches.open(cacheNames[0]!);
      return !!(await cache.match('/js/components/DisplaySettings.svelte.native.js'));
    })).toBe(true);
    await server.disconnect();
    await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('display'); });
    const panel = page.locator('#settings-tab-display');
    await panel.locator('[data-unit="US"]').click();
    await panel.locator('[data-alt-units="on"]').click();
    await expect(panel.locator('[data-unit="US"]')).toHaveAttribute('aria-pressed', 'true');
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('display'); });
    await expect(panel.locator('[data-unit="US"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.locator('[data-alt-units="on"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.locator('[data-unit="US"]')).toHaveCSS('min-height', '44px');
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
