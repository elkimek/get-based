interface NutritionPhotoSource {
  aiNutritionEstimate?: { nutrientKeys?: unknown } | null;
  foodComposition?: { completeNutrientKeys?: unknown; matchedComponents?: unknown } | null;
}

// nutrition-photo-provenance.js — AI-photo nutrient persistence boundaries.

/** Remove editor-only composition state after the original shallow copy. */
export function persistedNutritionComponent(component: unknown): Record<string, unknown> {
  const persisted = { ...component as Record<string, unknown> };
  delete persisted.foodDataCandidates;
  delete persisted.foodCompositionAttempted;
  delete persisted.visualNutrients;
  delete persisted.visualNutrientsPer100g;
  return persisted;
}

export function persistedNutritionComponents(components: unknown) {
  return (Array.isArray(components) ? components as unknown[] : []).map(persistedNutritionComponent);
}

export function photoEstimateNutrientAllowlist(source: NutritionPhotoSource | null | undefined, reviewedKeys: readonly unknown[] = [], photoKeys: readonly unknown[] = []) {
  const aiEstimatedKeys = Array.isArray(source?.aiNutritionEstimate?.nutrientKeys)
    ? source.aiNutritionEstimate!.nutrientKeys as unknown[] : [];
  const legacyCompositionKeys = Array.isArray(source?.foodComposition?.completeNutrientKeys)
    ? source.foodComposition!.completeNutrientKeys as unknown[] : [];
  return new Set([...photoKeys, ...aiEstimatedKeys, ...legacyCompositionKeys, ...reviewedKeys]);
}

export function photoEstimateNutrientBasis(source: NutritionPhotoSource | null | undefined) {
  if (Array.isArray(source?.aiNutritionEstimate?.nutrientKeys) && (source.aiNutritionEstimate!.nutrientKeys as unknown[]).length) {
    return 'model-estimated-from-food-identity-and-portions';
  }
  if (Number(source?.foodComposition?.matchedComponents || 0) > 0) return 'legacy-food-composition';
  return 'visual-core-plus-user-edits';
}

// A replacement analysis owns these values. Portable source extensions and prior
// correction history survive, without presenting an obsolete estimate as current.
const analysisSourceFields = new Set([
  'kind', 'analysisKind', 'provider', 'model', 'modelDisplay', 'usage', 'analyzedAt',
  'recordedAt', 'recordedBy', 'nutrientBasis', 'aiNutritionEstimate', 'label',
  'correction', 'foodData', 'foodComposition', 'originalSource', 'templateMealId', 'review',
]);
const currentReviewFields = new Set([
  'userContext', 'editedNutrients', 'editedComponentIdentities', 'editedPortions',
  'removedComponents', 'mealNameEdited', 'reviewedAt', 'analysisInvalidated', 'calculatedNutrients',
]);
export function preserveMealSourceExtensions<Source extends Record<string, unknown> & { review?: Record<string, unknown> | null }>(previous: Source | null | undefined, current: Source): Source {
  const extensions = Object.fromEntries(Object.entries(previous || {}).filter(([key]) => !analysisSourceFields.has(key)));
  const review = Object.fromEntries(Object.entries(previous?.review || {}).filter(([key]) => !currentReviewFields.has(key)));
  return { ...extensions, ...current, ...(Object.keys(review).length || current.review ? { review: { ...review, ...current.review } } : {}) };
}
