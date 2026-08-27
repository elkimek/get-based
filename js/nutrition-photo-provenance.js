// @ts-check
// nutrition-photo-provenance.js — AI-photo nutrient persistence boundaries.

export function persistedNutritionComponents(components) {
  return (Array.isArray(components) ? components : []).map(component => {
    const persisted = { ...component };
    // Strip transient fields created by older food-composition builds while
    // preserving historical source metadata on already-saved meals.
    for (const key of ['foodDataCandidates', 'foodCompositionAttempted', 'visualNutrients', 'visualNutrientsPer100g']) delete persisted[key];
    return persisted;
  });
}

export function photoEstimateNutrientAllowlist(source, reviewedKeys = [], photoKeys = []) {
  const aiEstimatedKeys = Array.isArray(source?.aiNutritionEstimate?.nutrientKeys)
    ? source.aiNutritionEstimate.nutrientKeys : [];
  const legacyCompositionKeys = Array.isArray(source?.foodComposition?.completeNutrientKeys)
    ? source.foodComposition.completeNutrientKeys : [];
  return new Set([...photoKeys, ...aiEstimatedKeys, ...legacyCompositionKeys, ...reviewedKeys]);
}

export function photoEstimateNutrientBasis(source) {
  if (Array.isArray(source?.aiNutritionEstimate?.nutrientKeys) && source.aiNutritionEstimate.nutrientKeys.length) {
    return 'model-estimated-from-food-identity-and-portions';
  }
  if (Number(source?.foodComposition?.matchedComponents || 0) > 0) return 'legacy-food-composition';
  return 'visual-core-plus-user-edits';
}
