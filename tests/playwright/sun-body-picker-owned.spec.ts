import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

test('authored body picker retains responsive SVG, caption styling, overlay precedence and keyboard focus in every theme', async ({ page }, info) => {
  test.setTimeout(120000);
  await installDiscussionFixture(page.context()); await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const body = await import('/js/sun-body-silhouette.js');
    const host = document.createElement('div'); host.id = 'body-picker-acceptance';
    host.className = 'sun-silhouette-wrap'; host.style.cssText = 'position:relative;z-index:10000;max-width:600px';
    host.innerHTML = body.renderBodySilhouette(new Set()); document.body.prepend(host);
    body.bindBodySilhouette(host, new Set());
  });
  const host = page.locator('#body-picker-acceptance'); const svg = host.locator('svg');
  for (const width of [320,599,600,601,607,1100]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']) {
      expect(await page.evaluate(async theme => { const api = await import('/js/theme.js'); return await api.setTheme(theme) && api.getTheme() === theme; }, theme)).toBe(true);
      // Use the original CSS predicate: headless WebKit excludes its classic
      // scrollbar from media-query width near this boundary.
      const mobilePicker = await page.evaluate(() => matchMedia('(max-width:600px)').matches);
      if (width === 320) expect(mobilePicker).toBe(true);
      if (width >= 607) expect(mobilePicker).toBe(false);
      expect(await svg.evaluate(element => getComputedStyle(element).maxWidth)).toBe(mobilePicker ? '100%' : '380px');
      const dimensions = await svg.boundingBox(); expect(dimensions!.width).toBeGreaterThan(200); expect(dimensions!.width).toBeLessThanOrEqual(mobilePicker ? width : 380);
      expect(await host.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      const label = await host.locator('text').first().evaluate(element => { const css = getComputedStyle(element); return { size: css.fontSize, weight: css.fontWeight, transform: css.textTransform, spacing: css.letterSpacing }; });
      expect(label.size).toBe('7px'); expect(label.weight).toBe('600'); expect(label.transform).toBe('uppercase'); expect(label.spacing).toBe('0.8px');
      const face = host.locator('[data-region="face"]'); await face.focus();
      await page.keyboard.press('Enter'); await expect(host.locator('[data-region="face"]')).toHaveAttribute('aria-pressed','true');
      await expect(host.locator('[data-region="face"]')).toBeFocused();
      await page.keyboard.press('Space'); await expect(host.locator('[data-region="face"]')).toHaveAttribute('aria-pressed','false');
      await expect(host.locator('[data-region="face"]')).toBeFocused();
      await expect(host.locator('[data-region="face-back"]')).toHaveAttribute('aria-pressed','false');
      expect(await host.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => item.id))).toEqual([]);
    }
    await host.screenshot({ path: info.outputPath(`body-picker-${width}.png`) });
  }
  // The real region-map/blob lifecycle must reach a ready selection; no synthetic
  // SVG or mocked image bypasses the production canvas/asset path here.
  await host.locator('[data-region="face"]').focus(); await page.keyboard.press('Enter');
  await expect(svg).toHaveAttribute('data-selection-overlay','ready');
  await expect(host.locator('image[href^="blob:"]')).toHaveCount(2);
  await expect(host.locator('[data-region="face"]')).toBeFocused();
  expect(await host.locator('[data-region="face"]').evaluate(element => { const css = getComputedStyle(element); return { opacity: css.strokeOpacity, width: css.strokeWidth, dash: css.strokeDasharray }; })).toEqual({ opacity: '1', width: '0.8px', dash: '2px, 1.5px' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sun-overlay-ready')));
  await expect(host.locator('[data-region="face"]')).toBeFocused();
  await page.evaluate(() => { const button = document.createElement('button'); button.id = 'body-picker-outside'; button.textContent = 'Next control'; document.body.prepend(button); button.focus(); window.dispatchEvent(new CustomEvent('sun-overlay-ready')); });
  await expect(page.locator('#body-picker-outside')).toBeFocused();
  await expect.poll(() => host.locator('[data-region="face"]').evaluate(element => getComputedStyle(element).fillOpacity)).toBe('0');
});
