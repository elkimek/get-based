import { expect, test } from './coverage-fixture.js';

test('EU C-peptide imports keep picomoles and saved reviews repair legacy values and ranges', async ({ page }) => {
  await page.goto('/app');
  const imported = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const data = await import('/js/data.js');
    const review = await import('/js/pdf-import-review.js');
    const commit = await import('/js/pdf-import-commit.js');
    commit.configurePdfImportCommitDeps({ maybeShowEncryptionNudge: () => {} });
    (await import('/js/pdf-import-review-runtime.js')).configurePdfImportReviewRuntimeDeps({ buildSidebar: () => {}, navigate: () => {}, updateHeaderDates: () => {} });
    state.unitSystem = 'EU';
    state.profileSex = null;
    state.profileDob = null;
    (state as { importedData: unknown }).importedData = { entries: [{ date: '2026-10-01', markers: { 'biochemistry.glucose': 5 } }], importSnapshots: [], customMarkers: {} };
    review.showImportPreview({ date: '2026-10-01', fileName: 'synthetic-cpeptide.pdf', markers: [{ rawName: 'C-peptide', matched: true, mappedKey: 'diabetes.cPeptide', value: 662, unit: 'pmol/L', refMin: 165.5, refMax: 993 }] });
    await commit.confirmImport();
    data.invalidateActiveDataCache();
    const snapshot = state.importedData.importSnapshots[0];
    return { value: state.importedData.entries[0]!.markers['diabetes.cPeptide'],
      raw: snapshot.markers[0], count: state.importedData.importSnapshots.length,
      shown: data.getActiveData().categories.diabetes!.markers.cPeptide,
      range: state.importedData.refOverrides['diabetes.cPeptide'], id: snapshot.id };
  });
  expect(imported.count).toBe(1);
  expect(imported.value).toBe(2);
  expect(imported.raw).toMatchObject({ value: 662, unit: 'pmol/L', refMin: 165.5, refMax: 993 });
  expect(imported.range).toMatchObject({ refMin: 0.5, refMax: 3 });
  expect(imported.shown).toMatchObject({ unit: 'pmol/L', values: [662], refMin: 165.5, refMax: 993, canonicalScoring: { values: [2] } });

  // Reproduce an entry written before the missing pmol/L conversion was fixed.
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.entries[0]!.markers['diabetes.cPeptide'] = 662;
    Object.assign(state.importedData.refOverrides['diabetes.cPeptide'], { refMin: 165.5, refMax: 993 });
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(async id => {
      (await import('/js/pdf-import-commit.js')).openImportReviewFromSnapshot(id);
    }, imported.id);
    await expect(page.locator('.import-value-input')).toHaveValue('662');
    const repaired = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const data = await import('/js/data.js');
      const review = await import('/js/pdf-import-review.js');
      const pending = structuredClone(review.getPendingImport()!.markers[0]);
      await (await import('/js/pdf-import-commit.js')).confirmImport();
      data.invalidateActiveDataCache();
      const stored = structuredClone(state.importedData);
      const { loadProfile } = await import('/js/profile.js');
      await loadProfile(state.currentProfile);
      return { pending, stored, reloaded: state.importedData.entries[0]!.markers,
        shown: data.getActiveData().categories.diabetes!.markers.cPeptide };
    });
    expect(repaired.pending).toMatchObject({ value: 662, unit: 'pmol/L', refMin: 165.5, refMax: 993 });
    expect(repaired.stored.entries[0]!.markers).toEqual({ 'diabetes.cPeptide': 2, 'biochemistry.glucose': 5 });
    expect(repaired.stored.refOverrides['diabetes.cPeptide']).toMatchObject({ refMin: 0.5, refMax: 3 });
    expect(repaired.stored.importSnapshots).toHaveLength(1);
    expect(repaired.stored.importSnapshots[0].id).toBe(imported.id);
    expect(repaired.stored.importSnapshots[0].markers[0]).toMatchObject(imported.raw);
    expect(repaired.stored.entries[0]!.markerSources!['diabetes.cPeptide']).toMatchObject({ snapshotId: imported.id, file: 'synthetic-cpeptide.pdf' });
    expect(repaired.reloaded).toEqual(repaired.stored.entries[0]!.markers);
    expect(repaired.shown).toMatchObject({ unit: 'pmol/L', values: [662], refMin: 165.5, refMax: 993 });
  }
});
