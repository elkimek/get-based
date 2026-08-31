import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
});

async function loadDemoAndReadNutrition(page, sex) {
  return page.evaluate(async requestedSex => {
    await (await import('/js/export.js')).loadDemoData(requestedSex);
    const { state } = await import('/js/state.js');
    const { listActiveProfileMeals } = await import('/js/nutrition-store.js');
    const meals = await listActiveProfileMeals();
    const current = state.profiles.find(profile => profile.id === state.currentProfile);
    return {
      name: current?.name,
      tags: current?.tags || [],
      mealCount: meals.length,
      mealNames: meals.map(meal => meal.name),
      imageCount: meals.reduce((total, meal) => total + (meal.images?.length || 0), 0),
      summaryMeals: state.nutritionSummary?.totalMeals,
      loggedDays: state.nutritionSummary?.windows?.d7?.loggedDays,
      targetNutrients: state.importedData.nutritionTargets?.widgetNutrients || [],
      contextEnabled: state.importedData.contextSourceSettings?.['meals-nutrition'],
      contextDays: state.importedData.nutritionContextDays,
      demoProfileNames: state.profiles.filter(profile => profile.tags?.includes('demo')).map(profile => profile.name),
    };
  }, sex);
}

test('Demo Alex and Demo Sarah include current, usable Meal Log histories without provider calls', async ({ page }) => {
  test.setTimeout(60_000);
  const providerRequests = [];
  page.on('request', request => {
    if (/api\.(openrouter|venice)\.ai/.test(request.url())) providerRequests.push(request.url());
  });

  await page.goto('/app', { waitUntil: 'load' });

  const alex = await loadDemoAndReadNutrition(page, 'male');
  expect(alex).toMatchObject({
    name: 'Demo Alex',
    tags: expect.arrayContaining(['demo']),
    mealCount: 69,
    summaryMeals: 69,
    loggedDays: 6,
    imageCount: 0,
    contextEnabled: true,
    contextDays: 30,
  });
  expect(alex.mealNames).toContain('Mediterranean chicken quinoa bowl');
  expect(alex.targetNutrients).toEqual(['proteinG', 'fiberG', 'fluidMl', 'sodiumMg']);

  const widget = page.locator('.dashboard-widget[data-widget-id="nutrition"]');
  await expect(widget).toBeVisible();
  await expect(widget).toContainText('6 of 7 days');
  await expect(widget).toContainText('Recorded daily averages');
  await page.evaluate(async () => (await import('/js/chat-panel.js')).closeChatPanel());
  await expect(page.locator('#chat-panel')).not.toHaveClass(/\bopen\b/);
  await widget.getByRole('button', { name: 'History' }).click();
  await expect(page.locator('.nutrition-history-modal')).toContainText('67 entries');
  await expect(page.getByRole('button', { name: 'Open Mediterranean chicken quinoa bowl details' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Mediterranean chicken quinoa bowl details' }).click();
  await expect(page.locator('#detail-modal')).toContainText('Synthetic demo meal');
  await expect(page.locator('#detail-modal')).toContainText('Bundled demo estimate');
  await page.locator('[data-nutrition-action="back"]').click();
  await page.getByRole('tab', { name: 'Trends' }).click();
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Days with entries' }).locator('strong')).toHaveText('29');
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Meals' }).locator('strong')).toHaveText('62');
  await expect(page.locator('.nutrition-history-overview')).toContainText('5 drink logs');
  await expect(page.locator('.nutrition-history-timing')).toBeVisible();
  await expect(page.locator('.nutrition-history-timing')).toContainText('Observed fasting window');
  await expect(page.locator('.nutrition-history-timing')).toContainText('16.5 h');
  const alexCoverage = await page.locator('.nutrition-history-coverage-bar > span').allTextContents();
  expect(alexCoverage.slice(0, 4)).toEqual(['7/7', '7/7', '7/7', '7/7']);
  await page.locator('.nutrition-history-modal .modal-close').click();

  const sarah = await loadDemoAndReadNutrition(page, 'female');
  expect(sarah).toMatchObject({
    name: 'Demo Sarah',
    tags: expect.arrayContaining(['demo']),
    mealCount: 91,
    summaryMeals: 91,
    loggedDays: 6,
    imageCount: 0,
    contextEnabled: true,
    contextDays: 30,
  });
  expect(sarah.mealNames).toEqual(expect.arrayContaining([
    'Lentil beet and arugula salad',
    'Pea protein berry shake',
  ]));
  expect(sarah.targetNutrients).toEqual(['proteinG', 'fiberG', 'ironMg', 'fluidMl']);
  expect(sarah.demoProfileNames).toEqual(expect.arrayContaining(['Demo Alex', 'Demo Sarah']));

  await expect(widget).toBeVisible();
  await expect(widget).toContainText('Iron');
  await widget.getByRole('button', { name: 'History' }).click();
  // History intentionally remembers the last selected view across profiles.
  await page.getByRole('tab', { name: 'Meals' }).click();
  await expect(page.locator('.nutrition-history-modal')).toContainText('88 entries');
  await expect(page.getByRole('button', { name: 'Open Lentil beet and arugula salad details' })).toBeVisible();
  await page.getByRole('tab', { name: 'Trends' }).click();
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Days with entries' }).locator('strong')).toHaveText('29');
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Meals' }).locator('strong')).toHaveText('83');
  await expect(page.locator('.nutrition-history-overview')).toContainText('5 drink logs');

  expect(providerRequests).toEqual([]);
});
