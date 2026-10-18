import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
async function open(page: Page, view = 'meals') {
  await page.evaluate(async selected => { await (await import('/js/nutrition.js')).openNutritionHistory('all', { view: selected, resetMeals: true }); }, view);
  await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => { const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]); return crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')); });
}
test.beforeEach(async ({ context, page }) => {
  await installDiscussionFixture(context); await context.addInitScript(() => localStorage.setItem('labcharts-ai-paused', 'true'));
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => {
    const [{ state }, profile, data, store] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/nutrition-store.js')]);
    state.importedData = profile.createDefaultProfileData();
    state.importedData.nutritionMeals = Array.from({ length: 50 }, (_, index) => {
      const date = new Date(); date.setDate(date.getDate() - index - 1); date.setHours(12, 0, 0, 0);
      const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { id: `history-owned-${index}`, name: `History meal ${index + 1}`, eatenAt: date.toISOString(), localDate, localTimeMinutes: 720, createdAt: date.toISOString(), updatedAt: date.toISOString(), reviewed: true, mealType: 'lunch', nutrients: { energyKcal: 500, proteinG: 20, carbohydrateG: 50, fatG: 20, fiberG: 5 }, source: { kind: 'manual' }, images: [] };
    });
    state.importedData.nutritionTargets = { configured: true, energyKcal: 2000, proteinBasis: 'fixed', proteinFixedG: 100, carbohydrateG: 200, fatG: 70, fiberG: 25, widgetNutrients: ['proteinG', 'carbohydrateG', 'fatG', 'fiberG'] };
    state.importedData.contextSourceSettings = { 'meals-nutrition': true };
    if (!await data.saveImportedData()) throw new Error('Could not seed committed history'); await store.hydrateNutritionSummary(state.currentProfile);
  });
});
test('owned History preserves paging, range selection, trends and read-only profile data', async ({ page }) => {
  const before = await stored(page); await open(page); const modal = page.locator('#detail-modal');
  await expect(page.getByRole('dialog', { name: 'Meals & Nutrition', exact: true })).toBeVisible();
  await expect(modal.locator('.nutrition-meal-row')).toHaveCount(12); await expect(modal.locator('.nutrition-meal-copy strong').first()).toHaveText('History meal 1');
  await expect(modal.locator('.nutrition-history-meals-head')).toContainText('Showing newest 12 of 50');
  await modal.evaluate(root => { root.scrollTop = 240; }); await modal.locator('.nutrition-history-more').evaluate((button: HTMLButtonElement) => button.click());
  await expect(modal.locator('.nutrition-meal-row')).toHaveCount(24); await expect(modal.locator('.nutrition-history-more')).toContainText('26 remaining'); await expect.poll(() => modal.evaluate(root => root.scrollTop)).toBeGreaterThanOrEqual(230);
  await page.getByRole('tab', { name: 'Trends', exact: true }).click(); await expect(modal.locator('.nutrition-goal-grade')).toHaveCount(4); await expect(modal.locator('.nutrition-target-ring')).toHaveClass(/is-poor/);
  await expect(modal.locator('.nutrition-fuel-composition')).toHaveAttribute('aria-label', /carbohydrate energy.*No preferred split/); await expect(modal.locator('.nutrition-history-timing')).toContainText('12:00');
  await expect(modal.locator('[data-nutrition-action="ask-history"]')).toBeEnabled();
  await modal.locator('[data-nutrition-range="30d"][data-nutrition-action="set-history-range"]').click(); await expect(modal.locator('[data-nutrition-range="30d"][data-nutrition-action="set-history-range"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Meals', exact: true }).click(); await expect(modal.locator('.nutrition-history-meals-head')).toContainText('29 entries');
  const rangeStyles = await modal.evaluate(root => {
    const selected = root.querySelector('[data-nutrition-action="set-history-range"][aria-pressed="true"]');
    const unselected = root.querySelector('[data-nutrition-action="set-history-range"][aria-pressed="false"]');
    if (!selected || !unselected) throw new Error('Missing selected and unselected history ranges');
    const probe = document.createElement('span'); probe.style.background = 'var(--accent-gradient)'; root.append(probe);
    const expectedGradient = getComputedStyle(probe).backgroundImage; probe.remove();
    const active = getComputedStyle(selected), inactive = getComputedStyle(unselected);
    return {expectedGradient, activeImage: active.backgroundImage, activeBorder: active.borderColor, activeInk: active.color, inactiveImage: inactive.backgroundImage, inactiveBorder: inactive.borderColor};
  });
  expect(rangeStyles.expectedGradient).not.toBe('none');
  expect(rangeStyles.activeImage).toBe(rangeStyles.expectedGradient);
  expect(rangeStyles.activeBorder).toBe('rgba(0, 0, 0, 0)');
  expect(rangeStyles.activeInk).toBe('rgb(255, 255, 255)');
  expect(rangeStyles.inactiveImage).toBe('none');
  expect(rangeStyles.inactiveBorder).not.toBe(rangeStyles.activeBorder);
  await modal.locator('.modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await stored(page)).toBe(before);
});
// Dense fine-pointer controls retain their native sizing; touch targets use the coarse-pointer styles.
test.describe('coarse-pointer touch targets', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    expect(await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      touch: navigator.maxTouchPoints > 0,
    }))).toEqual({ coarse: true, fine: false, touch: true });
  });

  test('History is accessible in six themes and narrow layouts with usable action targets', async ({ page }) => {
    test.setTimeout(120000); await open(page, 'trends');
    await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); document.head.append(link); await loaded; });
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const modal = page.locator('#detail-modal');
      await modal.evaluate(async root => { const animations: Animation[] = [...root.getAnimations({ subtree: true })]; for (let element: Element | null = root; element; element = element.parentElement) { getComputedStyle(element).backgroundColor; animations.push(...element.getAnimations()); } await Promise.all(animations.filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))); });
      expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} overflow`).toBe(true);
      for (const button of await modal.locator('button').all()) { const box = (await button.boundingBox())!; expect(box.height, `${theme}/${width} target height`).toBeGreaterThanOrEqual(44); expect(box.width, `${theme}/${width} target width`).toBeGreaterThanOrEqual(44); }
      expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
    }
  });
});
test('late History loading cannot replace another modal', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/css/nutrition.css', async route => { await gate; await route.continue(); });
  await page.evaluate(() => { void import('/js/nutrition.js').then(module => module.openNutritionHistory('all')); });
  await expect(page.locator('link[data-nutrition-stylesheet]')).toBeAttached();
  await page.evaluate(() => { const modal = document.getElementById('detail-modal')!; modal.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Replacement surface' })); });
  release(); await expect.poll(() => page.locator('link[data-nutrition-stylesheet]').evaluate((link: HTMLLinkElement) => !!link.sheet)).toBe(true);
  await expect(page.locator('#detail-modal')).toHaveText('Replacement surface'); await expect(page.locator('[data-nutrition-history-view]')).toHaveCount(0);
  await page.unroute('**/css/nutrition.css');
});
test('same-route refreshes preserve a pending History open', async ({ page }) => {
  let release!: () => void; let gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/css/nutrition.css', async route => { await gate; await route.continue(); });
  await page.evaluate(() => { void import('/js/nutrition.js').then(module => module.openNutritionHistory('all')); });
  await expect(page.locator('link[data-nutrition-stylesheet]')).toBeAttached();
  await page.evaluate(() => { document.getElementById('main-content')!.replaceChildren(document.createElement('section')); });
  release(); await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
  await page.locator('#detail-modal .modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await page.unroute('**/css/nutrition.css');
 });
test('actual navigation retires a pending History open', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/css/nutrition.css', async route => { await gate; await route.continue(); });
  await page.evaluate(() => { void import('/js/nutrition.js').then(module => module.openNutritionHistory('all')); });
  await expect(page.locator('link[data-nutrition-stylesheet]')).toBeAttached();
  await page.evaluate(() => document.querySelector<HTMLElement>('.nav-item[data-category="insight"]')!.click());
  await expect(page.locator('.nav-item[data-category="insight"]')).toHaveClass(/active/); release();
  await expect.poll(() => page.locator('link[data-nutrition-stylesheet]').evaluate((link: HTMLLinkElement) => !!link.sheet)).toBe(true);
  await expect(page.locator('[data-nutrition-history-view]')).toHaveCount(0);
});
test('failed History stylesheet loading leaves no unstyled dialog and can be retried', async ({ page }) => {
  await expect(page.locator('link[data-nutrition-stylesheet]')).toHaveCount(0);
  await page.route('**/css/nutrition.css', route => route.abort());
  expect(await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionHistory('all'))).toBe(false);
  await expect(page.locator('[data-nutrition-history-view]')).toHaveCount(0); await expect(page.locator('link[data-nutrition-stylesheet]')).toHaveCount(0);
  await page.unroute('**/css/nutrition.css'); await open(page);
});
test('a delete confirmation and connected controls retire on profile switch', async ({ page }) => {
  await open(page); await page.locator('.nutrition-meal-delete').first().click(); await expect(page.locator('#confirm-ok')).toBeVisible();
  await page.evaluate(async () => { const [{ state }, profile] = await Promise.all([import('/js/state.js'), import('/js/profile.js')]); state.currentProfile = 'nutrition-history-retired'; state.importedData = profile.createDefaultProfileData(); state.importedData.nutritionMeals = [{ id: 'history-owned-0', name: 'Other profile meal', eatenAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), nutrients: {}, source: { kind: 'manual' }, images: [], reviewed: true }]; window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); });
  await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); await expect(page.locator('[data-nutrition-history-view]')).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.nutritionMeals?.map(meal => meal.name))).toEqual(['Other profile meal']);
});
