import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
async function open(page: Page) { await page.getByRole('button', { name: 'Start guided chat', exact: true }).click(); await expect(page.locator('[data-chat-attachment-view]')).toBeVisible(); }
test('static owned attachments preserve stored thumbnails and accept fresh originals after offline cold launch', async ({ page, context }) => {
  test.setTimeout(120000); const errors: string[] = []; context.on('page', p => p.on('pageerror', error => errors.push(error.message))); page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(png => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1'); localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-07T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    if (localStorage.getItem('attachment-fixture-seeded')) return; localStorage.setItem('attachment-fixture-seeded', '1');
    localStorage.setItem('labcharts-ai-provider', 'ollama'); localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-default-chat-current-thread', 'attachment-thread');
    localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([{ id: 'attachment-thread', name: 'Stored image', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', messageCount: 1, personality: 'default' }]));
    localStorage.setItem('labcharts-default-chat-t_attachment-thread', JSON.stringify([{ role: 'user', content: 'Stored image question', hasImages: true, imageCount: 1, thumbnails: [`data:image/png;base64,${png}`] }]));
  }, png);
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await open(page);
    const stored = await page.evaluate(() => localStorage.getItem('labcharts-default-chat-t_attachment-thread'));
    await expect(page.locator('#chat-messages .chat-image-thumb')).toHaveCount(1);
    await page.locator('#chat-image-input').setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await expect(page.locator('.chat-attach-count')).toHaveText('1/5');
    expect(await page.evaluate(() => localStorage.getItem('labcharts-default-chat-t_attachment-thread'))).toBe(stored);
    await page.locator('#chat-messages .chat-image-thumb').click(); await expect(page.getByRole('dialog', { name: 'Attached image preview' })).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#chat-panel')).toHaveClass(/open/);
    server.state.offline = true; await page.close(); const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await open(cold);
    await expect(cold.locator('#chat-attach-preview')).toBeHidden(); await expect(cold.locator('#chat-messages .chat-image-thumb')).toHaveCount(1);
    await cold.locator('#chat-image-input').setInputFiles({ name: 'offline <original>.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await expect(cold.locator('.chat-attach-count')).toHaveText('1/5');
    await expect(cold.locator('#chat-attach-preview img')).toHaveAttribute('src', `data:image/png;base64,${png}`);
    await cold.getByRole('button', { name: 'Remove offline <original>.png', exact: true }).click(); await expect(cold.locator('#chat-input')).toBeFocused(); await expect(cold.locator('#chat-attach-preview')).toBeHidden();
    await cold.locator('#chat-messages .chat-image-thumb').click(); await expect(cold.getByRole('dialog', { name: 'Attached image preview' })).toBeVisible(); await cold.locator('.chat-lightbox-close').click(); await expect(cold.locator('.chat-lightbox')).toHaveCount(0);
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-default-chat-t_attachment-thread'))).toBe(stored); expect(errors).toEqual([]);
    await cold.screenshot({ path: test.info().outputPath('attachments-static-offline.png') });
  } finally { await server.close(); }
});
