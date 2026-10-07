import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture, installDiscussionProvider } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function open(page: Page) { await page.getByRole('button', { name: 'Start guided chat', exact: true }).click(); await expect(page.locator('#chat-input')).toBeVisible(); }
test('static message content restores literal citations and renders a delayed response after offline cold launch', async ({ page, context }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  await installDiscussionFixture(context); await installDiscussionProvider(context);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    const original = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = String(input instanceof Request ? input.url : input);
      if (/^http:\/\/(?:127\.0\.0\.1|localhost):11434\/(?:v1\/chat\/completions|api\/chat)$/.test(url)) {
        await new Promise<void>(resolve => Object.assign(window, { releaseChatResponse: resolve }));
      }
      return original(input, options);
    };
    if (localStorage.getItem('message-content-seeded')) return; localStorage.setItem('message-content-seeded', '1');
    localStorage.setItem('labcharts-default-chat-current-thread', 'content-thread');
    localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([{ id: 'content-thread', name: 'Stored citations', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', messageCount: 2, personality: 'default' }]));
    localStorage.setItem('labcharts-default-chat-t_content-thread', JSON.stringify([{ role: 'user', content: 'Stored question' }, { role: 'assistant', content: 'Stored answer.', personalityName: 'AI Lab Analyst', lensSourceName: '<Private Vault>', lensSources: [{ source: 'report <one>.md', score: .934, text: 'First <script>alert(1)</script>\nSecond & third' }] }]));
  });
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await open(page);
    await expect(page.locator('.chat-lens-sources-summary')).toHaveText('📎 1 excerpt from <Private Vault>');
    const stored = await page.evaluate(() => localStorage.getItem('labcharts-default-chat-t_content-thread'));
    server.state.offline = true; await page.close(); const cold = await context.newPage(); await cold.emulateMedia({ reducedMotion: 'reduce' });
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await open(cold);
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-default-chat-t_content-thread'))).toBe(stored);
    await cold.locator('.chat-lens-sources-summary').focus(); await cold.keyboard.press('Enter'); await cold.locator('.chat-lens-source-summary').focus(); await cold.keyboard.press('Space');
    await expect(cold.locator('.chat-lens-source-text')).toHaveText('First <script>alert(1)</script>Second & third'); await expect(cold.locator('.chat-lens-source-text br')).toHaveCount(1); await expect(cold.locator('.chat-lens-source-text script')).toHaveCount(0);
    await cold.locator('#chat-input').fill('Fresh question after cold launch'); await cold.locator('#chat-send-btn').click();
    await expect(cold.locator('.typing-indicator[data-chat-message-content]')).toBeVisible(); await expect(cold.locator('.typing-indicator')).toHaveAttribute('aria-hidden', 'true'); await expect(cold.locator('.chat-thinking-dots i')).toHaveCount(3);
    await expect.poll(() => cold.locator('.chat-thinking-dots i').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await expect.poll(() => cold.evaluate(() => typeof (window as unknown as { releaseChatResponse?: () => void; }).releaseChatResponse)).toBe('function');
    await cold.evaluate(() => (window as unknown as { releaseChatResponse(): void; }).releaseChatResponse());
    await expect(cold.locator('#chat-messages')).toContainText('Synthetic discussion reply.'); await expect(cold.locator('.typing-indicator')).toHaveCount(0); await expect(cold.locator('.chat-lens-sources-summary')).toHaveCount(1);
    await expect.poll(() => cold.evaluate(() => localStorage.getItem('labcharts-default-chat-t_content-thread'))).toContain('Synthetic discussion reply.'); expect(errors).toEqual([]);
    await cold.screenshot({ path: test.info().outputPath('message-content-static-offline.png') });
  } finally { await server.close(); }
});
