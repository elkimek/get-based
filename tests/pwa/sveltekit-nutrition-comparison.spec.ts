import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { seedNutritionMealDetail } from '../helpers/nutrition-meal-detail-fixture.js';
import { encryptedComparisonFixture, nutritionComparisonFixture, openNutritionBenchmarkFromInsight, readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { navigateWithOfflineLaunchDiagnostics, captureOfflineLaunchDiagnostics } from '../helpers/offline-launch-diagnostics.js';
async function ready(page: Page, origin: string) {
  await navigateWithOfflineLaunchDiagnostics(page, origin + '/app?dev-sw=1', test.info());
  try { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 }); }
  catch (error) { await captureOfflineLaunchDiagnostics(page, test.info()); throw error; }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
test('static authored benchmark restores encrypted results offline through two cold launches and clears only its local metadata', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context);
  const defaults = createDefaultProfileData(); delete defaults.manualValues; await context.addInitScript(seedNutritionMealDetail, defaults);
  await context.addInitScript(() => { if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-debug', 'true'); });
  const errors: string[] = [], csp: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('comparisonCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { comparisonCsp(value: string): Promise<void> }).comparisonCsp(event.violatedDirective); }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    await ready(page, server.origin); const before = await page.evaluate(readComparisonAcceptanceProfile), snapshot = nutritionComparisonFixture();
    await page.evaluate(encryptedComparisonFixture, { snapshot }); expect(await page.evaluate(encryptedComparisonFixture, { read: true })).toEqual(snapshot);
    await expect(page.locator('link[href="/css/nutrition.css"]')).toHaveCount(0); server.state.offline = true;
    await openNutritionBenchmarkFromInsight(page);
    for (let launch = 0; launch < 3; launch++) {
      const target = launch === 0 ? page : await context.newPage();
      if (launch) { await ready(target, server.origin); await openNutritionBenchmarkFromInsight(target); }
      await expect(target.locator('[data-nutrition-benchmark-view]')).toBeVisible();
      await expect(target.locator('[data-nutrition-picker-view]')).toBeVisible();
      await expect(target.locator('[data-nutrition-reference="vitaminCMg"]')).toHaveValue('0');
      await expect(target.locator('#nutrition-benchmark-photo-input')).toHaveAttribute('capture', 'environment');
      const area = target.locator('#nutrition-comparison-results'); await expect(area).toHaveAttribute('data-result-count', '3');
      await expect(target.locator('#nutrition-comparison-history')).toContainText('Last comparison restored');
      await expect(area.locator('[data-nutrition-comparison-card="0"]')).toContainText('150 tokens · 100 in / 50 out');
      await expect(area.locator('[data-nutrition-comparison-card="1"]')).toContainText('6 of 8 shown');
      await expect(area.locator('.is-error')).toContainText('This request may still be billable.'); await expect(area.locator('.is-error')).toContainText('Choose a photo and run a new comparison to retry.');
      const detailed = area.locator('[data-nutrition-comparison-card="0"] .nutrition-comparison-detailed'); await detailed.locator('summary').click();
      await expect(detailed.locator('tbody tr').filter({ hasText: 'Vitamin C' }).locator('td')).toHaveText(['0 mg', '0 mg', 'Same']);
      await expect(detailed.locator('tbody tr').filter({ hasText: 'Sodium' })).toContainText('+20%');
      expect(await target.evaluate(encryptedComparisonFixture, { read: true })).toEqual(snapshot); expect(await target.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
      if (launch === 2) {
        await target.locator('#nutrition-comparison-history [data-nutrition-action="clear-comparison-history"]').click();
        await expect(area.locator('[data-nutrition-comparison-card]')).toHaveCount(0); await expect(area).not.toHaveAttribute('data-result-count');
        await expect.poll(() => target.evaluate(encryptedComparisonFixture, { read: true })).toBeNull(); expect(await target.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
      }
      await target.close();
    }
    const cold = await context.newPage(); await ready(cold, server.origin);
    expect(await cold.evaluate(encryptedComparisonFixture, { read: true })).toBeNull(); expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before); await cold.close();
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
