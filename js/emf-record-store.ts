// Serialize EMF commands and publish only a successful canonical save.
import type { ProfileData } from '../types/app-state.js';
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, profileDataValuesEqual, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import type { ProfileFieldExpectation } from './data-core-types.js';

export const EMF_RECORD_PAYLOAD_FIELDS = ['emfAssessment'] as const;
export const EMF_RECORD_FIELDS = ['emfAssessment'] as const satisfies readonly ProfileFieldExpectation['key'][];
const listeners = new Set<() => void>();
export function onEMFRecordChanged(callback: () => void) { listeners.add(callback); return () => listeners.delete(callback); }
const queues = new Map<string, Promise<unknown>>();
export function queueEMFRecordWrite<T>(profileId: string, action: () => Promise<T>): Promise<T> {
  const pending = (queues.get(profileId) || Promise.resolve()).then(action);
  const settled = pending.catch(() => {}); queues.set(profileId, settled);
  void settled.then(() => { if (queues.get(profileId) === settled) queues.delete(profileId); });
  return pending;
}
export async function commitEMFRecordWrite(profileId: string, observed: ProfileData, base: ProfileData, source: ProfileData, next: ProfileData, authorized: () => boolean, fields: readonly ProfileFieldExpectation['key'][] = EMF_RECORD_FIELDS, ownedFields: readonly ProfileFieldExpectation['key'][] = EMF_RECORD_PAYLOAD_FIELDS) {
  let conflict = false;
  const current = () => {
    const same = fields.every(key => profileDataValuesEqual(observed[key] ?? null, source[key] ?? null));
    if (!same) conflict = true;
    return authorized() && same;
  };
  if (!current()) return { saved: false, conflict: true };
  const saved = await saveImportedDataForProfile(profileId, next, { baseData: base, forceProfileScope: true, canCommit: current,
    expectedContextFields: fields.map(key => ({ key, value: base[key] ?? null })), onContextFieldConflict: () => { conflict = true; } });
  if (saved) try {
    const committed = profileDataBaseline(next) || next;
    if (state.currentProfile !== profileId || state.importedData !== observed) {
      const result = rebaseLiveProfileData(base, observed, committed);
      adoptProfileData(observed, result.data); rememberProfileData(observed, result.baseline);
    }
    // These fields belonged to the captured command, including an accepted
    // repair of an unsaved normalization. Preserve unrelated newer drafts.
    const baseline = structuredClone(profileDataBaseline(observed) || base);
    for (const key of ownedFields) {
      const result = rebaseLiveProfileData(source[key], observed[key], committed[key], key);
      if (result.data === undefined && !Object.hasOwn(committed, key)) delete observed[key];
      else Object.assign(observed, { [key]: adoptProfileData(observed[key], result.data, key) });
      if (result.baseline === undefined && !Object.hasOwn(committed, key)) delete baseline[key];
      else Object.assign(baseline, { [key]: result.baseline });
    }
    rememberProfileData(observed, baseline);
    if (state.currentProfile === profileId && state.importedData === observed) {
      for (const listener of listeners) try { listener(); } catch { /* A view retirement cannot undo the accepted write. */ }
      notifyProfileDataContextChanged(profileId);
    }
  } catch { /* Adoption cannot undo a durable write; reload can recover its view. */ }
  return { saved, conflict };
}
