import { expect, test } from './coverage-fixture.js';

for (const source of ['wearable', 'cycle']) {
  test(`backup export rejects a ${source} read abort and succeeds after recovery`, async ({ page }) => {
    await page.goto('/app');
    const result = await page.evaluate(async source => {
      const backup = await import('/js/backup.js');
      const profileId = 'backup-export-fixture';
      localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Backup fixture' }]));
      localStorage.removeItem('labcharts-last-manual-backup');
      const { upsertDailyBatchRaw } = await import('/js/wearables-store.js');
      const { upsertCycleObservationBatchRaw } = await import('/js/cycle-store.js');
      await upsertDailyBatchRaw(profileId, [{ source: 'manual', date: '2026-09-21', weight: 80 }]);
      await upsertCycleObservationBatchRaw(profileId, [{ source: 'manual', date: '2026-09-21', bleeding: { flow: 'light' } }]);
      const original = IDBObjectStore.prototype.openCursor;
      let aborts = 0;
      IDBObjectStore.prototype.openCursor = function (...args) {
        const request = original.apply(this, args);
        if (this.transaction.db.name.includes(source === 'wearable' ? 'wearables' : 'cycle')) {
          aborts += 1;
          this.transaction.abort();
        }
        return request;
      };
      try {
        await backup.exportEncryptedBackup();
        return { aborts, lastBackup: localStorage.getItem('labcharts-last-manual-backup') };
      } finally { IDBObjectStore.prototype.openCursor = original; }
    }, source);
    expect(result.aborts).toBeGreaterThan(0);
    expect(result.lastBackup).toBeNull();
    await expect(page.locator('#notification-container')).toContainText('Backup could not be created');
    await expect(page.locator('#notification-container')).not.toContainText('Backup exported successfully');
    const download = page.waitForEvent('download');
    await page.evaluate(async () => (await import('/js/backup.js')).exportEncryptedBackup());
    expect((await download).suggestedFilename()).toMatch(/^labcharts-backup-/);
    await expect(page.locator('#notification-container')).toContainText('Backup exported successfully');
    const recovered = await page.evaluate(async () => (await import('/js/backup.js')).buildFullBackupSnapshot());
    expect(recovered.wearableIDB['backup-export-fixture'].manual[0].weight).toBe(80);
    expect(recovered.cycleIDB['backup-export-fixture'].manual[0].bleeding.flow).toBe('light');
  });
}

test('encrypted backup includes legacy and IDB profiles with unchanged ciphertext', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    window.__WEARABLES_TEST = true;
    const crypto = await import('/js/crypto.js');
    const { getBlob } = await import('/js/blob-storage.js');
    const { buildFullBackupSnapshot } = await import('/js/backup.js');
    await crypto._setTestSessionKey('synthetic-backup-passphrase');
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await crypto.encryptedSetItem('labcharts-profiles', JSON.stringify([{ id: 'legacy-fixture', name: 'Legacy' }, { id: 'idb-fixture', name: 'IDB' }]));
    await crypto.encryptedSetItem('labcharts-legacy-fixture-imported', JSON.stringify({ entries: [], contextNotes: 'Legacy private note' }));
    await crypto.encryptedSetItem('labcharts-idb-fixture-imported', JSON.stringify({ entries: [], contextNotes: 'IDB private note' }));
    const legacy = await getBlob('labcharts-legacy-fixture-imported');
    const migrated = await getBlob('labcharts-idb-fixture-imported');
    localStorage.setItem('labcharts-legacy-fixture-imported', legacy);
    const snapshot = await buildFullBackupSnapshot();
    return {
      profiles: snapshot.profiles.map(profile => profile.profileId),
      sameCiphertext: snapshot.profiles[0].keys.imported === legacy && snapshot.profiles[1].keys.imported === migrated,
      encrypted: snapshot.encrypted && snapshot.profileList.startsWith('v1:') && legacy.startsWith('v1:') && migrated.startsWith('v1:'),
      leakedPrivateNote: JSON.stringify(snapshot).includes('private note'),
    };
  });
  expect(result).toEqual({ profiles: ['legacy-fixture', 'idb-fixture'], sameCiphertext: true, encrypted: true, leakedPrivateNote: false });
});
