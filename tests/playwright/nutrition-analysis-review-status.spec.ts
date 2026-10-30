import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
for (const kind of ['meal-photo', 'nutrition-label'] as const) test(`${kind} review with uncertainty requires Save and preserves recorded data even after the form becomes valid`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await seedDashboardControlProfile(page);
  const before = await dashboardHealth(page), meals = await page.evaluate(async () => JSON.stringify(await (await import('/js/nutrition-store.js')).listNutritionMeals((await import('/js/state.js')).state.currentProfile, { limit: 10000 })));
  await page.evaluate(async kind => {
    await (await import('/js/nutrition-context.js')).loadNutritionFeature();
    await (await import('/js/nutrition.js')).openNutritionEditor();
    const analysis = (await import('/js/nutrition-analysis.js')).normalizeMealAnalysis({ mealName: 'Synthetic reviewed rice', components: [{ name: 'Rice', quantityG: 100, confidence: 0.75, nutrients: { energyKcal: 130, proteinG: 2 } }], nutrients: { energyKcal: 130, proteinG: 2 }, confidence: 0.75, warnings: ['Synthetic uncertainty requires human review.'], assumptions: [], label: null });
    const review = await import('/js/nutrition-review-ui.js'); review.setAnalysisKind(kind);
    review.applyAnalysis({ analysis, images: [], source: { kind: kind === 'meal-photo' ? 'ai-photo-estimate' : 'ai-label-scan', analysisKind: kind, provider: 'custom', model: 'synthetic-vision', modelDisplay: 'Synthetic vision', ...(kind === 'meal-photo' ? { aiNutritionEstimate: { nutrientKeys: ['energyKcal', 'proteinG'], basis: 'model-estimated-from-food-identity-and-portions' } } : {}) } });
  }, kind);
  const status = page.locator('#nutrition-analysis-status');
  await expect(status).toHaveClass(/is-success/);
  await expect(status).toContainText('Review the values and notes, then save.');
  await expect(status).not.toContainText('saved record');
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Synthetic reviewed rice');
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('130');
  await expect(page.locator('#nutrition-save-btn')).toBeDisabled();
  await page.locator('#nutrition-meal-type').selectOption('lunch');
  await expect(page.locator('#nutrition-save-btn')).toBeEnabled();
  expect(await dashboardHealth(page)).toBe(before);
  expect(await page.evaluate(async () => JSON.stringify(await (await import('/js/nutrition-store.js')).listNutritionMeals((await import('/js/state.js')).state.currentProfile, { limit: 10000 })))).toBe(meals);
  expect(errors).toEqual([]);
});
