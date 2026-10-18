import {openStaticSettings} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, hasTouch: false });

async function startSettings(page: Page, origin: string) {
  await page.addInitScript(() => {
    for (const [key, value] of Object.entries({
      'labcharts-theme': 'dark', 'labcharts-ai-provider': 'custom', 'labcharts-ai-paused': 'true',
      'labcharts-default-onboarded': 'profile-set', 'labcharts-default-emptyTour': 'completed',
      'labcharts-default-tour': 'completed', 'labcharts-encryption-nudge-dismissed': 'true',
      'labcharts-analytics-consent-seen': '1',
    })) localStorage.setItem(key, value);
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-15T00:00:00Z' }));
  });
  await page.goto(origin + '/app?dev-sw=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await openDisplay(page);
}
async function openDisplay(page: Page) {
  await openStaticSettings(page);
  await page.locator('#settings-nav-display').click();
  await expect(page.locator('#settings-nav-display')).toHaveAttribute('aria-selected', 'true');
}
async function nextRenderingTurn(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

// Artifact-only physical UI. Native public API/return-value coverage stays in
// settings-navigation-owner.spec.ts; no native runtime is imported into Kit.
for (const mode of ['newer-tab', 'close-reopen', 'keyboard-newer-focus', 'stale-failure', 'current-failure-retry'] as const) {
  test(`assembled Settings owns a delayed stylesheet action: ${mode}`, async ({ page }) => {
    const server = await startKitServer(artifact), errors: string[] = [], requests: string[] = [];
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) return route.abort();
      if (url.pathname === '/css/wearables.css') {
        requests.push(url.pathname + url.search);
        if (requests.length === 1) {
          await held;
          if (mode === 'stale-failure' || mode === 'current-failure-retry') return route.abort('failed');
        }
      }
      return route.continue();
    });
    try {
      await startSettings(page, server.origin);
      if (mode === 'keyboard-newer-focus') {
        await page.locator('#settings-nav-data').click(); await page.locator('#settings-nav-data').focus();
        await page.keyboard.press('ArrowDown');
      } else await page.locator('#settings-nav-wearables').click();
      await expect.poll(() => requests.length).toBe(1);
      if (mode === 'close-reopen') {
        await page.locator('#settings-modal [data-settings-action="close"]').click();
        await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
        await openDisplay(page);
      } else if (mode === 'keyboard-newer-focus') {
        await page.locator('#settings-nav-display').click(); await page.locator('#settings-nav-display').focus();
      } else if (mode === 'newer-tab' || mode === 'stale-failure') await page.locator('#settings-nav-ai').click();
      const selected = await page.locator('.settings-tabs-bar [aria-selected="true"]').getAttribute('id');
      if (mode === 'stale-failure' || mode === 'current-failure-retry') {
        const reportedFailure = page.waitForEvent('console', { predicate: message => message.type() === 'error' && message.text().includes('Failed to load Wearables presentation'), timeout: 12_000 });
        release(); await reportedFailure;
        await expect(page.locator('link[data-wearables-stylesheet]')).toHaveCount(0);
      } else {
        release();
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
          .some(link => new URL(link.href).pathname === '/css/wearables.css' && !!link.sheet));
      }
      await nextRenderingTurn(page);
      await expect(page.locator('.settings-tabs-bar [aria-selected="true"]')).toHaveCount(1);
      await expect(page.locator(`#${selected}`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
      if (mode === 'keyboard-newer-focus') await expect(page.locator('#settings-nav-display')).toBeFocused();
      if (mode === 'stale-failure') {
        await expect(page.locator('#settings-nav-ai')).toBeFocused();
        await expect(page.locator('#notification-container')).not.toContainText('Wearables could not be loaded. Try again.');
      }
      if (mode === 'current-failure-retry' || mode === 'stale-failure') {
        if (mode === 'current-failure-retry') await expect(page.locator('#notification-container')).toContainText('Wearables could not be loaded. Try again.');
        await page.locator('#settings-nav-wearables').click();
        await expect(page.locator('#settings-tab-wearables [data-wearables-view]')).toBeVisible();
        expect(requests).toHaveLength(2); expect(new URL(requests[1]!, server.origin).searchParams.get('lazy-retry')).toBe('1');
      } else expect(requests).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally { release(); await server.close(); }
  });
}
