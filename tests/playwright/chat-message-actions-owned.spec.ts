import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

test.beforeEach(async ({ page, context }) => {
  await installDiscussionFixture(context);
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    state.currentThreadId = 'message-actions';
    state.chatHistory = [
      { role: 'user', content: 'Review my latest message.' },
      { role: 'assistant', content: 'Literal answer.', context: [{ label: '<Private labs>', detail: 'LongImportedContext0123456789LongImportedContext0123456789LongImportedContext0123456789' }], agentDrafts: [{ id: 'review', profileId: state.currentProfile!, kind: 'note', status: 'pending', summary: '<script>literal summary</script>', payload: { scope: 'profile', mode: 'append', text: 'Literal <img src=x onerror=alert(1)> proposal\nSecond line.' } }] },
    ];
    (await import('/js/chat-render.js')).renderChatMessages();
    (await import('/js/chat-message-actions-component.js')).ensureChatMessageActions();
    const writes: string[] = [];
    Object.assign(window, { messageActionCopies: writes });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { writes.push(value); } } });
  });
});

test('owned message actions preserve keyboard disclosure, copy focus and mobile dismissal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const context = page.locator('.chat-context-toggle');
  await context.focus(); await page.keyboard.press('Enter');
  await expect(context).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.chat-context-details')).toBeVisible();
  await expect(page.locator('.chat-context-item')).toContainText('✓ <Private labs> (LongImportedContext');
  await expect(page.locator('.chat-context-details private, .chat-agent-draft script, .chat-agent-draft img')).toHaveCount(0);
  const copy = page.locator('#chat-copy-btn-1'); const node = await copy.elementHandle();
  await copy.focus(); await page.keyboard.press('Enter');
  await expect(copy).toHaveText('Copied'); await expect(copy).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { messageActionCopies: string[] }).messageActionCopies)).toEqual(['Literal answer.\n\nAI-generated']);
  await expect(copy).toHaveText('Copy'); expect(await node!.evaluate(element => element === document.getElementById('chat-copy-btn-1'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const summary = page.locator('.chat-action-more summary'); await summary.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.chat-action-more')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape'); await expect(page.locator('.chat-action-more')).not.toHaveAttribute('open', ''); await expect(summary).toBeFocused();
  await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
  await expect(page.locator('.chat-action-more-popover button')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('.chat-action-more')).not.toHaveAttribute('open', ''); await expect(summary).toBeFocused();
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  expect(errors).toEqual([]);
});

test('owned message actions ignore clipboard completion from a retired conversation', async ({ page }) => {
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise<void>(resolve => Object.assign(window, { finishOldCopy: resolve })) } }));
  await page.locator('#chat-copy-btn-1').click();
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { finishOldCopy?: () => void }).finishOldCopy)).toBe('function');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); state.currentProfile = 'destination';
    state.chatHistory = [{ role: 'user', content: 'Destination question' }, { role: 'assistant', content: 'Destination answer' }];
    (await import('/js/chat-render.js')).renderChatMessages();
    (window as unknown as { finishOldCopy(): void }).finishOldCopy();
  });
  await expect(page.locator('#chat-copy-btn-1')).toHaveText('Copy'); await expect(page.locator('#chat-messages')).toContainText('Destination answer');
});

test('owned message actions and editor fit every theme and narrow layout accessibly', async ({ page }) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.chat-context-toggle').click();
  const edit = page.locator('[data-chat-message-action="edit-user-message"]'); await edit.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#chat-message-edit-input')).toBeFocused(); await expect(page.locator('.chat-input-row')).toHaveAttribute('inert', '');
  await page.locator('#chat-message-edit-input').fill('Revision with a long word Long0123456789Long0123456789Long0123456789Long0123456789');
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async theme => { const t = await import('/js/theme.js'); await t.loadExtraThemesStylesheet(); t.setTheme(theme); }, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(async () => {
        const violations = await page.evaluate(async () => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run('[data-chat-message-actions-view], [data-chat-message-edit-view]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })));
        expect(violations, `${theme}/${width}`).toEqual([]);
        for (const selector of ['.chat-action-bar', '.chat-agent-draft', '.chat-context-details', '#chat-message-edit-input']) {
          const element = page.locator(selector); const box = await element.boundingBox(); expect(box!.x, selector).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width, selector).toBeLessThanOrEqual(width + 1);
          expect(await element.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${theme}/${width}/${selector}`).toBe(true);
        }
        expect(await page.locator('#chat-message-edit-input').evaluate(element => element.scrollHeight <= element.clientHeight + 1 || element.clientHeight >= 238), `${theme}/${width}/editor height`).toBe(true);
        if (await page.evaluate(() => matchMedia('(pointer:coarse)').matches)) {
          for (const selector of ['.chat-agent-draft-apply', '.chat-message-edit-submit', '.chat-context-toggle']) expect((await page.locator(selector).boundingBox())!.height, selector).toBeGreaterThanOrEqual(44);
        }
      }).toPass({ timeout: 5000 });
    }
  }
  await page.screenshot({ path: test.info().outputPath('message-actions-editor-narrow.png') });
  await page.locator('#chat-message-edit-input').focus(); await page.keyboard.press('Escape');
  await expect(page.locator('#chat-message-edit-input')).toHaveCount(0); await expect(page.locator('.chat-input-row')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  await edit.focus(); await expect(edit).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#chat-message-edit-input')).toBeFocused(); await page.keyboard.press('Escape');
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  expect(errors).toEqual([]);
});
