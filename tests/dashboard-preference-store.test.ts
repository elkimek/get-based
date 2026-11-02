// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { dashboardPreferenceKey, readDashboardPreferenceRaw, readDashboardPreferenceFootprint, writeDashboardPreferenceRaw, afterDashboardPreferenceCommit, runDashboardPreferenceCommand } from '../js/dashboard-preference-store.js';
const original = { profile: state.currentProfile, data: state.importedData }, locks = navigator.locks;
const key = (kind: 'widgets' | 'biometrics' | 'pins') => dashboardPreferenceKey(kind, 'alice');
beforeEach(() => {
  localStorage.clear(); state.currentProfile = 'alice'; state.importedData = createDefaultProfileData();
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name: string, options: unknown, callback?: () => unknown) => { const run = typeof options === 'function' ? options as () => unknown : callback!; const pending = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, pending.catch(() => {})); return pending; } } });
});
afterEach(() => { vi.restoreAllMocks(); state.currentProfile = original.profile; state.importedData = original.data; Object.defineProperty(navigator, 'locks', { configurable: true, value: locks }); });
it('stages read-your-writes without physical writes or presentation until every key is verified', async () => {
  const health = JSON.stringify(state.importedData), effects: unknown[] = []; localStorage.setItem('clinical-record-sentinel', 'KEEP');
  const result = await runDashboardPreferenceCommand(() => {
    writeDashboardPreferenceRaw('widgets', '{"order":["wearables"],"hidden":[]}'); writeDashboardPreferenceRaw('biometrics', '["weight"]'); writeDashboardPreferenceRaw('pins', '["biochemistry_glucose"]');
    expect(readDashboardPreferenceRaw('biometrics')).toBe('["weight"]'); expect(localStorage.getItem(key('biometrics'))).toBeNull(); afterDashboardPreferenceCommit(() => { effects.push(localStorage.getItem(key('biometrics'))); }); expect(effects).toEqual([]); return 'native-result';
  }, { requireLocks: true });
  expect(result).toMatchObject({ value: 'native-result', settingsSaved: true, dataSaved: false, effectsApplied: true, presentationFailed: false, changed: ['widgets', 'biometrics', 'pins'] }); expect(effects).toEqual(['["weight"]']); expect(localStorage.getItem('clinical-record-sentinel')).toBe('KEEP'); expect(JSON.stringify(state.importedData)).toBe(health);
});
it('keeps the owning profile independent of another tab’s shared active-profile key', async () => {
  localStorage.setItem('labcharts-active-profile', 'bob'); await runDashboardPreferenceCommand(() => writeDashboardPreferenceRaw('pins', '["biochemistry_glucose"]')); expect(localStorage.getItem(key('pins'))).toBe('["biochemistry_glucose"]'); expect(readDashboardPreferenceFootprint('bob')).toEqual({ widgets: null, biometrics: null, pins: null });
});
it('does not rewrite an identical stored value and can still publish native presentation', async () => {
  localStorage.setItem(key('pins'), '[]'); const set = vi.spyOn(Storage.prototype, 'setItem'), effects = vi.fn(); const result = await runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('pins', '[]'); afterDashboardPreferenceCommit(effects); }); expect(result.settingsSaved).toBe(false); expect(result.changed).toEqual([]); expect(set).not.toHaveBeenCalled(); expect(effects).toHaveBeenCalledOnce();
});
it('compares only touched expectations and preserves unrelated newer preferences', async () => {
  const expected = readDashboardPreferenceFootprint(); localStorage.setItem(key('widgets'), '{"future":"KEEP"}'); await runDashboardPreferenceCommand(() => writeDashboardPreferenceRaw('pins', '[]'), { expected }); expect(localStorage.getItem(key('widgets'))).toBe('{"future":"KEEP"}'); await expect(runDashboardPreferenceCommand(() => writeDashboardPreferenceRaw('widgets', '{}'), { expected })).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.getItem(key('widgets'))).toBe('{"future":"KEEP"}');
});
it('discards staged changes and effects if a native semantic operation fails', async () => {
  const effects = vi.fn(); await expect(runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('pins', '[]'); afterDashboardPreferenceCommit(effects); throw new Error('Invalid native choice'); })).rejects.toThrow('Invalid native choice'); expect(readDashboardPreferenceFootprint()).toEqual({ widgets: null, biometrics: null, pins: null }); expect(effects).not.toHaveBeenCalled();
});
it('compensates an earlier write when a later setting fails and publishes nothing', async () => {
  localStorage.setItem(key('widgets'), 'OLD'); const set = Storage.prototype.setItem, effects = vi.fn(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key('biometrics')) throw new Error('Synthetic full storage'); return set.call(this, name, value); });
  await expect(runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('widgets', 'NEW'); writeDashboardPreferenceRaw('biometrics', '[]'); afterDashboardPreferenceCommit(effects); })).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.getItem(key('widgets'))).toBe('OLD'); expect(localStorage.getItem(key('biometrics'))).toBeNull(); expect(effects).not.toHaveBeenCalled();
});
it('keeps an uncertain rollback explicit instead of claiming nothing was saved', async () => {
  const set = Storage.prototype.setItem, effects = vi.fn(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key('biometrics')) throw new Error('Synthetic later-key rejection'); return set.call(this, name, value); }); vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Synthetic rollback rejection'); });
  await expect(runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('widgets', 'NEW'); writeDashboardPreferenceRaw('biometrics', '[]'); afterDashboardPreferenceCommit(effects); })).rejects.toMatchObject({ persistenceUncertain: true }); expect(localStorage.getItem(key('widgets'))).toBe('NEW'); expect(effects).not.toHaveBeenCalled();
});
it('never rolls back over another writer’s different value', async () => {
  const set = Storage.prototype.setItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key('biometrics')) { set.call(this, key('widgets'), 'PEER'); throw new Error('Synthetic contention'); } return set.call(this, name, value); }); await expect(runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('widgets', 'NEW'); writeDashboardPreferenceRaw('biometrics', '[]'); })).rejects.toMatchObject({ persistenceUncertain: true }); expect(localStorage.getItem(key('widgets'))).toBe('PEER');
});
it('rejects a queued command after profile ownership changes, before invoking its body', async () => {
  let release!: () => void; Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_name: string, _options: unknown, callback: () => unknown) => { await new Promise<void>(resolve => { release = resolve; }); return callback(); } } }); const body = vi.fn(() => writeDashboardPreferenceRaw('pins', '[]')), pending = runDashboardPreferenceCommand(body); state.currentProfile = 'bob'; release(); await expect(pending).rejects.toMatchObject({ noChangeApplied: true }); expect(body).not.toHaveBeenCalled(); expect(localStorage.getItem(key('pins'))).toBeNull();
});
it('blocks a changed native form guard after staging and before any persistence', async () => {
  let active = true; const effects = vi.fn(); await expect(runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('pins', '[]'); afterDashboardPreferenceCommit(effects); active = false; }, { canCommit: () => active })).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.getItem(key('pins'))).toBeNull(); expect(effects).not.toHaveBeenCalled();
});
it('retains a verified save while withholding presentation from a retired profile', async () => {
  const set = Storage.prototype.setItem, effects = vi.fn(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { set.call(this, name, value); if (name === key('pins')) state.currentProfile = 'bob'; }); const result = await runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('pins', '[]'); afterDashboardPreferenceCommit(effects); }); expect(result).toMatchObject({ settingsSaved: true, dataSaved: false, effectsApplied: false }); expect(localStorage.getItem(key('pins'))).toBe('[]'); expect(effects).not.toHaveBeenCalled();
});
it('does not erase a confirmed save when optional presentation fails', async () => {
  const result = await runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('pins', '[]'); afterDashboardPreferenceCommit(() => { throw new Error('Synthetic renderer failure'); }); }); expect(result).toMatchObject({ settingsSaved: true, presentationFailed: true }); expect(localStorage.getItem(key('pins'))).toBe('[]');
});
it('stops remaining presentation effects when an earlier effect retires the profile', async () => {
  const stale = vi.fn(); const result = await runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('pins', '[]'); afterDashboardPreferenceCommit(() => { state.currentProfile = 'bob'; }); afterDashboardPreferenceCommit(stale); }); expect(result).toMatchObject({ settingsSaved: true, effectsApplied: false }); expect(stale).not.toHaveBeenCalled(); expect(localStorage.getItem(key('pins'))).toBe('[]');
});
it('serializes conflicting snapshot writers and permits exactly one effect', async () => {
  const expected = readDashboardPreferenceFootprint(), first = vi.fn(), second = vi.fn(); const results = await Promise.allSettled([runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('pins', '["first"]'); afterDashboardPreferenceCommit(first); }, { expected }), runDashboardPreferenceCommand(() => { writeDashboardPreferenceRaw('pins', '["second"]'); afterDashboardPreferenceCommit(second); }, { expected })]); expect(results.map(row => row.status)).toEqual(['fulfilled', 'rejected']); expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled(); expect(localStorage.getItem(key('pins'))).toBe('["first"]');
});
it('requires Web Locks for chat but retains the native fallback and synchronous compatibility path', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }); await expect(runDashboardPreferenceCommand(() => writeDashboardPreferenceRaw('pins', '[]'), { requireLocks: true })).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.getItem(key('pins'))).toBeNull(); await runDashboardPreferenceCommand(() => writeDashboardPreferenceRaw('pins', '[]')); expect(readDashboardPreferenceRaw('pins')).toBe('[]'); writeDashboardPreferenceRaw('pins', null); expect(readDashboardPreferenceRaw('pins')).toBeNull();
});
it('rejects declared async staging before executing its body', async () => {
  const body = vi.fn(); await expect(runDashboardPreferenceCommand(async () => { body(); writeDashboardPreferenceRaw('pins', '[]'); })).rejects.toThrow('synchronous'); expect(body).not.toHaveBeenCalled(); expect(localStorage.getItem(key('pins'))).toBeNull();
});
