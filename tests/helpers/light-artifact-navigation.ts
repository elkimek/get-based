import {performance as hostPerformance} from 'node:perf_hooks';
import { expect, test, type Page } from '@playwright/test';
import { navigateWithOfflineLaunchDiagnostics, captureOfflineLaunchDiagnostics } from './offline-launch-diagnostics.js';

export async function readyLightArtifact(page: Page, origin: string) {
  // Playwright's browser clock is shared across pages. Measure this navigation
  // through controlled app readiness with the independent host monotonic clock.
  const startedAt = hostPerformance.now();
  await navigateWithOfflineLaunchDiagnostics(page, origin + '/app?dev-sw=1', test.info());
  try {
    await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  } catch (error) { await captureOfflineLaunchDiagnostics(page, test.info()); throw error; }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  return Math.round(hostPerformance.now() - startedAt);
}
export async function openLightArtifact(page: Page) {
  if (await page.locator('#chat-panel.open').isVisible()) await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('[data-nav-action="navigate"][data-nav-route="light"]').click();
  await expect(page.locator('.light-page[data-light-page-presentation]')).toBeVisible();
  await expect(page.locator('.light-session-log-actions')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/);
  await expect(page.locator('.light-page > .category-header')).toHaveCSS('margin-bottom', '0px');
}
