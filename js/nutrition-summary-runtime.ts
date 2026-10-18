// Nutrition hydration is awaited by startup; only its encrypted store is lazy.
import { state } from './state.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';

export async function hydrateNutritionSummary(...args: Parameters<typeof import('./nutrition-store.js').hydrateNutritionSummary>) {
  const store = await import('./nutrition-store.js');
  return store.hydrateNutritionSummary(...args);
}

let syncHydrationPromise: Promise<unknown> = Promise.resolve();
// Register before profile startup or sync can publish; preserve serialized reconciliation.
addUtilsRuntimeListener('labcharts-sync-applied', () => {
  const profileId = state.currentProfile;
  syncHydrationPromise = syncHydrationPromise
    .catch(() => undefined)
    .then(() => hydrateNutritionSummary(profileId))
    .catch(error => console.warn('[nutrition] Synced meals could not be hydrated:', error));
});
