// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { profileStorageKey } from '../js/profile.js';
import * as storage from '../js/crypto.js';
import { rememberProfileData } from '../js/profile-data-writes.js';
import { prepareLabReportWrite, commitLabReportWrite } from '../js/lab-report-store.js';
import { importReviewSampleOptions, resolveImportSample, selectLabReportSample } from '../js/lab-report-samples.js';
import { clearSyncSaveTimers, configureSyncSaveHooks } from '../js/sync-save-hooks.js';
import type { PendingImport } from '../js/pdf-import-review-runtime.js';
import type { ProfileData } from '../types/app-state.js';

const original = { profile: state.currentProfile, data: state.importedData };
const day = '2026-01-12';
const review = (): PendingImport => ({ date: day, markers: [{ matched: true, mappedKey: 'biochemistry.glucose', value: 5.2, unit: 'mmol/l' }] });
const sparse = () => ({ notes: [{ id: 'retained-note', date: day, text: 'Synthetic retained note' }], futureExtension: { retain: ['opaque', 7] } }) as unknown as typeof state.importedData;
let storageKey: string | undefined;
let restoreSync: ReturnType<typeof configureSyncSaveHooks> | undefined;
afterEach(async () => {
  clearSyncSaveTimers();
  if (restoreSync) configureSyncSaveHooks(restoreSync);
  restoreSync = undefined;
  if (storageKey) await storage.encryptedRemoveItem(storageKey);
  storageKey = undefined; localStorage.clear();
  state.currentProfile = original.profile; state.importedData = original.data;
});

it.each([undefined, null])('reads a sparse profile with entries=%s without initializing or altering it', entries => {
  const data = { ...sparse(), ...(entries === null ? { entries } : {}) } as unknown as ProfileData;
  const before = structuredClone(data);
  expect(importReviewSampleOptions(review(), data, 'synthetic-profile')).toEqual({ options: [], value: '', locked: false, required: false });
  expect(selectLabReportSample(data, { id: 'unknown-report', date: day })).toBeNull();
  expect(data).toEqual(before);
});

it('initializes only the private report transaction and preserves its sparse baseline', () => {
  const observed = sparse(), before = structuredClone(observed);
  rememberProfileData(observed);
  const { base, next } = prepareLabReportWrite(observed);
  expect(base).toEqual(before); expect(base).not.toHaveProperty('entries');
  expect(next.entries).toEqual([]); expect(observed).toEqual(before);
  const entry = resolveImportSample(review(), next, 'synthetic-profile', undefined, 1700000000000);
  expect(next.entries).toEqual([entry]); expect(entry.date).toBe(day);
  expect(observed).toEqual(before); expect(next.notes).toEqual(before.notes);
});

it('durably imports the first sample into a sparse profile while retaining unrelated data', async () => {
  const profile = `sparse-native-${crypto.randomUUID()}`, observed = sparse(), before = structuredClone(observed);
  storageKey = profileStorageKey(profile, 'imported');
  localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.importedData = observed;
  await storage.encryptedSetItem(storageKey, JSON.stringify(observed)); rememberProfileData(observed);
  const pushProfile = vi.fn<(id: string, data: unknown) => Promise<object>>(async () => ({}));
  restoreSync = configureSyncSaveHooks({pushProfile, isSyncConfigured: () => true, isSyncEnabled: () => true,
    isEvoluReady: () => true, isSyncing: () => false, getProfiles: () => [{id: profile}]});
  const { base, next } = prepareLabReportWrite(observed);
  const entry = resolveImportSample(review(), next, profile, undefined, 1700000000000);
  entry.markers['biochemistry.glucose'] = 5.2;
  expect(await commitLabReportWrite(profile, observed, base, next, () => state.currentProfile === profile && state.importedData === observed)).toBe(true);
  const saved = JSON.parse((await storage.encryptedGetItem(storageKey))!) as ProfileData;
  expect(saved.entries).toEqual([entry]); expect(saved.notes).toEqual(before.notes);
  expect(saved.futureExtension).toEqual(before.futureExtension);
  expect(state.importedData.entries).toEqual(saved.entries);
  expect(pushProfile).toHaveBeenCalledExactlyOnceWith(profile, state.importedData);
});

it('refuses malformed saved samples without replacing the unknown container', () => {
  const data = { ...sparse(), entries: { preserveUnknownFormat: true } } as unknown as ProfileData, before = structuredClone(data);
  expect(() => importReviewSampleOptions(review(), data, 'synthetic-profile')).toThrow('samples');
  expect(data).toEqual(before);
});

it('rejects a newly arrived same-date peer sample after an initially empty review', () => {
  const data = sparse(), pending = review();
  importReviewSampleOptions(pending, data, 'synthetic-profile');
  data.entries = [{ panelId: 'peer-sample', date: day, markers: { 'biochemistry.glucose': 6 } }];
  const before = structuredClone(data);
  expect(() => resolveImportSample(pending, data, 'synthetic-profile', undefined, 1700000000000)).toThrow('samples on this date changed');
  expect(data).toEqual(before);
});
