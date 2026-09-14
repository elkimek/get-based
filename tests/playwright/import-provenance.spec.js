import { expect, test } from './coverage-fixture.js';

test('profile load repairs an imported edit and Settings keeps it under its report after edit and revert', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { migrateProfileData } = await import('/js/profile-data-migrations.js');
    const settings = await import('/js/settings-data.js');
    const store = await import('/js/marker-detail-store.js');
    const key = 'biochemistry.glucose';
    const date = '2026-01-01';
    state.importedData = migrateProfileData({
      entries: [{ date, markers: { [key]: 6 }, markerSources: { [key]: { file: null, at: 200 } } }],
      manualValues: { [`${key}:${date}`]: 5 },
      importSnapshots: [{ id: 'report', date, fileName: 'synthetic-lab.pdf', type: 'pdf', markerCount: 1,
        markers: [{ mappedKey: key, value: 5, unit: 'mmol/l' }] }],
    });
    const repairedSettings = settings.renderDataEntriesSection();
    await store.editManualMarkerValue({ dotKey: key, date, storedValue: 7, now: 300 });
    const editedSettings = settings.renderDataEntriesSection();
    const editedSource = { ...state.importedData.entries[0].markerSources[key] };
    await store.revertManualMarkerValue(key, date, { now: 400 });
    const revertedSettings = settings.renderDataEntriesSection();
    const reverted = structuredClone(state.importedData.entries[0]);
    await store.saveManualMarkerValue({ dotKey: 'biochemistry.alt', date, storedValue: 0.5, now: 500 });
    const mixedSettings = settings.renderDataEntriesSection();
    return { repairedSettings, editedSettings, revertedSettings, editedSource, reverted, mixedSettings };
  });
  for (const html of [result.repairedSettings, result.editedSettings, result.revertedSettings]) {
    expect(html).toContain('synthetic-lab.pdf');
    expect(html).not.toContain('Manual / legacy markers');
    expect(html).not.toContain('Date locked');
  }
  expect(result.editedSource).toEqual({ file: 'synthetic-lab.pdf', snapshotId: 'report', at: 300, manuallyEdited: true });
  expect(result.reverted.markerSources['biochemistry.glucose']).toEqual({ file: 'synthetic-lab.pdf', snapshotId: 'report', at: 400 });
  expect(result.reverted.markers['biochemistry.glucose']).toBe(5);
  expect(result.mixedSettings).toContain('manual markers not tied to an import file');
  expect(result.mixedSettings).toContain('Date locked');
});
