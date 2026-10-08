import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import type { ProfileData } from '../../types/app-state.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { seedNutritionMealDetail } from '../helpers/nutrition-meal-detail-fixture.js';
import { readEncryptedNutritionMeals } from '../helpers/nutrition-meal-cache-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { navigateWithOfflineLaunchDiagnostics, captureOfflineLaunchDiagnostics } from '../helpers/offline-launch-diagnostics.js';
async function ready(page: Page, origin: string) {
  await navigateWithOfflineLaunchDiagnostics(page, origin + '/app?dev-sw=1', test.info());
  try { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 }); }
  catch (error) { await captureOfflineLaunchDiagnostics(page, test.info()); throw error; }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  return page.evaluate(() => { const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; return { appReadyAndSwControlledMs: performance.now(), navigationDurationMs: navigation.duration, documentTransferBytes: navigation.transferSize, documentDecodedBytes: navigation.decodedBodySize }; });
}
async function history(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click(); await expect(page.locator('[data-context-cards-view]')).toBeVisible();
  await page.locator('[data-context-card-key="diet"] [data-nutrition-context-link]').click(); await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
}
const ordered = <T extends { id?: unknown }>(rows: T[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
async function committed(page: Page, before: ProfileData, ids: string[], started: number) {
  const current = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
  const { nutritionMeals: previousMeals, _deletedClearedAt: previousClocks, ...previousFields } = before;
  const { nutritionMeals: meals, _deletedClearedAt: clocks, ...fields } = current;
  expect(fields).toEqual(previousFields);
  expect(ordered(meals!.filter(meal => !ids.includes(meal.id)))).toEqual(ordered(previousMeals!));
  const metadata = clocks as Record<string, Record<string, number>>, previous = previousClocks as Record<string, Record<string, number>> | undefined;
  expect(clocks).toEqual({ ...previous, nutritionMeals: { ...previous?.nutritionMeals, ...Object.fromEntries(ids.map(id => [id, expect.any(Number)])) } });
  for (const id of ids) expect(metadata.nutritionMeals![id]).toBeGreaterThanOrEqual(started);
  const cache = await page.evaluate(readEncryptedNutritionMeals);
  expect(ordered(cache)).toEqual(ordered(meals!));
  return current;
}
test('static authored meal editor saves zero and unknown values offline, then edits and reuses them across cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context); const defaults = createDefaultProfileData(); delete defaults.manualValues; await context.addInitScript(seedNutritionMealDetail, defaults);
  const errors: string[] = [], csp: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('editorCsp', (_, directive: string) => { csp.push(directive); }); await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { editorCsp(value: string): Promise<void> }).editorCsp(event.violatedDirective); }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', ...await ready(page, server.origin) }]; const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData, started = Date.now();
    await expect(page.locator('link[href="/css/nutrition.css"]')).toHaveCount(0); server.state.offline = true;
    await history(page); await page.locator('[data-nutrition-action="detail"][data-nutrition-id="detail-owned"]').click();
    await page.getByRole('button', { name: 'Edit meal', exact: true }).click();
    await expect(page.locator('#nutrition-consumed-unit')).toHaveValue('servings'); await expect(page.locator('#nutrition-model-purpose')).toHaveText('Label model');
    const photos = await page.locator('#nutrition-photo-preview').evaluate(root => ({ available: root.clientWidth, images: [...root.querySelectorAll('img')].map(image => image.getBoundingClientRect().width) }));
    expect(photos.images).toHaveLength(2); for (const width of photos.images) expect(width).toBeGreaterThan(photos.available * .45);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await page.locator('[data-nutrition-action="return-detail"]').click(); await expect(page.locator('.confirm-overlay.show')).toBeVisible(); await page.locator('#confirm-ok').click();
    await expect(page.locator('[data-nutrition-meal-detail-view]')).toBeVisible(); await page.locator('[data-nutrition-action="back"]').click();
    await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
    await page.locator('[data-nutrition-history-view] [data-nutrition-action="open"]').click(); await expect(page.locator('[data-nutrition-editor-view]')).toBeVisible();
    await page.getByRole('tab', { name: 'Manual', exact: true }).click(); await page.locator('#nutrition-meal-name').fill('Offline <literal> meal'); await page.locator('#nutrition-meal-type').selectOption('lunch'); await page.locator('#nutrition-eaten-at').fill('2026-10-08T12:30'); await page.locator('#nutrition-note').fill('Keep offline note');
    for (const [key, value] of [['energyKcal', '500'], ['proteinG', '0'], ['carbohydrateG', '60'], ['fatG', '20']]) await page.locator(`#nutrition-${key}`).fill(value!);
    await page.locator('.nutrition-more-nutrients > summary').click(); await page.locator('#nutrition-vitaminCMg').fill('0');
    await page.locator('#nutrition-save-btn').click(); await expect(page.locator('[data-nutrition-meal-detail-view]')).toContainText('Offline <literal> meal');
    const first = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData, saved = first.nutritionMeals!.find(meal => meal.name === 'Offline <literal> meal')!; expect(saved).toBeDefined();
    const local = await page.evaluate(() => { const date = new Date('2026-10-08T12:30'); return { eatenAt: date.toISOString(), timezoneOffsetMinutes: date.getTimezoneOffset(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }; });
    expect(saved).toEqual({ id: expect.any(String), createdAt: expect.any(String), updatedAt: expect.any(String), name: 'Offline <literal> meal', mealType: 'lunch', ...local, localDate: '2026-10-08', localTimeMinutes: 750, note: 'Keep offline note', analysisContext: '', nutrients: { energyKcal: 500, proteinG: 0, carbohydrateG: 60, fatG: 20, vitaminCMg: 0 }, components: [], assumptions: [], warnings: [], confidence: null, images: [], reviewed: true, source: { kind: 'manual', recordedAt: expect.any(String), nutrientBasis: 'user-entered', review: { userContext: '', editedNutrients: ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'vitaminCMg'], editedComponentIdentities: [], mealNameEdited: false, reviewedAt: expect.any(String) } } });
    for (const stamp of [saved.createdAt, saved.updatedAt, (saved.source as { recordedAt: string }).recordedAt]) expect(new Date(String(stamp)).getTime()).toBeGreaterThanOrEqual(started);
    let snapshot = await committed(page, before, [saved.id], started); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({ phase: `offline-cold-${launch + 1}`, ...await ready(cold, server.origin) }); expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
      await history(cold); await cold.locator(`[data-nutrition-action="detail"][data-nutrition-id="${saved.id}"]`).click();
      await cold.locator(`[data-nutrition-action="${launch === 0 ? 'edit' : 'reuse'}"]`).click(); await expect(cold.locator('[data-nutrition-editor-view]')).toBeVisible();
      await expect(cold.locator('#nutrition-proteinG')).toHaveValue('0'); await expect(cold.locator('#nutrition-fiberG')).toHaveValue(''); await cold.locator('.nutrition-more-nutrients > summary').click(); await expect(cold.locator('#nutrition-vitaminCMg')).toHaveValue('0');
      await cold.locator('#nutrition-note').fill(launch === 0 ? 'Edited offline note' : 'Reused offline note'); await cold.locator('#nutrition-save-btn').click(); await expect(cold.locator('[data-nutrition-meal-detail-view]')).toBeVisible();
      const current = await cold.evaluate(readComparisonAcceptanceProfile) as ProfileData, added = current.nutritionMeals!.filter(meal => !before.nutritionMeals!.some(previous => previous.id === meal.id));
      expect(added).toHaveLength(launch === 0 ? 1 : 2); const edited = added.find(meal => meal.id === saved.id)!;
      expect(edited).toEqual({ ...saved, note: 'Edited offline note', updatedAt: expect.any(String), source: { ...(saved.source as object), review: { ...(saved.source as { review: object }).review, reviewedAt: expect.any(String) } } });
      if (launch === 1) { const reused = added.find(meal => meal.id !== saved.id)!; expect(reused).toMatchObject({ name: saved.name, note: 'Reused offline note', nutrients: saved.nutrients, images: [], source: { kind: 'reused-meal', templateMealId: saved.id, originalSource: { kind: 'manual', provider: '', model: '' } } }); expect(reused).not.toHaveProperty('responseCheckIn'); }
      snapshot = await committed(cold, before, added.map(meal => meal.id), started); await cold.close();
    }
    const final = await context.newPage(); loading.push({ phase: 'offline-final-cold', ...await ready(final, server.origin) }); expect(await final.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot); await final.close(); expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('meal-editor-loading.json'), JSON.stringify({ measurement: 'Document-relative performance.now sampled after automation observed app-ready and service-worker control; local fixture with offline origin, not hosted or physical-device performance acceptance.', loading }, null, 2) + '\n');
  } finally { await server.close(); }
});
