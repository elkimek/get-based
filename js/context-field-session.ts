// One form session owns a captured profile, baseline and commit lifecycle.
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, adoptProfileData, rememberProfileData, rebaseLiveProfileData } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { recordContextCardChange } from './context-cards-runtime.js';
import type { ProfileSaveOptions } from './data-core-types.js';
type ContextFieldKey = NonNullable<ProfileSaveOptions['expectedContextField']>['key'];
export function createContextFieldSession<Value>(key: ContextFieldKey, apply: (draft: typeof state.importedData, value: Value) => void) {
  const profile = state.currentProfile, origin = state.importedData;
  const base = structuredClone(profileDataBaseline(origin) || origin);
  let retired = false, saving = false, committed = false;
  const current = () => !retired && state.currentProfile === profile && state.importedData === origin;
  return {
    current,
    retire() { retired = true; },
    async save(value: Value): Promise<'saved' | 'failed' | 'conflict' | 'retired' | 'blocked' | 'busy'> {
      if (!current())
        return 'retired';
      if (saving || committed)
        return 'busy';
      if (isProfileReadBlocked(profile))
        return 'blocked';
      saving = true;
      let conflict = false;
      try {
        const draft = structuredClone(base);
        apply(draft, value);
        recordContextCardChange(key, draft);
        const saved = await saveImportedDataForProfile(profile, draft, {
          forceProfileScope: true, baseData: base,
          expectedContextField: {
            key, value: base[key] ?? null
          }, onContextFieldConflict: () => { conflict = true; },
        });
        if (!saved)
          return conflict ? 'conflict' : 'failed';
        committed = true;
        try {
          // A completed write still belongs to its origin after a view/profile switch.
          if (state.currentProfile !== profile || state.importedData !== origin) {
            const result = rebaseLiveProfileData(base, origin, profileDataBaseline(draft) || draft);
            adoptProfileData(origin, result.data);
            rememberProfileData(origin, result.baseline);
          }
          if (state.currentProfile === profile)
            notifyProfileDataContextChanged(profile);
        } catch { /* Storage committed; presentation hooks cannot undo it. */ }
        return 'saved';
      }
      catch {
        return 'failed';
      }
      finally {
        saving = false;
      }
    },
  };
}

