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
async function open(page: Page) {
  await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Active discussion' })).toBeVisible();
}
test('static discussion restores pending participants, resumes offline and retains end state through cold launch', async ({ page, context }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  await installDiscussionFixture(context); await installDiscussionProvider(context);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('discussion-seeded')) return;
    localStorage.setItem('discussion-seeded', '1');
    const personas = [{ id: 'default', name: 'AI Lab Analyst', icon: '🔬' }, { id: 'house', name: 'Dr. Gregory House', icon: '🦯' }];
    localStorage.setItem('labcharts-default-chat-current-thread', 'discussion-thread');
    localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([{ id: 'discussion-thread', name: 'Stored discussion', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', messageCount: 2, personality: 'default', discussionPersonas: personas, discussionOriginalPersonality: 'default', discussionPendingPersonas: [personas[1]] }]));
    localStorage.setItem('labcharts-default-chat-t_discussion-thread', JSON.stringify([{ role: 'user', content: 'Stored question' }, { role: 'assistant', content: 'Stored answer.', personalityName: 'AI Lab Analyst' }]));
  });
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await open(page);
    await expect(page.locator('.chat-discussion-resume')).toHaveText('Resume 1');
    const stored = await page.evaluate(() => localStorage.getItem('labcharts-default-chat-t_discussion-thread'));
    server.state.offline = true; await page.close(); const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await open(cold);
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-default-chat-t_discussion-thread'))).toBe(stored);
    await expect(cold.locator('.chat-discussion-expectation')).toContainText('1 response remaining');
    await cold.locator('.chat-discussion-add').click(); await expect(cold.getByRole('dialog', { name: 'Add a participant' })).toBeVisible();
    await expect(cold.locator('.discuss-persona-picker input[data-locked="1"]')).toHaveCount(2);
    await cold.getByRole('button', { name: 'Close participant picker' }).click();
    await cold.locator('.chat-discussion-resume').click(); await expect(cold.locator('#chat-messages')).toContainText('Synthetic discussion reply.');
    await expect(cold.locator('.chat-discussion-resume')).toHaveCount(0);
    await expect(cold.locator('#chat-messages .chat-ai[data-chat-transcript-message]')).toHaveCount(2);
    await expect(cold.locator('#chat-messages .chat-cost-footnote')).toContainText('17 tokens');
    await expect(cold.locator('#chat-messages [data-chat-persona-label]')).toContainText('Dr. Gregory House');
    await expect(cold.locator('#chat-messages [data-chat-live-view]')).toHaveCount(0);
    const requests = await cold.evaluate(() => (window as unknown as { discussionRequests: unknown[]; }).discussionRequests);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ model: 'fixture-model' });
    await cold.locator('.chat-discussion-end').click(); await expect(cold.locator('.chat-discussion-mode')).toHaveCount(0);
    await expect(cold.locator('#chat-input')).not.toHaveAttribute('aria-describedby');
    const transcript = await cold.evaluate(() => localStorage.getItem('labcharts-default-chat-t_discussion-thread'));
    await cold.close(); const ended = await context.newPage(); await ended.goto(server.origin + '/app?dev-sw=1'); await ready(ended);
    await ended.getByRole('button', { name: 'Start guided chat', exact: true }).click();
    await expect(ended.locator('[data-chat-discussion-view]')).toBeVisible(); await expect(ended.locator('.chat-discussion-mode')).toHaveCount(0);
    await expect(ended.locator('#chat-messages')).toContainText('Stored answer.'); await expect(ended.locator('#chat-messages')).toContainText('Synthetic discussion reply.');
    await expect(ended.locator('#chat-messages .chat-ai[data-chat-transcript-message]')).toHaveCount(2);
    await expect(ended.locator('#chat-messages .chat-cost-footnote')).toContainText('17 tokens');
    await expect(ended.locator('#chat-messages [data-chat-persona-label]')).toContainText('Dr. Gregory House');
    expect(await ended.evaluate(() => localStorage.getItem('labcharts-default-chat-t_discussion-thread'))).toBe(transcript);
    expect(await ended.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-chat-threads') || '[]').find((thread: { id: string; }) => thread.id === 'discussion-thread').discussionEnded)).toBe(true);
    await ended.screenshot({ path: test.info().outputPath('discussion-static-ended.png') }); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
