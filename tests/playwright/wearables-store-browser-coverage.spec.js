import { expect, test } from './coverage-fixture.js';

test('wearables store browser coverage handles rows raw backup metadata and database lifecycle', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const store = await import('/js/wearables-store.js');
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const profileId = `wearables-store-coverage-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      await store.deleteWearablesDB(profileId).catch(() => {});

      let validationMessage = '';
      try {
        await store.upsertDaily(profileId, { source: 'oura' });
      } catch (error) {
        validationMessage = error?.message || String(error);
      }
      check('upsertDaily validates source and date fields',
        validationMessage.includes('upsertDaily requires {source, date}'));

      await store.upsertDaily(profileId, {
        source: 'oura',
        date: '2026-06-01',
        hrv_rmssd: 44,
        rhr: 54,
      });
      const firstRead = await store.getDaily(profileId, 'oura', '2026-06-01');
      check('upsertDaily round-trips a browser IndexedDB row',
        firstRead?.source === 'oura'
        && firstRead?.date === '2026-06-01'
        && firstRead?.hrv_rmssd === 44
        && typeof firstRead?.importedAt === 'number');

      await store.upsertDailyBatch(profileId, [
        { source: 'oura', date: '2026-06-01', hrv_rmssd: null, rhr: 52, steps: 3200 },
        { source: 'oura', date: '2026-06-02', hrv_rmssd: 47, rhr: 51 },
        { source: 'oura' },
        null,
      ]);
      const merged = await store.getDaily(profileId, 'oura', '2026-06-01');
      const range = await store.getDailyRange(profileId, 'oura', '2026-06-01', '2026-06-30');
      const countAfterBatch = await store.countSource(profileId, 'oura');
      check('upsertDailyBatch preserves existing non-null fields and merges incoming values',
        merged?.hrv_rmssd === 44
        && merged?.rhr === 52
        && merged?.steps === 3200);
      check('getDailyRange returns inclusive source rows in chronological order',
        range.length === 2
        && range[0].date === '2026-06-01'
        && range[1].date === '2026-06-02');
      check('countSource ignores invalid batch rows',
        countAfterBatch === 2);

      await store.deleteDaily(profileId, 'oura', '2026-06-02');
      const afterDelete = await store.getDaily(profileId, 'oura', '2026-06-02');
      const countAfterDelete = await store.countSource(profileId, 'oura');
      check('deleteDaily removes one compound-key row',
        afterDelete == null && countAfterDelete === 1);

      await store.upsertDailyBatchRaw(profileId, [
        { source: 'backup', date: '2026-05-01', hrv_rmssd: 33, _raw: { vendor: 'fixture' } },
        { source: 'backup' },
        null,
      ]);
      const rawRows = await store.getDailyRangeRaw(profileId, 'backup', '2026-05-01', '2026-05-01');
      const restoredRows = await store.getDailyRange(profileId, 'backup', '2026-05-01', '2026-05-01');
      check('raw backup APIs preserve stored row shape',
        rawRows.length === 1
        && rawRows[0]._raw?.vendor === 'fixture'
        && restoredRows.length === 1
        && restoredRows[0].hrv_rmssd === 33);

      await store.setMeta(profileId, 'last-sync:oura', { at: 12345, rows: 2 });
      const meta = await store.getMeta(profileId, 'last-sync:oura');
      await store.deleteMeta(profileId, 'last-sync:oura');
      const metaAfterDelete = await store.getMeta(profileId, 'last-sync:oura');
      check('meta kv supports set get and delete',
        meta?.at === 12345 && meta?.rows === 2 && metaAfterDelete == null);

      await store.clearSource(profileId, 'oura');
      const ouraCount = await store.countSource(profileId, 'oura');
      const backupCount = await store.countSource(profileId, 'backup');
      check('clearSource removes one source without touching others',
        ouraCount === 0 && backupCount === 1);

      const db1 = await store.openWearablesDB(profileId);
      db1.close();
      store.resetWearablesDB(profileId);
      const db2 = await store.openWearablesDB(profileId);
      check('resetWearablesDB evicts the cached connection promise',
        db2 !== db1 && db2.name.includes(profileId));
      db2.close();

      await store.deleteWearablesDB(profileId);
      const afterDbDelete = await store.getDailyRange(profileId, 'backup', '2026-05-01', '2026-05-01');
      check('deleteWearablesDB removes the profile database',
        afterDbDelete.length === 0);
    } finally {
      await store.deleteWearablesDB(profileId).catch(() => {});
    }

    return failures;
  });

  expect(results).toEqual([]);
});
