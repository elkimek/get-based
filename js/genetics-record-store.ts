// Publish captured genetics intent only after the canonical locked profile save.
import type { ProfileData } from '../types/app-state.js';
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, profileDataValuesEqual, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';

export function prepareGeneticsWrite(observed: ProfileData) {
  const base = structuredClone(profileDataBaseline(observed) || observed);
  return { base, next: structuredClone(base) };
}
export async function commitGeneticsWrite(profileId: string, observed: ProfileData, base: ProfileData, next: ProfileData, authorized: () => boolean, onConflict: () => void = () => {}) {
  const current = () => {
    if (!authorized()) return false;
    const same = ['genetics', 'geneticsSnpTombstones', 'geneticsLifecycle'].every(key => profileDataValuesEqual(observed[key] ?? null, base[key] ?? null));
    if (!same) onConflict(); return same;
  };
  if (!current()) return false;
  if (!await saveImportedDataForProfile(profileId, next, { forceProfileScope: true, baseData: base, canCommit: current,
    expectedContextFields: [{ key: 'genetics', value: base.genetics ?? null }, { key: 'geneticsSnpTombstones', value: base.geneticsSnpTombstones ?? null }, { key: 'geneticsLifecycle', value: base.geneticsLifecycle ?? null }], onContextFieldConflict: onConflict })) return false;
  try {
    if (state.currentProfile !== profileId || state.importedData !== observed) {
      const rebased = rebaseLiveProfileData(base, observed, profileDataBaseline(next) || next);
      adoptProfileData(observed, rebased.data); rememberProfileData(observed, rebased.baseline);
    }
    notifyProfileDataContextChanged(profileId);
  } catch { /* A presentation failure cannot undo a durable write. */ }
  return true;
}
