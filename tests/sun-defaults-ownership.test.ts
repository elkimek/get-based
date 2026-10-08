import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { createSunSetupSession } from '../js/sun-defaults-session.js';
import { readProfileForLoad } from '../js/profile-load-safety.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { persistSunSetupValues, saveSunDefaults } from '../js/sun-defaults.js';
import type { SunSetupValues } from '../js/sun-defaults-model.js';
const profile = 'sun-setup-owned', key = profileStorageKey(profile, 'imported');
const previousProfile = state.currentProfile, previousData = state.importedData;
const values: SunSetupValues = { skinIdx: 3, fitzpatrick: 'IV', photosensitiveMeds: 'none', homeLight: 'led-warm', eyewear: 'sunglasses', ott: { 'low-outdoor-time': true }, ottScore: 1 };
beforeEach(async () => {
  state.currentProfile = profile; state.importedData = createDefaultProfileData();
  state.importedData.sunDefaults = { fitzpatrick: 'II', completedAt: 1, homeLight: 'incandescent' };
  state.importedData.contextNotes = 'Keep unrelated context';
  await crypto.encryptedRemoveItem(key); expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); await crypto.encryptedRemoveItem(key);
  state.currentProfile = previousProfile; state.importedData = previousData;
});
it('does not publish failed setup values or mirrored skin and allows an actual storage retry', async () => {
  const before = structuredClone(state.importedData), stored = await crypto.encryptedGetItem(key);
  const write = vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValueOnce(new Error('Storage failed'));
  expect(await persistSunSetupValues(values, 123)).toBeNull();
  expect(state.importedData).toEqual(before); expect(await crypto.encryptedGetItem(key)).toBe(stored);
  write.mockRestore(); expect(await persistSunSetupValues(values, 123)).toMatchObject({ fitzpatrick: 'IV', completedAt: 123 });
  expect(JSON.parse((await crypto.encryptedGetItem(key))!).lightCircadian.skinType).toBe('IV — olive');
});
it('returns failure for an unsaved deferral without publishing skipped flags', async () => {
  const before = structuredClone(state.importedData);
  vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValueOnce(new Error('Storage failed'));
  expect(await saveSunDefaults({ skipped: true, setupPromptDismissedAt: 456 })).toBe(false);
  expect(state.importedData).toEqual(before);
});

