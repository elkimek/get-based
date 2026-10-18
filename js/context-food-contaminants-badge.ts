// The synchronous cold-render contract uses the same authored badge everywhere.
import { renderHTML } from './components/ContextFoodContaminantsBadge.svelte.html.js';
import { state } from './state.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { foodContaminantFlaggedCount } from './context-food-contaminants-model.js';
import { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';
export function projectDietContaminantsBadge(): number | null {
  if (doesNutritionContextOverrideTypicalMeals()) return null;
  const count = foodContaminantFlaggedCount(scanDietForContaminants(state.importedData.diet));
  return count ? count : null;
}

export function renderDietContaminantsBadge(): string {
  const count = projectDietContaminantsBadge();
  return count === null ? '' : renderHTML({count});
}
