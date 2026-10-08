// A check-in may start only from its captured, live meal/profile owner.
import { state } from './state.js';
import { getActiveProfileMeal, saveActiveProfileMeal } from './nutrition-store.js';
import { isProfileReadBlocked } from './profile-load-safety.js';
import { getErrorMessage } from './caught-error.js';
import type { MealResponseDraft } from './nutrition-meal-detail-model.js';
type Meal = NonNullable<Awaited<ReturnType<typeof getActiveProfileMeal>>>;
export function createNutritionMealDetailSession(meal: Meal, ownerCurrent: () => boolean) {
  const profile = state.currentProfile, origin = state.importedData;
  let retired = false, saving = false, failure = '';
  const current = () => !retired && state.currentProfile === profile && state.importedData === origin;
  return {
    current, retire() { retired = true; }, failureMessage: () => failure,
    async save(response: MealResponseDraft | null): Promise<Awaited<ReturnType<typeof saveActiveProfileMeal>> | null> {
      if (!current() || !ownerCurrent() || saving) return null;
      saving = true; failure = '';
      try {
        if (isProfileReadBlocked(profile)) throw new Error('This profile could not be read safely. Reload it before changing a meal.');
        const latest = await getActiveProfileMeal(meal.id);
        if (!current() || !ownerCurrent()) return null;
        if (!latest) throw new Error('That meal is no longer available.');
        if (latest.updatedAt !== meal.updatedAt) throw new Error('This meal changed elsewhere. Reopen its details before saving a check-in.');
        if (isProfileReadBlocked(profile)) throw new Error('This profile could not be read safely. Reload it before changing a meal.');
        const { responseCheckIn: _removed, ...withoutResponse } = latest;
        // The store captures profile/data synchronously here; an accepted write
        // finishes there even when the view retires while persistence is pending.
        return await saveActiveProfileMeal(response === null ? withoutResponse : {
          ...latest, responseCheckIn: {
            ...(response.satiety2h === null ? {} : { satiety2h: response.satiety2h }),
            ...(response.energy2h === null ? {} : { energy2h: response.energy2h }),
            recordedAt: new Date().toISOString(),
          },
        });
      } catch (error) { failure = getErrorMessage(error, 'The after-meal check-in could not be saved.'); return null; }
      finally { saving = false; }
    },
  };
}
