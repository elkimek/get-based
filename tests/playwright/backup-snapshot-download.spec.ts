import fs from 'node:fs/promises';
import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';

const passphrase = 'SyntheticSnapshot1!';
async function prepare(page: Page, url: string) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-paused', 'true');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice', acceptedAt: '2026-11-12T00:00:00Z',
    }));
    for (const suffix of ['emptyTour', 'tour']) localStorage.setItem('labcharts-default-' + suffix, 'completed');
  });
  await page.goto(url);
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
}
async function openBackup(page: Page) {
  const close = page.getByRole('button', { name: 'Close chat', exact: true });
  if (await close.isVisible()) await close.click();
  await page.locator('[data-shell-action="open-settings"]:visible').first().click();
  await page.locator('#settings-nav-data').click();
  await page.locator('#backup-snapshots-toggle').click();
  await expect(page.locator('#backup-snapshot-list')).toBeVisible();
}

for (const encrypted of [false, true]) {
  test('saved ' + (encrypted ? 'encrypted' : 'plaintext') + ' snapshot downloads without restoring and recovers on another origin', async ({ page, browser }) => {
    test.setTimeout(60000);
    await prepare(page, '/app');
    const sourceOrigin = new URL(page.url()).origin;
    const fixture = await page.evaluate(async ({ encrypted, passphrase }) => {
      const crypto = await import('/js/crypto.js');
      if (encrypted) {
        (window as Window & { __WEARABLES_TEST?: boolean }).__WEARABLES_TEST = true;
        const salt = await crypto._setTestSessionKey(passphrase);
        localStorage.setItem('labcharts-encryption-salt', btoa(String.fromCharCode(...salt!)));
        localStorage.setItem('labcharts-encryption-enabled', 'true');
      }
      const profiles = [{ id: 'snapshot-portable', name: 'Saved snapshot', tags: [], status: 'active', createdAt: 1, lastUpdated: 1 }];
      await crypto.encryptedSetItem('labcharts-profiles', JSON.stringify(profiles));
      localStorage.setItem('labcharts-active-profile', 'snapshot-portable');
      await crypto.encryptedSetItem('labcharts-snapshot-portable-imported', JSON.stringify({ entries: [], contextNotes: 'Historical snapshot note' }));
      await (await import('/js/wearables-store.js')).upsertDailyBatch('snapshot-portable', [{ source: 'manual', date: '2026-11-01', weight: 81 }]);
      const backup = await import('/js/backup.js');
      const snapshot = (await backup.buildFullBackupSnapshot())!;
      snapshot.createdAt = '2026-11-01T09:08:07.000Z';
      const db = await backup.openBackupDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put({ id: 42, createdAt: snapshot.createdAt, encrypted, snapshot });
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      await crypto.encryptedSetItem('labcharts-snapshot-portable-imported', JSON.stringify({ entries: [], contextNotes: 'Current data must survive' }));
      localStorage.setItem('labcharts-last-manual-backup', 'current-backup-marker');
      return {
        serialized: backup.serializeBackupSnapshot(snapshot)!,
        current: await crypto.encryptedGetItem('labcharts-snapshot-portable-imported'),
        profileList: localStorage.getItem('labcharts-profiles'),
      };
    }, { encrypted, passphrase });
    await openBackup(page);
    const downloading = page.waitForEvent('download');
    await page.locator('[data-crypto-action="export-auto-backup"][data-crypto-snapshot-id="42"]').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('getbased-backup-snapshot-2026-11-01-09-08-07.json');
    const bytes = await fs.readFile((await download.path())!);
    expect(bytes.toString()).toBe(fixture.serialized);
    await expect(page.locator('#confirm-dialog-overlay.show')).toHaveCount(0);
    expect(await page.evaluate(async () => ({
      current: await (await import('/js/crypto.js')).encryptedGetItem('labcharts-snapshot-portable-imported'),
      profileList: localStorage.getItem('labcharts-profiles'),
      lastManual: localStorage.getItem('labcharts-last-manual-backup'),
    }))).toEqual({ current: fixture.current, profileList: fixture.profileList, lastManual: 'current-backup-marker' });

    const destination = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const target = await destination.newPage();
      const targetOrigin = sourceOrigin.replace('127.0.0.1', 'localhost');
      expect(targetOrigin).not.toBe(sourceOrigin);
      await prepare(target, targetOrigin + '/app');
      await target.locator('[data-shell-action="open-settings"]:visible').first().click();
      await target.locator('#settings-nav-data').click();
      const chooser = target.waitForEvent('filechooser');
      await target.getByRole('button', { name: 'Restore Backup', exact: true }).click();
      await (await chooser).setFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes });
      await expect(target.locator('#confirm-dialog-overlay.show')).toContainText('Restore backup');
      const reload = target.waitForEvent('framenavigated', { predicate: frame => frame === target.mainFrame() });
      await target.locator('#confirm-ok').click();
      await reload;
      if (encrypted) {
        await target.locator('#passphrase-unlock-input').fill(passphrase);
        await target.locator('#passphrase-unlock-btn').click();
      }
      await expect(target.locator('html[data-app-ready]')).toBeAttached();
      const restored = await target.evaluate(async () => ({
        data: JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem('labcharts-snapshot-portable-imported'))!),
        readings: await (await import('/js/wearables-store.js')).getDailyRange('snapshot-portable', 'manual', '2026-11-01', '2026-11-01'),
      }));
      expect(restored.data.contextNotes).toBe('Historical snapshot note');
      expect(restored.readings[0]!.weight).toBe(81);
      await target.reload();
      if (encrypted && await target.locator('#passphrase-unlock-input').isVisible()) {
        await target.locator('#passphrase-unlock-input').fill(passphrase);
        await target.locator('#passphrase-unlock-btn').click();
      }
      await expect(target.locator('html[data-app-ready]')).toBeAttached();
      expect(await target.evaluate(async () => JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem('labcharts-snapshot-portable-imported'))!).contextNotes)).toBe('Historical snapshot note');
    } finally { await destination.close(); }
  });
}

test('a snapshot removed after listing reports the problem without exporting current data', async ({ page }) => {
  await prepare(page, '/app');
  await page.evaluate(async () => {
    const { buildFullBackupSnapshot, openBackupDB } = await import('/js/backup.js');
    const snapshot = (await buildFullBackupSnapshot())!;
    const db = await openBackupDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({ id: 43, createdAt: snapshot.createdAt, encrypted: snapshot.encrypted, snapshot });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  });
  await openBackup(page);
  await page.evaluate(async () => {
    const db = await (await import('/js/backup.js')).openBackupDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').delete(43);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  });
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.locator('[data-crypto-action="export-auto-backup"][data-crypto-snapshot-id="43"]').click();
  await expect(page.locator('#notification-container')).toContainText('Snapshot not found');
  expect(downloads).toBe(0);
});
