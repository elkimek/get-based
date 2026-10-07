import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function openChat(page: Page) {
  await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
  await expect(page.locator('[data-chat-header-view]')).toBeVisible();
}
async function inspectReceipt(page: Page) {
  const badge = page.locator('#chat-messages .e2ee-attestation-badge');
  await expect(badge).toContainText('TEE + GPU encrypted');
  await badge.focus();
  const tooltip = page.locator('#e2ee-attestation-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('not proven to run together');
  await expect(tooltip).toContainText('source of each response is not independently verified');
  await expect(tooltip).toContainText('<GPU>');
  await expect(tooltip.locator('gpu')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
}
test('shared static header retains summaries, perspectives and search preference during offline cold launch', async ({ page, context, isMobile }) => {
  test.setTimeout(120000); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  await context.route('https://openrouter.ai/**', route => route.abort());
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const name of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1'); localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-07T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement', JSON.stringify({ version: '2026-08-31', acknowledged: true, acknowledgedAt: '2026-10-07T00:00:00Z' }));
    if (localStorage.getItem('header-fixture-seeded')) return; localStorage.setItem('header-fixture-seeded', '1');
    localStorage.setItem('labcharts-ai-provider', 'openrouter'); localStorage.setItem('labcharts-ai-paused', 'false'); localStorage.setItem('labcharts-openrouter-key', 'synthetic-header-key');
    localStorage.setItem('labcharts-openrouter-model', 'openai/header-test'); localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id: 'openai/header-test', name: 'Header model' }]));
    localStorage.setItem('labcharts-default-chat-current-thread', 'header-thread');
    localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([{ id: 'header-thread', name: 'Retained summary', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', messageCount: 4, personality: 'default', summary: 'A persisted summary.' }]));
    localStorage.setItem('labcharts-default-chat-t_header-thread', JSON.stringify([{ role: 'user', content: 'First question' }, { role: 'assistant', content: 'First answer', personalityName: 'Analyst', personalityIcon: '🔬', provider: 'venice', modelId: 'private-fixture', modelDisplay: 'Private fixture', usage: { inputTokens: 10, outputTokens: 12 }, e2ee: true, attestation: { nonceVerified: true, signingKeyBound: true, dcapVerified: true, gpuVerified: true, gpu: { tokensVerified: true, arch: '<GPU>' } } }, { role: 'user', content: 'Second question' }, { role: 'assistant', content: 'Second answer', personalityName: 'Reviewer', personalityIcon: '🌿' }]));
  });
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await openChat(page); await inspectReceipt(page);
    await expect(page.locator('.chat-header-title')).toContainText('Analyst + 1 perspective');
    await expect(page.locator('.chat-summary-btn')).toHaveAttribute('aria-label', 'View summary');
    await page.locator('#chat-websearch-checkbox').focus(); await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('labcharts-chat-websearch'))).toBe('on');
    if (!isMobile) { await page.locator('.chat-fullscreen-btn').click(); await expect(page.locator('.chat-fullscreen-btn')).toHaveAttribute('aria-pressed', 'true'); }
    await page.locator('.chat-summary-btn').click(); await expect(page.locator('#summary-modal-overlay')).toContainText('A persisted summary.'); await page.keyboard.press('Escape');
    server.state.offline = true; await page.close(); const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await openChat(cold); await inspectReceipt(cold);
    await expect(cold.locator('#chat-websearch-checkbox')).toBeChecked(); await expect(cold.locator('.chat-header-title')).toContainText('Analyst + 1 perspective');
    await expect(cold.locator('.chat-summary-btn')).toHaveAttribute('aria-label', 'View summary');
    if (!isMobile) await expect(cold.locator('.chat-fullscreen-btn')).toHaveAttribute('aria-pressed', 'true');
    await cold.locator('.chat-more-menu > summary').click(); await cold.keyboard.press('Escape'); await expect(cold.locator('.chat-more-menu > summary')).toBeFocused(); await expect(cold.locator('#chat-panel')).toHaveClass(/open/);
    await cold.locator('.chat-summary-btn').click(); await expect(cold.locator('#summary-modal-overlay')).toContainText('A persisted summary.');
    await cold.screenshot({ path: test.info().outputPath('header-static-offline-summary.png') }); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
