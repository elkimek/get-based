// Setup writes capture one profile and publish defaults/skin only after atomic storage success.
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, profileDataValuesEqual, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { SKIN_TYPE } from './constants.js';
import { FITZPATRICK_ROMAN } from './sun-defaults-model.js';
import type { SunSetupDefaults, SunSetupValues } from './sun-defaults-model.js';
import type { LightCircadianContext } from '../types/profile-context-data.js';
export type SunSetupSaveResult = 'saved' | 'failed' | 'conflict' | 'retired' | 'blocked' | 'busy' | 'invalid';
export type SunSetupSession = ReturnType<typeof createSunSetupSession>;

function defaultLightContext(): LightCircadianContext {
  return { amLight: null, daytime: null, uvExposure: null, skinType: null, evening: [], screenTime: null,
    techEnv: [], cold: null, grounding: null, mealTiming: [], note: '' };
}

// A rendered action is valid only for its original profile/root and switch epoch.
// Keep one active identity, rather than retaining every profile previously visited.
let identitySequence = 0;
let identity: { profile: string; origin: typeof state.importedData; ticket: string } | null = null;
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', () => { identity = null; });
}
export function captureSunSetupIdentity() {
  if (!identity || identity.profile !== state.currentProfile || identity.origin !== state.importedData) {
    identity = { profile: state.currentProfile, origin: state.importedData, ticket: `light-setup-${++identitySequence}` };
  }
  return identity.ticket;
}
export function isCurrentSunSetupIdentity(ticket: string) {
  return identity?.ticket === ticket && identity.profile === state.currentProfile && identity.origin === state.importedData;
}

export function createSunSetupSession() {
  const ticket = captureSunSetupIdentity();
  const profile = state.currentProfile, origin = state.importedData;
  const base = structuredClone(profileDataBaseline(origin) || origin);
  const observedDefaults = structuredClone(origin?.sunDefaults || {});
  const observedLight = structuredClone(origin?.lightCircadian ?? null);
  let retired = false, saving = false, committed = false, lastResult: SunSetupSaveResult | null = null;
  const current = () => !retired && !!origin && isCurrentSunSetupIdentity(ticket);
  const finish = (result: SunSetupSaveResult) => { lastResult = result; return result; };
  async function commit(patch: Partial<SunSetupDefaults>, values?: SunSetupValues, now?: number): Promise<SunSetupSaveResult> {
    if (!current()) return finish('retired');
    if (saving || committed) return finish('busy');
    if (isProfileReadBlocked(profile)) return finish('blocked');
    if (!profileDataValuesEqual(origin.sunDefaults || {}, observedDefaults)
      || values && !profileDataValuesEqual(origin.lightCircadian ?? null, observedLight)) return finish('conflict');
    saving = true;
    let conflict = false;
    try {
      const draft = structuredClone(base);
      draft.sunDefaults = { ...structuredClone(observedDefaults), ...structuredClone(patch) };
      if (values) {
        Object.assign(draft.sunDefaults, { fitzpatrick: values.fitzpatrick, photosensitiveMeds: values.photosensitiveMeds,
          homeLight: values.homeLight, eyewear: values.eyewear, ott: structuredClone(values.ott || {}),
          ottScore: Number(values.ottScore) || 0, completedAt: now });
        delete draft.sunDefaults.skipped; delete draft.sunDefaults.setupPromptDismissedAt;
        draft.lightCircadian = structuredClone(observedLight || defaultLightContext());
        draft.lightCircadian.skinType = SKIN_TYPE[values.skinIdx]!;
      }
      const saved = await saveImportedDataForProfile(profile, draft, { forceProfileScope: true, baseData: base,
        expectedContextFields: [
          { key: 'sunDefaults', value: base.sunDefaults ?? null },
          ...(values ? [{ key: 'lightCircadian' as const, value: base.lightCircadian ?? null }] : []),
        ], onContextFieldConflict: () => { conflict = true; },
      });
      if (!saved) return finish(conflict ? 'conflict' : 'failed');
      committed = true;
      try {
        if (state.currentProfile !== profile || state.importedData !== origin) {
          const result = rebaseLiveProfileData(base, origin, profileDataBaseline(draft) || draft);
          adoptProfileData(origin, result.data); rememberProfileData(origin, result.baseline);
        }
        if (state.currentProfile === profile) notifyProfileDataContextChanged(profile);
      } catch { /* Storage committed; view refresh cannot undo it. */ }
      return finish('saved');
    } catch { return finish('failed'); }
    finally { saving = false; }
  }
  return {
    current, retire() { retired = true; }, result: () => lastResult,
    defaults: () => origin?.sunDefaults || null,
    patchDefaults(patch: Partial<SunSetupDefaults>) { return commit(patch); },
    saveValues(values: SunSetupValues | null | undefined, now = Date.now()) {
      if (!values || !Number.isInteger(values.skinIdx) || values.skinIdx < 0 || values.skinIdx >= FITZPATRICK_ROMAN.length
        || FITZPATRICK_ROMAN[values.skinIdx] !== values.fitzpatrick) return Promise.resolve(finish('invalid'));
      return commit({}, values, now);
    },
  };
}
