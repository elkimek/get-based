import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import type { ProfileData } from '../../types/app-state.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import {
  navigateWithOfflineLaunchDiagnostics, captureOfflineLaunchDiagnostics, installOfflineStartupDiagnostics,
} from '../helpers/offline-launch-diagnostics.js';

async function ready(page: Page, origin: string) {
  await navigateWithOfflineLaunchDiagnostics(page, origin + '/app?dev-sw=1', test.info());
  try {
    await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  } catch (error) {
    await captureOfflineLaunchDiagnostics(page, test.info());
    throw error;
  }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  return page.evaluate(() => performance.now());
}

async function open(page: Page) {
  if (await page.locator('#chat-fab').isVisible()) await page.locator('#chat-fab').click();
  else await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
}

test('static authored empty Chat preserves context notes through offline skip, return and two closed-client launches', async ({ page, context }) => {
  test.setTimeout(120000);
  await installOfflineStartupDiagnostics(context);
  await installDiscussionFixture(context);
  // Establish a committed baseline once, then exercise all subsequent writes
  // through the real offline onboarding and notes controls.
  await context.addInitScript(defaults => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('empty-baseline-seeded')) return;
    localStorage.setItem('labcharts-default-imported', JSON.stringify(defaults));
    localStorage.setItem('empty-baseline-seeded', '1');
  }, createDefaultProfileData());
  const errors: string[] = [], csp: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('emptyCsp', (_, value: string) => { csp.push(value); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { emptyCsp(value: string): Promise<void> }).emptyCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', observedReadyMs: await ready(page, server.origin) }];
    server.state.offline = true;
    await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
    await page.locator('#chat-onboard-name').fill('Ada <literal>');
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await expect(page.locator('#chat-onboard-next')).toBeEnabled();
    await page.locator('#chat-onboard-next').click();
    await page.getByRole('button', { name: 'Continue to context cards', exact: true }).click();
    await expect(page.locator('[data-chat-empty-view] .chat-context-cards')).toBeVisible();
    await expect(page.locator('.chat-context-cards article.context-card')).toHaveCount(9);

    const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    const started = Date.now();
    const date = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    await page.locator('.chat-context-cards').getByRole('textbox', { name: 'Additional context', exact: true }).fill('Offline context <literal> & kept');
    await expect(page.locator('.chat-context-cards .ctx-notes-status')).toHaveText('Saved');
    let snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    const expected = {
      ...before, contextNotes: 'Offline context <literal> & kept',
      changeHistory: [...(before.changeHistory || []), {
        field: 'contextNotes', date, snapshot: 'Offline context <literal> & kept', updatedAt: expect.any(Number),
      }],
    };
    expect(snapshot).toEqual(expected);
    expect((snapshot.changeHistory!.at(-1) as { updatedAt: number }).updatedAt).toBeGreaterThanOrEqual(started);
    await page.getByRole('button', { name: 'Skip context cards', exact: true }).click();
    await expect(page.locator('[data-chat-empty-view]')).toContainText('Context cards are skipped for now, Ada <literal>.');
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
    await page.close();

    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      loading.push({ phase: `offline-cold-${launch + 1}`, observedReadyMs: await ready(cold, server.origin) });
      await open(cold);
      await expect(cold.locator('[data-chat-empty-view]')).toContainText('Context cards are skipped for now');
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
      await cold.getByRole('button', { name: 'Add context cards', exact: true }).click();
      await expect(cold.locator('.chat-context-cards textarea')).toHaveValue('Offline context <literal> & kept');
      await cold.getByRole('button', { name: 'Skip context cards', exact: true }).click();
      await expect(cold.locator('[data-chat-empty-view]')).toContainText('Context cards are skipped for now');
      snapshot = await cold.evaluate(readComparisonAcceptanceProfile) as ProfileData;
      expect(snapshot).toEqual(expected);
      await cold.close();
    }
    expect(errors).toEqual([]);
    expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('chat-empty-loading.json'), JSON.stringify({
      measurement: 'Local fixture performance.now sampled after automation observed app-ready and worker control; not hosted or physical-device performance acceptance.',
      loading,
    }, null, 2) + '\n');
  } finally {
    await server.close();
  }
});
