import path from 'node:path';
import { expect, test } from '@playwright/test';
import { startKitServer } from './kit-release-server.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');

for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile static chat scroll' : 'desktop static chat scroll', () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 },
      isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });

    test('retains reading across history reloads and follows only after Jump to latest', async ({ page, context }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.addInitScript(() => {
        if (!['http:', 'https:'].includes(location.protocol)) return;
        for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
        localStorage.setItem('labcharts-analytics-consent-seen', '1');
        localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
        localStorage.setItem('labcharts-ai-paused', 'true');
        localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22',
          privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-11-02T00:00:00Z', appVersion: 'test', location: 'local-test' }));
        const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user',
          content: index % 2 ? `Reading section ${index}. Keep the reader at the same place during a transcript refresh.\n\n`.repeat(24) : `Question ${index}` }));
        localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([{ id: 'scroll-history', name: 'Reading position',
          createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', messageCount: history.length, personality: 'default' }]));
        localStorage.setItem('labcharts-default-chat-t_scroll-history', JSON.stringify(history));
      });
      const server = await startKitServer(artifact);
      try {
        // Use the compact welcome to avoid desktop chat-first auto-opening during boot.
        if (!mobile) await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(server.origin + '/app?dev-sw=1');
        await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
        await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
        await expect(page.locator('#chat-messages .chat-ai')).toHaveCount(6);
        if (!mobile) await page.setViewportSize({ width: 1365, height: 900 });
        const messages = page.locator('#chat-messages');
        await expect.poll(() => messages.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(1000);
        const saved = await page.evaluate(() => localStorage.getItem('labcharts-default-chat-t_scroll-history'));
        const top = await messages.evaluate(node => { node.scrollTop = (node.scrollHeight - node.clientHeight) * 0.4; return node.scrollTop; });
        await expect(page.locator('#chat-jump-latest')).toBeVisible();
        for (let refresh = 0; refresh < 3; refresh++) {
          await page.locator('.chat-close-btn').click();
          await expect(page.locator('#chat-panel')).not.toHaveClass(/open/);
          await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
          await expect(page.locator('#chat-panel')).toHaveClass(/open/);
          await expect.poll(() => messages.evaluate((node, position) => Math.abs(node.scrollTop - position), top)).toBeLessThanOrEqual(2);
          await expect(page.locator('.chat-jump-latest-label')).toHaveText('Jump to latest');
        }
        expect(await page.evaluate(() => localStorage.getItem('labcharts-default-chat-t_scroll-history'))).toBe(saved);
        await page.locator('#chat-jump-latest').click();
        await expect.poll(() => messages.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
        await page.locator('.chat-close-btn').click();
        await page.evaluate(() => {
          const key = 'labcharts-default-chat-t_scroll-history';
          const history = JSON.parse(localStorage.getItem(key)!);
          history.push({ role: 'assistant', content: 'A newly saved reply.\n\n'.repeat(24) });
          localStorage.setItem(key, JSON.stringify(history));
        });
        await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
        await expect(page.locator('#chat-messages .chat-ai')).toHaveCount(7);
        await expect.poll(() => messages.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(3);
        expect(errors).toEqual([]);
      } finally { await server.close(); }
    });
  });
}
