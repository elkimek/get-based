// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { profileStorageKey } from '../js/profile-storage-key.js';
import { commitDisplayPreferences, readDisplayPreferences, DisplayPreferenceConflict, DisplayPreferenceUncertain } from '../js/display-preferences.js';

const original = { profile: state.currentProfile, data: state.importedData, unit: state.unitSystem, alt: state.showAltUnits, range: state.rangeMode };
const lockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
const key = (suffix: string) => profileStorageKey('preference-owner', suffix);
function installLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, _options: unknown, callback: () => unknown) => {
    const result = (queues.get(name) || Promise.resolve()).catch(() => {}).then(callback);
    queues.set(name, result); return result;
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); return request;
}
beforeEach(() => {
  localStorage.clear(); state.currentProfile = 'preference-owner'; state.importedData = structuredClone(original.data);
  state.unitSystem = 'EU'; state.showAltUnits = false; state.rangeMode = 'optimal'; installLocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  if (lockDescriptor) Object.defineProperty(navigator, 'locks', lockDescriptor); else Reflect.deleteProperty(navigator, 'locks');
  state.currentProfile = original.profile; state.importedData = original.data; state.unitSystem = original.unit; state.showAltUnits = original.alt; state.rangeMode = original.range;
});
it('commits canonical native keys before publishing state and preserves physical/profile data', async () => {
  const before = structuredClone(state.importedData);
  const receipt = await commitDisplayPreferences({ unitSystem: 'US', showAltUnits: true, rangeMode: 'both', timeFormat: '12h' }, { requireLocks: true });
  expect(readDisplayPreferences()).toEqual({ unitSystem: 'US', showAltUnits: true, rangeMode: 'both', timeFormat: '12h' });
  expect([localStorage.getItem(key('units')), localStorage.getItem(key('showAltUnits')), localStorage.getItem(key('rangeMode')), localStorage.getItem('labcharts-time-format')]).toEqual(['US', 'on', 'both', '12h']);
  expect(state.importedData).toEqual(before);
  expect(receipt.scopes).toEqual([{ field: 'unitSystem', scope: 'profile' }, { field: 'showAltUnits', scope: 'profile' }, { field: 'rangeMode', scope: 'profile' }, { field: 'timeFormat', scope: 'browser' }]);
});
it.each([{ unitSystem: ['US'] }, { unitSystem: 'SI' }, { rangeMode: ['both'] }, { showAltUnits: 'true' }, { timeFormat: ['12h'] }, { height: 180 }, {}, JSON.parse('{"__proto__":{"unitSystem":"US"}}')])('rejects unsupported or type-confused settings before writing: %j', async patch => {
  const write = vi.spyOn(Storage.prototype, 'setItem'); await expect(commitDisplayPreferences(patch)).rejects.toThrow();
  expect(write).not.toHaveBeenCalled(); expect(state.unitSystem).toBe('EU');
});
it('rolls back earlier preference writes on quota failure without publishing staged state', async () => {
  localStorage.setItem(key('units'), 'EU'); const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key('showAltUnits')) throw new DOMException('Synthetic full storage', 'QuotaExceededError'); return set.call(this, name, value); });
  await expect(commitDisplayPreferences({ unitSystem: 'US', showAltUnits: true })).rejects.toMatchObject({ noChangeApplied: true });
  expect(localStorage.getItem(key('units'))).toBe('EU'); expect(localStorage.getItem(key('showAltUnits'))).toBeNull(); expect(state.unitSystem).toBe('EU'); expect(state.showAltUnits).toBe(false);
});
it('marks failed compensation as uncertain rather than claiming nothing changed', async () => {
  localStorage.setItem(key('units'), 'EU'); const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key('showAltUnits') || name === key('units') && value === 'EU') throw new Error('Synthetic storage unavailable'); return set.call(this, name, value); });
  await expect(commitDisplayPreferences({ unitSystem: 'US', showAltUnits: true })).rejects.toBeInstanceOf(DisplayPreferenceUncertain);
  expect(localStorage.getItem(key('units'))).toBe('US'); expect(state.unitSystem).toBe('EU');
});
it('serializes two native toggles against fresh values instead of losing the second intent', async () => {
  const toggle = () => commitDisplayPreferences((current: ReturnType<typeof readDisplayPreferences>) => ({ showAltUnits: !current.showAltUnits }));
  const [first, second] = await Promise.all([toggle(), toggle()]);
  expect([first.after.showAltUnits, second.after.showAltUnits]).toEqual([true, false]); expect(readDisplayPreferences().showAltUnits).toBe(false);
});
it('reconciles stale presentation when another tab already saved the requested value', async () => {
  localStorage.setItem(key('units'), 'US'); localStorage.setItem(key('showAltUnits'), 'on'); localStorage.setItem(key('rangeMode'), 'both');
  const receipt = await commitDisplayPreferences({ unitSystem: 'US', showAltUnits: true, rangeMode: 'both' });
  expect(receipt.changed).toEqual([]); expect(receipt.refresh).toEqual(['unitSystem', 'showAltUnits', 'rangeMode']);
  expect([state.unitSystem, state.showAltUnits, state.rangeMode]).toEqual(['US', true, 'both']);
});
it('undoes only the captured fields and refuses to overwrite an intervening explicit change', async () => {
  const receipt = await commitDisplayPreferences({ unitSystem: 'US' });
  await commitDisplayPreferences({ showAltUnits: true });
  await commitDisplayPreferences({ unitSystem: receipt.before.unitSystem }, { expected: { unitSystem: receipt.after.unitSystem }, requireLocks: true });
  expect(readDisplayPreferences()).toMatchObject({ unitSystem: 'EU', showAltUnits: true });
  await commitDisplayPreferences({ unitSystem: 'ANZ' });
  await expect(commitDisplayPreferences({ unitSystem: 'EU' }, { expected: { unitSystem: 'US' }, requireLocks: true })).rejects.toBeInstanceOf(DisplayPreferenceConflict);
  expect(readDisplayPreferences().unitSystem).toBe('ANZ');
});
it.each(['profile', 'root'])('rejects an owner %s change while waiting for its lock', async target => {
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const locks = installLocks(); locks.mockImplementationOnce(async (_name, _options, callback) => { await held; return callback(); });
  const pending = commitDisplayPreferences({ unitSystem: 'US' }, { requireLocks: true });
  if (target === 'profile') state.currentProfile = 'other-preference-owner'; else state.importedData = structuredClone(state.importedData);
  release(); await expect(pending).rejects.toBeInstanceOf(DisplayPreferenceConflict); expect(localStorage.getItem(key('units'))).toBeNull(); expect(state.unitSystem).toBe('EU');
});
it('keeps native settings usable without Web Locks while refusing unsafe automated changes', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  await expect(commitDisplayPreferences({ unitSystem: 'US' }, { requireLocks: true })).rejects.toBeInstanceOf(DisplayPreferenceConflict);
  expect(localStorage.getItem(key('units'))).toBeNull(); await commitDisplayPreferences({ unitSystem: 'ANZ' }); expect(readDisplayPreferences().unitSystem).toBe('ANZ');
});
