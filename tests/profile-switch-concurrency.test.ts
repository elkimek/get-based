// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  read: vi.fn<(key: string) => Promise<string | null>>(),
  write: vi.fn<(key: string, value: string) => Promise<void>>(),
  restore: vi.fn<(profileId: string) => Promise<void>>(),
  notify: vi.fn<typeof import('../js/utils.js').showNotification>(),
}));
vi.mock('../js/crypto.js', () => ({ encryptedGetItem: mocks.read, encryptedSetItem: mocks.write, getEncryptionEnabled: () => false, isUnlocked: () => true }));
vi.mock('../js/utils.js', () => ({ isDebugMode: () => false, showConfirmDialog: async () => false, showNotification: mocks.notify }));
vi.mock('../js/profile-data-migrations.js', () => ({ migrateProfileData: (value: unknown) => value }));
vi.mock('../js/profile-data-writes.js', () => ({ rememberProfileData: () => {} }));
vi.mock('../js/correlation-workspace-store.js', () => ({ restoreCorrelationWorkspace: mocks.restore }));
vi.mock('../js/profile-storage-cleanup.js', () => ({ clearProfileStorage: async () => {} }));
vi.mock('../js/profile-list-store.js', () => ({
  configureProfileListStoreDeps: () => ({}), getProfiles: () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  initProfilesCache: async () => {}, mutateProfiles: async () => {}, saveProfiles: async () => {},
}));
vi.mock('../js/profile-sync-policy.js', () => ({ clearLocalProfileDeleteIntent: () => {}, isDemoProfileId: () => false, markLocalProfileDeleteIntent: () => {}, queueEligibleProfileSync: () => {} }));
import { state } from '../js/state.js';
import { configureProfileDeps, configureProfileRuntimeDeps, createDefaultProfileData, loadProfile, switchProfile } from '../js/profile.js';
import { isProfileReadBlocked } from '../js/profile-load-safety.js';
function deferred<Value>() {
  let resolve!: (value: Value) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const data = (name: string) => JSON.stringify({ ...createDefaultProfileData(), contextNotes: name });
const runtime = {
  invalidateProfileContextCache: vi.fn<() => Promise<void> | void>(),
  reloadProfileRuntimeShell: vi.fn<(id: string) => Promise<void> | void>(),
  refreshProfileWearables: vi.fn<NonNullable<NonNullable<Parameters<typeof configureProfileRuntimeDeps>[0]>['refreshProfileWearables']>>(),
  dispatchProfileSwitched: vi.fn<(id: string) => void>(),
};
let oldRuntime: ReturnType<typeof configureProfileRuntimeDeps>, oldDeps: ReturnType<typeof configureProfileDeps>;
let previousState: typeof state;
let previousActiveProfile: string | null;
beforeEach(() => {
  vi.resetAllMocks();
  previousState = { ...state };
  previousActiveProfile = localStorage.getItem('labcharts-active-profile');
  state.currentProfile = 'start'; state.importedData = createDefaultProfileData();
  mocks.read.mockImplementation(async key => key.endsWith('-imported') ? data(key.includes('-a-') ? 'A' : 'B') : null);
  mocks.write.mockResolvedValue(undefined); mocks.restore.mockResolvedValue(undefined);
  oldDeps = configureProfileDeps({ showNotification: mocks.notify });
  oldRuntime = configureProfileRuntimeDeps(runtime);
});
afterEach(() => { configureProfileRuntimeDeps(oldRuntime); configureProfileDeps(oldDeps); Object.assign(state, previousState); if (previousActiveProfile === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', previousActiveProfile); });
it('keeps the latest selection when an older storage read finishes last', async () => {
  const older = deferred<string | null>(); mocks.read.mockImplementationOnce(() => older.promise);
  const first = switchProfile('a'); await switchProfile('b'); older.resolve(data('A')); await first;
  expect(state.currentProfile).toBe('b'); expect(state.importedData.contextNotes).toBe('B');
  expect(localStorage.getItem('labcharts-active-profile')).toBe('b');
  expect(runtime.dispatchProfileSwitched).toHaveBeenCalledExactlyOnceWith('b');
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('Switched to B', 'info');
});
it('invalidates a pending selection when the user reselects the already active profile', async () => {
  state.currentProfile = 'a'; const older = deferred<string | null>(); mocks.read.mockImplementationOnce(() => older.promise);
  const first = switchProfile('b'); await switchProfile('a'); older.resolve(data('B')); await first;
  expect(state.currentProfile).toBe('a'); expect(state.importedData.contextNotes).toBe('A');
  expect(runtime.dispatchProfileSwitched).toHaveBeenCalledExactlyOnceWith('a');
});
it('does not adopt old data after context invalidation yields to a newer load', async () => {
  const older = deferred<void>(); runtime.invalidateProfileContextCache.mockImplementationOnce(() => older.promise);
  const first = switchProfile('a'); await vi.waitFor(() => expect(runtime.invalidateProfileContextCache).toHaveBeenCalledOnce());
  await switchProfile('b'); older.resolve(); await first;
  expect(state.currentProfile).toBe('b'); expect(state.importedData.contextNotes).toBe('B');
  expect(runtime.reloadProfileRuntimeShell).toHaveBeenCalledExactlyOnceWith('b');
});
it('does not clear a destination conversation after an old workspace restore resolves', async () => {
  const older = deferred<void>(); mocks.restore.mockImplementationOnce(() => older.promise);
  const first = switchProfile('a'); await vi.waitFor(() => expect(mocks.restore).toHaveBeenCalledOnce());
  await switchProfile('b'); state.chatHistory = [{ role: 'user', content: 'B message' }];
  older.resolve(); await first;
  expect(state.chatHistory).toEqual([{ role: 'user', content: 'B message' }]);
  expect(runtime.reloadProfileRuntimeShell).toHaveBeenCalledExactlyOnceWith('b');
});
it('does not start old wearable work after an old shell refresh resolves', async () => {
  const older = deferred<void>(); runtime.reloadProfileRuntimeShell.mockImplementationOnce(() => older.promise);
  const first = switchProfile('a'); await vi.waitFor(() => expect(runtime.reloadProfileRuntimeShell).toHaveBeenCalledOnce());
  await switchProfile('b'); older.resolve(); await first;
  expect(runtime.refreshProfileWearables).toHaveBeenCalledExactlyOnceWith('b', null);
  expect(runtime.dispatchProfileSwitched).toHaveBeenCalledExactlyOnceWith('b');
});
it('does not announce an old switch after awaiting its wearable refresh', async () => {
  const older = deferred<void>(); runtime.refreshProfileWearables.mockImplementationOnce(() => older.promise);
  const first = switchProfile('a'); await vi.waitFor(() => expect(runtime.refreshProfileWearables).toHaveBeenCalledOnce());
  await switchProfile('b'); older.resolve(); await first;
  expect(runtime.dispatchProfileSwitched).toHaveBeenCalledExactlyOnceWith('b');
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('Switched to B', 'info');
});
it.each(['read', 'write'])('finishes scoped corrupt-byte recovery without overwriting or notifying the newer profile during %s', async stage => {
  const older = deferred<string | null>(), write = deferred<void>();
  mocks.read.mockImplementation(async key => key === 'labcharts-a-imported' ? '{bad' : key === 'labcharts-a-imported-corrupt' ? stage === 'read' ? older.promise : null : data('B'));
  if (stage === 'write') mocks.write.mockImplementationOnce(() => write.promise);
  const first = switchProfile('a');
  await vi.waitFor(() => expect(stage === 'read' ? mocks.read : mocks.write).toHaveBeenCalledWith(...(stage === 'read' ? ['labcharts-a-imported-corrupt'] : ['labcharts-a-imported-corrupt', '{bad'])));
  await switchProfile('b'); older.resolve(null); write.resolve(); await first;
  expect(mocks.write).toHaveBeenCalledExactlyOnceWith('labcharts-a-imported-corrupt', '{bad');
  expect(state.currentProfile).toBe('b'); expect(state.importedData.contextNotes).toBe('B');
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('Switched to B', 'info');
});
it('retains failed-read blocking for an old profile while suppressing stale notifications', async () => {
  const older = deferred<string | null>(); mocks.read.mockImplementationOnce(() => older.promise);
  const first = switchProfile('a'); const failure = new Error('Read failed'); const rejected = expect(first).rejects.toBe(failure);
  await switchProfile('b'); older.reject(failure); await rejected;
  expect(isProfileReadBlocked('a')).toBe(true); expect(state.currentProfile).toBe('b');
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('Switched to B', 'info');
  await loadProfile('a'); expect(isProfileReadBlocked('a')).toBe(false);
});
it('keeps a completed same-profile selection a no-op', async () => {
  await switchProfile('a'); mocks.read.mockClear(); runtime.dispatchProfileSwitched.mockClear();
  await switchProfile('a'); expect(mocks.read).not.toHaveBeenCalled(); expect(runtime.dispatchProfileSwitched).not.toHaveBeenCalled();
});

it('does not block a newer successful load when an older same-profile read fails', async () => {
  const older = deferred<string | null>(); mocks.read.mockImplementationOnce(() => older.promise);
  const first = loadProfile('a'); const failure = new Error('Old read failed'); const rejected = expect(first).rejects.toBe(failure);
  await loadProfile('a'); older.reject(failure); await rejected;
  expect(isProfileReadBlocked('a')).toBe(false); expect(state.importedData.contextNotes).toBe('A');
  expect(mocks.notify).not.toHaveBeenCalled();
});
it('keeps a newer failed load blocked when an older same-profile read succeeds', async () => {
  const older = deferred<string | null>(); const failure = new Error('Newest read failed');
  mocks.read.mockImplementationOnce(() => older.promise).mockRejectedValueOnce(failure);
  const first = loadProfile('a'); await expect(loadProfile('a')).rejects.toBe(failure);
  expect(isProfileReadBlocked('a')).toBe(true); older.resolve(data('Old A')); await first;
  expect(isProfileReadBlocked('a')).toBe(true); expect(state.importedData.contextNotes).not.toBe('Old A');
  await loadProfile('a'); expect(isProfileReadBlocked('a')).toBe(false);
});
