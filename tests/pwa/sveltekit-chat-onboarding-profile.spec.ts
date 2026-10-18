import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { BackupSnapshot } from '../../js/backup.js';
import type { ProfileData } from '../../types/app-state.js';
import type { ProfileRecord } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('static profile onboarding saves on offline first use and retains profile fields and IndexedDB weight through cold launch', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await installDiscussionFixture(context);
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      (window as unknown as { profileCsp: string[] }).profileCsp ??= [];
      (window as unknown as { profileCsp: string[] }).profileCsp.push(event.violatedDirective);
    });
  });
  const server = await startKitServer(artifact);
  try {
    // Desktop returning-user startup deliberately opens guided Chat. Exercise
    // first offline construction from the genuine compact welcome instead.
    const requestedViewport = page.viewportSize();
    if (requestedViewport && requestedViewport.width > 768) await page.setViewportSize({ width: 700, height: requestedViewport.height });
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    expect(await page.locator('[data-chat-profile-setup-view]').count()).toBe(0);
    server.state.offline = true;
    await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
    await expect(page.locator('[data-chat-profile-setup-view]')).toBeVisible();
    if (requestedViewport) await page.setViewportSize(requestedViewport);
    await page.locator('#chat-onboard-dob').fill('1990-01-02');
    await page.locator('#chat-onboard-name').fill('Ada <literal>');
    await page.getByRole('button', { name: 'Female', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Female', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByText('Optional body and location context', { exact: true }).click();
    await page.locator('#chat-onboard-height').fill('180');
    await page.locator('#chat-onboard-height-unit').selectOption('in');
    await page.locator('#chat-onboard-height').fill('70');
    await page.locator('#chat-onboard-weight').fill('150');
    await page.locator('#chat-onboard-weight-unit').selectOption('lbs');
    await page.locator('#chat-onboard-country').fill('Germany');
    await expect(page.locator('#chat-onboard-lat')).not.toBeEmpty();
    await expect(page.locator('#chat-onboard-next')).toBeEnabled();
    await page.locator('#chat-onboard-next').click();
    await expect(page.getByRole('group', { name: 'Onboarding step 2 of 3: Add-ons' })).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('labcharts-profiles'));
    expect(JSON.parse(stored!)[0]).toMatchObject({ name: 'Ada <literal>', sex: 'female', dob: '1990-01-02', height: 177.8, heightUnit: 'in', location: { country: 'Germany', zip: '' } });
    expect(await page.evaluate(() => (window as unknown as { profileCsp?: string[] }).profileCsp || [])).toEqual([]);
    await page.close();
    const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
    await expect(cold.getByRole('button', { name: 'Weight: 68.0 kg', exact: true })).toBeVisible();
    await cold.locator('#chat-fab').click();
    await expect(cold.getByRole('group', { name: 'Onboarding step 2 of 3: Add-ons' })).toBeVisible();
    await cold.getByRole('button', { name: 'Back to previous onboarding step' }).click();
    await expect(cold.locator('#chat-onboard-name')).toHaveValue('Ada <literal>');
    await expect(cold.getByRole('button', { name: 'Female', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(cold.locator('#chat-onboard-dob')).toHaveValue('1990-01-02');
    await cold.getByText('Optional body and location context', { exact: true }).click();
    await expect(cold.locator('#chat-onboard-height')).toHaveValue('70.0');
    await expect(cold.locator('#chat-onboard-height-unit')).toHaveValue('in');
    await expect(cold.locator('#chat-onboard-country')).toHaveValue('Germany');
    await expect(cold.locator('#chat-onboard-lat')).not.toBeEmpty();
    await cold.screenshot({ path: test.info().outputPath('profile-offline-cold.png') });
    const restored = await cold.evaluate(() => localStorage.getItem('labcharts-profiles'));
    const originalProfiles = JSON.parse(stored!) as ProfileRecord[];
    const restoredProfiles = JSON.parse(restored!) as ProfileRecord[];
    // Existing startup maintenance may persist a manual-source/summary update and touch lastUpdated.
    // Every other profile field must remain identical, and the timestamp must never move backward.
    const fields = (profiles: ProfileRecord[]) => profiles.map(({ lastUpdated, ...profile }) => profile);
    expect(fields(restoredProfiles)).toEqual(fields(originalProfiles));
    expect(restoredProfiles[0]!.lastUpdated).toBeGreaterThanOrEqual(originalProfiles[0]!.lastUpdated);
    // Export through the real UI: the backup service reads the migrated profile blob from IndexedDB.
    await cold.getByRole('button', { name: 'Close chat', exact: true }).click();
    await cold.locator('[data-shell-action="open-settings"]').click();
    await cold.locator('#settings-nav-data').click();
    const downloading = cold.waitForEvent('download');
    await cold.locator('#backup-section').getByRole('button', { name: 'Download Backup', exact: true }).click();
    const download = await downloading;
    const backup = JSON.parse(await fs.readFile((await download.path())!, 'utf8')) as BackupSnapshot;
    expect(backup).toMatchObject({ format: 'labcharts-backup', encrypted: false });
    const profileId = JSON.parse(stored!)[0].id as string;
    const saved = backup.profiles.find(profile => profile.profileId === profileId)!;
    const imported = saved.keys.imported;
    const data = JSON.parse(imported!) as ProfileData;
    expect(data.biometrics!.weight).toEqual([expect.objectContaining({ value: 150, unit: 'lbs', source: 'manual' })]);
    const manual = backup.wearableIDB?.[profileId]?.manual;
    expect(manual).toEqual([expect.objectContaining({ source: 'manual', weight: expect.closeTo(68.0388555, 6) })]);
    expect(await cold.evaluate(() => (window as unknown as { profileCsp?: string[] }).profileCsp || [])).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
