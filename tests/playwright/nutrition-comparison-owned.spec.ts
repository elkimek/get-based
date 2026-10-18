import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { seedNutritionMealDetail } from '../helpers/nutrition-meal-detail-fixture.js';
import { encryptedComparisonFixture, nutritionComparisonFixture, openNutritionBenchmarkFromInsight } from '../helpers/nutrition-comparison-fixture.js';

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

  test('authored comparison results preserve restored failures, keyboard tables and six-theme mobile layout', async ({ page, context }, info) => {
    test.setTimeout(120000);
    await installDiscussionFixture(context); await context.addInitScript(seedNutritionMealDetail);
    await context.addInitScript(() => { if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-debug', 'true'); });
    await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
    await page.evaluate(encryptedComparisonFixture, { snapshot: nutritionComparisonFixture() });
    await openNutritionBenchmarkFromInsight(page);
    await expect(page.locator('[data-nutrition-action="clear-benchmark-photos"]')).toBeHidden();
    const area = page.locator('#nutrition-comparison-results'); await expect(area.locator('[data-nutrition-comparison-card]')).toHaveCount(3);
    await expect(area.locator('.is-error')).toContainText('Provider unavailable <literal>');
    await expect(area.locator('.is-error [data-nutrition-action="retry-comparison"]')).toHaveCount(0);
    await expect(area.locator('[data-nutrition-comparison-card="0"]')).toContainText('150 tokens · 100 in / 50 out');
    await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); document.head.append(link); await loaded; });
    const detail = area.locator('[data-nutrition-comparison-card="0"] .nutrition-comparison-detailed');
    await detail.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(detail).toHaveAttribute('open', '');
    const table = detail.getByRole('region', { name: 'Detailed nutrient comparison table' });
    await table.focus(); await expect(table).toBeFocused();
    const modal = page.locator('#detail-modal');
    for (const width of [320, 1100]) for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await modal.evaluate(async root => { const animations = [...root.getAnimations({ subtree: true })]; for (let element: Element | null = root; element; element = element.parentElement) { getComputedStyle(element).backgroundColor; animations.push(...element.getAnimations()); } await Promise.all(animations.filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))); });
      expect(await modal.evaluate(element => element.scrollWidth - element.clientWidth), `${theme}/${width} horizontal overflow`).toBeLessThanOrEqual(1);
      for (const control of await area.locator('button,summary').all()) { const box = await control.boundingBox(); if (box) { expect(box.width, `${theme}/${width} target width`).toBeGreaterThanOrEqual(44); expect(box.height, `${theme}/${width} target height`).toBeGreaterThanOrEqual(44); } }
      expect(await area.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
      if (theme === 'dark') { await area.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`comparison-${width}.png`) }); }
    }
    await area.locator('[data-nutrition-comparison-card="0"] [data-nutrition-action="set-comparison-reference"]').click();
    for (const width of [320, 1100]) for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const baselineDetail = area.locator('[data-nutrition-comparison-card="0"] .nutrition-comparison-detailed');
      await baselineDetail.locator('summary').click();
      await modal.evaluate(async root => { const animations = [...root.getAnimations({ subtree: true })]; for (let element: Element | null = root; element; element = element.parentElement) { getComputedStyle(element).backgroundColor; animations.push(...element.getAnimations()); } await Promise.all(animations.filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))); });
      expect(await area.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `baseline ${theme}/${width} accessibility`).toEqual([]);
      await baselineDetail.locator('summary').click();
    }
    await detail.locator('summary').click();
    await page.setViewportSize({ width: 320, height: 900 }); await table.focus(); await page.keyboard.press('ArrowRight');
    await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(async () => { (await import('/js/nutrition-comparison-results.js')).renderNutritionComparisonResults({ runs: [{ providerLabel: 'Fixture', modelLabel: 'Still running', status: 'running', durationMs: 0 }] }); });
    expect(await area.locator('.nutrition-comparison-skeleton').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  });
});
