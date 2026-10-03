import { routeHtml } from '../helpers/browser-static-routes.js';
import { expect, test } from './coverage-fixture.js';

for (const boundary of ['cancel', 'close', 'profile', 'reload-profile']) {
  test(`meal photo preparation cannot restart after ${boundary}`, async ({ page }) => {
    await routeHtml(page, '**/nutrition-boundary-harness', '<div id="modal-overlay"></div><div id="detail-modal" class="nutrition-modal"></div>');
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
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
      state.currentProfile = 'request-origin'; (state as unknown as {importedData: unknown}).importedData = { entries: [] };
      (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).boundaryResult = { started: 0, applied: 0, finished: 0, settled: false };
      lifecycle.configureNutritionRequestLifecycle({
        selectedPhotos: () => [], getExistingImages: () => [{ thumbnailUrl: '/delayed-meal.png' }],
        startProgress: () => { (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).boundaryResult.started++; return 'id'; },
        applyAnalysis: () => { (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).boundaryResult.applied++; },
        finishProgress: () => { (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).boundaryResult.finished++; },
      });
      (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).pendingMeal = lifecycle.runNutritionMealAnalysis().finally(() => { (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).boundaryResult.settled = true; });
    });
    try {
      await expect.poll(() => requested).toBe(true);
      await page.evaluate(async action => {
        const lifecycle = await import('/js/nutrition-request-lifecycle.js');
        const { state } = await import('/js/state.js');
        if (action === 'cancel') (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).boundaryResult.cancelled = lifecycle.cancelNutritionMealAnalysis();
        else if (action === 'close') lifecycle.resetNutritionRequestLifecycle();
        else if (action === 'profile') state.currentProfile = 'destination';
        else (state as unknown as {importedData: unknown}).importedData = { entries: [] };
      }, boundary);
    } finally { release!(); }
    await page.evaluate(() => (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).pendingMeal);
    expect(await page.evaluate(() => (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).boundaryResult)).toMatchObject({ started: 0, applied: 0, finished: 0, settled: true });
    if (boundary === 'cancel') expect(await page.evaluate(() => (window as unknown as Window & {boundaryResult: {started: number; applied: number; finished: number; settled: boolean; cancelled?: boolean}; pendingMeal: Promise<unknown>}).boundaryResult.cancelled)).toBe(true);
    await expect(page.locator('#modal-overlay')).not.toHaveAttribute('data-modal-background-dismissible', '');
  });
}
