import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
test.beforeEach(async ({ page, context }) => {
  await installDiscussionFixture(context); await page.goto('/app');
  await page.evaluate(async png => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    state.chatHistory = [
      { role: 'user', content: 'Attached result', hasImages: true, imageCount: 1, thumbnails: [png] },
      { role: 'assistant', content: 'Literal citation details.', lensSourceName: '<Private Vault>', lensSources: [{ source: 'VeryLongUnbrokenImportedFilename0123456789VeryLongUnbrokenImportedFilename0123456789.md', score: .934, text: 'First <script>alert(1)</script>\nSecond & third' }] },
    ];
    (await import('/js/chat-render.js')).renderChatMessages();
  }, png);
});
test('owned message content opens citations and stored images with the keyboard', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const summary = page.locator('.chat-lens-sources-summary'); await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.chat-lens-sources')).toHaveAttribute('open', ''); await expect(summary).toBeFocused();
  await expect.poll(() => summary.evaluate(element => getComputedStyle(element, '::before').rotate)).toBe('90deg');
  const inner = page.locator('.chat-lens-source-summary'); await inner.focus(); await page.keyboard.press('Space');
  await expect(page.locator('.chat-lens-source')).toHaveAttribute('open', ''); await expect(page.locator('.chat-lens-source-text')).toHaveText('First <script>alert(1)</script>Second & third');
  await expect(page.locator('.chat-lens-source-text script')).toHaveCount(0); await expect(page.locator('.chat-lens-source-text br')).toHaveCount(1);
  const image = page.getByRole('button', { name: 'Open attached image 1 of 1', exact: true }); await image.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Attached image preview' })).toBeVisible(); await page.keyboard.press('Escape');
  await expect(image).toBeFocused(); await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  expect(errors).toEqual([]);
});
test('owned message content fits every theme and narrow layout with accessible details', async ({ page }) => {
  test.setTimeout(90000); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.chat-lens-sources-summary').click(); await page.locator('.chat-lens-source-summary').click();
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async theme => { const t = await import('/js/theme.js'); await t.loadExtraThemesStylesheet(); t.setTheme(theme); }, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(async () => {
        const violations = await page.evaluate(async () => (await (window as unknown as { axe: typeof import('axe-core'); }).axe.run('[data-chat-message-content]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })));
        expect(violations, `${theme}/${width}`).toEqual([]);
        for (const selector of ['.chat-lens-sources', '.chat-image-thumbs']) {
          const element = page.locator(selector); const box = await element.boundingBox(); expect(box!.x, selector).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width, selector).toBeLessThanOrEqual(width + 1);
          expect(await element.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${theme}/${width}/${selector}`).toBe(true);
        }
      }).toPass({ timeout: 5000 });
    }
  }
  await page.screenshot({ path: test.info().outputPath('message-content-narrow.png') });
});
test('owned message content thinking view keeps its nodes and releases removed clocks', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await page.evaluate(async () => {
    const thinking = await import('/js/chat-thinking-status.js'); const indicator = thinking.createChatThinkingIndicator(); document.getElementById('chat-messages')!.appendChild(indicator);
    const phrase = indicator.querySelector('.chat-thinking-text')!; thinking.startChatThinkingStatus(indicator, { phrases: ['Preparing', 'Responding'], durations: [500] });
    const animation = getComputedStyle(indicator.querySelector('i')!).animationName;
    await new Promise(resolve => setTimeout(resolve, 550)); const rotated = phrase.textContent; const stable = phrase === indicator.querySelector('.chat-thinking-text');
    indicator.remove(); await new Promise(resolve => setTimeout(resolve, 550)); thinking.startChatThinkingStatus(indicator);
    await new Promise(resolve => setTimeout(resolve, 550));
    return { animation, rotated, stable, retired: !indicator.isConnected && phrase.textContent === rotated };
  });
  expect(result).toEqual({ animation: 'none', rotated: 'Responding', stable: true, retired: true }); expect(errors).toEqual([]);
});
