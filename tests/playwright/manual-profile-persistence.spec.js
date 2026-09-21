import { expect, test } from './coverage-fixture.js';

test('a biometric row and its connection stay with the origin after a switch during IndexedDB lookup', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { logManualMetric } = await import('/js/wearables-manual.js');
    const { getDaily, upsertDaily } = await import('/js/wearables-store.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const profile = state.currentProfile;
    const day = '2026-09-21';
    state.importedData.manualMetricTombstones = { [`rhr.${day}`]: Date.now() };
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    await upsertDaily(profile, { source: 'manual', date: day, rhr: 60 });
    const destination = { entries: [], contextNotes: 'Destination', manualMetricTombstones: {} };
    const get = IDBObjectStore.prototype.get;
    let switched = false;
    IDBObjectStore.prototype.get = function (...args) {
      const request = get.apply(this, args);
      if (Array.isArray(args[0]) && args[0][0] === 'manual' && args[0][1] === day) {
        request.addEventListener('success', () => { switched = true; state.currentProfile = 'destination'; state.importedData = destination; }, { once: true });
      }
      return request;
    };
    try { await logManualMetric(profile, 'weight', { date: day, value: 80 }); }
    finally { IDBObjectStore.prototype.get = get; }
    const saved = JSON.parse(await encryptedGetItem(profileStorageKey(profile, 'imported')));
    return { switched, row: await getDaily(profile, 'manual', day), connected: !!saved.wearableConnections?.manual, destination };
  });
  expect(result.switched).toBe(true);
  expect(result.row).toMatchObject({ weight: 80 });
  expect(result.row.rhr).toBeUndefined();
  expect(result.connected).toBe(true);
  expect(result.destination).toEqual({ entries: [], contextNotes: 'Destination', manualMetricTombstones: {} });
});

test('an aborted deletion-intent commit preserves wearable readings and the live profile', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { deleteAllManualMetrics } = await import('/js/wearables-manual.js');
    const { getDaily, upsertDaily } = await import('/js/wearables-store.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const profile = state.currentProfile;
    const key = profileStorageKey(profile, 'imported');
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    await upsertDaily(profile, { source: 'manual', date: '2026-09-21', rhr: 60 });
    const before = JSON.stringify(state.importedData);
    const diskBefore = await encryptedGetItem(key);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (args[1] === key) request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    };
    let error = '';
    try { await deleteAllManualMetrics(profile); } catch (e) { error = e.message; }
    finally { IDBObjectStore.prototype.put = put; }
    return { error, row: await getDaily(profile, 'manual', '2026-09-21'), liveUnchanged: before === JSON.stringify(state.importedData), diskUnchanged: diskBefore === await encryptedGetItem(key) };
  });
  expect(result.error).toContain('Could not save');
  expect(result.row).toMatchObject({ rhr: 60 });
  expect(result.liveUnchanged).toBe(true);
  expect(result.diskUnchanged).toBe(true);
});

test('simultaneous weight and blood-pressure entries retain both measurements', async ({ page }) => {
  await page.goto('/app');
  const row = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { logManualMetric, logManualBP } = await import('/js/wearables-manual.js');
    const { getDaily } = await import('/js/wearables-store.js');
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    await Promise.all([
      logManualMetric(state.currentProfile, 'weight', { date: '2026-09-20', value: 80 }),
      logManualBP(state.currentProfile, { date: '2026-09-20', systolic: 120, diastolic: 80, pulse: 60 }),
    ]);
    return getDaily(state.currentProfile, 'manual', '2026-09-20');
  });
  expect(row).toMatchObject({ weight: 80, bp_systolic: 120, bp_diastolic: 80, rhr: 60 });
});

