import fs from 'node:fs/promises';
import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import type { BackupSnapshot } from '../../js/backup.js';

const passphrase = 'SyntheticBackup1!';
const providerKeys = ['api', 'lens', 'venice', 'openrouter', 'routstr', 'ppq', 'custom'].map(provider => `labcharts-${provider}-key`);
const notes = 'Synthetic backup must survive a fresh browser context.';
const profileList = [{ id: 'portable', name: 'Portable backup', createdAt: 1, location: { country: '', zip: '' }, tags: [], notes: '', status: 'active', lastUpdated: Date.parse('2026-10-31T12:00:00Z'), pinned: false, height: null, heightUnit: 'cm' }];
async function prepare(page: Page, url: string) {
  await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
  await page.addInitScript(() => {
    if (localStorage.getItem('backup-portability-prepared')) return;
    localStorage.setItem('backup-portability-prepared', 'true');
    localStorage.setItem('labcharts-ai-paused', 'true');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-31T00:00:00Z' }));
    for (const suffix of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed');
  });
  await page.goto(url);
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
}
async function openBackup(page: Page) {
  const close = page.getByRole('button', { name: 'Close chat', exact: true });
  if (await close.isVisible()) await close.click();
  await page.locator('[data-shell-action="open-settings"]:visible').first().click();
  await page.locator('#settings-nav-data').click();
  await expect(page.locator('#backup-section [data-protection-view="backup"]')).toBeVisible();
}

for (const encrypted of [false, true]) {
  for (const route of ['settings', 'json-import'] as const) {
    test(`downloaded ${encrypted ? 'encrypted' : 'unencrypted'} backup restores in a fresh window through ${route}`, async ({ page, browser }) => {
      test.setTimeout(60000);
      await prepare(page, '/app');
      const origin = new URL(page.url()).origin;
      await page.evaluate(async ({ encrypted, passphrase, providerKeys, notes, profileList }) => {
        const crypto = await import('/js/crypto.js');
        if (encrypted) {
          (window as Window & { __WEARABLES_TEST?: boolean }).__WEARABLES_TEST = true;
          const salt = await crypto._setTestSessionKey(passphrase);
          localStorage.setItem('labcharts-encryption-salt', btoa(String.fromCharCode(...salt!)));
          localStorage.setItem('labcharts-encryption-enabled', 'true');
        }
        await crypto.encryptedSetItem('labcharts-profiles', JSON.stringify(profileList));
        localStorage.setItem('labcharts-active-profile', 'portable');
        await crypto.encryptedSetItem('labcharts-portable-imported', JSON.stringify({ entries: [], contextNotes: notes }));
        for (const key of providerKeys) await crypto.encryptedSetCredentialItem(key, `synthetic-secret-${key}`);
        await (await import('/js/wearables-store.js')).upsertDailyBatch('portable', [{ source: 'manual', date: '2026-10-31', weight: 81 }]);
        await (await import('/js/cycle-store.js')).upsertCycleObservationBatch('portable', [{ source: 'manual', date: '2026-10-31', importId: 'portable-cycle', bleeding: { flow: 'light' } }]);
      }, { encrypted, passphrase, providerKeys, notes, profileList });
      await openBackup(page);
      const downloading = page.waitForEvent('download');
      await page.locator('#backup-section').getByRole('button', { name: 'Download Backup', exact: true }).click();
      const download = await downloading;
      const bytes = await fs.readFile((await download.path())!);
      const snapshot = JSON.parse(bytes.toString()) as BackupSnapshot;
      expect(snapshot).toMatchObject({ format: 'labcharts-backup', version: 1, encrypted });
      for (const key of providerKeys) {
        if (encrypted) expect(snapshot.settings[key]).toMatch(/^v1:/);
        else expect(snapshot.settings).not.toHaveProperty(key);
        expect(bytes.toString()).not.toContain(`synthetic-secret-${key}`);
      }
      const fresh = await browser.newContext({ serviceWorkers: 'block' });
      try {
        const target = await fresh.newPage();
        await prepare(target, origin + '/app');
        const before = await target.evaluate(() => localStorage.getItem('labcharts-profiles'));
        const choose = async () => {
          const file = { name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes };
          if (route === 'settings') {
            const chooser = target.waitForEvent('filechooser');
            await target.locator('#backup-section').getByRole('button', { name: 'Restore Backup', exact: true }).click();
            await (await chooser).setFiles(file);
          } else {
            await target.locator('#profile-selector [data-nav-action="open-client-list"]').click();
            await expect(target.locator('#client-list-overlay')).toHaveClass(/\bshow\b/);
            await target.locator('#client-list-modal [data-cl-action="toggle-tools-menu"]').click();
            const chooser = target.waitForEvent('filechooser');
            await target.locator('#client-list-modal [data-cl-action="trigger-json-import"]').click();
            await (await chooser).setFiles(file);
          }
          await expect(target.locator('#confirm-dialog-overlay.show')).toContainText('This will overwrite 1 profile(s).');
        };
        if (route === 'settings') await openBackup(target);
        await choose();
        await target.locator('#confirm-cancel').click();
        await expect(target.locator('#confirm-dialog-overlay')).not.toHaveClass(/\bshow\b/);
        expect(await target.evaluate(() => localStorage.getItem('labcharts-profiles'))).toBe(before);
        expect(await target.evaluate(() => localStorage.getItem('labcharts-encryption-enabled'))).toBeNull();
        await choose();
        const reload = target.waitForEvent('framenavigated', { predicate: frame => frame === target.mainFrame() });
        await target.locator('#confirm-ok').click();
        await reload;
        if (encrypted) {
          await target.locator('#passphrase-unlock-input').fill(passphrase);
          await target.locator('#passphrase-unlock-btn').click();
        }
        await expect(target.locator('html[data-app-ready]')).toBeAttached();
        const restored = await target.evaluate(async ({ providerKeys }) => {
          const crypto = await import('/js/crypto.js');
          const wearable = await (await import('/js/wearables-store.js')).getDailyRange('portable', 'manual', '2026-10-31', '2026-10-31');
          const cycle = await (await import('/js/cycle-store.js')).getAllCycleObservationsRaw('portable');
          return {
            profiles: await crypto.encryptedGetItem('labcharts-profiles'),
            data: await crypto.encryptedGetItem('labcharts-portable-imported'),
            keys: await Promise.all(providerKeys.map(key => crypto.encryptedGetItem(key))),
            wearableWeight: wearable[0]?.weight,
            cycleCount: cycle.length,
          };
        }, { providerKeys });
        expect(restored.profiles).toBe(JSON.stringify(profileList));
        expect(JSON.parse(restored.data!).contextNotes).toBe(notes);
        expect(restored.keys).toEqual(providerKeys.map(key => encrypted ? `synthetic-secret-${key}` : null));
        expect(restored.wearableWeight).toBe(81);
        expect(restored.cycleCount).toBe(1);
      } finally { await fresh.close(); }
    });
  }
}


test('cancelling a full backup ends a mixed file import without merging later files', async ({ page }) => {
  await prepare(page, '/app');
  const before = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const before = JSON.stringify(state.importedData);
    const { dispatchImportFiles } = await import('/js/import-dispatch.js');
    const { importDataJSON } = await import('/js/export-import.js');
    const { loadImportUI } = await import('/js/import-loader.js');
    const backup = { format: 'labcharts-backup', version: 1, createdAt: '2026-10-31', profileList: '[]', profiles: [] };
    const files = [new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' }),
      new File([JSON.stringify({ entries: [], contextNotes: 'Must never merge after a full backup.' })], 'later.json', { type: 'application/json' })];
    (window as unknown as { pendingBackupImport: Promise<void> }).pendingBackupImport = dispatchImportFiles(files, loadImportUI, 'picker', importDataJSON);
    return before;
  });
  await expect(page.locator('#confirm-dialog-overlay.show')).toContainText('Restore backup');
  await page.locator('#confirm-cancel').click();
  const after = await page.evaluate(async () => {
    await (window as unknown as { pendingBackupImport: Promise<void> }).pendingBackupImport;
    const { state } = await import('/js/state.js');
    const { importDispatch } = await import('/js/pdf-import-progress.js');
    return { data: JSON.stringify(state.importedData), busy: importDispatch.busy };
  });
  expect(after).toEqual({ data: before, busy: false });
});
