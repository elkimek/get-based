import { afterEach, expect, test } from 'vitest';
import { state } from '../js/state.js';
import { configureSyncDeltaMerge } from '../js/sync-delta-merge.js';
import { mergePulledImportedData } from '../js/sync-pull-merge.js';
import { DELTA_ARRAY_CONFIG } from '../js/sync-delta-registry.js';

const previousProfile = state.currentProfile;
const previousData = state.importedData;
afterEach(() => {
  state.currentProfile = previousProfile;
  state.importedData = previousData;
  configureSyncDeltaMerge({ getEvolu: () => null, getItemRowQuery: () => null });
});

test('preparing a lean sync merge leaves active notes untouched until commit', async () => {
  const note = { date: '2026-08-06T10:00:00.000Z', text: 'retained locally', updatedAt: '2026-08-06T10:00:00.000Z' };
  state.currentProfile = 'merge-isolation';
  state.importedData = { notes: [note] };
  const active = state.importedData;
  const before = JSON.stringify(active);
  configureSyncDeltaMerge({
    getItemRowQuery: () => ({}),
    getEvolu: () => ({ getQueryRows: () => [{
      profileId: 'merge-isolation', arrayName: 'notes',
      itemId: DELTA_ARRAY_CONFIG.notes.itemIdFn(note), isDeleted: 1,
      syncedAt: '2026-09-14T00:00:00.000Z',
    }] }),
  });
  const result = await mergePulledImportedData('merge-isolation', null);
  expect(result.merged.notes).toEqual([]);
  expect(result.merged).not.toBe(active);
  expect(state.importedData).toBe(active);
  expect(JSON.stringify(active)).toBe(before);
  expect(result.localDataChanged).toBe(true);
});
