import fs from 'node:fs/promises';
import { expect, test } from './coverage-fixture.js';
import { createDefaultProfileData } from '../../js/profile.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { seedChatSummaryFixture } from '../helpers/chat-summary-fixture.js';

test('authored summary rows and dialog retain keyboard, exports and profile data across themes and widths', async ({ page, context }, info) => {
  test.setTimeout(120000);
  await installDiscussionFixture(context);
  await context.addInitScript(seedChatSummaryFixture, { defaults: createDefaultProfileData() });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
  await page.getByRole('button', { name: 'Toggle conversations', exact: true }).click();
  const rows = page.locator('[data-chat-saved-summaries-view]');
  await expect(rows.locator('button')).toHaveCount(2);
  const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData));
  await rows.locator('button').first().focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Summary', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.summary-modal-meta')).toContainText('Wellness <Plan>');
  await expect(dialog.locator('.summary-modal-body')).toContainText('Literal <img src=x> & kept.');
  await expect(dialog.locator('img,script')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();

  for (const width of [320, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      const applied = await page.evaluate(async theme => {
        const module = await import('/js/theme.js');
        return { result: await module.setTheme(theme), theme: module.getTheme() };
      }, theme);
      expect(applied).toEqual({ result: true, theme });
      await expect.poll(() => dialog.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && animation.playState === 'running').length)).toBe(0);
      expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth), `${width}/${theme} overflow`).toBeLessThanOrEqual(1);
      const violations = await dialog.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, details: item.nodes.map(node => node.failureSummary) })));
      expect(violations, `${width}/${theme} dialog accessibility`).toEqual([]);
      for (const button of await dialog.locator('button').all()) {
        const box = await button.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: info.outputPath(`chat-summary-${width}.png`) });
  }
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { Object.assign(window, { summaryCopied: value }); } } });
    window.open = (() => ({ document: { write(value: string) { Object.assign(window, { summaryPrinted: value }); }, close() {} }, print() { Object.assign(window, { summaryPrintCalled: true }); } })) as unknown as typeof window.open;
  });
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { summaryCopied: string }).summaryCopied)).toBe('## Findings\nFerritin improved.\n\n- Retest vitamin D.\n\nLiteral <img src=x> & kept.\n\nWritten with Grok');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Wellness__Plan__summary.md');
  expect(await fs.readFile((await download.path())!, 'utf8')).toContain('Literal <img src=x> & kept.\n\nWritten with Grok');
  await dialog.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => {
    const record = window as unknown as { summaryPrinted: string; summaryPrintCalled: boolean };
    const print = new DOMParser().parseFromString(record.summaryPrinted, 'text/html');
    return { called: record.summaryPrintCalled, title: print.title, literal: print.body.textContent?.includes('Literal <img src=x> & kept.'), unsafe: !!print.querySelector('script,img'), inlineStyle: !!print.querySelector('style') };
  })).toEqual({ called: true, title: 'Wellness <Plan> - Summary', literal: true, unsafe: false, inlineStyle: true });
  expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(rows.locator('button').first()).toBeFocused();
  await rows.locator('button').first().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.summary-modal-body')).toContainText('Ferritin improved.');
  expect(errors).toEqual([]);
});
