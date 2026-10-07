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
  await expect(page.locator('#chat-input')).toBeVisible();
  await expect(page.locator('#chat-copy-btn-1')).toBeVisible();
}

async function savedContextNotes(page: Page): Promise<string | undefined> {
  return page.evaluate(async () => {
    const open = indexedDB.open('labcharts-blobs', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const request = db.transaction('kv', 'readonly').objectStore('kv').get('labcharts-default-imported');
      const value = await new Promise<string>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as string);
        request.onerror = () => reject(request.error);
      });
      return (JSON.parse(value) as { contextNotes?: string }).contextNotes;
    } finally { db.close(); }
  });
}

test('static message actions and editing persist through two offline cold launches', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('page', current => current.on('pageerror', error => errors.push(error.message)));
  await installDiscussionFixture(context); await installDiscussionProvider(context);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    const writes: string[] = [];
    Object.assign(window, { cachedMessageCopies: writes });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { writes.push(text); } } });
    if (localStorage.getItem('message-actions-seeded')) return;
    localStorage.setItem('message-actions-seeded', '1');
    localStorage.setItem('labcharts-default-chat-current-thread', 'actions-thread');
    localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([{ id: 'actions-thread', name: 'Stored actions', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', messageCount: 2, personality: 'default' }]));
    localStorage.setItem('labcharts-default-chat-t_actions-thread', JSON.stringify([
      { role: 'user', content: 'Stored question' },
      { role: 'assistant', content: 'Stored answer.', personalityName: 'AI Lab Analyst', context: [{ label: '<Private labs>', detail: '5 > 3' }], agentDrafts: [{ id: 'cached-proposal', profileId: 'default', status: 'pending', kind: 'note', summary: 'Reviewed <note>', payload: { scope: 'profile', mode: 'append', text: 'Cached literal <script>note</script>.' } }] },
    ]));
  });
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await open(page);
    const original = await page.evaluate(() => localStorage.getItem('labcharts-default-chat-t_actions-thread'));
    server.state.offline = true; await page.close();
    const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await open(cold);
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-default-chat-t_actions-thread'))).toBe(original);
    await cold.locator('.chat-context-toggle').focus(); await cold.keyboard.press('Enter');
    await expect(cold.locator('.chat-context-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(cold.locator('.chat-context-item')).toHaveText('✓ <Private labs> (5 > 3)');
    await cold.locator('#chat-copy-btn-1').focus(); await cold.keyboard.press('Enter');
    await expect(cold.locator('#chat-copy-btn-1')).toHaveText('Copied'); await expect(cold.locator('#chat-copy-btn-1')).toBeFocused();
    expect(await cold.evaluate(() => (window as unknown as { cachedMessageCopies: string[] }).cachedMessageCopies)).toEqual(['Stored answer.\n\nAI-generated']);
    await expect(cold.locator('.chat-agent-draft')).toContainText('Cached literal <script>note</script>.');
    await expect(cold.locator('.chat-agent-draft script')).toHaveCount(0);
    await cold.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(cold.locator('.chat-agent-draft')).toContainText('Applied to getbased');
    await expect(cold.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
    expect(await savedContextNotes(cold)).toBe('Cached literal <script>note</script>.');
    await cold.locator('#chat-input').fill('Preserve my separate draft');
    await expect.poll(() => cold.evaluate(() => localStorage.getItem('labcharts-default-chatDraft_actions-thread'))).toBe('Preserve my separate draft');
    const edit = cold.locator('[data-chat-message-action="edit-user-message"]'); await edit.focus(); await cold.keyboard.press('Enter');
    await expect(cold.locator('#chat-message-edit-input')).toHaveValue('Stored question'); await expect(cold.locator('.chat-input-row')).toHaveAttribute('inert', '');
    await cold.locator('#chat-message-edit-input').fill('Cancelled offline revision'); await cold.keyboard.press('Escape');
    await expect(cold.locator('#chat-msg-0')).toContainText('Stored question'); await expect(cold.locator('#chat-input')).toHaveValue('Preserve my separate draft');
    await expect(cold.locator('#chat-message-edit-input')).toHaveCount(0);
    await expect(cold.locator('#chat-panel')).toHaveClass(/open/);
    await edit.focus(); await expect(edit).toBeFocused(); await cold.keyboard.press('Enter');
    await expect(cold.locator('#chat-message-edit-input')).toBeFocused();
    await cold.locator('#chat-message-edit-input').fill('Edited offline question'); await cold.keyboard.press('Control+Enter');
    await expect(cold.locator('#chat-message-edit-input')).toHaveCount(0);
    await expect(cold.locator('#chat-input')).toHaveValue('Preserve my separate draft');
    await expect(cold.locator('#chat-msg-0')).toContainText('Edited offline question'); await expect(cold.locator('.chat-msg.chat-ai')).toHaveCount(1); await expect(cold.locator('.chat-msg.chat-ai')).toContainText('Synthetic discussion reply.');
    await expect.poll(() => cold.evaluate(() => localStorage.getItem('labcharts-default-chat-t_actions-thread'))).toContain('Synthetic discussion reply.');
    await cold.close(); const restored = await context.newPage(); await restored.goto(server.origin + '/app?dev-sw=1'); await ready(restored); await open(restored);
    await expect(restored.locator('#chat-msg-0')).toContainText('Edited offline question'); await expect(restored.locator('#chat-msg-1')).toContainText('Synthetic discussion reply.');
    expect(await savedContextNotes(restored)).toBe('Cached literal <script>note</script>.');
    await expect(restored.locator('#chat-input')).toHaveValue('Preserve my separate draft');
    await restored.screenshot({ path: test.info().outputPath('message-actions-static-offline.png') });
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
