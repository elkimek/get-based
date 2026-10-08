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

test('static offline AI storage failure keeps the saved verdict, then a successful retry survives two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData(), sunDefaults: { fitzpatrick: 'II', completedAt: 1, aiAnalysis: { status: 'ok', dot: 'yellow', tip: 'Earlier saved context', detail: 'Keep this until a new save succeeds', fingerprint: 'old', actions: ['Keep existing action'] } } });
  await context.addInitScript(() => { if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-ai-paused', 'true'); });
  const errors: string[] = [], csp: string[] = []; const observe = (p: Page) => p.on('pageerror', e => errors.push(e.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('verdictPersistCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e => { void (window as unknown as { verdictPersistCsp(value: string): Promise<void> }).verdictPersistCsp(e.violatedDirective); }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }]; server.state.offline = true; await openLight(page);
    const before = await page.evaluate(readComparisonAcceptanceProfile);
    await page.evaluate(() => {
      localStorage.setItem('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:11434', model: 'persistence-fixture', mode: 'ollama' })); localStorage.setItem('labcharts-ollama-model', 'persistence-fixture'); localStorage.setItem('labcharts-ai-paused', 'false');
      const originalFetch = window.fetch.bind(window), originalPut = IDBObjectStore.prototype.put;
      let fail = true, rejected = 0, requests = 0;
      IDBObjectStore.prototype.put = function(value, key) {
        if (this.name === 'kv' && key === 'labcharts-default-imported' && fail) { rejected++; throw new DOMException('Synthetic profile quota failure', 'QuotaExceededError'); }
        return originalPut.call(this, value, key);
      };
      window.fetch = async (input, options) => {
        if (!String(input instanceof Request ? input.url : input).includes('/v1/chat/completions')) return originalFetch(input, options);
        requests++; return Response.json({ choices: [{ message: { content: JSON.stringify({ dot: 'green', tip: 'New saved context', detail: 'Committed after retry', actions: ['New saved action'] }) } }] });
      };
      Object.assign(window, { verdictWriteFixture: { recover: () => { fail = false; }, rejected: () => rejected, requests: () => requests } });
    });
    const panel = page.locator('.light-setup-summary [data-light-onboarding-ai]');
    await panel.getByRole('button', { name: 'Re-run', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { verdictWriteFixture: { rejected(): number } }).verdictWriteFixture.rejected())).toBeGreaterThan(0);
    await expect(panel).toHaveAttribute('data-ai-state', 'ok'); await expect(panel.locator('.sun-detail-ai-tip')).toHaveText('⚠ Earlier saved context');
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    // Return through the actual route to prove the unchanged value is live state as well as stored data.
    const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
    await page.locator('[data-nav-action="navigate"][data-nav-route="dashboard"]').click(); await openLight(page);
    await expect(panel.locator('.sun-detail-ai-tip')).toHaveText('⚠ Earlier saved context');
    await page.evaluate(() => (window as unknown as { verdictWriteFixture: { recover(): void } }).verdictWriteFixture.recover());
    await panel.getByRole('button', { name: 'Re-run', exact: true }).click();
    await expect(panel.locator('.sun-detail-ai-tip')).toHaveText('✓ New saved context'); const saved = await page.evaluate(readComparisonAcceptanceProfile);
    expect(saved).toEqual({ ...(before as object), sunDefaults: { ...(before as { sunDefaults: object }).sunDefaults, aiAnalysis: (saved as { sunDefaults: { aiAnalysis: unknown } }).sunDefaults.aiAnalysis } });
    expect(await page.evaluate(() => (window as unknown as { verdictWriteFixture: { requests(): number } }).verdictWriteFixture.requests())).toBe(2); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) }); await openLight(cold);
      await expect(cold.locator('.light-setup-summary .sun-detail-ai-tip')).toHaveText('✓ New saved context'); expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(saved); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]); await fs.writeFile(test.info().outputPath('verdict-persistence-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
