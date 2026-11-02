// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { readHistoryViewPreferences, commitHistoryViewPreferences, writeHistoryViewPreferencesNow } from '../js/history-view-preferences.js';
import { parseHistoryViewPatch } from '../shared/history-view-contract.js';
const original = { profile: state.currentProfile, root: state.importedData, locks: navigator.locks };
beforeEach(() => { localStorage.clear(); state.currentProfile = 'alice'; Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }); });
afterEach(() => { vi.restoreAllMocks(); state.currentProfile = original.profile; state.importedData = original.root; Object.defineProperty(navigator, 'locks', { configurable: true, value: original.locks }); });
function installLocks() { const pending = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name: string, _options: unknown, callback: () => unknown) => { const next = (pending.get(name) || Promise.resolve()).then(callback); pending.set(name, next.catch(() => {})); return next; } } }); }
it('reads native defaults without creating preferences or reading health records', () => { expect(readHistoryViewPreferences().values).toEqual({ nutritionRange: '30d', nutritionView: 'meals', wearableRange: '90d', stripHidden: false, stripCollapsed: false }); expect(localStorage.length).toBe(0); });
it('keeps browser-wide ranges separate from profile strip visibility', async () => {
  installLocks(); const root = state.importedData, before = JSON.stringify(root); localStorage.setItem('labcharts-active-profile', 'bob'); const result = await commitHistoryViewPreferences({ nutritionRange: 'all', nutritionView: 'trends', wearableRange: '1y', stripHidden: true, stripCollapsed: true }, { requireLocks: true });
  expect(result.changed).toHaveLength(5); expect(localStorage.getItem('wearables-strip-hidden-alice')).toBe('1'); expect(localStorage.getItem('wearables-strip-hidden-bob')).toBeNull(); expect(readHistoryViewPreferences('bob').values).toMatchObject({ nutritionRange: 'all', wearableRange: '1y', stripHidden: false, stripCollapsed: true }); expect(state.importedData).toBe(root); expect(JSON.stringify(root)).toBe(before);
});
it('rejects a stale targeted footprint while retaining unrelated newer preferences', async () => {
  installLocks(); const before = readHistoryViewPreferences(); writeHistoryViewPreferencesNow({ stripCollapsed: true }); const result = await commitHistoryViewPreferences({ nutritionView: 'trends' }, { expected: before.footprint, requireLocks: true }); expect(result.after.values.stripCollapsed).toBe(true);
  await expect(commitHistoryViewPreferences({ nutritionView: 'meals' }, { expected: before.footprint, requireLocks: true })).rejects.toMatchObject({ noChangeApplied: true }); expect(readHistoryViewPreferences().values.nutritionView).toBe('trends');
});
it('restores exact absent and unfamiliar prior values without touching other fields', async () => {
  installLocks(); localStorage.setItem('nutrition-history-range', 'future-range'); const before = readHistoryViewPreferences(); expect(before.recognized.nutritionRange).toBe(false); expect(before.values.nutritionRange).toBe('30d'); const changed = await commitHistoryViewPreferences({ nutritionRange: '1y', stripHidden: true }, { expected: before.footprint });
  writeHistoryViewPreferencesNow({ stripCollapsed: true }); await commitHistoryViewPreferences({ nutritionRange: before.values.nutritionRange, stripHidden: before.values.stripHidden }, { expected: changed.after.footprint, restore: before.footprint }); expect(localStorage.getItem('nutrition-history-range')).toBe('future-range'); expect(localStorage.getItem('wearables-strip-hidden-alice')).toBeNull(); expect(readHistoryViewPreferences().values.stripCollapsed).toBe(true);
});
it('rolls back an earlier key when a later preference write fails', async () => {
  installLocks(); const write = Storage.prototype.setItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) { if (key === 'nutrition-history-view') throw new Error('Synthetic quota'); return write.call(this, key, value); }); await expect(commitHistoryViewPreferences({ nutritionRange: 'all', nutritionView: 'trends' })).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.getItem('nutrition-history-range')).toBeNull(); expect(localStorage.getItem('nutrition-history-view')).toBeNull();
});
it('marks persistence unconfirmed when rollback cannot restore a written key', async () => {
  installLocks(); const write = Storage.prototype.setItem, remove = Storage.prototype.removeItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) { if (key === 'nutrition-history-view') throw new Error('Synthetic quota'); return write.call(this, key, value); }); vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) { if (key === 'nutrition-history-range') throw new Error('Synthetic rollback failure'); return remove.call(this, key); }); await expect(commitHistoryViewPreferences({ nutritionRange: 'all', nutritionView: 'trends' })).rejects.toMatchObject({ persistenceUncertain: true }); expect(localStorage.getItem('nutrition-history-range')).toBe('all');
});
it('refuses a command without locks or its full expected footprint', async () => {
  await expect(commitHistoryViewPreferences({ nutritionRange: 'all' }, { requireLocks: true })).rejects.toMatchObject({ noChangeApplied: true }); installLocks(); await expect(commitHistoryViewPreferences({ nutritionRange: 'all' }, { expected: {}, requireLocks: true })).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.length).toBe(0);
});
it('rejects a queued owner change before persistence', async () => {
  installLocks(); const command = commitHistoryViewPreferences({ nutritionRange: 'all' }, { requireLocks: true }); state.currentProfile = 'bob'; await expect(command).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.length).toBe(0);
});
it('keeps legacy synchronous writes and no-op durable receipts', async () => {
  const native = writeHistoryViewPreferencesNow({ nutritionRange: 'all' }); expect(localStorage.getItem('nutrition-history-range')).toBe('all'); expect(native.changed).toEqual(['nutritionRange']); expect((await commitHistoryViewPreferences({ nutritionRange: 'all' })).changed).toEqual([]);
});
it.each([null, [], {}, { code: 'run()' }, { nutritionRange: '7d' }, { wearableRange: '30d' }, { nutritionView: 'unknown' }, { stripHidden: 'true' }, { stripCollapsed: null }])('rejects undeclared or malformed preference patches: %j', patch => { expect(() => parseHistoryViewPatch(patch)).toThrow(); expect(localStorage.length).toBe(0); });
