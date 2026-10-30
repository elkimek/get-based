// Import/re-review/removal publish only after the captured profile's locked save.
import type { ProfileData } from '../types/app-state.js';
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, profileDataValuesEqual, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';

const fields = ['entries', 'importSnapshots', 'refOverrides', 'customMarkers', 'manualValues', 'markerValueNotes', 'labPanelTombstones', 'importBenchmarks', '_deleted', '_deletedAt', '_deletedClearedAt', 'markerLabels', 'categoryLabels'] as const;
export function labReportWriteDependencies(data: ProfileData) { return Object.fromEntries(fields.map(key => [key, data[key] ?? null])); }
export function prepareLabReportWrite(observed: ProfileData) {
  const base = structuredClone(profileDataBaseline(observed) || observed), next = structuredClone(base);
  // Normalize only the private write intent; keep the exact sparse CAS baseline.
  if (next.entries == null) next.entries = [];
  return { base, next };
}
export async function commitLabReportWrite(profileId: string, observed: ProfileData, base: ProfileData, next: ProfileData, authorized: () => boolean, onConflict: () => void = () => {}) {
  const current = () => {
    if (!authorized()) return false;
    const same = fields.every(key => profileDataValuesEqual(observed[key] ?? null, base[key] ?? null));
    if (!same) onConflict(); return same;
  };
  if (!current()) return false;
  const saved = await saveImportedDataForProfile(profileId, next, { immediate: true, forceProfileScope: true, baseData: base, canCommit: current,
    expectedContextFields: fields.map(key => ({ key, value: base[key] ?? null })), onContextFieldConflict: onConflict });
  if (!saved) return false;
  try {
    if (state.currentProfile !== profileId || state.importedData !== observed) {
      const rebased = rebaseLiveProfileData(base, observed, profileDataBaseline(next) || next);
      adoptProfileData(observed, rebased.data); rememberProfileData(observed, rebased.baseline);
    }
    notifyProfileDataContextChanged(profileId);
  } catch { /* Durable success is independent of projection refresh. */ }
  return true;
}
