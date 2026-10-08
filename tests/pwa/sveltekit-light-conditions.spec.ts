import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { seedLightPageFixture } from '../helpers/light-page-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';

test('static authored conditions first load offline, refresh and inspect modeled data through two cold launches without profile writes', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData(), sunDefaults: { fitzpatrick: 'II', completedAt: 1, coords: { lat: 50.08, lon: 14.43 } } });
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-ai-paused', 'true');
    if (!localStorage.getItem('conditions-provider-seeded')) {
      localStorage.setItem('conditions-provider-seeded', '1'); localStorage.setItem('labcharts-meteo-config', JSON.stringify({ mode: 'open-meteo', privacyRounding: 0.1 }));
    }
    const original = window.fetch.bind(window);
    window.fetch = (input, options) => /https:\/\/[^/]*open-meteo\.com\//.test(String(input instanceof Request ? input.url : input))
      ? Promise.reject(new TypeError('Conditions provider unavailable offline')) : original(input, options);
  });
  const errors: string[] = [], csp: string[] = [];
  const observe = (p: Page) => p.on('pageerror', e => errors.push(e.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('conditionsCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e => { void (window as unknown as { conditionsCsp(value: string): Promise<void> }).conditionsCsp(e.violatedDirective); }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  async function check(target: Page) {
    await openLight(target);
    const widget = target.locator('.dashboard-widget[data-widget-id="light-conditions-now"]'), slot = widget.locator('.conditions-now');
    await expect(slot).toHaveAttribute('aria-busy', 'false'); await expect(slot).toHaveAttribute('data-light-conditions-presentation', '');
    await expect(widget.locator('.conditions-now-source')).toContainText('offline modeled estimate');
    await expect(widget.locator('.conditions-now-grid')).toBeVisible(); await expect(widget).toContainText('UV index'); await expect(widget).toContainText('Air quality');
    const details = widget.getByRole('button', { name: 'Show raw conditions response, source, cache, and sanity check', exact: true }); await details.click();
    const modal = target.getByRole('dialog', { name: 'Inspect conditions data', exact: true }); await expect(modal).toHaveAttribute('data-light-conditions-presentation', '');
    await expect(modal.getByRole('region', { name: 'Raw conditions payload', exact: true })).toContainText('zenith_offline');
    await expect(modal).toContainText('Location sent to provider'); await expect(modal).toContainText('privacy-rounded');
    await target.keyboard.press('Escape'); await expect(modal).toHaveCount(0); await expect(details).toBeFocused();
    await widget.getByRole('button', { name: 'Refresh conditions data — bypasses cache', exact: true }).click();
    await expect(slot).toHaveClass(/is-refreshing/); await expect(slot).not.toHaveClass(/is-refreshing/);
    await expect(widget.locator('.conditions-now-source')).toContainText('offline modeled estimate');
  }
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }], before = await page.evaluate(readComparisonAcceptanceProfile);
    server.state.offline = true; const first = Date.now(); await check(page); expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    loading.push({ phase: 'offline-first-conditions', readyMs: Date.now() - first }); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) }); await check(cold);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('conditions-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
