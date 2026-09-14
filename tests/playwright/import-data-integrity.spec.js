import { test, expect } from './coverage-fixture.js';

test('commit rejects duplicate and blank rows, and preserves custom units across imports', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const data = await import('/js/data.js');
    const review = await import('/js/pdf-import-review.js');
    const commit = await import('/js/pdf-import-commit.js');
    commit.configurePdfImportCommitDeps({ maybeShowEncryptionNudge: () => {} });
    (await import('/js/pdf-import-review-runtime.js')).configurePdfImportReviewRuntimeDeps({ buildSidebar: () => {}, navigate: () => {}, updateHeaderDates: () => {} });
    state.importedData = { entries: [], customMarkers: {}, importSnapshots: [] };
    const glucose = value => ({ rawName: 'Glucose', value, unit: 'mmol/l', matched: true, mappedKey: 'biochemistry.glucose' });
    const run = async (markers, date = '2026-01-01') => {
      review.showImportPreview({ date, fileName: 'synthetic.pdf', markers });
      await commit.confirmImport();
    };
    await run([glucose(5), glucose(7)]);
    const duplicateBlocked = state.importedData.entries.length === 0 && !!review.getPendingImport();
    await run([glucose(5)]);
    review.showImportPreview({ date: '2026-01-01', fileName: 'blank.pdf', markers: [glucose(8)] });
    const input = document.querySelector('.import-value-input');
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await commit.confirmImport();
    const blankPreserved = state.importedData.entries[0].markers['biochemistry.glucose'] === 5 && state.importedData.importSnapshots.length === 1;
    const custom = (value, unit) => ({ rawName: 'Analyte', suggestedName: 'Analyte', suggestedKey: 'auditSpecialty.analyte', suggestedCategoryLabel: 'Specialty', value, unit, matched: false });
    await run([custom(10, 'mg/l')]);
    await run([custom(1, 'g/l')], '2026-02-01');
    const secondId = state.importedData.importSnapshots.at(-1).id;
    const marker = data.getActiveData().categories.auditSpecialty.markers.analyte;
    const units = { unit: marker.unit, values: marker.values };
    const rawUnits = state.importedData.importSnapshots.at(-1).markers[0].unit;
    await commit.deleteImportSnapshot(secondId);
    await run([custom(2, 'g/l')]);
    await commit.deleteImportSnapshot(state.importedData.importSnapshots.at(-1).id);
    return { duplicateBlocked, blankPreserved, units, rawUnits, firstAfterDelete: state.importedData.entries[0].markers['auditSpecialty.analyte'] };
  });
  expect(result).toEqual({ duplicateBlocked: true, blankPreserved: true, units: { unit: 'mg/l', values: [10, 1000] }, rawUnits: 'g/l', firstAfterDelete: 10 });
});

test('matched custom marker ranges use the saved unit after import and snapshot deletion', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const review = await import('/js/pdf-import-review.js');
    const commit = await import('/js/pdf-import-commit.js');
    commit.configurePdfImportCommitDeps({ maybeShowEncryptionNudge: () => {} });
    (await import('/js/pdf-import-review-runtime.js')).configurePdfImportReviewRuntimeDeps({ buildSidebar: () => {}, navigate: () => {}, updateHeaderDates: () => {} });
    const key = 'auditSpecialty.analyte';
    state.importedData = { entries: [], customMarkers: { [key]: { name: 'Analyte', unit: 'mg/l' } }, importSnapshots: [] };
    for (const [date, value, unit, refMin, refMax] of [
      ['2026-01-01', 10, 'mg/l', 5, 20], ['2026-02-01', 1, 'g/l', 0.5, 2],
    ]) {
      review.showImportPreview({ date, fileName: 'synthetic.pdf', markers: [{ rawName: 'Analyte', matched: true, mappedKey: key, value, unit, refMin, refMax }] });
      await commit.confirmImport();
    }
    const imported = structuredClone(state.importedData.refOverrides[key]);
    const raw = structuredClone(state.importedData.importSnapshots.at(-1).markers[0]);
    await commit.deleteImportSnapshot(state.importedData.importSnapshots.at(-1).id);
    return { imported, raw, restored: state.importedData.refOverrides[key] };
  });
  expect(result.imported).toMatchObject({ refMin: 500, refMax: 2000 });
  expect(result.raw).toMatchObject({ value: 1, unit: 'g/l', refMin: 0.5, refMax: 2 });
  expect(result.restored).toMatchObject({ refMin: 5, refMax: 20 });
});

