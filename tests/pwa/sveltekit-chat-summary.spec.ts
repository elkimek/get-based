import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { BackupSnapshot } from '../../js/backup.js';
import type { ProfileData } from '../../types/app-state.js';
import { createDefaultProfileData } from '../../js/profile.js';
import { getConfiguredArrayItemId } from '../../js/data-merge.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture, installDiscussionProvider } from '../helpers/chat-discussion-fixture.js';
import { seedChatSummaryFixture } from '../helpers/chat-summary-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { navigateWithOfflineLaunchDiagnostics, captureOfflineLaunchDiagnostics, installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';

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
}
async function open(page: Page) {
  // Deferred returning-user Chat can open and hide its FAB between visibility and click.
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/);
  if (!(await page.locator('#chat-panel.open').isVisible())) {
    if (await page.locator('#chat-fab').isVisible()) await page.locator('#chat-fab').click();
    else await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
  }
  await expect(page.locator('#chat-panel')).toHaveClass(/\bopen\b/);
}
async function rail(page: Page) {
  await open(page);
  // Rendering saved summaries follows restoreRailState in the asynchronous
  // Chat open lifecycle. A visibility snapshot before that point can race it.
  await expect(page.locator('[data-chat-saved-summaries-view]')).toBeAttached();
  if (!(await page.locator('#chat-thread-rail').getAttribute('class'))?.split(' ').includes('open')) {
    await page.getByRole('button', { name: 'Toggle conversations', exact: true }).click();
  }
  await expect(page.locator('#chat-thread-rail')).toHaveClass(/\bopen\b/);
  await expect(page.locator('[data-chat-saved-summaries-view]')).toBeVisible();
}

test('static summary generation, download and deletion preserve unrelated profile data through two offline closed-client launches and backup', async ({ page, context }) => {
  test.setTimeout(120000);
  await installOfflineStartupDiagnostics(context);
  await installDiscussionFixture(context);
  // Only the local model transport is synthetic. Assets, UI, generation,
  // canonical persistence, service worker, exports and deletion are real.
  await installDiscussionProvider(context);
  await context.addInitScript(seedChatSummaryFixture, { defaults: createDefaultProfileData(), generate: true });
  const errors: string[] = [], csp: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('summaryCsp', (_, value: string) => { csp.push(value); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { summaryCsp(value: string): Promise<void> }).summaryCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    await ready(page, server.origin);
    const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    const started = Date.now();
    server.state.offline = true;
    await open(page);
    await expect(page.locator('.chat-summary-btn')).toBeEnabled();
    await page.locator('.chat-summary-btn').click();
    const dialog = page.getByRole('dialog', { name: 'Summary', exact: true });
    await expect(dialog.locator('.summary-modal-body')).toContainText('Synthetic discussion reply.');
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await expect(dialog.locator('.chat-provider-attribution')).toHaveText('AI-generated');
    const snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    const generated = (snapshot.chatSummaries as Record<string, unknown>[]).find(row => row.threadId === 'summary-thread')!;
    expect(generated).toEqual({
      id: expect.stringMatching(/^s_/), threadId: 'summary-thread', threadName: 'Wellness <Plan>',
      content: 'Synthetic discussion reply.', createdAt: expect.any(String), model: 'fixture-model', attribution: 'AI-generated',
      cost: { provider: 'ollama', modelId: 'fixture-model', modelDisplay: 'fixture-model', inputTokens: 12, outputTokens: 5 },
    });
    expect(Date.parse(String(generated.createdAt))).toBeGreaterThanOrEqual(started);
    expect(snapshot).toEqual({ ...before, chatSummaries: [...(before.chatSummaries as unknown[]), generated] });
    const threads = await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-chat-threads') || '[]') as Record<string, unknown>[]);
    expect(threads.find(row => row.id === 'summary-thread')).toMatchObject({
      summary: generated.content, summaryDate: generated.createdAt, summaryModel: generated.model, summaryCost: generated.cost,
    });
    const downloading = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('Wellness__Plan__summary.md');
    const markdown = await fs.readFile((await download.path())!, 'utf8');
    expect(markdown).toContain('# Wellness <Plan>');
    expect(markdown).toContain('Synthetic discussion reply.\n\nAI-generated');
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
    await page.close();

    let cold = await context.newPage();
    await ready(cold, server.origin); await rail(cold);
    const row = cold.locator('[data-chat-saved-summaries-view] button').filter({ hasText: 'Wellness <Plan>' });
    await expect(row).toHaveAttribute('data-chat-message-summary-id', String(generated.id));
    await row.click();
    await expect(cold.getByRole('dialog', { name: 'Summary', exact: true }).locator('.summary-modal-body')).toContainText('Synthetic discussion reply.');
    expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
    await cold.getByRole('dialog', { name: 'Summary', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(cold.getByRole('dialog', { name: 'Summary', exact: true })).not.toBeVisible();
    const deleted = await cold.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    const tombstoneId = getConfiguredArrayItemId('chatSummaries', generated)!;
    expect(tombstoneId).toMatch(/^cs_/);
    const timestamp = (deleted._deletedAt as Record<string, Record<string, number>>).chatSummaries![tombstoneId]!;
    expect(timestamp).toBeGreaterThanOrEqual(started);
    expect(deleted).toEqual({
      ...before,
      _deleted: { ...before._deleted, chatSummaries: [tombstoneId] },
      _deletedAt: { ...before._deletedAt, chatSummaries: { [tombstoneId]: timestamp } },
    });
    expect(await cold.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-chat-threads') || '[]'))).toEqual(threads);
    await cold.close();

    cold = await context.newPage(); await ready(cold, server.origin); await rail(cold);
    await expect(cold.locator('[data-chat-saved-summaries-view] button')).toHaveCount(1);
    await expect(cold.locator('[data-chat-saved-summaries-view] button')).toContainText('Older summary');
    expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(deleted);
    const closeRail = cold.getByRole('button', { name: 'Close conversations', exact: true });
    if (await closeRail.isVisible()) await closeRail.click();
    await cold.getByRole('button', { name: 'Close chat', exact: true }).click();
    await cold.locator('[data-shell-action="open-settings"]').click(); await cold.locator('#settings-nav-data').click();
    const backingUp = cold.waitForEvent('download');
    await cold.locator('#backup-section').getByRole('button', { name: 'Download Backup', exact: true }).click();
    const backup = JSON.parse(await fs.readFile((await (await backingUp).path())!, 'utf8')) as BackupSnapshot;
    expect(backup).toMatchObject({ format: 'labcharts-backup', encrypted: false });
    expect(JSON.parse(backup.profiles.find(profile => profile.keys.imported)!.keys.imported!)).toEqual(deleted);
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