it('keeps an accepted save on its original profile after retirement and rejects duplicate writes', async () => {
  const source = state.importedData, original = crypto.encryptedSetItem;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => { await gate; return original(...args); });
  const session = createSunSetupSession(), pending = session.saveValues(values, 987);
  expect(source.sunDefaults?.fitzpatrick).toBe('II');
  expect(await session.saveValues(values)).toBe('busy');
  session.retire(); state.currentProfile = 'other-light-profile'; state.importedData = createDefaultProfileData();
  state.importedData.contextNotes = 'Other profile'; const other = structuredClone(state.importedData);
  release(); expect(await pending).toBe('saved');
  const stored = JSON.parse((await crypto.encryptedGetItem(key))!);
  expect(stored.sunDefaults).toMatchObject({ fitzpatrick: 'IV', completedAt: 987 });
  expect(stored.lightCircadian.skinType).toBe('IV — olive');
  expect(source.sunDefaults?.fitzpatrick).toBe('IV'); expect(state.importedData).toEqual(other);
  expect(await session.patchDefaults({ skipped: true })).toBe('retired');
});
for (const field of ['sunDefaults', 'lightCircadian'] as const) {
  it(`rejects a newer saved ${field} without publishing either half of setup`, async () => {
    const session = createSunSetupSession(), before = structuredClone(state.importedData);
    const peer = JSON.parse((await crypto.encryptedGetItem(key))!);
    if (field === 'sunDefaults') peer.sunDefaults.homeLight = 'candle';
    else peer.lightCircadian = { skinType: 'V — brown', note: 'Peer edit' };
    peer.contextNotes = 'Peer context'; await crypto.encryptedSetItem(key, JSON.stringify(peer));
    const write = vi.spyOn(crypto, 'encryptedSetItem');
    expect(await session.saveValues(values)).toBe('conflict'); expect(write).not.toHaveBeenCalled();
    expect(JSON.parse((await crypto.encryptedGetItem(key))!)).toEqual(peer); expect(state.importedData).toEqual(before);
  });
  it(`rejects a local ${field} change while retaining the draft`, async () => {
    const session = createSunSetupSession(), before = await crypto.encryptedGetItem(key);
    if (field === 'sunDefaults') state.importedData.sunDefaults!.homeLight = 'halogen';
    else state.importedData.lightCircadian = { note: 'Unsaved local Light edit' };
    const live = structuredClone(state.importedData);
    expect(await session.saveValues(values)).toBe('conflict');
    expect(state.importedData).toEqual(live); expect(await crypto.encryptedGetItem(key)).toBe(before);
  });
}
it('retains unrelated saved and unsaved fields and clears deferred flags on completion', async () => {
  state.importedData.sunDefaults = { ...state.importedData.sunDefaults, skipped: true, setupPromptDismissedAt: 1 };
  state.importedData.lightCircadian = { note: 'Keep habits', evening: ['Dim warm light'] };
  expect(await saveImportedData()).toBe(true);
  const session = createSunSetupSession(), peer = JSON.parse((await crypto.encryptedGetItem(key))!);
  peer.contextNotes = 'Saved peer notes'; await crypto.encryptedSetItem(key, JSON.stringify(peer));
  state.importedData.contextNotes = 'Unsaved local notes';
  expect(await session.saveValues(values, 100)).toBe('saved');
  const stored = JSON.parse((await crypto.encryptedGetItem(key))!);
  expect(stored.contextNotes).toBe('Saved peer notes'); expect(state.importedData.contextNotes).toBe('Unsaved local notes');
  expect(stored.lightCircadian).toEqual({ note: 'Keep habits', evening: ['Dim warm light'], skinType: 'IV — olive' });
  expect(stored.sunDefaults).not.toHaveProperty('skipped'); expect(stored.sunDefaults).not.toHaveProperty('setupPromptDismissedAt');
  expect(await session.saveValues(values)).toBe('busy');
});
it('rejects retired roots, profile switches and invalid skin mappings before storage', async () => {
  const session = createSunSetupSession(), write = vi.spyOn(crypto, 'encryptedSetItem');
  expect(await session.saveValues({ ...values, fitzpatrick: 'II' })).toBe('invalid');
  state.importedData = structuredClone(state.importedData);
  expect(await session.saveValues(values)).toBe('retired');
  const next = createSunSetupSession(); state.currentProfile = 'other-light-profile';
  expect(await next.patchDefaults({ skipped: true })).toBe('retired'); expect(write).not.toHaveBeenCalled();
});
it('blocks a new write after a failed profile read until the profile loads successfully', async () => {
  const session = createSunSetupSession(), before = await crypto.encryptedGetItem(key);
  await expect(readProfileForLoad(profile, () => Promise.reject(new Error('Read failed')), () => {})).rejects.toThrow('Read failed');
  try {
    expect(await session.saveValues(values)).toBe('blocked'); expect(await session.patchDefaults({ skipped: true })).toBe('blocked');
    expect(await crypto.encryptedGetItem(key)).toBe(before);
  } finally { await readProfileForLoad(profile, () => undefined, () => {}); }
  expect(await session.saveValues(values)).toBe('saved');
});
it('defers only setup flags and preserves a concurrently saved Light context', async () => {
  const session = createSunSetupSession(), peer = JSON.parse((await crypto.encryptedGetItem(key))!);
  peer.lightCircadian = { note: 'Peer Light notes', skinType: 'V — brown' };
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  expect(await session.patchDefaults({ skipped: true, setupPromptDismissedAt: 555 })).toBe('saved');
  const stored = JSON.parse((await crypto.encryptedGetItem(key))!);
  expect(stored.sunDefaults).toMatchObject({ skipped: true, setupPromptDismissedAt: 555 });
  expect(stored.lightCircadian).toEqual(peer.lightCircadian);
});

it('rejects out-of-range untyped inputs before they can publish undefined skin/defaults', async () => {
  const session = createSunSetupSession(), before = structuredClone(state.importedData);
  const write = vi.spyOn(crypto, 'encryptedSetItem');
  const malformed = JSON.parse('{"skinIdx":99}') as SunSetupValues;
  expect(await session.saveValues(malformed)).toBe('invalid');
  expect(await session.saveValues(null)).toBe('invalid');
  expect(await session.saveValues({ ...values, skinIdx: 3.5 })).toBe('invalid');
  expect(write).not.toHaveBeenCalled(); expect(state.importedData).toEqual(before);
});
