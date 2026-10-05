// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deleteBlob, getBlob, setBlob } from '../js/blob-storage.js';
import { _setTestSessionKey, encryptedGetItem, encryptedSetItem } from '../js/crypto.js';
import { configureProfileDeps, configureProfileRuntimeDeps, createDefaultProfileData, loadProfile } from '../js/profile.js';
import { saveImportedData, saveImportedDataForProfile } from '../js/data.js';
import { isProfileReadBlocked } from '../js/profile-load-safety.js';
import { initializeProfileData } from '../js/startup-profile.js';
import { mergePulledImportedData, persistPulledImportedData } from '../js/sync-pull-merge.js';
import { initProfilesCache } from '../js/profile-list-store.js';
import { state } from '../js/state.js';
const profileId = 'encrypted-read-safety';
const key = `labcharts-${profileId}-imported`;
const runtimeOptions = { invalidateProfileContextCache: () => {}, reloadProfileRuntimeShell: () => {}, refreshProfileWearables: () => {} };
let oldRuntime: ReturnType<typeof configureProfileRuntimeDeps>, oldDeps: ReturnType<typeof configureProfileDeps>;
let oldProfileList: string | null, oldApiKey: string | null;
let oldState: typeof state, oldActiveProfile: string | null, oldEnabled: string | null, oldTestFlag: unknown;
const testWindow = window as Window & { __WEARABLES_TEST?: unknown };
const notify = vi.fn<typeof import('../js/utils.js').showNotification>();
const storedProfile = () => JSON.stringify({ ...createDefaultProfileData(), contextNotes: 'Recovered medical history' });
async function corruptAuthenticationTag() {
  const encrypted = await getBlob(key);
  if (typeof encrypted !== 'string') throw new Error('Missing encrypted fixture');
  const parts = encrypted.split(':');
  if (parts[0] !== 'v1' || !parts[1] || !parts[2]) throw new Error('Invalid encrypted fixture');
  const ct = Buffer.from(parts[2], 'base64');
  ct[ct.length - 1] = ct[ct.length - 1]! ^ 1;
  const damaged = `v1:${parts[1]}:${ct.toString('base64')}`;
  await setBlob(key, damaged);
  return damaged;
}
beforeEach(async () => {
  oldProfileList = localStorage.getItem('labcharts-profiles'); oldApiKey = localStorage.getItem('labcharts-api-key');
  oldState = { ...state }; oldActiveProfile = localStorage.getItem('labcharts-active-profile'); oldEnabled = localStorage.getItem('labcharts-encryption-enabled'); oldTestFlag = testWindow.__WEARABLES_TEST;
  vi.stubGlobal('crypto', webcrypto); testWindow.__WEARABLES_TEST = true;
  localStorage.setItem('labcharts-encryption-enabled', 'true');
  await _setTestSessionKey('correct fixture passphrase');
  await deleteBlob(key); localStorage.removeItem(key); notify.mockClear();
  oldDeps = configureProfileDeps({ showNotification: notify }); oldRuntime = configureProfileRuntimeDeps(runtimeOptions);
  state.currentProfile = 'previous-profile'; state.importedData = createDefaultProfileData();
  state.importedData.contextNotes = 'Previous active profile';
  // Each case begins with the genuine encrypted blob and native AES-GCM key.
  await encryptedSetItem(key, storedProfile());
});
afterEach(async () => {
  // A successful read clears the intentionally exercised blocked-profile state.
  await encryptedSetItem(key, storedProfile()).catch(() => {});
  localStorage.removeItem('labcharts-encryption-enabled'); await deleteBlob(key); localStorage.removeItem(key);
  await loadProfile(profileId); await _setTestSessionKey(null);
  configureProfileRuntimeDeps(oldRuntime); configureProfileDeps(oldDeps); Object.assign(state, oldState);
  if (oldActiveProfile === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', oldActiveProfile);
  if (oldEnabled === null) localStorage.removeItem('labcharts-encryption-enabled'); else localStorage.setItem('labcharts-encryption-enabled', oldEnabled);
  if (oldTestFlag === undefined) delete testWindow.__WEARABLES_TEST; else testWindow.__WEARABLES_TEST = oldTestFlag;
  if (oldProfileList === null) localStorage.removeItem('labcharts-profiles'); else localStorage.setItem('labcharts-profiles', oldProfileList);
  if (oldApiKey === null) localStorage.removeItem('labcharts-api-key'); else localStorage.setItem('labcharts-api-key', oldApiKey);
  document.getElementById('notification-container')?.remove();
  vi.unstubAllGlobals();
});
it('round-trips valid profile data with an opt-in strict read', async () => {
  expect(await encryptedGetItem(key, { throwOnDecryptError: true })).toBe(storedProfile());
});
it('keeps generic null behavior but rejects a strict AES authentication failure without changing storage', async () => {
  const damaged = await corruptAuthenticationTag();
  expect(await encryptedGetItem(key)).toBeNull();
  await expect(encryptedGetItem(key, { throwOnDecryptError: true })).rejects.toThrow();
  expect(await getBlob(key)).toBe(damaged);
});
it('rejects a strict read with a wrong key while the generic read still returns null', async () => {
  const original = await getBlob(key); await _setTestSessionKey('different fixture passphrase');
  expect(await encryptedGetItem(key)).toBeNull();
  await expect(encryptedGetItem(key, { throwOnDecryptError: true })).rejects.toThrow();
  expect(await getBlob(key)).toBe(original);
});
it('rejects a strict locked read while preserving generic ciphertext access', async () => {
  const original = await getBlob(key); await _setTestSessionKey(null);
  expect(await encryptedGetItem(key)).toBe(original);
  await expect(encryptedGetItem(key, { throwOnDecryptError: true })).rejects.toThrow('locked');
  expect(await getBlob(key)).toBe(original);
});
it('keeps a malformed envelope intact and rejects only the strict read', async () => {
  await setBlob(key, 'v1:invalid'); expect(await encryptedGetItem(key)).toBe('v1:invalid');
  await expect(encryptedGetItem(key, { throwOnDecryptError: true })).rejects.toThrow('invalid encryption envelope');
  expect(await getBlob(key)).toBe('v1:invalid');
});
it('leaves the active profile untouched and prevents scoped saves after a corrupt encrypted profile load', async () => {
  const originalData = state.importedData, damaged = await corruptAuthenticationTag();
  await expect(loadProfile(profileId)).rejects.toThrow();
  expect(isProfileReadBlocked(profileId)).toBe(true); expect(state.currentProfile).toBe('previous-profile');
  expect(state.importedData).toBe(originalData); expect(localStorage.getItem('labcharts-active-profile')).toBe(oldActiveProfile);
  expect(await saveImportedDataForProfile(profileId, createDefaultProfileData(), { forceProfileScope: true })).toBe(false);
  expect(await getBlob(key)).toBe(damaged);
  expect(notify).toHaveBeenCalledWith(expect.stringContaining('saved data has not been replaced'), 'error', 12000);
});
it('rejects a save if the stored ciphertext becomes unreadable after a successful load', async () => {
  await loadProfile(profileId); const damaged = await corruptAuthenticationTag();
  state.importedData.contextNotes = 'Unsaved edit'; expect(await saveImportedData()).toBe(false);
  expect(state.importedData.contextNotes).toBe('Unsaved edit'); expect(await getBlob(key)).toBe(damaged);
});
it('keeps missing and plain profile storage compatible with strict reads', async () => {
  await deleteBlob(key); expect(await encryptedGetItem(key, { throwOnDecryptError: true })).toBeNull();
  await setBlob(key, '{invalid plaintext');
  expect(await encryptedGetItem(key, { throwOnDecryptError: true })).toBe('{invalid plaintext');
  await setBlob(key, storedProfile()); expect(await encryptedGetItem(key, { throwOnDecryptError: true })).toBe(storedProfile());
  await loadProfile(profileId); expect(isProfileReadBlocked(profileId)).toBe(false);
  expect(state.importedData.contextNotes).toBe('Recovered medical history');
});

it('preserves generic credential null behavior after real AES authentication failure', async () => {
  const damaged = await corruptAuthenticationTag();
  localStorage.setItem('labcharts-api-key', damaged);
  expect(await encryptedGetItem('labcharts-api-key')).toBeNull();
  expect(localStorage.getItem('labcharts-api-key')).toBe(damaged);
});
it('blocks corrupt encrypted storage during startup before hydration or writes', async () => {
  const damaged = await corruptAuthenticationTag(), previous = state.importedData;
  localStorage.setItem('labcharts-profiles', '[]');
  localStorage.setItem('labcharts-active-profile', profileId);
  const notifications = document.createElement('div'); notifications.id = 'notification-container'; document.body.append(notifications);
  await expect(initializeProfileData()).rejects.toThrow();
  expect(isProfileReadBlocked(profileId)).toBe(true);
  expect(state.importedData).toBe(previous);
  expect(notifications.textContent).toContain('Your saved data has not been replaced');
  expect(await saveImportedData()).toBe(false);
  expect(await getBlob(key)).toBe(damaged);
});
it('unblocks a previously failed profile only after a successful recovered read', async () => {
  await corruptAuthenticationTag(); await expect(loadProfile(profileId)).rejects.toThrow();
  expect(isProfileReadBlocked(profileId)).toBe(true);
  await encryptedSetItem(key, storedProfile()); const recovered = await getBlob(key);
  await loadProfile(profileId);
  expect(isProfileReadBlocked(profileId)).toBe(false);
  expect(state.importedData.contextNotes).toBe('Recovered medical history');
  expect(await getBlob(key)).toBe(recovered);
});
it('aborts sync merge when the profile ciphertext is unreadable', async () => {
  const damaged = await corruptAuthenticationTag();
  await expect(mergePulledImportedData(profileId, null)).rejects.toThrow();
  expect(await getBlob(key)).toBe(damaged);
});
it('aborts direct sync persistence when the profile ciphertext is unreadable', async () => {
  const damaged = await corruptAuthenticationTag();
  await expect(persistPulledImportedData(key, profileId, {}, 100)).rejects.toThrow();
  expect(await getBlob(key)).toBe(damaged);
  expect(localStorage.getItem(`labcharts-${profileId}-sync-ts`)).toBeNull();
});

it('preserves cached profile metadata and encrypted list bytes when startup cannot decrypt the list', async () => {
  const damaged = await corruptAuthenticationTag(), previousProfiles = state.profiles;
  localStorage.setItem('labcharts-profiles', damaged);
  await expect(initProfilesCache()).rejects.toThrow();
  expect(state.profiles).toBe(previousProfiles);
  await expect(initializeProfileData()).rejects.toThrow();
  expect(state.profiles).toBe(previousProfiles);
  expect(state.currentProfile).toBe('previous-profile');
  expect(localStorage.getItem('labcharts-profiles')).toBe(damaged);
});