test('two tabs serialize manual row writes through the same profile lock', async ({ page, context }) => {
  await page.goto('/app');
  const profile = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    return state.currentProfile;
  });
  const second = await context.newPage();
  await second.goto('/app');
  await second.evaluate(async profile => {
    const { state } = await import('/js/state.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    state.currentProfile = profile;
    state.importedData = JSON.parse(await encryptedGetItem(`labcharts-${profile}-imported`));
    if (!state.importedData) throw new Error('Shared profile not loaded');
  }, profile);
  const lockName = `getbased-manual-rows:${profile}`;
  await page.evaluate(lockName => {
    window.manualTestLockHeld = false;
    navigator.locks.request(lockName, async () => {
      window.manualTestLockHeld = true;
      await new Promise(resolve => { window.releaseManualTestLock = resolve; });
    });
  }, lockName);
  await page.waitForFunction(() => window.manualTestLockHeld);
  const writes = [
    page.evaluate(async profile => (await import('/js/wearables-manual.js')).logManualMetric(profile, 'weight', { date: '2026-09-19', value: 82 }), profile),
    second.evaluate(async profile => (await import('/js/wearables-manual.js')).logManualBP(profile, { date: '2026-09-19', systolic: 118, diastolic: 76 }), profile),
  ];
  try {
    await expect.poll(() => page.evaluate(async lockName => (await navigator.locks.query()).pending.filter(lock => lock.name === lockName).length, lockName)).toBe(2);
  } finally {
    await page.evaluate(() => window.releaseManualTestLock());
    await Promise.all(writes);
  }
  const row = await page.evaluate(async profile => (await import('/js/wearables-store.js')).getDaily(profile, 'manual', '2026-09-19'), profile);
  expect(row).toMatchObject({ weight: 82, bp_systolic: 118, bp_diastolic: 76 });
});

test('raw backup restoration and a manual edit share the row lock', async ({ page }) => {
  await page.goto('/app');
  const profile = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    await Promise.all([import('/js/wearables-store.js'), import('/js/wearables-manual.js')]);
    return state.currentProfile;
  });
  const key = `getbased-manual-rows:${profile}`;
  await page.evaluate(key => {
    navigator.locks.request(key, async () => {
      window.restoreRowLockHeld = true;
      await new Promise(resolve => { window.releaseRestoreRowLock = resolve; });
    });
  }, key);
  await page.waitForFunction(() => window.restoreRowLockHeld);
  const restore = page.evaluate(async profile => (await import('/js/wearables-store.js')).upsertDailyBatchRaw(profile, [{ source: 'manual', date: '2026-09-18', rhr: 64 }]), profile);
  try {
    await expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending.filter(lock => lock.name === key).length, key)).toBe(1);
    const edit = page.evaluate(async profile => (await import('/js/wearables-manual.js')).logManualMetric(profile, 'weight', { date: '2026-09-18', value: 80 }), profile);
    // The module queue keeps the edit behind the queued restore in this tab.
    await page.evaluate(() => window.releaseRestoreRowLock());
    await Promise.all([restore, edit]);
  } finally { await page.evaluate(() => window.releaseRestoreRowLock()); }
  const row = await page.evaluate(async profile => (await import('/js/wearables-store.js')).getDaily(profile, 'manual', '2026-09-18'), profile);
  expect(row).toMatchObject({ rhr: 64, weight: 80 });
});

test('migration retry after an aborted metadata commit preserves newer manual readings', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { migrateBiometricsToManual, logManualMetric } = await import('/js/wearables-manual.js');
    const { getDaily, getMeta, setMeta } = await import('/js/wearables-store.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const profile = state.currentProfile;
    const key = profileStorageKey(profile, 'imported');
    const day = '2026-09-21';
    const legacy = { weight: [{ date: day, value: 70 }], bp: [{ date: day, systolic: 120, diastolic: 80 }] };
    state.importedData.biometrics = legacy;
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    await setMeta(profile, 'biometrics-migrated-v1', null);
    const put = IDBObjectStore.prototype.put;
    let aborted = 0;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (args[1] === key) request.addEventListener('success', () => { aborted += 1; this.transaction.abort(); }, { once: true });
      return request;
    };
    let failure = '';
    try { await migrateBiometricsToManual(profile, legacy); }
    catch (error) { failure = error.message; }
    finally { IDBObjectStore.prototype.put = put; }
    const flagAfterFailure = await getMeta(profile, 'biometrics-migrated-v1');
    await logManualMetric(profile, 'weight', { date: day, value: 82, note: 'Newer manual reading' });
    await migrateBiometricsToManual(profile, legacy);
    return { aborted, failure, flagAfterFailure, row: await getDaily(profile, 'manual', day), completed: !!await getMeta(profile, 'biometrics-migrated-v1') };
  });
  expect(result.aborted).toBeGreaterThan(0);
  expect(result.failure).toContain('metadata');
  expect(result.flagAfterFailure).toBeNull();
  expect(result.row).toMatchObject({ weight: 82, bp_systolic: 120, bp_diastolic: 80, note: 'Newer manual reading' });
  expect(result.completed).toBe(true);
});
