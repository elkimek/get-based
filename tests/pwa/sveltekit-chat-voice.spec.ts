import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installChatVoiceFixture, type Fixture } from '../helpers/chat-voice-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) { await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 }); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); }
async function open(page: Page) { await page.getByRole('button', { name: 'Start guided chat', exact: true }).click(); await expect(page.locator('[data-chat-voice-view]')).toBeVisible(); await expect(page.locator('#chat-listen-btn-1')).toHaveAttribute('data-chat-speech-owned', ''); }
test('static voice controls hydrate stored speech and dictate after offline cold launch', async ({ page, context }) => {
  test.setTimeout(120000); const errors: string[] = []; context.on('page', p => p.on('pageerror', e => errors.push(e.message))); page.on('pageerror', e => errors.push(e.message));
  await installChatVoiceFixture(context);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    if (localStorage.getItem('voice-fixture-seeded')) return; localStorage.setItem('voice-fixture-seeded', '1');
    localStorage.setItem('labcharts-default-chat-current-thread', 'voice-thread');
    localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([{ id: 'voice-thread', name: 'Stored speech', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', messageCount: 2, personality: 'default' }]));
    localStorage.setItem('labcharts-default-chat-t_voice-thread', JSON.stringify([{ role: 'user', content: 'Stored question' }, { role: 'assistant', content: 'Stored spoken reply.' }]));
  });
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await open(page);
    const stored = await page.evaluate(() => localStorage.getItem('labcharts-default-chat-t_voice-thread'));
    await page.locator('#chat-listen-btn-1').click(); await expect(page.locator('#chat-listen-btn-1')).toHaveText('Stop'); await page.locator('#chat-listen-btn-1').click(); await expect(page.locator('#chat-listen-btn-1')).toHaveText('Listen');
    server.state.offline = true; await page.close(); const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await open(cold);
    await expect(cold.locator('#chat-messages')).toContainText('Stored spoken reply.');
    await cold.locator('#chat-input').fill('Offline draft:'); await cold.locator('#chat-input').press('End');
    await cold.getByRole('button', { name: 'Speak message', exact: true }).click(); await expect(cold.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible(); await cold.getByRole('button', { name: 'Stop recording', exact: true }).click(); await expect(cold.locator('#chat-input')).toHaveValue('Offline draft: check my ferritin'); await expect(cold.locator('#chat-input')).toBeFocused();
    await cold.locator('#chat-listen-btn-1').click(); await expect(cold.locator('#chat-listen-btn-1')).toHaveText('Stop'); await cold.locator('#chat-listen-btn-1').click(); await expect(cold.locator('#chat-listen-btn-1')).toHaveText('Listen');
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-default-chat-t_voice-thread'))).toBe(stored);
    expect(await cold.evaluate(() => { const f = (window as unknown as { voiceFixture: Fixture; }).voiceFixture; return [f.starts, f.stops, f.requests.length]; })).toEqual([1, 1, 2]);
    await cold.screenshot({ path: test.info().outputPath('voice-static-offline.png') }); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
