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

  test('authored benchmark workspace keeps photos and reference drafts separate, accessible and responsive', async ({ page, context }, info) => {
    test.setTimeout(120000); await installDiscussionFixture(context); await context.addInitScript(seedNutritionMealDetail);
    await context.addInitScript(() => { if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-debug', 'true'); });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
    await page.evaluate(async () => {
      localStorage.setItem('labcharts-ai-paused', 'false');
      const keys = await import('/js/crypto-key-cache.js');
      keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
      localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
        { id: 'openai/gpt-5.6-sol', name: 'First vision model' },
        { id: 'anthropic/claude-opus-5.5', name: 'Second vision model' },
      ]));
      localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(['openai/gpt-5.6-sol', 'anthropic/claude-opus-5.5']));
      const api = await import('/js/api.js'); api.setOpenRouterModel('openai/gpt-5.6-sol'); api.setAIProvider('openrouter');
    });
    await page.evaluate(encryptedComparisonFixture, { snapshot: nutritionComparisonFixture() });
    await openNutritionBenchmarkFromInsight(page);
    const workspace = page.locator('[data-nutrition-benchmark-view]'), modal = page.locator('#detail-modal');
    await expect(workspace).toBeVisible(); await expect(workspace.locator('[data-nutrition-comparison-model]')).toHaveCount(2); await expect(page.locator('[data-nutrition-picker-view]')).toBeVisible();
    const search = workspace.locator('[data-nutrition-comparison-search]');
    await search.fill('first'); await expect(workspace.locator('.nutrition-comparison-model:visible')).toHaveCount(1);
    await search.fill('unavailable fixture'); await expect(workspace.locator('.nutrition-comparison-model:visible')).toHaveCount(0);
    await expect(workspace.locator('[data-nutrition-comparison-search-empty]')).toBeVisible();
    await search.fill(''); await expect(workspace.locator('.nutrition-comparison-model:visible')).toHaveCount(2);
    const choice = workspace.locator('[data-nutrition-comparison-model]').first();
    await choice.focus(); await expect(choice).toBeFocused();
    const checked = await choice.isChecked(); await page.keyboard.press('Space');
    if (checked) await expect(choice).not.toBeChecked(); else await expect(choice).toBeChecked();
    await page.keyboard.press('Space'); if (checked) await expect(choice).toBeChecked(); else await expect(choice).not.toBeChecked();
    await workspace.locator('.nutrition-comparison-known-values > summary').click();
    await workspace.locator('.nutrition-comparison-reference-details > summary').click();
    const reference = workspace.locator('[data-nutrition-reference="vitaminCMg"]'); await reference.fill('0');
    await workspace.locator('[data-nutrition-reference="mealName"]').fill('Keep <literal> reference');
    await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); document.head.append(link); await loaded; });
    for (const width of [320, 1100]) for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await modal.evaluate(async root => { const animations = [...root.getAnimations({ subtree: true })]; for (let element: Element | null = root; element; element = element.parentElement) { getComputedStyle(element).backgroundColor; animations.push(...element.getAnimations()); } await Promise.all(animations.filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))); });
      expect(await modal.evaluate(element => element.scrollWidth - element.clientWidth), `${theme}/${width} horizontal overflow`).toBeLessThanOrEqual(1);
      expect(await workspace.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
      for (const control of await workspace.locator('button,summary,input,textarea').all()) { const box = await control.boundingBox(); if (box) { expect(box.width, `${theme}/${width} target width`).toBeGreaterThanOrEqual(44); expect(box.height, `${theme}/${width} target height`).toBeGreaterThanOrEqual(44); } }
      if (theme === 'dark') { await workspace.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`benchmark-workspace-${width}.png`) }); }
    }
    // The benchmark source owns its files; returning to the parked editor preserves its actual input nodes.
    await page.locator('[data-nutrition-action="return-editor"]').click();
    await page.locator('#nutrition-meal-name').fill('Keep editor draft');
    const original = page.locator('#nutrition-photo-input');
    const photo = { name: 'meal.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=', 'base64') };
    await original.setInputFiles(photo);
    await page.locator('[data-nutrition-action="toggle-comparison"]').click();
    await expect(workspace.locator('[data-nutrition-reference="mealName"]')).toHaveValue('Keep <literal> reference');
    await expect(reference).toHaveValue('0');
    const upload = page.locator('#nutrition-benchmark-photo-input'); await upload.setInputFiles(photo);
    await expect(page.locator('#nutrition-benchmark-photo-status')).toHaveText('1 benchmark view ready. Log meal remains unchanged.');
    await expect(page.locator('#nutrition-benchmark-photo-preview img')).toHaveCount(1);
    const photoGeometry = await page.locator('#nutrition-benchmark-photo-preview').evaluate(root => ({ available: root.clientWidth, width: root.querySelector('img')!.getBoundingClientRect().width }));
    expect(photoGeometry.width).toBeGreaterThan(photoGeometry.available * .95);
    await page.locator('[data-nutrition-action="clear-benchmark-photos"]').click();
    await expect(page.locator('#nutrition-benchmark-photo-preview img')).toHaveCount(0);
    await expect(page.locator('[data-nutrition-action="clear-benchmark-photos"]')).toBeHidden();
    await page.locator('[data-nutrition-action="return-editor"]').click();
    await expect(page.locator('#nutrition-meal-name')).toHaveValue('Keep editor draft');
    expect(await original.evaluate(input => (input as HTMLInputElement).files?.[0]?.name)).toBe('meal.png');
    expect(errors).toEqual([]);
  });
});
