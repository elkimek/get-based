import { expect, test } from './coverage-fixture.js';

for (const boundary of ['cancel', 'close', 'profile', 'reload-profile']) {
  test(`meal photo preparation cannot restart after ${boundary}`, async ({ page }) => {
    await page.route('**/nutrition-boundary-harness', route => route.fulfill({
      contentType: 'text/html', body: '<div id="modal-overlay"></div><div id="detail-modal" class="nutrition-modal"></div>',
    }));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requested = false;
    await page.route('**/delayed-meal.png', async route => {
      requested = true;
      await gate;
      await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZcL8AAAAASUVORK5CYII=', 'base64') });
    });
    await page.goto('/nutrition-boundary-harness');
    await page.evaluate(async () => {
      const lifecycle = await import('/js/nutrition-request-lifecycle.js');
      const { state } = await import('/js/state.js');
      state.currentProfile = 'request-origin'; state.importedData = { entries: [] };
      window.boundaryResult = { started: 0, applied: 0, finished: 0, settled: false };
      lifecycle.configureNutritionRequestLifecycle({
        selectedPhotos: () => [], getExistingImages: () => [{ thumbnailUrl: '/delayed-meal.png' }],
        startProgress: () => { window.boundaryResult.started++; return 'id'; },
        applyAnalysis: () => { window.boundaryResult.applied++; },
        finishProgress: () => { window.boundaryResult.finished++; },
      });
      window.pendingMeal = lifecycle.runNutritionMealAnalysis().finally(() => { window.boundaryResult.settled = true; });
    });
    try {
      await expect.poll(() => requested).toBe(true);
      await page.evaluate(async action => {
        const lifecycle = await import('/js/nutrition-request-lifecycle.js');
        const { state } = await import('/js/state.js');
        if (action === 'cancel') window.boundaryResult.cancelled = lifecycle.cancelNutritionMealAnalysis();
        else if (action === 'close') lifecycle.resetNutritionRequestLifecycle();
        else if (action === 'profile') state.currentProfile = 'destination';
        else state.importedData = { entries: [] };
      }, boundary);
    } finally { release(); }
    await page.evaluate(() => window.pendingMeal);
    expect(await page.evaluate(() => window.boundaryResult)).toMatchObject({ started: 0, applied: 0, finished: 0, settled: true });
    if (boundary === 'cancel') expect(await page.evaluate(() => window.boundaryResult.cancelled)).toBe(true);
    await expect(page.locator('#modal-overlay')).not.toHaveAttribute('data-modal-background-dismissible', '');
  });
}
