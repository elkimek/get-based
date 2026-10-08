// Accepted form writes finish on their captured profile; a retired view cannot begin one.
import { state } from './state.js';
import { getErrorMessage } from './caught-error.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, profileDataValuesEqual, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { saveActiveProfileMeal } from './nutrition-store.js';
import { normalizeNutritionTargets } from './nutrition-targets.js';
import { mealFromFluidDraft } from './nutrition-entry-model.js';
import type { FluidDraft, NutritionEntryResult } from './nutrition-entry-model.js';
import type { NormalizedNutritionTargets } from './nutrition-targets.js';

export function createNutritionEntrySession() {
  const profile = state.currentProfile, origin = state.importedData;
  const observed = structuredClone(origin.nutritionTargets ?? null);
  let retired = false, saving = false, failure = '';
  const current = () => !retired && state.currentProfile === profile && state.importedData === origin;
  async function commit(operation: () => Promise<NutritionEntryResult>): Promise<NutritionEntryResult> {
    if (!current()) return 'retired';
    if (saving) return 'busy';
    if (isProfileReadBlocked(profile)) return 'blocked';
    saving = true;
    try { failure = ''; return await operation(); } catch (error) { failure = getErrorMessage(error, 'The entry could not be saved.'); return 'failed'; }
    finally { saving = false; }
  }
  return {
    current, failureMessage: () => failure, retire() { retired = true; },
    saveTargets(value: NormalizedNutritionTargets) {
      return commit(async () => {
        if (!profileDataValuesEqual(origin.nutritionTargets ?? null, observed)) return 'conflict';
        const base = structuredClone(profileDataBaseline(origin) || origin), draft = structuredClone(base);
        draft.nutritionTargets = normalizeNutritionTargets({ ...value, configured: true });
        let conflict = false;
        const saved = await saveImportedDataForProfile(profile, draft, { forceProfileScope: true, baseData: base,
          expectedContextField: { key: 'nutritionTargets', value: structuredClone(base.nutritionTargets ?? null) },
          onContextFieldConflict: () => { conflict = true; },
        });
        if (!saved) return conflict ? 'conflict' : 'failed';
        try {
          if (state.currentProfile !== profile || state.importedData !== origin) {
            const result = rebaseLiveProfileData(base, origin, profileDataBaseline(draft) || draft);
            adoptProfileData(origin, result.data); rememberProfileData(origin, result.baseline);
          }
          if (state.currentProfile === profile) notifyProfileDataContextChanged(profile);
        } catch { /* A presentation refresh cannot undo committed settings. */ }
        return 'saved';
      });
    },
    saveFluid(value: FluidDraft) {
      return commit(async () => {
        // saveActiveProfileMeal captures its profile/data synchronously before queuing.
        await saveActiveProfileMeal(mealFromFluidDraft(value));
        return 'saved';
      });
    },
  };
}
