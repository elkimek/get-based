import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { seedNutritionMealDetail } from '../helpers/nutrition-meal-detail-fixture.js';

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

  test('authored meal editor keeps review, entry tabs and ingredient drafts accessible in every theme', async ({ page, context }, info) => {
    test.setTimeout(120000); await installDiscussionFixture(context); await context.addInitScript(seedNutritionMealDetail);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
    await page.locator('[data-context-card-key="diet"] [data-nutrition-context-link]').click();
    await page.getByRole('button', { name: 'Open Reviewed detail lunch details' }).click();
    await page.getByRole('button', { name: 'Edit meal', exact: true }).click();
    const editor = page.locator('[data-nutrition-editor-view]'), modal = page.locator('#detail-modal');
    await expect(editor).toBeVisible(); await expect(editor.locator('#nutrition-proteinG')).toHaveValue('0');
    await expect(editor.locator('#nutrition-review-checks')).toContainText('Check remaining label');
    await expect(editor.locator('#nutrition-photo-preview img')).toHaveCount(2);
    await expect(editor.locator('#nutrition-consumed-unit')).toHaveValue('servings');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('labcharts-ai-settings-local-changed')));
    await expect(editor.locator('#nutrition-model-purpose')).toHaveText('Label model');
    await expect(editor.locator('[data-nutrition-model-route]')).toHaveAttribute('aria-label','Nutrition label analysis model');
    await editor.locator('.nutrition-more-nutrients > summary').click();
    await editor.locator('[data-nutrition-component-name="0"]').fill('Keep <literal> ingredient');
    await editor.locator('#nutrition-note').fill('Keep review draft');
    await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; const loaded = new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); document.head.append(link); await loaded; });
    for (const width of [320, 1100]) for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await modal.evaluate(async root => { const animations = [...root.getAnimations({ subtree: true })]; for (let element: Element | null = root; element; element = element.parentElement) { getComputedStyle(element).backgroundColor; animations.push(...element.getAnimations()); } await Promise.all(animations.filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))); });
      const overflow = await modal.evaluate(element => element.scrollWidth - element.clientWidth);
      if (overflow > 1) await info.attach(`editor-overflow-${theme}-${width}`, { contentType: 'application/json', body: Buffer.from(JSON.stringify(await modal.evaluate(root => {
        const bounds = root.getBoundingClientRect(); return [...root.querySelectorAll('*')].map(element => { const rect = element.getBoundingClientRect(), style = getComputedStyle(element); return { id: element.id, tag: element.tagName, class: element.classList[0], x: rect.x, right: rect.right, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, minWidth: style.minWidth, overflowX: style.overflowX, display: style.display, text: element.textContent?.slice(0, 70) }; }).filter(element => element.width > 0 && (element.right > bounds.right + 1 || element.scrollWidth > element.clientWidth + 1));
      }), null, 2)) });
      expect(overflow, `${theme}/${width} horizontal overflow`).toBeLessThanOrEqual(1);
      const photos = await editor.locator('#nutrition-photo-preview').evaluate(root => ({ available: root.clientWidth, grid: root.querySelector('.nutrition-photo-grid')!.getBoundingClientRect().width, images: [...root.querySelectorAll('img')].map(image => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, decoded: image.naturalWidth > 0 })) }));
      expect(photos.grid, `${theme}/${width} full-width photo grid`).toBeGreaterThan(photos.available * .95);
      for (const image of photos.images) { expect(image.width, `${theme}/${width} photo width`).toBeGreaterThan(photos.grid * .45); expect(image.height).toBeGreaterThanOrEqual(225); expect(image.decoded).toBe(true); }
      expect(await editor.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
      for (const control of await editor.locator('button,summary,input,textarea,select').all()) { const box = await control.boundingBox(); if (box) { expect(box.width, `${theme}/${width} ${await control.getAttribute("id") || await control.getAttribute("data-nutrition-action") || await control.getAttribute("data-nutrition-component-grams") || await control.getAttribute("data-nutrition-component-name") || await control.textContent()} target width`).toBeGreaterThanOrEqual(44); expect(box.height, `${theme}/${width} ${await control.getAttribute("id") || await control.getAttribute("data-nutrition-action") || await control.getAttribute("data-nutrition-component-grams") || await control.getAttribute("data-nutrition-component-name") || await control.textContent()} target height`).toBeGreaterThanOrEqual(44); } }
      if (theme === 'dark') { await modal.evaluate(root => { root.scrollTop = 0; }); await page.screenshot({ path: info.outputPath(`meal-editor-${width}.png`) }); }
    }
    const photoTab = editor.getByRole('tab', { name: 'Photo', exact: true }); await photoTab.click(); await expect(photoTab).toHaveAttribute('aria-selected','true');
    await editor.getByRole('tab', { name: 'Nutrition label', exact: true }).click(); await expect(editor.locator('#nutrition-label-consumption')).toBeVisible();
    await editor.getByRole('tab', { name: 'Manual', exact: true }).click(); await expect(editor.locator('#nutrition-photo-input')).toBeHidden();
    await expect(editor.locator('[data-nutrition-component-name="0"]')).toHaveValue('Keep <literal> ingredient'); await expect(editor.locator('#nutrition-note')).toHaveValue('Keep review draft');
    await expect(editor.locator('#nutrition-proteinG')).toHaveValue('0');
    expect(errors).toEqual([]);
  });
});
