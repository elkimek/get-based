import fs from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import { createSelfHostServer, SELF_HOST_BIND } from '../../server/self-host-server.js';
import { createDefaultProfileData } from '../../js/profile.js';
import type { BackupSnapshot } from '../../js/backup.js';

async function backup(page: Page): Promise<BackupSnapshot> {
  const close = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await close.isVisible()) await close.click();
  await page.locator('[data-shell-action="open-settings"]:visible').first().click();
  await page.locator('#settings-nav-data').click();
  const downloading = page.waitForEvent('download');
  await page.locator('#backup-section').getByRole('button', {name: 'Download Backup', exact: true}).click();
  return JSON.parse(await fs.readFile((await (await downloading).path())!, 'utf8')) as BackupSnapshot;
}

test('the real self-host server boots the production app and recovers records offline without a development URL', async ({page, context}) => {
  test.setTimeout(120000);
  const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
  const server = await createSelfHostServer({artifactDirectory: artifact});
  await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, SELF_HOST_BIND, resolve);});
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true; server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  const errors: string[] = [];
  context.on('page', opened => opened.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(defaults => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('self-host-synthetic-seeded')) return;
    localStorage.setItem('self-host-synthetic-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Synthetic self-host profile', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({...defaults, contextNotes: 'Retain synthetic self-host records.'}));
    localStorage.setItem('labcharts-analytics-disabled', 'true');
    localStorage.setItem('labcharts-ai-paused', 'true');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    for (const suffix of ['emptyTour', 'tour']) localStorage.setItem('labcharts-default-' + suffix, 'completed');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice'}));
  }, createDefaultProfileData());
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  try {
    await page.goto(origin + '/app');
    await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout: 30000});
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const original = await backup(page);
    expect(JSON.parse(original.profiles[0]!.keys.imported!).contextNotes).toBe('Retain synthetic self-host records.');
    await page.close();
    expect(context.pages()).toHaveLength(0);
    await stop();
    const offline = await context.newPage();
    await offline.goto(origin + '/app');
    await expect(offline.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout: 30000});
    const recovered = await backup(offline);
    expect(recovered.profiles).toEqual(original.profiles);
    expect(errors).toEqual([]);
  } finally { await stop(); }
});
