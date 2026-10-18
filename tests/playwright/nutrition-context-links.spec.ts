import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
test.beforeEach(async ({ context, page }) => {
  await installDiscussionFixture(context); await context.addInitScript(() => localStorage.setItem('labcharts-ai-paused', 'true'));
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => {
    const [{ state }, profile, data, nutrition] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/nutrition-store.js')]);
    state.importedData = profile.createDefaultProfileData(); state.importedData.diet = { breakfast: 'strawberries and yogurt' };
    // These links consume committed history. Seed the canonical profile and
    // hydrate its real encrypted meal cache without requesting storage permission.
    state.importedData.nutritionMeals = [8, 18].map(hour => {
      const eatenAt = new Date(); eatenAt.setDate(eatenAt.getDate() - 1); eatenAt.setHours(hour, 0, 0, 0);
      const localDate = `${eatenAt.getFullYear()}-${String(eatenAt.getMonth() + 1).padStart(2, '0')}-${String(eatenAt.getDate()).padStart(2, '0')}`;
      return { id: `nutrition-link-${hour}`, name: `Link ${hour === 8 ? 'breakfast' : 'dinner'}`, eatenAt: eatenAt.toISOString(), localDate, localTimeMinutes: hour * 60, mealType: hour === 8 ? 'breakfast' : 'dinner', createdAt: eatenAt.toISOString(), updatedAt: eatenAt.toISOString(), reviewed: true, nutrients: { energyKcal: 500, proteinG: 20 }, source: { kind: 'manual' }, images: [] };
    });
    if (!await data.saveImportedData()) throw new Error('Could not seed nutrition profile');
    await nutrition.hydrateNutritionSummary(state.currentProfile);
  });
  await insight(page);
});
async function insight(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click();
  await page.locator('.nav-item[data-category="insight"]').click(); await expect(page.locator('[data-context-cards-view]')).toBeVisible();
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported'));
  });
}
test('nutrition card links preserve real meal/trend navigation and do not write the profile', async ({ page }) => {
  const before = await saved(page), diet = page.locator('[data-context-card-key="diet"] [data-nutrition-context-link]');
  await expect(diet).toContainText('Detailed meal log active'); await expect(diet).toContainText('2 logged meals · 1/7 days');
  await expect(page.locator('[data-food-contaminant-badge]')).toHaveCount(0);
  await diet.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.nav-item[data-category="body"]')).toHaveClass(/active/);
  await expect(page.locator('#detail-modal .nutrition-history-head h3')).toHaveText('Meals & Nutrition');
  await expect(page.getByRole('tab', { name: 'Meals', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#detail-modal')).toContainText('Link breakfast'); await expect(page.locator('#detail-modal')).toContainText('Link dinner');
  await page.locator('#detail-modal .modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await insight(page);
  const timing = page.locator('[data-context-card-key="lightCircadian"] [data-nutrition-context-link]');
  await expect(timing).toContainText('Logged meal timing'); await expect(timing).toContainText('first 08:00 · last 18:00');
  await timing.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('tab', { name: 'Trends', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.nutrition-history-timing')).toBeVisible(); await expect(page.locator('.nutrition-history-timing')).toContainText('Logged meal timing');
  await page.locator('#detail-modal .modal-close').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await saved(page)).toBe(before);
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

  test('nutrition card links stay accessible and contained across themes and narrow layouts', async ({ page }) => {
    test.setTimeout(120000);
    await page.evaluate(async () => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css';
      const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); document.head.append(link); await loaded;
    });
    const links = page.locator('[data-nutrition-context-link]'); await expect(links).toHaveCount(2);
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const link of await links.all()) {
        await link.evaluate(async root => {
          const animations: Animation[] = []; for (let element: Element | null = root; element; element = element.parentElement) { getComputedStyle(element).backgroundColor; animations.push(...element.getAnimations()); }
          await Promise.all(animations.filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
        });
        expect((await link.boundingBox())!.height, `${theme}/${width} target`).toBeGreaterThanOrEqual(44);
        expect(await link.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} overflow`).toBe(true);
        expect(await link.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
      }
    }
  });
});
