import { expect, test } from './coverage-fixture.js';

test('import review chooses a sample, persists exact re-review and removes only its source after reload', async ({ page }) => {
  await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app');
  await page.locator('html[data-app-ready]').waitFor();
  const before = await page.evaluate(async () => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic report ownership', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
    const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = [];
    state.importedData.entries = [
      { panelId: 'morning', date: '2026-10-20', specimen: 'serum', context: { sampleTime: '08:00', fasting: true }, markers: { 'biochemistry.glucose': 5 }, updatedAt: 100 },
      { panelId: 'evening', date: '2026-10-20', specimen: 'plasma', context: { sampleTime: '16:00', fasting: false }, markers: { 'biochemistry.glucose': 7 }, updatedAt: 200 },
    ];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not save synthetic samples');
    const commit = await import('/js/pdf-import-commit.js'); commit.configurePdfImportCommitDeps({ maybeShowEncryptionNudge: () => {} });
    const pdf = await import('/js/pdf-import.js'); pdf.setupDropZone();
    (await import('/js/pdf-import-review.js')).showImportPreview({ date: '2026-10-20', fileName: 'synthetic-evening.pdf', markers: [{ rawName: 'Glucose', mappedKey: 'biochemistry.glucose', matched: true, value: 8, unit: 'mmol/l' }] });
    return structuredClone(state.importedData);
  });
  await expect(page.getByRole('button', { name: 'Import 1 Marker', exact: true })).toBeDisabled();
  await page.getByLabel('Sample destination', { exact: true }).selectOption('evening');
  await page.getByRole('button', { name: 'Import 1 Marker', exact: true }).click();
  await expect(page.locator('#import-modal-overlay')).toBeHidden();
  const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
  const saved = await receipt(); expect(saved.entries[0]).toEqual(before.entries[0]); expect(saved.entries[1].markers['biochemistry.glucose']).toBe(8);
  const sourceId = saved.importSnapshots[0].id; expect(saved.importSnapshots[0].panelId).toBe('evening');
  await page.reload();
  await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async id => { (await import('/js/pdf-import.js')).setupDropZone(); (await import('/js/pdf-import-commit.js')).openImportReviewFromSnapshot(id); }, sourceId);
  await expect(page.getByLabel('Sample destination', { exact: true })).toBeDisabled();
  await page.locator('.import-value-input').fill('9'); await page.locator('.import-value-input').press('Tab');
  await page.getByRole('button', { name: 'Update Import (1 Marker)', exact: true }).click(); await expect(page.locator('#import-modal-overlay')).toBeHidden();
  const edited = await receipt(); expect(edited.entries[0]).toEqual(before.entries[0]); expect(edited.entries[1].markers['biochemistry.glucose']).toBe(9);
  await page.evaluate(async id => { if (!await (await import('/js/pdf-import-commit.js')).deleteImportSnapshot(id)) throw new Error('Could not remove synthetic source'); }, sourceId);
  const removed = await receipt(); expect(removed.entries).toEqual([before.entries[0]]); expect(removed.importSnapshots).toEqual([]); expect(removed._deleted?.entries || []).not.toContain('2026-10-20');
  await page.reload(); expect((await receipt()).entries).toEqual(removed.entries);
});
