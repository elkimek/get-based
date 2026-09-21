import { expect, test } from './coverage-fixture.js';

for (const mode of ['file', 'snapshot']) {
  for (const source of ['wearable', 'cycle']) {
    test(`${mode} restore reports ${source} storage failure without scheduling a success reload`, async ({ page }) => {
      await page.goto('/app');
      await page.evaluate(async ({ mode, source }) => {
        const backup = await import('/js/backup.js');
        const profile = 'restore-failure-fixture';
        const snapshot = {
          format: 'labcharts-backup', createdAt: '2026-09-21T12:00:00Z', encrypted: false,
          profileList: JSON.stringify([{ id: profile, name: 'Restore fixture' }]),
          profiles: [{ profileId: profile, keys: { imported: JSON.stringify({ entries: [] }) } }],
          wearableIDB: { [profile]: { manual: [{ source: 'manual', date: '2026-09-21', weight: 80 }] } },
          cycleIDB: { [profile]: { manual: [{ source: 'manual', date: '2026-09-21', importId: 'fixture-import', bleeding: { flow: 'light' } }] } },
        };
        const timeout = window.setTimeout;
        window.restoreReloads = 0;
        window.setTimeout = (callback, delay, ...args) => {
          if (String(callback).includes('location.reload')) { window.restoreReloads += 1; return 0; }
          return timeout(callback, delay, ...args);
        };
        const put = IDBObjectStore.prototype.put;
        window.restoreAborts = 0;
        IDBObjectStore.prototype.put = function (...args) {
          const request = put.apply(this, args);
          const database = this.transaction.db.name;
          if (database.includes(source === 'wearable' ? 'wearables' : 'cycle') && this.name === (source === 'wearable' ? 'daily-metrics' : 'daily-observations')) {
            request.addEventListener('success', () => { window.restoreAborts += 1; this.transaction.abort(); }, { once: true });
          }
          return request;
        };
        window.finishRestoreFixture = () => { IDBObjectStore.prototype.put = put; window.setTimeout = timeout; };
        if (mode === 'file') backup.importEncryptedBackup(new File([JSON.stringify(snapshot)], 'synthetic-backup.json', { type: 'application/json' }));
        else {
          const db = await backup.openBackupDB();
          const id = await new Promise((resolve, reject) => {
            const tx = db.transaction('snapshots', 'readwrite');
            const request = tx.objectStore('snapshots').add({ createdAt: snapshot.createdAt, snapshot });
            tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error);
          });
          await import('/js/crypto-ui.js');
          const button = document.createElement('button');
          button.setAttribute('data-crypto-action', 'restore-auto-backup');
          button.setAttribute('data-crypto-snapshot-id', String(id));
          button.setAttribute('data-crypto-snapshot-id-type', 'number');
          document.body.append(button);
          button.click();
        }
      }, { mode, source });
      await page.locator('#confirm-dialog-overlay.show #confirm-ok').click();
      await expect.poll(() => page.evaluate(() => window.restoreAborts)).toBeGreaterThan(0);
      await expect(page.locator('#notification-container')).toContainText('incomplete');
      expect(await page.evaluate(() => window.restoreReloads)).toBe(0);
      await expect(page.locator('#notification-container')).not.toContainText('Backup restored');
      await page.evaluate(() => window.finishRestoreFixture());
    });
  }
}
