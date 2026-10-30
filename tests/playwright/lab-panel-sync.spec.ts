import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import type { DeltaItemRow } from '../../js/sync-delta-row-codec.js';

async function readStored(page: Page) {
  return page.evaluate(async () => { const [{ state }, profile, crypto] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/crypto.js')]); return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!); });
}
async function plan(page: Page): Promise<DeltaItemRow[]> {
  return page.evaluate(async () => { const { state } = await import('/js/state.js'), { _planArrayDelta } = await import('/js/sync-delta-array-planner.js'); const result = await _planArrayDelta(state.currentProfile, 'entries', state.importedData.entries); return result.ops.filter(op => op.kind !== 'tombstone').map(op => ({ itemId: '2026-10-20', payload: op.args.payload, syncedAt: String(op.args.syncedAt) })); });
}
async function receive(page: Page, rows: DeltaItemRow[]) {
  await page.evaluate(async rows => { const { state } = await import('/js/state.js'); await (await import('/js/sync-delta-array-merge.js')).mergeArrayRowsIntoImported(state.importedData, 'entries', rows); if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not save synthetic replicated panels'); }, rows);
}
async function correct(page: Page, marker: string, index: number, value: number, clock: number) {
  await page.evaluate(async ({ marker, index, value, clock }) => {
    const { state } = await import('/js/state.js'), entry = state.importedData.entries[index]!;
    (await import('/js/lab-entry.js')).setLabEntryMarker(entry, marker, value, { now: clock, source: { ...entry.markerSources![marker], at: clock, manuallyEdited: true } });
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not save synthetic panel correction');
  }, { marker, index, value, clock });
}
test('separate browser replicas retain same-day panels, sources and independent corrections through storage and the real row codec', async ({ page, browser }) => {
  await page.addInitScript(() => { localStorage.setItem('labcharts-default-emptyTour', 'completed'); localStorage.setItem('labcharts-default-tour', 'completed'); localStorage.setItem('labcharts-ai-paused', 'true'); });
  await page.goto('/app');
  const marker = await page.evaluate(async () => {
    const [{ state }, profile, data, schema] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/marker-schema.js')]);
    const key = `${Object.keys(schema.MARKER_SCHEMA).find(category => schema.MARKER_SCHEMA[category]!.markers.cortisol)!}.cortisol`;
    state.importedData = profile.createDefaultProfileData(); state.importedData.entries = [
      { date: '2026-10-20', markers: { [key]: 350 }, specimen: 'serum', context: { sampleTime: '08:00', fasting: true }, sourceFile: 'serum.pdf', markerSources: { [key]: { file: 'serum.pdf', snapshotId: 'serum-report', at: 100 } }, updatedAt: 100 },
      { date: '2026-10-20', markers: { [key]: 3 }, specimen: 'saliva', context: { sampleTime: '23:00', fasting: false }, sourceFile: 'saliva.pdf', markerSources: { [key]: { file: 'saliva.pdf', snapshotId: 'saliva-report', at: 200 } }, updatedAt: 200 },
    ]; if (!await data.saveImportedData()) throw new Error('Could not seed panels'); return key;
  });
  const original = await readStored(page), rows = await plan(page); expect(rows).toHaveLength(1); expect(new Set(original.entries.map((entry: { panelId: string }) => entry.panelId)).size).toBe(2);
  const consents = await page.evaluate(() => Object.fromEntries(['labcharts-legal-acceptance', 'labcharts-ai-transparency-acknowledgement'].map(key => [key, localStorage.getItem(key)])));
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.addInitScript(consents => { for (const [key, value] of Object.entries(consents)) if (value) localStorage.setItem(key, value); for (const suffix of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); localStorage.setItem('labcharts-ai-paused', 'true'); }, consents);
    const peer = await context.newPage(); await peer.goto(new URL('/app', page.url()).href); await peer.locator('html[data-app-ready]').waitFor({ state: 'attached' });
    expect((await readStored(peer))?.entries || []).toEqual([]); await receive(peer, rows); expect((await readStored(peer)).entries).toEqual(original.entries);
    await peer.reload(); await peer.locator('html[data-app-ready]').waitFor({ state: 'attached' }); expect((await readStored(peer)).entries).toEqual(original.entries);
    const read = await peer.evaluate(async marker => {
      const { createAgentDataTools } = await import('/js/agent-data-bindings.js');
      return createAgentDataTools().readData({ resource: 'markerValueNotes', recordId: `2026-10-20.${marker}`, create: false, query: '', limit: 25, offset: 0 });
    }, marker);
    expect(read).toMatchObject({ available: true, current: { values: [350, 3] } }); expect(JSON.stringify(read)).not.toContain('serum.pdf');
    const clock = Date.now(); await correct(page, marker, 0, 355, clock + 100); await correct(peer, marker, 1, 4, clock + 200);
    await receive(page, await plan(peer)); await receive(peer, await plan(page));
    for (const replica of [page, peer]) {
      await replica.reload(); await replica.locator('html[data-app-ready]').waitFor({ state: 'attached' });
      const saved = await readStored(replica); expect(saved.entries.map((entry: { markers: Record<string, number> }) => entry.markers[marker])).toEqual([355, 4]);
      expect(saved.entries.map((entry: { panelId: string }) => entry.panelId)).toEqual(original.entries.map((entry: { panelId: string }) => entry.panelId));
      expect(saved.entries.map((entry: { context: unknown }) => entry.context)).toEqual(original.entries.map((entry: { context: unknown }) => entry.context));
      expect(saved.entries.map((entry: { markerSources: Record<string, { snapshotId: string }> }) => entry.markerSources[marker]!.snapshotId)).toEqual(['serum-report', 'saliva-report']);
    }
  } finally { await context.close(); }
});

test('panel corrections retain independent Revert history and a cold replica honors a panel removal before stale result rows', async ({ page, browser }) => {
  await page.goto('/app');
  const fixture = await page.evaluate(async () => {
    const [{ state }, profile, data] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js')]);
    state.importedData = profile.createDefaultProfileData(); const marker = 'biochemistry.glucose';
    state.importedData.entries = [
      { date: '2026-10-20', markers: { [marker]: 5 }, context: { sampleTime: '08:00' }, markerSources: { [marker]: { file: 'first.pdf', snapshotId: 'first-report', at: 100 } }, sourceFile: 'first.pdf', updatedAt: 100 },
      { date: '2026-10-20', markers: { [marker]: 6 }, context: { sampleTime: '16:00' }, markerSources: { [marker]: { file: 'second.pdf', snapshotId: 'second-report', at: 200 } }, sourceFile: 'second.pdf', updatedAt: 200 },
    ]; state.importedData.markerValueNotes = { [`${marker}:2026-10-20`]: 'Keep shared context' };
    if (!await data.saveImportedData()) throw new Error('Could not seed mutation fixture');
    const panelId = state.importedData.entries[0]!.panelId!, store = await import('/js/marker-detail-store.js');
    if (!await store.editManualMarkerValue({ dotKey: marker, date: '2026-10-20', panelId, storedValue: 5.5, now: 1000 })) throw new Error('Could not correct first sample');
    return { marker, panelId, original: store.getManualOriginalForMarker(marker, '2026-10-20', panelId) };
  });
  expect(fixture.original).toBe(5); const corrected = await readStored(page), staleRows = await plan(page);
  expect(corrected.entries.map((row: { markers: Record<string, number> }) => row.markers[fixture.marker])).toEqual([5.5, 6]);
  expect(await page.evaluate(async ({ marker, panelId }) => !!await (await import('/js/marker-detail-store.js')).revertManualMarkerValue(marker, '2026-10-20', { panelId, now: 1100 }), fixture)).toBe(true);
  expect((await readStored(page)).entries[0].markers[fixture.marker]).toBe(5);
  const removalRows = await page.evaluate(async panelId => {
    const { state } = await import('/js/state.js'), owner = await import('/js/lab-panel-mutations.js');
    if (!owner.removeLabPanel(state.importedData, state.importedData.entries.find(row => row.panelId === panelId)!, 1200)) throw new Error('Could not remove first panel');
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not persist removal');
    const plan = await (await import('/js/sync-delta-map-planner.js'))._planKeyedMapDelta(state.currentProfile, 'labPanelTombstones', state.importedData.labPanelTombstones);
    return plan.ops.map(op => ({ itemId: String(op.args.itemId), payload: op.args.payload, syncedAt: String(op.args.syncedAt) }));
  }, fixture.panelId);
  expect(removalRows).toHaveLength(1); const removed = await readStored(page); expect(removed.entries).toHaveLength(1); expect(removed._deleted?.entries || []).not.toContain('2026-10-20');
  const consent = await page.evaluate(() => Object.fromEntries(['labcharts-legal-acceptance', 'labcharts-ai-transparency-acknowledgement'].map(key => [key, localStorage.getItem(key)])));
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.addInitScript(consents => { for (const [key, value] of Object.entries(consents)) if (value) localStorage.setItem(key, value); localStorage.setItem('labcharts-ai-paused', 'true'); }, consent);
    const peer = await context.newPage(); await peer.goto(new URL('/app', page.url()).href); await peer.locator('html[data-app-ready]').waitFor({ state: 'attached' });
    await peer.evaluate(async rows => {
      const { state } = await import('/js/state.js'); await (await import('/js/sync-delta-map-merge.js')).mergeMapRowsIntoImported(state.importedData, 'labPanelTombstones', rows);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not persist cold removal history');
    }, removalRows);
    await receive(peer, staleRows); await peer.reload(); await peer.locator('html[data-app-ready]').waitFor({ state: 'attached' });
    const cold = await readStored(peer); expect(cold.entries).toEqual(removed.entries); expect(cold.labPanelTombstones).toEqual(removed.labPanelTombstones);
    expect(cold.entries[0].markerSources[fixture.marker].snapshotId).toBe('second-report');
  } finally { await context.close(); }
  await page.reload(); await page.locator('html[data-app-ready]').waitFor({ state: 'attached' }); expect((await readStored(page)).markerValueNotes[`${fixture.marker}:2026-10-20`]).toBe('Keep shared context');
});