test('client round trip preserves entry metadata and bundle merge retains other markers', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const data = await import('/js/data.js');
    const { importDataJSON } = await import('/js/export-import.js');
    const original = { date: '2026-01-01', markers: { 'biochemistry.glucose': 5, 'biochemistry.alt': 0.5 }, context: { sampleTime: '08:00', fasting: true, cyclePhase: 'luteal' }, collectionContextSources: { fasting: { snapshotId: 'report', at: 100 } }, deletedMarkers: { 'biochemistry.ast': 150 } };
    state.importedData = { entries: [original] };
    await data.saveImportedData();
    const exported = await (await import('/js/export.js')).buildClientExportObject(state.currentProfile, false, false);
    await importDataJSON(new File([JSON.stringify(exported)], 'synthetic.json'));
    const restored = structuredClone(state.importedData.entries[0]);
    await importDataJSON(new File([JSON.stringify({ type: 'database', profiles: [{ id: state.currentProfile, data: { entries: [{ date: original.date, markers: { 'biochemistry.glucose': 6 } }] } }] })], 'bundle.json'));
    return { restored, merged: state.importedData.entries[0] };
  });
  expect(result.restored.context).toEqual({ sampleTime: '08:00', fasting: true, cyclePhase: 'luteal' });
  expect(result.restored.collectionContextSources.fasting.snapshotId).toBe('report');
  expect(result.restored.deletedMarkers).toEqual({ 'biochemistry.ast': 150 });
  expect(result.merged.markers).toEqual({ 'biochemistry.glucose': 6, 'biochemistry.alt': 0.5 });
  expect(result.merged.context).toEqual(result.restored.context);
});

test('aborted storage transactions reject and failed edits roll back', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { editManualMarkerValue } = await import('/js/marker-detail-store.js');
    const { setBlob, getBlob } = await import('/js/blob-storage.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const key = profileStorageKey(state.currentProfile, 'imported');
    state.importedData = { entries: [{ date: '2026-01-01', markers: { 'biochemistry.glucose': 5 } }] };
    await saveImportedData();
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const req = original.apply(this, args);
      if (args[1] === key) req.addEventListener('success', () => this.transaction.abort(), { once: true });
      return req;
    };
    let rejected = false, edited;
    try {
      try { await setBlob(key, '{}'); } catch { rejected = true; }
      edited = await editManualMarkerValue({ dotKey: 'biochemistry.glucose', date: '2026-01-01', storedValue: 7 });
    } finally { IDBObjectStore.prototype.put = original; }
    return { rejected, edited, memory: state.importedData.entries[0].markers['biochemistry.glucose'], disk: JSON.parse(await getBlob(key)).entries[0].markers['biochemistry.glucose'] };
  });
  expect(result).toEqual({ rejected: true, edited: null, memory: 5, disk: 5 });
});

test('failed profile reads retain data and block saves until a successful retry', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { loadProfile, profileStorageKey } = await import('/js/profile.js');
    const id = state.currentProfile;
    const key = profileStorageKey(id, 'imported');
    state.importedData = { entries: [{ date: '2026-01-01', markers: { 'biochemistry.glucose': 5 } }] };
    await saveImportedData();
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (name) {
      if (name === key) throw new DOMException('Synthetic read failure', 'UnknownError');
      return original.call(this, name);
    };
    let failed = false;
    try { await loadProfile(id); } catch { failed = true; } finally { IDBObjectStore.prototype.get = original; }
    const count = state.importedData.entries.length;
    const blocked = !await saveImportedData();
    await loadProfile(id);
    return { failed, count, blocked, retrySaved: await saveImportedData() };
  });
  expect(result).toEqual({ failed: true, count: 1, blocked: true, retrySaved: true });
});
