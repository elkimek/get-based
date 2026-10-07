import { afterEach, expect, it, vi } from 'vitest';
import { createDefaultProfileData } from '../js/profile.js';
import { appendImportedArrayItem, deleteImportedArrayItem, clearTombstone, getConfiguredArrayItemId, mergeImportedData } from '../js/data-merge.js';
afterEach(() => vi.restoreAllMocks());
for (const path of ['entries', 'healthGoals'] as const) for (const rollback of [0, 1000]) it(`${path} restores and later deletions dominate their observed predecessors with clock rollback ${rollback}`, () => {
  let now = 1791400000000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  const source = createDefaultProfileData(); source.entries = [{ date: '2026-10-07', markers: {} }]; source.healthGoals = [{ text: 'Restore me', severity: 'mild' }];
  const row = structuredClone(source[path][0]!), id = getConfiguredArrayItemId(path, row); expect(id).toBeTruthy();
  deleteImportedArrayItem(source, path, 0); const deleted = structuredClone(source); now -= rollback;
  clearTombstone(source, path, id); appendImportedArrayItem(source, path, row); const restored = structuredClone(source);
  expect(mergeImportedData(restored, deleted)[path]).toHaveLength(1); expect(mergeImportedData(deleted, restored)[path]).toHaveLength(1);
  deleteImportedArrayItem(source, path, 0);
  expect(mergeImportedData(source, restored)[path]).toHaveLength(0); expect(mergeImportedData(restored, source)[path]).toHaveLength(0);
});
