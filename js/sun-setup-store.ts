// Stage setup writes; publish only payload fields accepted by canonical storage.
import type { ProfileData } from '../types/app-state.js';
import type { ProfileFieldExpectation } from './data-core-types.js';
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, profileDataValuesEqual, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import { protectSunSessionCalculationAdoption } from './sun-session-mutations.js';
export async function commitSunDataWrite(profile: string, origin: ProfileData, base: ProfileData, source: ProfileData, next: ProfileData, fields: readonly ProfileFieldExpectation['key'][], owned: readonly ProfileFieldExpectation['key'][], authorized = () => true) {
  let conflict = false;
  const current = () => {
    const same = fields.every(key => profileDataValuesEqual(origin[key] ?? null, source[key] ?? null));
    if (!same) conflict = true;
    return authorized() && same;
  };
  if (!current()) return { saved: false, conflict };
  const saved = await saveImportedDataForProfile(profile, next, { baseData: base, forceProfileScope: true, canCommit: current,
    expectedContextFields: fields.map(key => ({ key, value: base[key] ?? null })), onContextFieldConflict: () => { conflict = true; } });
  if (saved) try {
    const committed = profileDataBaseline(next) || next;
    if (state.currentProfile !== profile || state.importedData !== origin) {
      const rebased = rebaseLiveProfileData(base, origin, committed); adoptProfileData(origin, rebased.data); rememberProfileData(origin, rebased.baseline);
    }
    const baseline = structuredClone(profileDataBaseline(origin) || base);
    for (const key of owned) {
      const rebased = rebaseLiveProfileData(source[key], origin[key], committed[key], key);
      if (rebased.data === undefined && !Object.hasOwn(committed, key)) delete origin[key];
      else Object.assign(origin, { [key]: adoptProfileData(origin[key], rebased.data, key) });
      Object.assign(baseline, { [key]: rebased.baseline });
    }
    rememberProfileData(origin, baseline);
    if (owned.includes('sunSessions')) protectSunSessionCalculationAdoption(origin, source, committed);
    if (state.currentProfile === profile && state.importedData === origin) notifyProfileDataContextChanged(profile);
  } catch { /* A later reload can recover the accepted durable view. */ }
  return { saved, conflict };
}
export const commitSunSetupWrite = commitSunDataWrite;
